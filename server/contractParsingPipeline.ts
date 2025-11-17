/**
 * Contract Parsing Pipeline
 * 
 * Orchestrates the entire contract parsing workflow:
 * 1. Extract PDF text (page-by-page)
 * 2. Normalize text
 * 3. Detect logical parts
 * 4. Chunk parts
 * 5. Summarize chunks with Claude
 * 6. Store results in database
 * 
 * Provides smooth progress tracking using work units formula:
 * totalWorkUnits = P (pages) + 5 (overhead) + C (chunks) + C*5 (Claude steps)
 */

import { db } from './db';
import { 
  contractParsedAssets, 
  contractLogicalParts, 
  contractTextChunks,
  contractParsingJobs,
  contractParsingJobSteps,
  contractReviewDocuments
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { extractContractText, normalizeContractText } from './contractTextExtraction';
import { detectLogicalParts } from './contractPartDetection';
import { chunkAllParts } from './contractParsingChunking';
import { summarizeChunk } from './contractClaudeSummarization';
import { ObjectStorageService } from './objectStorage';
import crypto from 'crypto';

export interface ProcessingProgress {
  jobId: string;
  revisionId: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  phase: 'queued' | 'extracting_pdf' | 'normalising_text' | 'detecting_parts' | 'chunking' | 'summarising' | 'completed' | 'failed';
  message: string;
  totalWorkUnits: number;
  completedWorkUnits: number;
  percentage: number;
  chunkStats?: {
    pageCount: number;
    chunkCount: number;
    totalTokens: number;
    limitOk: boolean;
    chunks: Array<{
      chunkIndex: number;
      pageRange: string;
      tokenUsage: number;
      charCount: number;
    }>;
  };
  error?: string;
}

/**
 * Transform ChunkSummaryResult to match contractTextChunks.summaryJson schema
 * Strict validation with explicit error handling
 */
function toSummaryJsonPayload(summary: any): any | null {
  // Guard: Ensure summary is an object
  if (!summary || typeof summary !== 'object') {
    console.error(`[toSummaryJsonPayload] Invalid summary object`);
    return null;
  }
  
  // Parse and validate page range with strict regex (e.g., "15-20")
  const pageRangeMatch = summary.pageRange?.match(/^(\d+)-(\d+)$/);
  if (!pageRangeMatch) {
    console.error(`[toSummaryJsonPayload] Invalid pageRange format: ${summary.pageRange}`);
    return null;
  }
  
  const startPage = parseInt(pageRangeMatch[1], 10);
  const endPage = parseInt(pageRangeMatch[2], 10);
  
  // Validate: start must be > 0, end >= start (allow same page for single-page chunks)
  if (startPage < 1 || endPage < startPage) {
    console.error(`[toSummaryJsonPayload] Invalid pageRange values: ${startPage}-${endPage}`);
    return null;
  }
  
  // Guard: Ensure all expected arrays exist
  if (!Array.isArray(summary.summaries)) {
    console.error(`[toSummaryJsonPayload] Missing or invalid summaries array`);
    summary.summaries = [];
  }
  if (!Array.isArray(summary.definitions)) {
    summary.definitions = [];
  }
  if (!Array.isArray(summary.crossRefs)) {
    summary.crossRefs = [];
  }
  if (!Array.isArray(summary.risks)) {
    summary.risks = [];
  }
  
  return {
    pageRange: [startPage, endPage] as [number, number],
    // Summaries: require clauseNumber, heading, summary
    summaries: summary.summaries
      .filter((s: any) => s?.clauseNumber && s?.heading && s?.summary)
      .map((s: any) => ({
        clauseNumber: String(s.clauseNumber),
        heading: String(s.heading),
        summary: String(s.summary)
      })),
    // Definitions: require term, definition, AND clauseRef (maps to clauseNumber)
    definedTerms: summary.definitions
      .filter((d: any) => d?.term && d?.definition && d?.clauseRef)
      .map((d: any) => ({
        clauseNumber: String(d.clauseRef),
        term: String(d.term),
        definition: String(d.definition)
      })),
    // Cross-references: require fromClause, toClause
    crossReferences: summary.crossRefs
      .filter((c: any) => c?.fromClause && c?.toClause)
      .map((c: any) => ({
        fromClause: String(c.fromClause),
        toClause: String(c.toClause),
        context: c?.context ? String(c.context) : ''
      })),
    // Risks: require clauseRef, description, severity
    risks: summary.risks
      .filter((r: any) => r?.clauseRef && r?.description && r?.severity)
      .map((r: any) => ({
        clauseNumber: String(r.clauseRef),
        severity: String(r.severity),
        description: String(r.description)
      }))
  };
}

/**
 * Process a contract revision and extract structured data
 * 
 * @param revisionId - Contract review document (revision) ID
 * @returns Processing result
 */
export async function processContractRevision(revisionId: string): Promise<void> {
  console.log(`[ContractParsing] Starting processing for revision ${revisionId}`);
  
  // Get revision from database
  const [revision] = await db
    .select()
    .from(contractReviewDocuments)
    .where(eq(contractReviewDocuments.id, revisionId))
    .limit(1);
  
  if (!revision) {
    throw new Error(`Revision ${revisionId} not found`);
  }
  
  if (!revision.clientContractFileKey) {
    throw new Error(`Revision ${revisionId} has no contract file attached`);
  }
  
  // Create parsing job
  const [job] = await db
    .insert(contractParsingJobs)
    .values({
      revisionId,
      status: 'processing',
      phase: 'extracting_pdf',
      message: 'Starting PDF extraction...',
      totalWorkUnits: 100, // Initial estimate, will update
      completedWorkUnits: 0,
      startedAt: new Date(),
    })
    .returning();
  
  const jobId = job.id;
  
  try {
    // === PHASE 1: Extract PDF ===
    await updateJobProgress(jobId, {
      phase: 'extracting_pdf',
      message: 'Extracting text from PDF...'
    });
    
    // Download PDF from object storage
    const objectStorage = new ObjectStorageService();
    const pdfBuffer = await objectStorage.downloadFile(revision.clientContractFileKey);
    
    // Extract text page-by-page
    const extraction = await extractContractText(pdfBuffer);
    const pageCount = extraction.pageCount;
    
    console.log(`[ContractParsing] Extracted ${pageCount} pages`);
    
    // Calculate file hash for deduplication
    const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    
    // === PHASE 2: Normalize text ===
    await updateJobProgress(jobId, {
      phase: 'normalising_text',
      message: 'Normalizing text...',
      completedWorkUnits: pageCount
    });
    
    const normalizedText = normalizeContractText(extraction.fullText);
    
    console.log(`[ContractParsing] Normalized text: ${normalizedText.length} characters`);
    
    // === PHASE 3: Detect logical parts ===
    await updateJobProgress(jobId, {
      phase: 'detecting_parts',
      message: 'Detecting contract sections...',
      completedWorkUnits: pageCount + 2
    });
    
    const detectedParts = detectLogicalParts(normalizedText);
    
    console.log(`[ContractParsing] Detected ${detectedParts.length} logical parts`);
    
    // === PHASE 4: Chunk parts ===
    await updateJobProgress(jobId, {
      phase: 'chunking',
      message: 'Chunking contract text...',
      completedWorkUnits: pageCount + 3
    });
    
    const chunksMap = chunkAllParts(detectedParts, normalizedText);
    
    // Calculate total chunks
    let totalChunks = 0;
    chunksMap.forEach(chunks => {
      totalChunks += chunks.length;
    });
    
    console.log(`[ContractParsing] Created ${totalChunks} chunks`);
    
    // Update total work units with accurate count
    // Formula: P (pages) + 5 (overhead) + C (chunks) + C*5 (Claude steps)
    const totalWorkUnits = pageCount + 5 + totalChunks + (totalChunks * 5);
    
    await updateJobProgress(jobId, {
      totalWorkUnits,
      completedWorkUnits: pageCount + 5 + totalChunks
    });
    
    // === PHASE 5: Create parsed asset ===
    const [parsedAsset] = await db
      .insert(contractParsedAssets)
      .values({
        projectId: revision.projectId,
        templateId: revision.templateId,
        sourceRevisionId: revisionId,
        fileKey: revision.clientContractFileKey,
        fileHash,
        pageCount,
        rawExtractedText: extraction.fullText,
        selectedTemplateColumnIds: revision.selectedTemplateColumnIds,
        tokenUsageTotal: 0,
      })
      .returning();
    
    console.log(`[ContractParsing] Created parsed asset ${parsedAsset.id}`);
    
    // Update job with parsed asset ID
    await db
      .update(contractParsingJobs)
      .set({ parsedAssetId: parsedAsset.id })
      .where(eq(contractParsingJobs.id, jobId));
    
    // === PHASE 6: Store logical parts ===
    for (const part of detectedParts) {
      await db.insert(contractLogicalParts).values({
        parsedAssetId: parsedAsset.id,
        orderIndex: part.orderIndex,
        partType: part.type.toLowerCase(),
        label: part.label,
        startPage: part.startPage,
        endPage: part.endPage,
        detectedBy: part.detectedBy,
        confidence: part.confidence.toString(),
      });
    }
    
    console.log(`[ContractParsing] Stored ${detectedParts.length} logical parts`);
    
    // === PHASE 7: Summarize chunks with Claude ===
    await updateJobProgress(jobId, {
      phase: 'summarising',
      message: `Analyzing chunks with Claude (0/${totalChunks})...`
    });
    
    let completedChunks = 0;
    const baseWorkUnits = pageCount + 5 + totalChunks;
    
    // Process each part's chunks
    for (const [partIndex, chunks] of Array.from(chunksMap.entries())) {
      const part = detectedParts.find(p => p.orderIndex === partIndex);
      if (!part) continue;
      
      // Get the logical part ID from database
      const [logicalPart] = await db
        .select()
        .from(contractLogicalParts)
        .where(
          and(
            eq(contractLogicalParts.parsedAssetId, parsedAsset.id),
            eq(contractLogicalParts.orderIndex, partIndex)
          )
        )
        .limit(1);
      
      if (!logicalPart) continue;
      
      // Process each chunk
      for (const chunk of chunks) {
        const globalChunkIndex = completedChunks + 1;
        
        // Update progress (5 sub-steps per chunk)
        const currentWorkUnits = baseWorkUnits + (completedChunks * 5);
        await updateJobProgress(jobId, {
          message: `Analyzing chunk ${globalChunkIndex}/${totalChunks} with Claude...`,
          completedWorkUnits: currentWorkUnits + 1 // "Request prepared"
        });
        
        // Summarize chunk with Claude
        const pageRange = `${chunk.startPage}-${chunk.endPage}`;
        
        // Track "request sent"
        await updateJobProgress(jobId, {
          completedWorkUnits: currentWorkUnits + 2
        });
        
        const summary = await summarizeChunk(chunk, globalChunkIndex, pageRange);
        
        // Track "response received"
        await updateJobProgress(jobId, {
          completedWorkUnits: currentWorkUnits + 3
        });
        
        // Transform summary (returns null if validation fails)
        const transformedSummary = toSummaryJsonPayload(summary);
        if (!transformedSummary) {
          throw new Error(`Summary validation failed for chunk ${globalChunkIndex} - invalid page range or structure`);
        }
        
        // Store chunk in database
        await db.insert(contractTextChunks).values({
          parsedAssetId: parsedAsset.id,
          logicalPartId: logicalPart.id,
          chunkIndex: globalChunkIndex,
          startPage: chunk.startPage,
          endPage: chunk.endPage,
          startChar: chunk.startChar,
          endChar: chunk.endChar,
          rawText: chunk.rawText,
          summaryJson: transformedSummary,
          tokenUsage: summary.tokensUsed,
        });
        
        // Track "summary stored"
        await updateJobProgress(jobId, {
          completedWorkUnits: currentWorkUnits + 5
        });
        
        // Record job step
        await db.insert(contractParsingJobSteps).values({
          jobId,
          stepType: 'claude_summarization',
          workUnits: 5,
          tokensConsumed: summary.tokensUsed,
        });
        
        completedChunks++;
      }
    }
    
    // === PHASE 8: Complete ===
    // Calculate total tokens used
    const allChunks = await db
      .select()
      .from(contractTextChunks)
      .where(eq(contractTextChunks.parsedAssetId, parsedAsset.id));
    
    const totalTokens = allChunks.reduce((sum, chunk) => sum + (chunk.tokenUsage || 0), 0);
    
    await db
      .update(contractParsedAssets)
      .set({ tokenUsageTotal: totalTokens })
      .where(eq(contractParsedAssets.id, parsedAsset.id));
    
    await db
      .update(contractReviewDocuments)
      .set({ parsedAssetId: parsedAsset.id })
      .where(eq(contractReviewDocuments.id, revisionId));
    
    await updateJobProgress(jobId, {
      status: 'succeeded',
      phase: 'completed',
      message: 'Contract parsing completed successfully',
      completedWorkUnits: totalWorkUnits
    });
    
    await db
      .update(contractParsingJobs)
      .set({ finishedAt: new Date() })
      .where(eq(contractParsingJobs.id, jobId));
    
    console.log(`[ContractParsing] Processing complete for revision ${revisionId}`);
    
  } catch (error) {
    console.error(`[ContractParsing] Processing failed for revision ${revisionId}:`, error);
    
    // Cleanup: Delete partial/orphaned records to prevent corrupt state
    try {
      // Get the parsed asset ID if it was created
      const [failedJob] = await db
        .select()
        .from(contractParsingJobs)
        .where(eq(contractParsingJobs.id, jobId))
        .limit(1);
      
      if (failedJob?.parsedAssetId) {
        console.log(`[ContractParsing] Cleaning up partially created parsed asset: ${failedJob.parsedAssetId}`);
        
        // Delete in correct order to respect foreign key constraints:
        // 1. Delete text chunks (reference logicalPartId)
        await db
          .delete(contractTextChunks)
          .where(eq(contractTextChunks.parsedAssetId, failedJob.parsedAssetId));
        
        // 2. Delete logical parts (reference parsedAssetId)
        await db
          .delete(contractLogicalParts)
          .where(eq(contractLogicalParts.parsedAssetId, failedJob.parsedAssetId));
        
        // 3. Delete parsed asset (parent record)
        await db
          .delete(contractParsedAssets)
          .where(eq(contractParsedAssets.id, failedJob.parsedAssetId));
        
        console.log(`[ContractParsing] Cleanup complete: removed all partial records`);
      }
      
      // Delete orphaned job steps
      await db
        .delete(contractParsingJobSteps)
        .where(eq(contractParsingJobSteps.jobId, jobId));
      
    } catch (cleanupError) {
      console.error(`[ContractParsing] Cleanup failed:`, cleanupError);
      // Don't throw - we still want to mark the job as failed
    }
    
    // Get current job to retrieve totalWorkUnits
    const [currentJob] = await db
      .select()
      .from(contractParsingJobs)
      .where(eq(contractParsingJobs.id, jobId))
      .limit(1);
    
    // Mark job as failed and set completedWorkUnits = totalWorkUnits for consistent UI
    await db
      .update(contractParsingJobs)
      .set({
        status: 'failed',
        phase: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        completedWorkUnits: currentJob?.totalWorkUnits || 0,
        parsedAssetId: null, // Clear reference to deleted parsed asset
        errorJson: {
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        },
        finishedAt: new Date()
      })
      .where(eq(contractParsingJobs.id, jobId));
    
    throw error;
  }
}

/**
 * Update job progress
 */
async function updateJobProgress(
  jobId: string,
  updates: {
    status?: 'pending' | 'processing' | 'succeeded' | 'failed';
    phase?: 'queued' | 'extracting_pdf' | 'normalising_text' | 'detecting_parts' | 'chunking' | 'summarising' | 'completed' | 'failed';
    message?: string;
    totalWorkUnits?: number;
    completedWorkUnits?: number;
  }
): Promise<void> {
  await db
    .update(contractParsingJobs)
    .set({
      ...updates,
      lastHeartbeat: new Date()
    })
    .where(eq(contractParsingJobs.id, jobId));
}

/**
 * Get parsing job progress with optional chunk statistics on completion
 */
export async function getParsingProgress(revisionId: string): Promise<ProcessingProgress | null> {
  const [job] = await db
    .select()
    .from(contractParsingJobs)
    .where(eq(contractParsingJobs.revisionId, revisionId))
    .limit(1);
  
  if (!job) {
    return null;
  }
  
  const percentage = job.totalWorkUnits > 0
    ? Math.min(100, Math.round((job.completedWorkUnits / job.totalWorkUnits) * 100))
    : 0;
  
  // Fetch chunk statistics only when job has succeeded
  let chunkStats: any = undefined;
  if (job.status === 'succeeded' && job.parsedAssetId) {
    try {
      // Get parsed asset for page count and total tokens
      const [parsedAsset] = await db
        .select()
        .from(contractParsedAssets)
        .where(eq(contractParsedAssets.id, job.parsedAssetId))
        .limit(1);
      
      // Get all chunks for per-chunk breakdown
      const chunks = await db
        .select({
          chunkIndex: contractTextChunks.chunkIndex,
          startPage: contractTextChunks.startPage,
          endPage: contractTextChunks.endPage,
          tokenUsage: contractTextChunks.tokenUsage,
          charCount: sql<number>`LENGTH(${contractTextChunks.rawText})`,
        })
        .from(contractTextChunks)
        .where(eq(contractTextChunks.parsedAssetId, job.parsedAssetId))
        .orderBy(contractTextChunks.chunkIndex);
      
      // Check if all chunks are within Claude's 200k token limit
      const maxTokensPerChunk = Math.max(...chunks.map(c => c.tokenUsage || 0));
      const limitOk = maxTokensPerChunk <= 200000;
      
      chunkStats = {
        pageCount: parsedAsset?.pageCount || 0,
        chunkCount: chunks.length,
        totalTokens: parsedAsset?.tokenUsageTotal || 0,
        limitOk,
        chunks: chunks.map(c => ({
          chunkIndex: c.chunkIndex,
          pageRange: `${c.startPage}-${c.endPage}`,
          tokenUsage: c.tokenUsage || 0,
          charCount: c.charCount || 0,
        })),
      };
    } catch (error) {
      console.error(`[ContractParsing] Failed to fetch chunk stats:`, error);
      // Don't fail the whole request if stats query fails
    }
  }
  
  return {
    jobId: job.id,
    revisionId: job.revisionId,
    status: job.status as any,
    phase: job.phase as any,
    message: job.message || '',
    totalWorkUnits: job.totalWorkUnits,
    completedWorkUnits: job.completedWorkUnits,
    percentage,
    chunkStats,
    error: job.errorJson ? JSON.stringify(job.errorJson) : undefined
  };
}
