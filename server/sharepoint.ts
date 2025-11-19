import { Client } from '@microsoft/microsoft-graph-client';
import { extractTextFromPDF, generateEmbedding, cosineSimilarity } from './semanticSearch';
import { correspondenceLetters } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

let cachedToken: { token: string; expiresAt: number } | null = null;

// Check if SharePoint connection is active
export async function checkSharePointConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    // Check if Azure AD credentials are configured
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const tenantId = process.env.AZURE_TENANT_ID;

    if (!clientId || !clientSecret || !tenantId) {
      return {
        connected: false,
        error: 'Azure AD credentials not configured. Please add AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID to your environment.'
      };
    }

    await getAccessToken();
    return { connected: true };
  } catch (error: any) {
    return { 
      connected: false, 
      error: error.message || 'SharePoint not connected' 
    };
  }
}

// Parse Microsoft Graph API error for better error messages
function parseGraphError(error: any): string {
  // Extract error details from Graph API response
  const graphError = error.body?.error || error.error || error;
  const errorCode = graphError.code || '';
  const errorMessage = graphError.message || error.message || error.toString();
  
  // Map common error codes to user-friendly messages
  switch (errorCode.toLowerCase()) {
    case 'accessdenied':
    case 'unauthorized':
      return 'Access denied. Please check: 1) The site URL is correct, 2) You have permission to access this SharePoint site, 3) The OAuth connection has Sites.Read.All or Sites.ReadWrite.All permissions';
    case 'resourcenotfound':
    case 'itemnotfound':
      return 'Resource not found. Please verify the site URL or folder path is correct';
    case 'invalidrequest':
      return `Invalid request: ${errorMessage}. Please check the URL format`;
    case 'generalexception':
      return `SharePoint error: ${errorMessage}`;
    case 'unauthenticated':
      return 'Authentication failed. Please reconnect your SharePoint OAuth integration';
    default:
      // If we have an error code, include it for troubleshooting
      if (errorCode) {
        return `${errorMessage} (Error code: ${errorCode})`;
      }
      return errorMessage || 'Unknown error occurred';
  }
}

// Normalize folder path to ensure it has proper format
function normalizeFolderPath(path: string): string {
  if (!path) return '/';
  
  // Remove whitespace
  path = path.trim();
  
  // Ensure leading slash
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  // Collapse multiple slashes
  path = path.replace(/\/+/g, '/');
  
  // Remove trailing slash (unless it's the root)
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  
  return path;
}

// Test if a SharePoint folder is accessible
export async function testSharePointFolderAccess(
  siteUrl: string,
  folderPath: string
): Promise<{ accessible: boolean; siteId?: string; driveId?: string; error?: string }> {
  try {
    const client = await getUncachableSharePointClient();
    
    // Validate and normalize folder path
    const normalizedPath = normalizeFolderPath(folderPath);
    
    // Extract site path from URL
    const urlParts = new URL(siteUrl);
    const sitePath = urlParts.pathname;
    
    // Get site information
    let site;
    try {
      site = await client
        .api(`/sites/${urlParts.hostname}:${sitePath}`)
        .get();
    } catch (siteError: any) {
      return {
        accessible: false,
        error: parseGraphError(siteError)
      };
    }
    
    const siteId = site.id;
    
    // Get default drive
    let drive;
    try {
      drive = await client
        .api(`/sites/${siteId}/drive`)
        .get();
    } catch (driveError: any) {
      return {
        accessible: false,
        error: `Failed to access document library: ${parseGraphError(driveError)}`
      };
    }
    
    const driveId = drive.id;
    
    // Try to access the folder
    try {
      console.log(`[SharePoint] Testing access to: /sites/${siteId}/drive/root:${normalizedPath}`);
      await client
        .api(`/sites/${siteId}/drive/root:${normalizedPath}`)
        .get();
      
      return { 
        accessible: true,
        siteId,
        driveId
      };
    } catch (folderError: any) {
      console.error('[SharePoint] Folder access error:', {
        path: normalizedPath,
        errorCode: folderError.code || folderError.body?.error?.code,
        errorMessage: folderError.message,
        fullError: JSON.stringify(folderError, null, 2)
      });
      return {
        accessible: false,
        error: `Folder "${normalizedPath}" not accessible: ${parseGraphError(folderError)}`
      };
    }
  } catch (error: any) {
    return {
      accessible: false,
      error: parseGraphError(error)
    };
  }
}

