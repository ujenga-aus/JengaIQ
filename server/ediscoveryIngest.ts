import { db } from './db';
import { ediscoveryUploads, ediscoveryEmails, ediscoveryAttachments, projects, projectSharePointSettings } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { simpleParser } from 'mailparser';
import { VoyageAIClient } from 'voyageai';
import type { PSTFolder, PSTMessage } from 'pst-extractor';

// Initialize Voyage AI client
const getVoyageClient = () => {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY environment variable is not set. Please add your Voyage AI API key.');
  }
  return new VoyageAIClient({ apiKey });
};

// Helper to recursively count messages in PST folders
function countMessagesInFolder(folder: PSTFolder, onProgress?: (count: number) => void): number {
  let count = 0;
  
  // Count messages in current folder
  if (folder.contentCount > 0) {
    let email: PSTMessage | null = folder.getNextChild();
    while (email) {
      count++;
      if (onProgress) onProgress(count);
      email = folder.getNextChild();
    }
  }
  
  // Recursively count in subfolders
  if (folder.hasSubfolders) {
    const subfolders: PSTFolder[] = folder.getSubFolders();
    for (const subfolder of subfolders) {
      count += countMessagesInFolder(subfolder, onProgress);
    }
  }
  
  return count;
}

// Helper to manually construct EML from PSTMessage
function buildEMLFromPSTMessage(message: PSTMessage): string {
  const emlLines: string[] = [];
  
  // Add headers
  if (message.senderEmailAddress) {
    emlLines.push(`From: ${message.senderEmailAddress}`);
  }
  if (message.displayTo) {
    emlLines.push(`To: ${message.displayTo}`);
  }
  if (message.displayCC) {
    emlLines.push(`Cc: ${message.displayCC}`);
  }
  if (message.subject) {
    emlLines.push(`Subject: ${message.subject}`);
  }
  if (message.clientSubmitTime) {
    emlLines.push(`Date: ${message.clientSubmitTime.toISOString()}`);
  }
  if (message.internetMessageId) {
    emlLines.push(`Message-ID: ${message.internetMessageId}`);
  } else {
    // Generate a placeholder message ID
    emlLines.push(`Message-ID: <${Date.now()}@local>`);
  }
  
  // Content type
  if (message.bodyHTML) {
    emlLines.push(`Content-Type: text/html; charset="utf-8"`);
  } else {
    emlLines.push(`Content-Type: text/plain; charset="utf-8"`);
  }
  
  // Empty line to separate headers from body
  emlLines.push('');
  
  // Add body
  if (message.bodyHTML) {
    emlLines.push(message.bodyHTML);
  } else if (message.body) {
    emlLines.push(message.body);
  }
  
  return emlLines.join('\r\n');
}

// Helper to recursively process messages in PST folders
async function processMessagesInFolder(
  folder: PSTFolder,
  companyId: string,
  uploadId: string,
  sourceFilename: string,
  onProgress?: (processed: number) => void
): Promise<{ emailCount: number; attachmentCount: number }> {
  let emailCount = 0;
  let attachmentCount = 0;
  
  // Process messages in current folder
  if (folder.contentCount > 0) {
    let email: PSTMessage | null = folder.getNextChild();
    while (email) {
      try {
        // Convert PST message to EML format for processing
        const emlData = buildEMLFromPSTMessage(email);
        const emlBuffer = Buffer.from(emlData, 'utf-8');
        
        await processEmail(companyId, uploadId, emlBuffer, undefined, sourceFilename);
        emailCount++;
        
        // Count attachments
        if (email.numberOfAttachments > 0) {
          attachmentCount += email.numberOfAttachments;
        }
        
        if (onProgress) onProgress(emailCount);
      } catch (error) {
        console.error('[PST Progress] Error processing email:', error);
      }
      email = folder.getNextChild();
    }
  }
  
  // Recursively process subfolders
  if (folder.hasSubfolders) {
    const subfolders: PSTFolder[] = folder.getSubFolders();
    for (const subfolder of subfolders) {
      const subResults = await processMessagesInFolder(
        subfolder,
        companyId,
        uploadId,
        sourceFilename,
        onProgress
      );
      emailCount += subResults.emailCount;
      attachmentCount += subResults.attachmentCount;
    }
  }
  
  return { emailCount, attachmentCount };
}