// Test if a SharePoint file is accessible
export async function testSharePointFileAccess(
  siteUrl: string,
  filePath: string
): Promise<{ accessible: boolean; fileName?: string; fileSize?: number; error?: string }> {
  try {
    const client = await getUncachableSharePointClient();
    
    // Validate and normalize file path
    const normalizedPath = normalizeFolderPath(filePath);
    
    // Extract site path from URL
    const urlParts = new URL(siteUrl);
    const sitePath = urlParts.pathname;
    
    // Get site information
    let site;
    try {
      site = await client
        .api(`/sites/${urlParts.hostname}:${sitePath}`)
        .get();
    } catch (siteError: any) {
      return {
        accessible: false,
        error: parseGraphError(siteError)
      };
    }
    
    const siteId = site.id;
    
    // Get default drive
    let drive;
    try {
      drive = await client
        .api(`/sites/${siteId}/drive`)
        .get();
    } catch (driveError: any) {
      return {
        accessible: false,
        error: `Failed to access document library: ${parseGraphError(driveError)}`
      };
    }
    
    // Try to access the file
    try {
      const fileMetadata = await client
        .api(`/sites/${siteId}/drive/root:${normalizedPath}`)
        .get();
      
      return { 
        accessible: true,
        fileName: fileMetadata.name,
        fileSize: fileMetadata.size
      };
    } catch (fileError: any) {
      return {
        accessible: false,
        error: `File "${normalizedPath}" not accessible: ${parseGraphError(fileError)}`
      };
    }
  } catch (error: any) {
    return {
      accessible: false,
      error: parseGraphError(error)
    };
  }
}

async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  // Get Azure AD credentials from environment
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('Azure AD credentials not configured. Please add AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID to your environment.');
  }

  // Azure AD OAuth2 client credentials flow
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Azure AD authentication failed: ${errorData.error_description || response.statusText}`);
    }

    const tokenData = await response.json();
    
    // Cache the token (expires_in is in seconds, subtract 5 minutes for safety)
    const expiresIn = (tokenData.expires_in || 3600) - 300;
    cachedToken = {
      token: tokenData.access_token,
      expiresAt: Date.now() + (expiresIn * 1000)
    };

    return tokenData.access_token;
  } catch (error: any) {
    throw new Error(`Failed to obtain Azure AD token: ${error.message}`);
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableSharePointClient() {
  const accessToken = await getAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

// Search SharePoint documents using Microsoft Graph API
export async function searchSharePointDocuments(
  siteUrl: string,
  folderPath: string,
  query: string
): Promise<any[]> {
  try {
    const client = await getUncachableSharePointClient();
    
    // Extract site path from URL
    const urlParts = new URL(siteUrl);
    const sitePath = urlParts.pathname;
    
    // Get site information
    const site = await client
      .api(`/sites/${urlParts.hostname}:${sitePath}`)
      .get();
    
    // Search for documents in the site
    const searchResults = await client
      .api('/search/query')
      .post({
        requests: [
          {
            entityTypes: ['driveItem'],
            query: {
              queryString: `path:"${folderPath}" AND ${query}`
            },
            from: 0,
            size: 25,
            fields: [
              'name',
              'lastModifiedDateTime',
              'webUrl',
              'size',
              'fileExtension'
            ],
            region: 'AUS' // Required for application permissions - using Australia region for this tenant
          }
        ]
      });
    
    // Extract hits from response
    const hits = searchResults?.value?.[0]?.hitsContainers?.[0]?.hits || [];
    
    return hits.map((hit: any) => ({
      id: hit.resource?.id,
      name: hit.resource?.name,
      url: hit.resource?.webUrl,
      lastModified: hit.resource?.lastModifiedDateTime,
      size: hit.resource?.size,
      extension: hit.resource?.fileExtension,
      summary: hit.summary
    }));
  } catch (error) {
    console.error('SharePoint search error:', error);
    return [];
  }
}

// Get document content from SharePoint
export async function getSharePointDocumentContent(
  siteId: string,
  driveId: string,
  itemId: string
): Promise<Buffer | null> {
  try {
    const client = await getUncachableSharePointClient();
    
    const content = await client
      .api(`/sites/${siteId}/drives/${driveId}/items/${itemId}/content`)
      .get();
    
    return content;
  } catch (error) {
    console.error('Error fetching SharePoint document:', error);
    return null;
  }
}

// Sync SharePoint documents to database with pre-computed embeddings
export async function syncSharePointDocuments(
  projectId: string,
  siteUrl: string,
  folderPath: string,
  db: any
): Promise<{ indexed: number; skipped: number; deleted: number; errors: number; totalTokens: number }> {
  try {
    const client = await getUncachableSharePointClient();
    
    // Extract site path from URL
    const urlParts = new URL(siteUrl);
    const sitePath = urlParts.pathname;
    
    // Get site information
    const site = await client
      .api(`/sites/${urlParts.hostname}:${sitePath}`)
      .get();
    
    const siteId = site.id;
    
    // Get default drive
    const drive = await client
      .api(`/sites/${siteId}/drive`)
      .get();
    
    const driveId = drive.id;
    
    // Use Drive API to directly access the folder and list PDF files
    console.log(`[SharePoint Sync] Accessing folder: ${folderPath}`);
    console.log(`[SharePoint Sync] Site ID: ${siteId}, Drive ID: ${driveId}`);
    
    // Normalize folder path - remove leading/trailing slashes and "Documents" prefix if present
    let normalizedPath = folderPath.trim();
    if (normalizedPath.startsWith('/Documents/')) {
      normalizedPath = normalizedPath.substring('/Documents'.length);
    } else if (normalizedPath.startsWith('Documents/')) {
      normalizedPath = '/' + normalizedPath.substring('Documents'.length);
    }
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }
    
    console.log(`[SharePoint Sync] Normalized path: ${normalizedPath}`);
    
    // Get all files in the folder using Drive API
    const folderContents = await client
      .api(`/sites/${siteId}/drives/${driveId}/root:${normalizedPath}:/children`)
      .top(200) // Get up to 200 items
      .get();
    
    // Filter for PDF files only
    const pdfFiles = (folderContents?.value || []).filter((item: any) => {
      const fileName = item.name || '';
      return fileName.toLowerCase().endsWith('.pdf') && item.file; // Must be a file (not folder) and end with .pdf
    });
    
    console.log(`[SharePoint Sync] Found ${pdfFiles.length} PDF documents in folder (${folderContents?.value?.length || 0} total items)`);
    if (pdfFiles.length === 0) {
      console.log(`[SharePoint Sync] No PDFs found. Check if:`);
      console.log(`  1. Folder path '${folderPath}' exists in SharePoint`);
      console.log(`  2. Folder contains PDF files`);
      console.log(`  3. You have permission to access the folder`);
    }
    
    // Get all SharePoint file IDs from current search
    const currentSharePointFileIds = new Set(
      pdfFiles
        .map((file: any) => file.id)
        .filter((id: string | undefined) => !!id)
    );
    
    // Delete database entries for files that no longer exist in SharePoint
    const existingSharePointLetters = await db
      .select()
      .from(correspondenceLetters)
      .where(
        and(
          eq(correspondenceLetters.projectId, projectId),
          eq(correspondenceLetters.source, 'sharepoint')
        )
      );
    
    let deleted = 0;
    for (const letter of existingSharePointLetters) {
      if (letter.sharePointFileId && !currentSharePointFileIds.has(letter.sharePointFileId)) {
        console.log(`[SharePoint Sync] Deleting removed file: ${letter.fileName}`);
        await db
          .delete(correspondenceLetters)
          .where(eq(correspondenceLetters.id, letter.id));
        deleted++;
      }
    }
    
    if (deleted > 0) {
      console.log(`[SharePoint Sync] Deleted ${deleted} removed files from database`);
    }
    
    let indexed = 0;
    let skipped = 0;
    let errors = 0;
    let totalTokens = 0;
    
    // Process documents with concurrency limit
    const CONCURRENCY_LIMIT = 3; // Process 3 at a time to avoid rate limits
    
    for (let i = 0; i < pdfFiles.length; i += CONCURRENCY_LIMIT) {
      const batch = pdfFiles.slice(i, i + CONCURRENCY_LIMIT);
      
      await Promise.all(
        batch.map(async (file: any) => {
          try {
            const itemId = file.id;
            const fileName = file.name;
            const fileUrl = file.webUrl;
            const lastModified = file.lastModifiedDateTime;
            
            if (!itemId || !fileName) {
              console.log(`[SharePoint Sync] Skipping - missing id or name`);
              skipped++;
              return;
            }
            
            // Check if already indexed
            const [existing] = await db
              .select()
              .from(correspondenceLetters)
              .where(
                and(
                  eq(correspondenceLetters.projectId, projectId),
                  eq(correspondenceLetters.sharePointFileId, itemId)
                )
              )
              .limit(1);
            
            if (existing) {
              console.log(`[SharePoint Sync] Already indexed: ${fileName}`);
              skipped++;
              return;
            }
            
            // Download PDF
            const stream = await client
              .api(`/sites/${siteId}/drives/${driveId}/items/${itemId}/content`)
              .getStream();
            
            if (!stream) {
              console.log(`[SharePoint Sync] Failed to download: ${fileName}`);
              errors++;
              return;
            }
            
            // Convert to Buffer
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            const pdfBuffer = Buffer.concat(chunks);
            
            // Extract text
            const extractedText = await extractTextFromPDF(pdfBuffer);
            
            if (!extractedText || extractedText.length < 50) {
              console.log(`[SharePoint Sync] Insufficient text: ${fileName}`);
              errors++;
              return;
            }
            
            // Generate embedding
            const { embedding, usage } = await generateEmbedding(extractedText);
            const embeddingVector = JSON.stringify(embedding);
            
            // Track token usage
            if (usage?.total_tokens) {
              totalTokens += usage.total_tokens;
            }
            
            // Insert into database with retry logic to handle concurrent inserts
            let letterNumber: number | undefined;
            let retries = 0;
            const maxRetries = 5;
            
            while (retries < maxRetries) {
              try {
                letterNumber = await db.transaction(async (tx: any) => {
                  // Lock the latest letter row for this project to prevent concurrent inserts from getting the same number
                  const [latestLetter] = await tx
                    .select({ letterNumber: correspondenceLetters.letterNumber })
                    .from(correspondenceLetters)
                    .where(eq(correspondenceLetters.projectId, projectId))
                    .orderBy(sql`letter_number DESC`)
                    .limit(1)
                    .for('update');
                  
                  const nextLetterNumber = (latestLetter?.letterNumber || 0) + 1;
                  
                  // Insert with the locked letter number
                  await tx
                    .insert(correspondenceLetters)
                    .values({
                      projectId,
                      letterNumber: nextLetterNumber,
                      sharePointFileId: itemId,
                      fileName,
                      fileUrl,
                      extractedText,
                      embeddingVector,
                      subject: fileName.replace('.pdf', ''),
                      source: 'sharepoint',
                      category: 'correspondence'
                    });
                  
                  return nextLetterNumber;
                });
                
                // Success - break out of retry loop
                break;
              } catch (error: any) {
                // Check if it's a unique constraint violation
                if (error?.code === '23505' && retries < maxRetries - 1) {
                  // Retry with exponential backoff
                  retries++;
                  await new Promise(resolve => setTimeout(resolve, 100 * retries));
                  continue;
                }
                // Other errors or max retries exceeded
                throw error;
              }
            }
            
            if (letterNumber) {
              console.log(`[SharePoint Sync] Indexed: ${fileName} (Letter #${letterNumber})`);
              indexed++;
            }
            
          } catch (error) {
            console.error(`[SharePoint Sync] Error processing document:`, error);
            errors++;
          }
        })
      );
    }
    
    console.log(`[SharePoint Sync] Complete: ${indexed} indexed, ${skipped} skipped, ${deleted} deleted, ${errors} errors, ${totalTokens} tokens`);
    
    return { indexed, skipped, deleted, errors, totalTokens };
  } catch (error) {
    console.error('[SharePoint Sync] Sync error:', error);
    throw error;
  }
}