// Helper to calculate SHA-256 hash
function calculateHash(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Helper to normalize email address
function normalizeEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  return email.toLowerCase().trim();
}

// Extract plain text from HTML (simple version)
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate embedding for email content using Voyage AI
// Uses voyage-3-lite for cost-effectiveness and better accuracy
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const voyage = getVoyageClient();
    const response = await voyage.embed({
      input: [text.substring(0, 32000)], // Voyage supports 32K context vs OpenAI's 8K
      model: "voyage-3-lite", // Cost-effective for email discovery
      inputType: "document" // "document" for indexing emails
    });
    return response.data?.[0]?.embedding || [];
  } catch (error) {
    console.error('Error generating Voyage AI embedding:', error);
    // Return empty embedding on error
    return [];
  }
}

// Parse a single EML message and store in database
async function processEmail(
  companyId: string,
  uploadId: string,
  emlBuffer: Buffer,
  emlPath?: string,
  sourceFilename?: string
): Promise<void> {
  try {
    const parsed = await simpleParser(emlBuffer);
    
    // Extract addresses - handle both single and array of AddressObject
    const fromValue = Array.isArray(parsed.from) ? parsed.from[0] : parsed.from;
    const fromAddress = normalizeEmail(fromValue?.value?.[0]?.address);
    
    const toValue = Array.isArray(parsed.to) ? parsed.to : (parsed.to ? [parsed.to] : []);
    const toAddresses = toValue.flatMap((t: any) => 
      (t.value || []).map((v: any) => normalizeEmail(v.address))
    ).filter(Boolean) as string[];
    
    const ccValue = Array.isArray(parsed.cc) ? parsed.cc : (parsed.cc ? [parsed.cc] : []);
    const ccAddresses = ccValue.flatMap((c: any) => 
      (c.value || []).map((v: any) => normalizeEmail(v.address))
    ).filter(Boolean) as string[];
    
    const bccValue = Array.isArray(parsed.bcc) ? parsed.bcc : (parsed.bcc ? [parsed.bcc] : []);
    const bccAddresses = bccValue.flatMap((b: any) => 
      (b.value || []).map((v: any) => normalizeEmail(v.address))
    ).filter(Boolean) as string[];
    
    // Get body text
    let bodyText = parsed.text || '';
    const bodyHtml = parsed.html || undefined;
    
    // If no text but has HTML, convert HTML to text
    if (!bodyText && bodyHtml) {
      bodyText = htmlToText(bodyHtml);
    }
    
    // Create snippet (first 200 chars)
    const snippet = bodyText.substring(0, 200);
    
    // Calculate hash of body content
    const bodyHash = calculateHash(bodyText || '');
    
    // Generate embedding from subject + addresses + body
    const embeddingText = [
      parsed.subject || '',
      fromAddress || '',
      ...toAddresses,
      bodyText.substring(0, 2000), // Limit body text for embedding
    ].join(' ');
    
    const embedding = await generateEmbedding(embeddingText);
    
    // Check if email already exists (by message-id and hash)
    const messageId = parsed.messageId || undefined;
    if (messageId) {
      const existing = await db
        .select()
        .from(ediscoveryEmails)
        .where(eq(ediscoveryEmails.messageId, messageId))
        .limit(1);
      
      if (existing.length > 0) {
        console.log(`Email already exists: ${messageId}`);
        return;
      }
    }
    
    // Insert email
    const [insertedEmail] = await db.insert(ediscoveryEmails).values({
      companyId,
      uploadId,
      messageId,
      subject: parsed.subject || undefined,
      fromAddress,
      toAddresses,
      ccAddresses,
      bccAddresses,
      sentAt: parsed.date || undefined,
      hasAttachments: (parsed.attachments?.length || 0) > 0,
      bodyText,
      bodyHtml,
      snippet,
      sha256: bodyHash,
      embedding: JSON.stringify(embedding), // Store as JSON string for now
      sourceFilename, // Track which PST file this email came from
    }).returning();
    
    // Process attachments
    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const attachment of parsed.attachments) {
        const attachmentHash = calculateHash(attachment.content);
        
        // For now, we'll store attachment metadata only
        // In production, you'd save to object storage and store the key
        const storageKey = `ediscovery/${uploadId}/attachments/${insertedEmail.id}/${attachment.filename}`;
        
        await db.insert(ediscoveryAttachments).values({
          companyId,
          emailId: insertedEmail.id,
          filename: attachment.filename || 'unnamed',
          contentType: attachment.contentType || undefined,
          sizeBytes: attachment.size || 0,
          sha256: attachmentHash,
          storageKey,
        });
      }
    }
  } catch (error) {
    console.error('Error processing email:', error);
    // Continue processing other emails even if one fails
  }
}