// AI Semantic search on SharePoint documents using embeddings (DEPRECATED - use database search instead)
export async function semanticSearchSharePoint(
  siteUrl: string,
  folderPath: string,
  queryEmbedding: number[],
  topK: number = 5
): Promise<any[]> {
  try {
    const client = await getUncachableSharePointClient();
    
    // Extract site path from URL
    const urlParts = new URL(siteUrl);
    const sitePath = urlParts.pathname;
    
    // Get site information
    const site = await client
      .api(`/sites/${urlParts.hostname}:${sitePath}`)
      .get();
    
    const siteId = site.id;
    
    // Get default drive for the site
    const drive = await client
      .api(`/sites/${siteId}/drive`)
      .get();
    
    const driveId = drive.id;
    
    // Search for all PDF documents in the specified folder
    const searchResults = await client
      .api('/search/query')
      .post({
        requests: [
          {
            entityTypes: ['driveItem'],
            query: {
              queryString: `path:"${folderPath}" AND fileExtension:pdf`
            },
            from: 0,
            size: 25, // Limit candidates to prevent overwhelming APIs
            fields: [
              'name',
              'lastModifiedDateTime',
              'webUrl',
              'size',
              'id'
            ],
            region: 'AUS' // Required for application permissions - using Australia region for this tenant
          }
        ]
      });
    
    // Extract hits from response
    const hits = searchResults?.value?.[0]?.hitsContainers?.[0]?.hits || [];
    
    console.log(`[SharePoint AI Search] Found ${hits.length} PDF documents in folder`);
    
    // Process documents with concurrency limit to prevent rate limiting
    const CONCURRENCY_LIMIT = 5; // Process 5 at a time
    const documentsWithSimilarity: any[] = [];
    
    for (let i = 0; i < hits.length; i += CONCURRENCY_LIMIT) {
      const batch = hits.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(
        batch.map(async (hit: any) => {
        try {
          const itemId = hit.resource?.id;
          const fileName = hit.resource?.name;
          
          if (!itemId || !fileName) {
            console.log(`[SharePoint AI Search] Skipping document - missing id or name`);
            return null;
          }
          
          // Download PDF content as stream and convert to Buffer
          const stream = await client
            .api(`/sites/${siteId}/drives/${driveId}/items/${itemId}/content`)
            .getStream();
          
          if (!stream) {
            console.log(`[SharePoint AI Search] Failed to download: ${fileName}`);
            return null;
          }
          
          // Convert stream to Buffer
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          const pdfBuffer = Buffer.concat(chunks);
          
          // Extract text from PDF
          const extractedText = await extractTextFromPDF(pdfBuffer);
          
          if (!extractedText || extractedText.length < 50) {
            console.log(`[SharePoint AI Search] Insufficient text in: ${fileName} (${extractedText.length} chars)`);
            return null;
          }
          
          // Generate embedding for the document
          const { embedding: docEmbedding } = await generateEmbedding(extractedText);
          
          // Calculate cosine similarity with query embedding
          const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
          
          console.log(`[SharePoint AI Search] ${fileName}: similarity=${similarity.toFixed(3)}`);
          
          return {
            id: `sp_${itemId}`,
            source: 'sharepoint',
            fileName: fileName,
            fileUrl: hit.resource?.webUrl,
            subject: fileName,
            lastModified: hit.resource?.lastModifiedDateTime,
            similarity,
            isExternal: true,
            extractedText: extractedText.substring(0, 500), // Include preview
            siteId,
            driveId,
            itemId
          };
        } catch (docError) {
          console.error(`[SharePoint AI Search] Error processing document:`, docError);
          return null;
        }
        })
      );
      
      // Add batch results to main array
      documentsWithSimilarity.push(...batchResults);
    }
    
    // Filter out nulls and sort by similarity
    const validDocuments = documentsWithSimilarity
      .filter(doc => doc !== null)
      .sort((a, b) => b!.similarity - a!.similarity)
      .slice(0, topK);
    
    console.log(`[SharePoint AI Search] Returning ${validDocuments.length} semantically similar documents`);
    
    return validDocuments;
  } catch (error) {
    console.error('[SharePoint AI Search] Search error:', error);
    return [];
  }
}

// Scan SharePoint folder for PST files and compare with database
export async function scanSharePointPSTFolder(
  projectId: string,
  siteUrl: string,
  pstFolderPath: string
): Promise<{
  newPstFiles: Array<{
    name: string;
    size: number;
    path: string;
    lastModified: string;
    id: string;
  }>;
  existingCount: number;
  error?: string;
}> {
  try {
    if (!pstFolderPath || !siteUrl) {
      return { newPstFiles: [], existingCount: 0, error: 'PST folder path or site URL not configured' };
    }

    const client = await getUncachableSharePointClient();
    
    // Extract site path from URL
    const urlParts = new URL(siteUrl);
    const sitePath = urlParts.pathname;
    
    // Get site information
    const site = await client
      .api(`/sites/${urlParts.hostname}:${sitePath}`)
      .get();
    
    const siteId = site.id;
    
    // Get default drive
    const drive = await client
      .api(`/sites/${siteId}/drive`)
      .get();
    
    const driveId = drive.id;
    
    // Normalize folder path
    const normalizedPath = normalizeFolderPath(pstFolderPath);
    
    console.log(`[PST Scan] Scanning folder: ${normalizedPath} for project ${projectId}`);
    
    // Get all files in the folder
    const folderContents = await client
      .api(`/sites/${siteId}/drives/${driveId}/root:${normalizedPath}:/children`)
      .top(200)
      .get();
    
    // Debug: Log all files returned by SharePoint
    console.log(`[PST Scan] SharePoint returned ${folderContents?.value?.length || 0} total items`);
    if (folderContents?.value) {
      folderContents.value.forEach((item: any) => {
        console.log(`[PST Scan]   - ${item.name} (file: ${!!item.file}, folder: ${!!item.folder})`);
      });
    }
    
    // Filter for PST files only
    const pstFiles = (folderContents?.value || []).filter((item: any) => {
      const fileName = item.name || '';
      return fileName.toLowerCase().endsWith('.pst') && item.file; // Must be a file and end with .pst
    });
    
    console.log(`[PST Scan] Found ${pstFiles.length} PST files in SharePoint folder`);
    
    // Get existing uploads from database
    const { ediscoveryUploads } = await import('../shared/schema');
    const { db } = await import('./db');
    const { eq } = await import('drizzle-orm');
    
    const existingUploads = await db
      .select()
      .from(ediscoveryUploads)
      .where(eq(ediscoveryUploads.projectId, projectId));
    
    const existingFilenames = new Set(existingUploads.map(u => u.filename.toLowerCase()));
    
    // Find new PST files not yet in database
    const newPstFiles = pstFiles
      .filter((file: any) => !existingFilenames.has(file.name.toLowerCase()))
      .map((file: any) => ({
        name: file.name,
        size: file.size || 0,
        path: `${normalizedPath}/${file.name}`,
        lastModified: file.lastModifiedDateTime,
        id: file.id,
      }));
    
    console.log(`[PST Scan] Found ${newPstFiles.length} new PST files to index`);
    
    return {
      newPstFiles,
      existingCount: pstFiles.length - newPstFiles.length,
    };
  } catch (error: any) {
    console.error('[PST Scan] Scan error:', error);
    return {
      newPstFiles: [],
      existingCount: 0,
      error: parseGraphError(error),
    };
  }
}