// Main ingestion function
export async function ingestPSTFile(uploadId: string): Promise<void> {
  console.log(`Starting PST ingestion for upload ${uploadId}`);
  
  try {
    // Get upload record
    const [upload] = await db
      .select()
      .from(ediscoveryUploads)
      .where(eq(ediscoveryUploads.id, uploadId));
    
    if (!upload) {
      throw new Error('Upload not found');
    }
    
    if (upload.status === 'complete') {
      console.log('Upload already processed');
      return;
    }
    
    // Update status to processing
    await db
      .update(ediscoveryUploads)
      .set({ status: 'processing' })
      .where(eq(ediscoveryUploads.id, uploadId));
    
    let pstPath = upload.storageKey;
    
    // Check if we need to download from SharePoint
    // Download if: storageKey is a SharePoint path OR temp file doesn't exist locally
    const needsDownload = !pstPath.startsWith('/tmp/') || 
      !(await fs.access(pstPath).then(() => true).catch(() => false));
    
    if (needsDownload) {
      console.log(`[PST Download] Downloading PST from SharePoint: ${upload.sourcePath}`);
      
      // Download PST from SharePoint
      const { SharePointService } = await import('./sharepoint');
      
      // Get project and SharePoint settings
      const projectResults = await db
        .select()
        .from(projects)
        .where(eq(projects.id, upload.projectId))
        .limit(1);
      const project = projectResults[0];
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      const spSettingsResults = await db
        .select()
        .from(projectSharePointSettings)
        .where(eq(projectSharePointSettings.projectId, upload.projectId))
        .limit(1);
      const spSettings = spSettingsResults[0];
      
      if (!spSettings?.sharePointSiteUrl) {
        throw new Error('SharePoint settings not found for project');
      }
      
      // Stream large file directly to temp directory (avoids memory issues)
      console.log(`[PST Download] Starting streaming download from SharePoint: ${upload.sourcePath}`);
      
      try {
        const spService = new SharePointService();
        
        let lastProgressUpdate = 0;
        const tempFilePath = await spService.downloadFileToTempPath(
          spSettings.sharePointSiteUrl,
          upload.sourcePath!,
          (bytesDownloaded) => {
            // Update progress every 100MB to avoid too many DB updates
            const now = Date.now();
            if (now - lastProgressUpdate > 2000 || bytesDownloaded % (100 * 1024 * 1024) === 0) {
              lastProgressUpdate = now;
              const sizeMB = (bytesDownloaded / (1024 * 1024)).toFixed(2);
              console.log(`[PST Download] Downloaded ${sizeMB} MB...`);
              
              // Calculate download progress (first 50% of total progress)
              const downloadProgressPct = upload.sizeBytes > 0 
                ? Math.min(50, Math.floor((bytesDownloaded / upload.sizeBytes) * 50))
                : 0;
              
              // Update progress in DB (non-blocking)
              db.update(ediscoveryUploads)
                .set({ 
                  progressPct: downloadProgressPct, // 0-50% for download phase
                  status: 'processing' 
                })
                .where(eq(ediscoveryUploads.id, uploadId))
                .catch(err => console.error('Error updating download progress:', err));
            }
          }
        );
        
        console.log(`[PST Download] Download complete, file saved to ${tempFilePath}`);
        
        // Update storageKey to temp path
        await db
          .update(ediscoveryUploads)
          .set({ storageKey: tempFilePath })
          .where(eq(ediscoveryUploads.id, uploadId));
        
        pstPath = tempFilePath;
      } catch (downloadError) {
        console.error('[PST Download] Failed to download from SharePoint:', downloadError);
        throw new Error(`Failed to download PST from SharePoint: ${downloadError}`);
      }
    }
    
    // Check if file exists locally
    try {
      await fs.access(pstPath);
    } catch {
      throw new Error(`PST file not found at ${pstPath}`);
    }
    
    // Extract PST to temporary directory
    const tempDir = path.join('/tmp', `pst-extract-${uploadId}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    console.log(`Extracting PST from ${pstPath} to ${tempDir}`);
    
    let emailCount = 0;
    let attachmentCount = 0;
    
    try {
      // Use pst-extractor to extract emails from PST file
      const { PSTFile } = await import('pst-extractor');
      
      console.log(`[PST Progress] Starting PST extraction from ${pstPath}`);
      
      // PHASE 1: Count total emails for accurate progress tracking
      console.log(`[PST Progress] Phase 1: Counting total emails in PST file...`);
      const countExtractor = new PSTFile(pstPath);
      const totalEmailCount = countMessagesInFolder(countExtractor.getRootFolder(), (count) => {
        if (count % 100 === 0) {
          console.log(`[PST Progress] Counted ${count} emails so far...`);
        }
      });
      
      console.log(`[PST Progress] Total emails in PST: ${totalEmailCount}`);
      
      // Update with total count
      await db
        .update(ediscoveryUploads)
        .set({ 
          progressPct: 0,
          emailCount: totalEmailCount // Store total for display
        })
        .where(eq(ediscoveryUploads.id, uploadId));
      
      // PHASE 2: Extract and process emails with accurate progress
      console.log(`[PST Progress] Phase 2: Processing ${totalEmailCount} emails...`);
      const extractor = new PSTFile(pstPath);
      
      let processedCount = 0;
      
      // Process all messages with progress tracking
      const results = await processMessagesInFolder(
        extractor.getRootFolder(),
        upload.companyId,
        uploadId,
        upload.filename,
        (count) => {
          processedCount = count;
          
          // Update progress every 10 emails or at completion
          // Email processing is 50-100% of total progress (download was 0-50%)
          if (processedCount % 10 === 0 || processedCount === totalEmailCount) {
            const emailProgressPct = totalEmailCount > 0 
              ? Math.floor((processedCount / totalEmailCount) * 50)
              : 0;
            const progressPct = 50 + emailProgressPct; // 50-100% for processing phase
            
            db.update(ediscoveryUploads)
              .set({ progressPct })
              .where(eq(ediscoveryUploads.id, uploadId))
              .then(() => {
                console.log(`[PST Progress] Processed ${processedCount}/${totalEmailCount} emails (${progressPct}%)`);
              })
              .catch(err => console.error('Error updating progress:', err));
          }
        }
      );
      
      emailCount = results.emailCount;
      attachmentCount = results.attachmentCount;
      
      console.log(`[PST Progress] PST extraction complete: ${emailCount} emails, ${attachmentCount} attachments processed`);
      
      // Update upload record
      await db
        .update(ediscoveryUploads)
        .set({
          status: 'complete',
          emailCount,
          attachmentCount,
          processedAt: new Date(),
        })
        .where(eq(ediscoveryUploads.id, uploadId));
      
    } catch (extractError) {
      console.error('PST extraction error:', extractError);
      throw extractError;
    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      
      // Cleanup downloaded PST temp file
      if (pstPath.includes('/tmp/pst-')) {
        try {
          await fs.unlink(pstPath);
          console.log(`[PST Cleanup] Removed temp file: ${pstPath}`);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    
  } catch (error) {
    console.error(`PST ingestion failed for upload ${uploadId}:`, error);
    
    // Update status to failed
    await db
      .update(ediscoveryUploads)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(ediscoveryUploads.id, uploadId));
    
    throw error;
  }
}