// SharePoint Service class for file operations
export class SharePointService {
  async downloadFile(siteUrl: string, folderPath: string, fileId: string): Promise<Buffer> {
    try {
      const client = await getUncachableSharePointClient();
      
      // Extract site path from URL
      const urlParts = new URL(siteUrl);
      const sitePath = urlParts.pathname;
      
      // Get site information
      const site = await client
        .api(`/sites/${urlParts.hostname}:${sitePath}`)
        .get();
      
      const siteId = site.id;
      
      // Get default drive
      const drive = await client
        .api(`/sites/${siteId}/drive`)
        .get();
      
      const driveId = drive.id;
      
      // Download the file using the file ID
      const fileStream = await client
        .api(`/drives/${driveId}/items/${fileId}/content`)
        .getStream();
      
      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(Buffer.from(chunk));
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('[SharePoint] Error downloading file:', error);
      throw new Error(`Failed to download file from SharePoint: ${parseGraphError(error)}`);
    }
  }

  async downloadFileByPath(siteUrl: string, filePath: string): Promise<Buffer> {
    try {
      const client = await getUncachableSharePointClient();
      
      // Normalize the file path
      const normalizedPath = normalizeFolderPath(filePath);
      
      // Extract site path from URL
      const urlParts = new URL(siteUrl);
      const sitePath = urlParts.pathname;
      
      // Get site information
      const site = await client
        .api(`/sites/${urlParts.hostname}:${sitePath}`)
        .get();
      
      const siteId = site.id;
      
      // Get default drive
      const drive = await client
        .api(`/sites/${siteId}/drive`)
        .get();
      
      const driveId = drive.id;
      
      // Download the file using the file path
      const fileStream = await client
        .api(`/drives/${driveId}/root:${normalizedPath}:/content`)
        .getStream();
      
      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(Buffer.from(chunk));
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('[SharePoint] Error downloading file by path:', error);
      throw new Error(`Failed to download file from SharePoint: ${parseGraphError(error)}`);
    }
  }

  // Stream large file directly to disk to avoid memory issues
  async downloadFileToTempPath(
    siteUrl: string, 
    filePath: string, 
    onProgress?: (bytesDownloaded: number) => void
  ): Promise<string> {
    const fs = await import('fs');
    const fsPromises = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    try {
      const client = await getUncachableSharePointClient();
      
      // Normalize the file path
      const normalizedPath = normalizeFolderPath(filePath);
      
      // Extract site path from URL
      const urlParts = new URL(siteUrl);
      const sitePath = urlParts.pathname;
      
      // Get site information
      const site = await client
        .api(`/sites/${urlParts.hostname}:${sitePath}`)
        .get();
      
      const siteId = site.id;
      
      // Get default drive
      const drive = await client
        .api(`/sites/${siteId}/drive`)
        .get();
      
      const driveId = drive.id;
      
      // Download the file using the file path
      // .getStream() returns an async iterable, not a Node.js stream
      const fileStream = await client
        .api(`/drives/${driveId}/root:${normalizedPath}:/content`)
        .getStream();
      
      // Create a temporary file
      const tempDir = os.tmpdir();
      const tempFileName = `pst-${Date.now()}-${Math.random().toString(36).substring(7)}.pst`;
      const tempFilePath = path.join(tempDir, tempFileName);
      
      // Write stream for file output
      const writeStream = fs.createWriteStream(tempFilePath);
      let bytesDownloaded = 0;
      
      try {
        // Iterate over chunks and write to disk
        for await (const chunk of fileStream) {
          const buffer = Buffer.from(chunk);
          bytesDownloaded += buffer.length;
          
          // Report progress
          if (onProgress) {
            onProgress(bytesDownloaded);
          }
          
          // Write chunk to file with backpressure handling
          const canContinue = writeStream.write(buffer);
          if (!canContinue) {
            // Wait for drain event if write buffer is full
            await new Promise<void>((resolve) => writeStream.once('drain', resolve));
          }
        }
        
        // Close the write stream
        writeStream.end();
        
        // Wait for stream to finish
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
        
        console.log(`[SharePoint] Downloaded ${bytesDownloaded} bytes to ${tempFilePath}`);
        return tempFilePath;
        
      } catch (error) {
        // Cleanup on error
        writeStream.destroy();
        try {
          await fsPromises.unlink(tempFilePath);
          console.log(`[SharePoint] Cleaned up partial file after error: ${tempFilePath}`);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
    } catch (error) {
      console.error('[SharePoint] Error downloading file to temp path:', error);
      throw new Error(`Failed to download file from SharePoint: ${parseGraphError(error)}`);
    }
  }

  // Upload a file to SharePoint
  async uploadFile(
    siteUrl: string,
    folderPath: string,
    fileName: string,
    fileBuffer: Buffer
  ): Promise<{ success: boolean; filePath: string; error?: string }> {
    try {
      const client = await getUncachableSharePointClient();
      
      // Normalize the folder path
      const normalizedFolderPath = normalizeFolderPath(folderPath);
      
      // Extract site path from URL
      const urlParts = new URL(siteUrl);
      const sitePath = urlParts.pathname;
      
      // Get site information
      const site = await client
        .api(`/sites/${urlParts.hostname}:${sitePath}`)
        .get();
      
      const siteId = site.id;
      
      // Get default drive
      const drive = await client
        .api(`/sites/${siteId}/drive`)
        .get();
      
      const driveId = drive.id;
      
      // Construct the full file path
      const fullFilePath = normalizedFolderPath.endsWith('/')
        ? `${normalizedFolderPath}${fileName}`
        : `${normalizedFolderPath}/${fileName}`;
      
      console.log(`[SharePoint Upload] Uploading file to: ${fullFilePath}`);
      
      // Upload the file
      // For files < 4MB, use simple upload
      // For files > 4MB, use upload session (chunked upload)
      const fileSizeBytes = fileBuffer.length;
      const fileSizeMB = fileSizeBytes / (1024 * 1024);
      
      if (fileSizeMB < 4) {
        // Simple upload for small files
        await client
          .api(`/drives/${driveId}/root:${fullFilePath}:/content`)
          .put(fileBuffer);
        
        console.log(`[SharePoint Upload] Successfully uploaded ${fileName} (${fileSizeMB.toFixed(2)} MB)`);
      } else {
        // Chunked upload for large files
        const uploadSession = await client
          .api(`/drives/${driveId}/root:${fullFilePath}:/createUploadSession`)
          .post({});
        
        const uploadUrl = uploadSession.uploadUrl;
        const chunkSize = 320 * 1024 * 10; // 3.2 MB chunks (recommended by Microsoft)
        let start = 0;
        
        while (start < fileSizeBytes) {
          const end = Math.min(start + chunkSize, fileSizeBytes);
          const chunk = fileBuffer.slice(start, end);
          const contentRange = `bytes ${start}-${end - 1}/${fileSizeBytes}`;
          
          console.log(`[SharePoint Upload] Uploading chunk: ${contentRange}`);
          
          const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Range': contentRange,
              'Content-Length': chunk.length.toString(),
            },
            body: chunk,
          });
          
          if (!response.ok && response.status !== 202) {
            throw new Error(`Upload chunk failed: ${response.statusText}`);
          }
          
          start = end;
        }
        
        console.log(`[SharePoint Upload] Successfully uploaded ${fileName} (${fileSizeMB.toFixed(2)} MB) using chunked upload`);
      }
      
      return {
        success: true,
        filePath: fullFilePath,
      };
    } catch (error) {
      console.error('[SharePoint] Error uploading file:', error);
      return {
        success: false,
        filePath: '',
        error: parseGraphError(error),
      };
    }
  }
}
