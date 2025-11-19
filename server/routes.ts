import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { contractReviewWS } from "./contractReviewWebSocket";
import { riskRegisterWS } from "./riskRegisterWebSocket";
import { resourceTypesWS } from "./resourceTypesWebSocket";
import { globalVariablesWS } from "./globalVariablesWebSocket";
import { resourceRatesWS } from "./resourceRatesWebSocket";
import { worksheetsWS } from "./worksheetsWebSocket";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  templateColumnConfigs, 
  insertTemplateColumnConfigSchema,
  templateRows,
  insertTemplateRowSchema,
  contractReviewDocuments,
  contractReviewRows,
  contractReviewRowComments,
  insertContractReviewDocumentSchema,
  insertContractReviewRowSchema,
  insertContractReviewRowCommentSchema,
  projects,
  insertProjectSchema,
  businessUnits,
  insertBusinessUnitSchema,
  contractTemplates,
  insertContractTemplateSchema,
  companies,
  insertCompanySchema,
  rfis,
  insertRFISchema,
  rfiComments,
  insertRFICommentSchema,
  roles,
  permissions,
  projectRoles,
  userAccounts,
  insertUserAccountSchema,
  people,
  insertPersonSchema,
  type Person,
  employmentRoles,
  insertEmploymentRoleSchema,
  userEmploymentHistory,
  insertUserEmploymentHistorySchema,
  projectMemberships,
  insertProjectMembershipSchema,
  correspondenceLetters,
  correspondenceResponses,
  projectSharePointSettings,
  programs,
  insertProgramSchema,
  aiUsageLogs,
  riskRegisterRevisions,
  insertRiskRegisterRevisionSchema,
  risks,
  insertRiskSchema,
  riskActions,
  insertRiskActionSchema,
  quantSettings,
  insertQuantSettingSchema,
  likelihoodScales,
  consequenceScales,
  heatmapMatrix,
  doaEscalationMatrix,
  consequenceTypes,
  insertConsequenceTypeSchema,
  consequenceRatings,
  insertConsequenceRatingSchema,
  companyThemeSettings,
  insertCompanyThemeSettingsSchema,
  userRiskColumnPreferences,
  insertUserRiskColumnPreferencesSchema,
  userWorksheetColumnPreferences,
  insertUserWorksheetColumnPreferencesSchema,
  resourceTypes,
  insertResourceTypeSchema,
  monteCarloSnapshots,
  insertMonteCarloSnapshotSchema,
  contractClauses,
  insertContractClauseSchema,
  contractDefinitions,
  insertContractDefinitionSchema,
  contractNotes,
  insertContractNoteSchema,
  aiThreads,
  insertAiThreadSchema,
  aiMessages,
  insertAiMessageSchema,
  contractSearchIndex,
  insertContractSearchIndexSchema,
  quoteCategories,
  quotes,
  userQuoteProgress,
  insertUserQuoteProgressSchema,
  extendedToc
} from "@shared/schema";
import { eq, and, desc, asc, isNull, sql } from "drizzle-orm";
import multer from "multer";
import ExcelJS from "exceljs";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import * as rbacService from "./rbac-service";
import { 
  generateEmbedding, 
  extractTextFromPDF, 
  findSimilarLetters, 
  prepareTextForEmbedding 
} from "./semanticSearch";
import { searchSharePointDocuments, semanticSearchSharePoint, syncSharePointDocuments, SharePointService } from "./sharepoint";
import { parseXERBuffer, calculateCriticalPath } from "./xerParser";
import { extractAndSaveContractMetadata } from "./contractMetadataExtraction";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  }
});

// Table 2: Review work columns (ordered per user requirements)
// Order: Summary Position of Document, Cl. Ref, Comply, AI Proposed Mitigation, Bid Team Notes
const REVIEW_WORK_COLUMNS = [
  { columnHeader: 'Summary Position of Document', orderIndex: 1000 },
  { columnHeader: 'Cl. Ref', orderIndex: 1001 },
  { columnHeader: 'Comply', orderIndex: 1002 },
  { columnHeader: 'AI Proposed Mitigation', orderIndex: 1003 },
  { columnHeader: 'Bid Team Notes', orderIndex: 1004 },
];

// Helper function to extract text from contract documents (PDF and Word)
async function extractTextFromContract(
  buffer: Buffer, 
  fileName: string, 
  onProgress?: (status: 'start' | 'complete', fileName: string) => void
): Promise<string> {
  const fileExtension = fileName.toLowerCase().split('.').pop();
  
  if (fileExtension === 'pdf') {
    // Extract text from PDF using pdf-parse v2.x API
    if (onProgress) onProgress('start', fileName);
    
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    
    if (onProgress) onProgress('complete', fileName);
    return result.text;
  } else if (fileExtension === 'doc' || fileExtension === 'docx') {
    // Extract text from Word document
    if (onProgress) onProgress('start', fileName);
    
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    
    if (onProgress) onProgress('complete', fileName);
    return result.value;
  } else {
    throw new Error(`Unsupported file format: ${fileExtension}`);
  }
}

// Housekeeping: Ensure Financial and Time consequence types exist for a project
async function ensureDefaultConsequenceTypes(projectId: string, tx?: any): Promise<void> {
  try {
    const dbContext = tx || db;
    
    // Check existing consequence types for this project
    const existingTypes = await dbContext
      .select()
      .from(consequenceTypes)
      .where(eq(consequenceTypes.projectId, projectId));
    
    const existingFinancial = existingTypes.find((t: any) => t.name === 'Financial');
    const existingTime = existingTypes.find((t: any) => t.name === 'Time');
    
    const typesToCreate: Array<{ name: string; isDefault: boolean; displayOrder: number }> = [];
    
    if (!existingFinancial) {
      typesToCreate.push({ name: 'Financial', isDefault: true, displayOrder: 0 });
    }
    if (!existingTime) {
      typesToCreate.push({ name: 'Time', isDefault: true, displayOrder: 1 });
    }
    
    // Create missing default types
    if (typesToCreate.length > 0) {
      console.log(`[Risk Register] Creating ${typesToCreate.length} default consequence type(s) for project ${projectId}`);
    }
    
    for (const type of typesToCreate) {
      const [newType] = await dbContext
        .insert(consequenceTypes)
        .values({
          projectId,
          name: type.name,
          isDefault: type.isDefault,
          displayOrder: type.displayOrder,
        })
        .returning();
      
      // Create default ratings (6 levels) for the new type with descriptions
      let defaultRatings: Array<{ level: number; description: string }> = [];
      
      if (type.name === 'Financial') {
        defaultRatings = [
          { level: 1, description: 'Negligible financial impact\n<5% of Project Gross Margin' },
          { level: 2, description: 'Minor financial impact\n5% to 20% of Project Gross Margin' },
          { level: 3, description: 'Moderate financial impact\n20% to 40% of Project Gross Margin' },
          { level: 4, description: 'Significant financial impact\n40% to 70% of Project Gross Margin' },
          { level: 5, description: 'Major financial impact\n70% to 100% of Project Gross Margin' },
          { level: 6, description: 'Catastrophic financial impact\n>100% of Project Gross Margin' },
        ];
      } else if (type.name === 'Time') {
        defaultRatings = [
          { level: 1, description: 'Short term slippage\nNo impact to project schedule' },
          { level: 2, description: 'Schedule slippage without impact to project end date\nNo impact to delivery period' },
          { level: 3, description: 'Minor schedule overrun\n<5% of Delivery Period Duration' },
          { level: 4, description: 'Moderate schedule overrun\n5% to 10% of Delivery Period Duration' },
          { level: 5, description: 'Significant schedule overrun\n10% to 20% of Delivery Period Duration' },
          { level: 6, description: 'Major schedule overrun\n>20% of Delivery Period Duration' },
        ];
      } else {
        // For custom types, create empty descriptions
        defaultRatings = [
          { level: 1, description: '' },
          { level: 2, description: '' },
          { level: 3, description: '' },
          { level: 4, description: '' },
          { level: 5, description: '' },
          { level: 6, description: '' },
        ];
      }
      
      for (const rating of defaultRatings) {
        await dbContext.insert(consequenceRatings).values({
          consequenceTypeId: newType.id,
          level: rating.level,
          description: rating.description,
        });
      }
    }
    
    // Update existing Financial and Time types if their descriptions are empty
    const typesToUpdate = [existingFinancial, existingTime].filter(Boolean);
    for (const type of typesToUpdate) {
      if (!type) continue;
      
      // Get default descriptions for this type
      let defaultDescriptions: { [level: number]: string } = {};
      
      if (type.name === 'Financial') {
        defaultDescriptions = {
          1: 'Negligible financial impact\n<5% of Project Gross Margin',
          2: 'Minor financial impact\n5% to 20% of Project Gross Margin',
          3: 'Moderate financial impact\n20% to 40% of Project Gross Margin',
          4: 'Significant financial impact\n40% to 70% of Project Gross Margin',
          5: 'Major financial impact\n70% to 100% of Project Gross Margin',
          6: 'Catastrophic financial impact\n>100% of Project Gross Margin',
        };
      } else if (type.name === 'Time') {
        defaultDescriptions = {
          1: 'Short term slippage\nNo impact to project schedule',
          2: 'Schedule slippage without impact to project end date\nNo impact to delivery period',
          3: 'Minor schedule overrun\n<5% of Delivery Period Duration',
          4: 'Moderate schedule overrun\n5% to 10% of Delivery Period Duration',
          5: 'Significant schedule overrun\n10% to 20% of Delivery Period Duration',
          6: 'Major schedule overrun\n>20% of Delivery Period Duration',
        };
      }
      
      // Get existing ratings for this type
      const existingRatings = await dbContext
        .select()
        .from(consequenceRatings)
        .where(eq(consequenceRatings.consequenceTypeId, type.id));
      
      // Update ratings with empty descriptions
      for (const rating of existingRatings) {
        if (!rating.description || rating.description.trim() === '') {
          const defaultDesc = defaultDescriptions[rating.level];
          if (defaultDesc) {
            await dbContext
              .update(consequenceRatings)
              .set({ description: defaultDesc })
              .where(eq(consequenceRatings.id, rating.id));
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Risk Register] Error ensuring default consequence types for project ${projectId}:`, error);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Setup Replit Auth (from javascript_log_in_with_replit blueprint)
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const person = req.person;

      // Return person data (includes replitAuthId, email, names, etc.)
      res.json(person);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard Quotes Rotator API
  app.get('/api/quotes/rotator', isAuthenticated, async (req: any, res) => {
    try {
      const person = req.person;

      // Fetch all categories with their quotes, ordered for rotation
      const categories = await db
        .select()
        .from(quoteCategories)
        .orderBy(quoteCategories.displayOrder);

      // Fetch all quotes for each category
      const categoriesWithQuotes = await Promise.all(
        categories.map(async (category) => {
          const categoryQuotes = await db
            .select()
            .from(quotes)
            .where(eq(quotes.categoryId, category.id))
            .orderBy(quotes.itemIndex);

          return {
            ...category,
            quotes: categoryQuotes,
          };
        })
      );

      // Get user's progress (if any)
      const companyId = req.query.companyId as string | undefined;
      const progress = await db
        .select()
        .from(userQuoteProgress)
        .where(
          and(
            eq(userQuoteProgress.userId, person.id),
            companyId
              ? eq(userQuoteProgress.companyId, companyId)
              : isNull(userQuoteProgress.companyId)
          )
        )
        .limit(1);

      res.json({
        categories: categoriesWithQuotes,
        progress: progress[0] || null,
      });
    } catch (error) {
      console.error("Error fetching quotes:", error);
      res.status(500).json({ message: "Failed to fetch quotes" });
    }
  });

  app.patch('/api/quotes/bookmark', isAuthenticated, async (req: any, res) => {
    try {
      const person = req.person;

      const { rowIndex, categoryIndex, companyId } = req.body;

      // Validate input
      if (typeof rowIndex !== 'number' || typeof categoryIndex !== 'number') {
        return res.status(400).json({ message: "Invalid input" });
      }

      // Upsert user progress
      const existing = await db
        .select()
        .from(userQuoteProgress)
        .where(
          and(
            eq(userQuoteProgress.userId, person.id),
            companyId
              ? eq(userQuoteProgress.companyId, companyId)
              : isNull(userQuoteProgress.companyId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(userQuoteProgress)
          .set({
            rowIndex,
            categoryIndex,
            lastShownAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userQuoteProgress.id, existing[0].id));
      } else {
        // Insert new
        await db.insert(userQuoteProgress).values({
          userId: person.id,
          companyId: companyId || null,
          rowIndex,
          categoryIndex,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating quote bookmark:", error);
      res.status(500).json({ message: "Failed to update bookmark" });
    }
  });
  
  // Object Storage Routes
  app.post('/api/upload-template-file', (req, res, next) => {
    console.log('[ROUTE] /api/upload-template-file route reached');
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('[MULTER] Error:', err);
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    console.log('[UPLOAD] Received upload request');
    console.log('[UPLOAD] File:', req.file ? `${req.file.originalname} (${req.file.size} bytes)` : 'No file');
    
    try {
      if (!req.file) {
        console.log('[UPLOAD] Error: No file in request');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('[UPLOAD] Starting object storage upload...');
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.uploadFile(req.file.buffer, req.file.originalname);
      
      console.log('[UPLOAD] Success! Object path:', objectPath);
      res.json({ objectPath });
    } catch (error) {
      console.error('[UPLOAD] Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  app.get('/objects/:objectPath(*)', async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error('Error serving object:', error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });
  
  // Template Column Configuration Routes
  
  // Save column configurations for a template
  app.post('/api/templates/:templateId/columns', async (req, res) => {
    try {
      const { templateId } = req.params;
      const { columns } = req.body;

      // Delete existing column configs for this template
      await db.delete(templateColumnConfigs).where(eq(templateColumnConfigs.templateId, templateId));

      // Insert new column configs
      const configs = columns.map((col: any) => ({
        templateId,
        columnHeader: col.header,
        isEditable: col.isEditable,
        orderIndex: col.orderIndex,
        isDoaAcronymColumn: col.isDoaAcronymColumn || false,
      }));

      const inserted = await db.insert(templateColumnConfigs).values(configs).returning();
      
      res.json({ success: true, configs: inserted });
    } catch (error) {
      console.error('Error saving column configs:', error);
      res.status(500).json({ error: 'Failed to save column configurations' });
    }
  });

  // Get column configurations for a template
  app.get('/api/templates/:templateId/columns', async (req, res) => {
    try {
      const { templateId } = req.params;
      const configs = await db
        .select()
        .from(templateColumnConfigs)
        .where(eq(templateColumnConfigs.templateId, templateId))
        .orderBy(templateColumnConfigs.orderIndex);
      
      res.json(configs);
    } catch (error) {
      console.error('Error fetching column configs:', error);
      res.status(500).json({ error: 'Failed to fetch column configurations' });
    }
  });

  // Save template rows
  app.post('/api/templates/:templateId/rows', async (req, res) => {
    try {
      const { templateId } = req.params;
      const { rows } = req.body;

      // Delete existing rows for this template
      await db.delete(templateRows).where(eq(templateRows.templateId, templateId));

      // Insert new rows
      if (rows && rows.length > 0) {
        await db.insert(templateRows).values(rows);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving template rows:', error);
      res.status(500).json({ error: 'Failed to save template rows' });
    }
  });

  // Get template rows with employment role lookups
  app.get('/api/templates/:templateId/rows', async (req, res) => {
    try {
      const { templateId } = req.params;
      const rows = await db
        .select()
        .from(templateRows)
        .where(eq(templateRows.templateId, templateId))
        .orderBy(templateRows.rowIndex);
      
      res.json(rows);
    } catch (error) {
      console.error('Error fetching template rows:', error);
      res.status(500).json({ error: 'Failed to fetch template rows' });
    }
  });

  // Contract Review Routes
  
  // Get contract review for a project (includes template info and active revision)
  app.get('/api/projects/:projectId/contract-review', async (req, res) => {
    try {
      const { projectId } = req.params;
      
      // Get all revisions for this project
      const revisions = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.projectId, projectId))
        .orderBy(desc(contractReviewDocuments.revisionNumber));
      
      if (revisions.length === 0) {
        return res.json({ revisions: [], activeRevision: null });
      }

      const activeRevision = revisions.find(r => r.status === 'active');
      
      // Get rows for active revision - NEW DUAL-TABLE APPROACH
      let rows: any[] = [];
      if (activeRevision) {
        // Import the new schema tables
        const { 
          contractReviewTemplateSnapshots,
          contractReviewSnapshotRows,
          contractReviewSnapshotCells,
          contractReviewRevisionRows,
          contractReviewRevisionCells 
        } = await import('@shared/schema');
        
        // Get the snapshot for this revision
        const snapshot = await db
          .select()
          .from(contractReviewTemplateSnapshots)
          .where(eq(contractReviewTemplateSnapshots.templateId, activeRevision.templateId))
          .limit(1);
        
        if (snapshot.length > 0) {
          // PERFORMANCE FIX: Batch fetch revision rows and their cells
          const revisionRows = await db
            .select()
            .from(contractReviewRevisionRows)
            .where(eq(contractReviewRevisionRows.revisionId, activeRevision.id))
            .orderBy(contractReviewRevisionRows.rowIndex);
          
          if (revisionRows.length > 0) {
            // Batch fetch all cells upfront (eliminates N+1)
            const { inArray } = await import('drizzle-orm');
            const revRowIds = revisionRows.map(r => r.id);
            const snapshotRowIds = revisionRows.map(r => r.snapshotRowId);
            
            const allSnapshotCells = await db
              .select()
              .from(contractReviewSnapshotCells)
              .where(inArray(contractReviewSnapshotCells.snapshotRowId, snapshotRowIds))
              .orderBy(contractReviewSnapshotCells.orderIndex);
            
            const allRevisionCells = await db
              .select()
              .from(contractReviewRevisionCells)
              .where(inArray(contractReviewRevisionCells.revisionRowId, revRowIds));
            
            // Group cells by row
            const snapshotCellsByRow = new Map<string, typeof allSnapshotCells>();
            for (const cell of allSnapshotCells) {
              if (!snapshotCellsByRow.has(cell.snapshotRowId)) {
                snapshotCellsByRow.set(cell.snapshotRowId, []);
              }
              snapshotCellsByRow.get(cell.snapshotRowId)!.push(cell);
            }
            
            const revisionCellsByRow = new Map<string, typeof allRevisionCells>();
            for (const cell of allRevisionCells) {
              if (!revisionCellsByRow.has(cell.revisionRowId)) {
                revisionCellsByRow.set(cell.revisionRowId, []);
              }
              revisionCellsByRow.get(cell.revisionRowId)!.push(cell);
            }
            
            // Assemble rows
            rows = revisionRows.map(revRow => ({
              id: revRow.id,
              rowIndex: revRow.rowIndex,
              snapshotCells: snapshotCellsByRow.get(revRow.snapshotRowId) || [],
              revisionCells: revisionCellsByRow.get(revRow.id) || [],
            }));
          }
        }
      }
      
      res.json({ 
        revisions, 
        activeRevision,
        rows
      });
    } catch (error) {
      console.error('Error fetching contract review:', error);
      res.status(500).json({ error: 'Failed to fetch contract review' });
    }
  });

  // Get all revisions for a project
  app.get('/api/projects/:projectId/contract-review/revisions', async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const revisions = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.projectId, projectId))
        .orderBy(desc(contractReviewDocuments.revisionNumber));
      
      // Auto-correct: Ensure the latest revision is ACTIVE
      if (revisions.length > 0) {
        const latestRevision = revisions[0]; // Already ordered by revision number DESC
        
        // If latest revision is not active, fix it
        if (latestRevision.status !== 'active') {
          console.log(`[AUTO-CORRECT] Latest revision ${latestRevision.revisionNumber} is not ACTIVE, fixing...`);
          
          // Mark latest as active
          await db
            .update(contractReviewDocuments)
            .set({ status: 'active' })
            .where(eq(contractReviewDocuments.id, latestRevision.id));
          
          // Mark all others as superseded
          for (const revision of revisions.slice(1)) {
            if (revision.status !== 'superseded') {
              await db
                .update(contractReviewDocuments)
                .set({ status: 'superseded' })
                .where(eq(contractReviewDocuments.id, revision.id));
            }
          }
          
          // Refresh the data to return corrected status
          const correctedRevisions = await db
            .select()
            .from(contractReviewDocuments)
            .where(eq(contractReviewDocuments.projectId, projectId))
            .orderBy(desc(contractReviewDocuments.revisionNumber));
          
          console.log(`[AUTO-CORRECT] Fixed revision statuses for project ${projectId}`);
          return res.json(correctedRevisions);
        }
      }
      
      res.json(revisions);
    } catch (error) {
      console.error('Error fetching revisions:', error);
      res.status(500).json({ error: 'Failed to fetch revisions' });
    }
  });

  // Get rows for a specific revision (dual-table structure)
  app.get('/api/contract-review/revisions/:revisionId/rows', async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Import new schema tables
      const { 
        contractReviewTemplateSnapshots,
        contractReviewSnapshotRows,
        contractReviewSnapshotCells,
        contractReviewRevisionRows,
        contractReviewRevisionCells,
        contractReviewApprovals
      } = await import('@shared/schema');
      
      // Get revision to find template ID
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      if (!revision) {
        return res.status(404).json({ error: 'Revision not found' });
      }
      
      // Get the snapshot for this revision's template
      const snapshot = await db
        .select()
        .from(contractReviewTemplateSnapshots)
        .where(eq(contractReviewTemplateSnapshots.templateId, revision.templateId))
        .limit(1);
      
      if (snapshot.length === 0) {
        return res.json([]); // No snapshot yet (migration not run)
      }
      
      // Get revision rows with snapshot row info
      const revisionRows = await db
        .select()
        .from(contractReviewRevisionRows)
        .where(eq(contractReviewRevisionRows.revisionId, revisionId))
        .orderBy(contractReviewRevisionRows.rowIndex);
      
      if (revisionRows.length === 0) {
        return res.json([]);
      }
      
      // PERFORMANCE FIX: Batch fetch all cells and approvals upfront (eliminates N+1)
      const revRowIds = revisionRows.map(r => r.id);
      const snapshotRowIds = revisionRows.map(r => r.snapshotRowId);
      
      // Fetch all snapshot cells in one query
      const { inArray } = await import('drizzle-orm');
      const allSnapshotCells = await db
        .select()
        .from(contractReviewSnapshotCells)
        .where(inArray(contractReviewSnapshotCells.snapshotRowId, snapshotRowIds))
        .orderBy(contractReviewSnapshotCells.orderIndex);
      
      // Fetch all revision cells in one query
      const allRevisionCells = await db
        .select()
        .from(contractReviewRevisionCells)
        .where(inArray(contractReviewRevisionCells.revisionRowId, revRowIds));
      
      // Fetch all approvals in one query
      const allApprovals = await db
        .select()
        .from(contractReviewApprovals)
        .where(inArray(contractReviewApprovals.revisionRowId, revRowIds))
        .orderBy(desc(contractReviewApprovals.createdAt));
      
      // Group cells and approvals by row ID
      const snapshotCellsByRow = new Map<string, typeof allSnapshotCells>();
      for (const cell of allSnapshotCells) {
        if (!snapshotCellsByRow.has(cell.snapshotRowId)) {
          snapshotCellsByRow.set(cell.snapshotRowId, []);
        }
        snapshotCellsByRow.get(cell.snapshotRowId)!.push(cell);
      }
      
      const revisionCellsByRow = new Map<string, typeof allRevisionCells>();
      for (const cell of allRevisionCells) {
        if (!revisionCellsByRow.has(cell.revisionRowId)) {
          revisionCellsByRow.set(cell.revisionRowId, []);
        }
        revisionCellsByRow.get(cell.revisionRowId)!.push(cell);
      }
      
      const approvalsByRow = new Map<string, typeof allApprovals>();
      for (const approval of allApprovals) {
        if (!approvalsByRow.has(approval.revisionRowId)) {
          approvalsByRow.set(approval.revisionRowId, []);
        }
        approvalsByRow.get(approval.revisionRowId)!.push(approval);
      }
      
      // Assemble rows with their cells and approvals
      const rows = revisionRows.map(revRow => ({
        id: revRow.id,
        rowIndex: revRow.rowIndex,
        snapshotCells: snapshotCellsByRow.get(revRow.snapshotRowId) || [],
        revisionCells: revisionCellsByRow.get(revRow.id) || [],
        approvals: approvalsByRow.get(revRow.id) || [],
      }));
      
      res.json(rows);
    } catch (error) {
      console.error('Error fetching revision rows:', error);
      res.status(500).json({ error: 'Failed to fetch revision rows' });
    }
  });

  // Create new contract review revision (with optional file upload)
  app.post('/api/projects/:projectId/contract-review/revisions', upload.single('contractFile'), async (req, res) => {
    try {
      const { projectId } = req.params;
      const { templateId, selectedTemplateColumnIds, notes, createdBy } = req.body;
      const file = req.file;
      
      // Handle file upload to object storage if provided
      let clientContractFileUrl = null;
      let clientContractFileKey = null;
      let clientContractFileName = null;
      
      if (file) {
        // Validate MIME type - only allow PDF and Word documents
        const allowedMimeTypes = [
          'application/pdf',
          'application/msword', // .doc
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        ];
        
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return res.status(400).json({ 
            error: 'Invalid file type. Only PDF and Word documents are allowed.' 
          });
        }
        
        const objectStorageService = new ObjectStorageService();
        const fileName = file.originalname;
        
        // uploadFile returns the full path in object storage (already includes /objects/ prefix)
        const fullPath = await objectStorageService.uploadFile(file.buffer, fileName);
        clientContractFileUrl = fullPath;  // Already has /objects/ prefix
        clientContractFileKey = fullPath.replace('/objects/', '');  // Remove /objects/ for the key
        clientContractFileName = fileName;
      }
      
      // Get current active revision if exists
      const currentActive = await db
        .select()
        .from(contractReviewDocuments)
        .where(
          and(
            eq(contractReviewDocuments.projectId, projectId),
            eq(contractReviewDocuments.status, 'active')
          )
        );
      
      // Determine next revision number
      const allRevisions = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.projectId, projectId));
      
      const nextRevisionNumber = allRevisions.length > 0 
        ? Math.max(...allRevisions.map(r => r.revisionNumber)) + 1 
        : 1;
      
      // Parse selectedTemplateColumnIds if it's a string
      const columnIds = typeof selectedTemplateColumnIds === 'string' 
        ? JSON.parse(selectedTemplateColumnIds) 
        : selectedTemplateColumnIds;
      
      // Import new schema tables for dual-table structure
      const { 
        contractReviewTemplateSnapshots,
        contractReviewSnapshotRows,
        contractReviewSnapshotCells,
        contractReviewRevisionRows,
        contractReviewRevisionCells 
      } = await import('@shared/schema');
      
      // Wrap all operations in a transaction to ensure data consistency
      const newRevision = await db.transaction(async (tx) => {
        // Create new revision
        const [revision] = await tx
          .insert(contractReviewDocuments)
          .values({
            projectId,
            templateId,
            revisionNumber: nextRevisionNumber,
            clientContractFileName,
            clientContractFileUrl,
            clientContractFileKey,
            selectedTemplateColumnIds: columnIds,
            notes,
            status: 'active',
            createdBy,
          })
          .returning();
        
        // Mark current active as superseded
        if (currentActive.length > 0) {
          await tx
            .update(contractReviewDocuments)
            .set({ status: 'superseded' })
            .where(eq(contractReviewDocuments.id, currentActive[0].id));
        }
        
        // Check if snapshot exists for this template
        const existingSnapshot = await tx
          .select()
          .from(contractReviewTemplateSnapshots)
          .where(eq(contractReviewTemplateSnapshots.templateId, templateId))
          .limit(1);
        
        let snapshotId: string;
        
        if (existingSnapshot.length > 0) {
          // Reuse existing snapshot
          snapshotId = existingSnapshot[0].id;
        } else {
          // Create new snapshot from template (Rev 01 only)
          const templateRowsData = await tx
            .select()
            .from(templateRows)
            .where(eq(templateRows.templateId, templateId))
            .orderBy(templateRows.rowIndex);
          
          const templateColumnData = await tx
            .select()
            .from(templateColumnConfigs)
            .where(eq(templateColumnConfigs.templateId, templateId))
            .orderBy(templateColumnConfigs.orderIndex);
          
          // Create snapshot
          const [snapshot] = await tx
            .insert(contractReviewTemplateSnapshots)
            .values({
              templateId,
              createdRevisionId: revision.id,
            })
            .returning();
          
          snapshotId = snapshot.id;
          
          // Create snapshot rows and cells (ALL template columns - snapshot is read-only reference data)
          for (const templateRow of templateRowsData) {
            const [snapshotRow] = await tx
              .insert(contractReviewSnapshotRows)
              .values({
                snapshotId,
                templateRowId: templateRow.id,
                rowIndex: templateRow.rowIndex,
              })
              .returning();
            
            // Create snapshot cells for ALL template columns
            const templateCells = (templateRow.cells as any[]) || [];
            for (const config of templateColumnData) {
              const cell = templateCells.find((c: any) => c && c.columnId === config.id);
              
              await tx.insert(contractReviewSnapshotCells).values({
                snapshotRowId: snapshotRow.id,
                templateColumnConfigId: config.id,
                columnHeader: config.columnHeader,
                value: cell?.value || '',
                employmentRoleId: cell?.employmentRoleId || null,
                orderIndex: config.orderIndex,
              });
            }
          }
        }
        
        // Get snapshot rows for creating revision rows
        const snapshotRows = await tx
          .select()
          .from(contractReviewSnapshotRows)
          .where(eq(contractReviewSnapshotRows.snapshotId, snapshotId))
          .orderBy(contractReviewSnapshotRows.rowIndex);
        
        // Determine source revision (for carry-forward tracking)
        const sourceRevisionId = currentActive.length > 0 ? currentActive[0].id : null;
        
        // Create revision rows
        for (const snapshotRow of snapshotRows) {
          const [revisionRow] = await tx
            .insert(contractReviewRevisionRows)
            .values({
              revisionId: revision.id,
              snapshotRowId: snapshotRow.id,
              rowIndex: snapshotRow.rowIndex,
              sourceRevisionId,
            })
            .returning();
          
          // If carrying forward from previous revision, copy revision cells
          if (sourceRevisionId) {
            // Get previous revision's row at same index
            const [prevRevRow] = await tx
              .select()
              .from(contractReviewRevisionRows)
              .where(
                and(
                  eq(contractReviewRevisionRows.revisionId, sourceRevisionId),
                  eq(contractReviewRevisionRows.rowIndex, snapshotRow.rowIndex)
                )
              );
            
            if (prevRevRow) {
              // Copy all revision cells from previous revision
              const prevCells = await tx
                .select()
                .from(contractReviewRevisionCells)
                .where(eq(contractReviewRevisionCells.revisionRowId, prevRevRow.id));
              
              for (const prevCell of prevCells) {
                await tx.insert(contractReviewRevisionCells).values({
                  revisionRowId: revisionRow.id,
                  columnConfigId: prevCell.columnConfigId,
                  columnKind: prevCell.columnKind,
                  columnHeader: prevCell.columnHeader,
                  value: prevCell.value,
                  lastEditedBy: prevCell.lastEditedBy,
                  lastEditedAt: prevCell.lastEditedAt,
                });
              }
              
              // If no review work columns exist in previous revision, initialize them
              // (This handles legacy revisions created before review work columns were added)
              const hasReviewWorkColumns = prevCells.some(c => c.columnKind === 'review_work');
              if (!hasReviewWorkColumns) {
                for (const reviewColumn of REVIEW_WORK_COLUMNS) {
                  await tx.insert(contractReviewRevisionCells).values({
                    revisionRowId: revisionRow.id,
                    columnConfigId: null,
                    columnKind: 'review_work',
                    columnHeader: reviewColumn.columnHeader,
                    value: '',
                    lastEditedBy: null,
                    lastEditedAt: null,
                  });
                }
              }
              
              // Copy all approvals from previous revision
              const { contractReviewApprovals } = await import('@shared/schema');
              const prevApprovals = await tx
                .select()
                .from(contractReviewApprovals)
                .where(eq(contractReviewApprovals.revisionRowId, prevRevRow.id));
              
              for (const prevApproval of prevApprovals) {
                await tx.insert(contractReviewApprovals).values({
                  revisionRowId: revisionRow.id,
                  comments: prevApproval.comments,
                  proposedDeparture: prevApproval.proposedDeparture,
                  status: prevApproval.status,
                  reviewComments: prevApproval.reviewComments,
                  reviewedBy: prevApproval.reviewedBy,
                  reviewedAt: prevApproval.reviewedAt,
                  createdBy: prevApproval.createdBy,
                });
              }
            }
          } else {
            // First revision: Initialize editable template columns from snapshot
            const templateColumnData = await tx
              .select()
              .from(templateColumnConfigs)
              .where(eq(templateColumnConfigs.templateId, templateId));
            
            const editableConfigs = templateColumnData.filter(c => c.isEditable);
            const templateRowData = await tx
              .select()
              .from(templateRows)
              .where(
                and(
                  eq(templateRows.templateId, templateId),
                  eq(templateRows.rowIndex, snapshotRow.rowIndex)
                )
              )
              .limit(1);
            
            if (templateRowData.length > 0) {
              const templateCells = (templateRowData[0].cells as any[]) || [];
              
              for (const config of editableConfigs) {
                const cell = templateCells.find((c: any) => c && c.columnId === config.id);
                
                await tx.insert(contractReviewRevisionCells).values({
                  revisionRowId: revisionRow.id,
                  columnConfigId: config.id,
                  columnKind: 'template_editable',
                  columnHeader: config.columnHeader,
                  value: cell?.value || '',
                  lastEditedBy: null,
                  lastEditedAt: null,
                });
              }
            }
            
            // Initialize hardcoded review work columns for Rev 01
            for (const reviewColumn of REVIEW_WORK_COLUMNS) {
              await tx.insert(contractReviewRevisionCells).values({
                revisionRowId: revisionRow.id,
                columnConfigId: null, // Review work columns don't have template config IDs
                columnKind: 'review_work',
                columnHeader: reviewColumn.columnHeader,
                value: '',
                lastEditedBy: null,
                lastEditedAt: null,
              });
            }
          }
        }
        
        return revision;
      });
      
      // Start automatic metadata extraction in the background if file was uploaded
      if (file && clientContractFileKey) {
        console.log(`[ContractMetadata] Starting automatic extraction for revision ${newRevision.id}`);
        // Fire and forget with proper error handling
        void (async () => {
          try {
            await extractAndSaveContractMetadata(newRevision.id);
            console.log(`[ContractMetadata] Automatic extraction completed for revision ${newRevision.id}`);
          } catch (error) {
            console.error(`[ContractMetadata] Automatic extraction failed for revision ${newRevision.id}:`, error);
          }
        })().catch(error => {
          console.error(`[ContractMetadata] Unexpected error in background task:`, error);
        });
      }
      
      // Start contract parsing in the background
      void (async () => {
        try {
          const { processContractRevision } = await import('./contractParsingPipeline');
          
          if (file && clientContractFileKey) {
            // New contract file uploaded - trigger parsing
            console.log(`[ContractParsing] Starting parsing for revision ${newRevision.id}`);
            await processContractRevision(newRevision.id);
            console.log(`[ContractParsing] Parsing completed for revision ${newRevision.id}`);
          } else {
            // No contract file - handle copy-forward from previous revision
            const previousRevisions = await db
              .select()
              .from(contractReviewDocuments)
              .where(
                and(
                  eq(contractReviewDocuments.projectId, projectId),
                  sql`${contractReviewDocuments.revisionNumber} < ${newRevision.revisionNumber}`,
                  sql`${contractReviewDocuments.parsedAssetId} IS NOT NULL`
                )
              )
              .orderBy(desc(contractReviewDocuments.revisionNumber))
              .limit(1);
            
            if (previousRevisions.length > 0) {
              // Copy parsedAssetId from previous revision
              await db
                .update(contractReviewDocuments)
                .set({ parsedAssetId: previousRevisions[0].parsedAssetId })
                .where(eq(contractReviewDocuments.id, newRevision.id));
              
              console.log(`[ContractParsing] Copied parsed data from revision ${previousRevisions[0].revisionNumber} to ${newRevision.revisionNumber}`);
            } else {
              console.log(`[ContractParsing] No contract file and no previous parsed data for revision ${newRevision.id}`);
            }
          }
        } catch (error) {
          console.error(`[ContractParsing] Failed for revision ${newRevision.id}:`, error);
        }
      })().catch(error => {
        console.error(`[ContractParsing] Unexpected error in background task:`, error);
      });
      
      res.json({ success: true, revision: newRevision });
    } catch (error) {
      console.error('Error creating revision:', error);
      res.status(500).json({ error: 'Failed to create revision' });
    }
  });

  // Delete a contract review revision
  app.delete('/api/contract-review/revisions/:revisionId', async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Get the revision to check if it can be deleted
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      if (!revision) {
        return res.status(404).json({ error: 'Revision not found' });
      }

      // Get all revisions for this project to check if this is the max revision
      const allRevisions = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.projectId, revision.projectId));
      
      const maxRevisionNumber = Math.max(...allRevisions.map(r => r.revisionNumber));
      
      if (revision.revisionNumber !== maxRevisionNumber) {
        return res.status(400).json({ 
          error: 'Only the latest revision can be deleted' 
        });
      }

      // Delete the contract file from object storage if it exists
      if (revision.clientContractFileKey) {
        try {
          const objectStorageService = new ObjectStorageService();
          await objectStorageService.deleteFile(revision.clientContractFileKey);
          console.log('[DELETE_REVISION] Contract file deleted from object storage');
        } catch (storageError) {
          console.error('[DELETE_REVISION] Error deleting file from storage:', storageError);
          // Continue with database deletion even if storage deletion fails
        }
      }

      // If the deleted revision was ACTIVE, mark the previous revision as ACTIVE
      if (revision.status === 'active' && allRevisions.length > 1) {
        // Find the previous revision (second highest revision number)
        const previousRevision = allRevisions
          .filter(r => r.id !== revisionId)
          .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
        
        if (previousRevision) {
          await db
            .update(contractReviewDocuments)
            .set({ status: 'active' })
            .where(eq(contractReviewDocuments.id, previousRevision.id));
          
          console.log(`[DELETE_REVISION] Marked revision ${previousRevision.revisionNumber} as ACTIVE`);
        }
      }

      // Delete the revision (cascade deletes will handle related data)
      await db
        .delete(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      console.log('[DELETE_REVISION] Revision deleted successfully:', revisionId);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting revision:', error);
      res.status(500).json({ error: 'Failed to delete revision' });
    }
  });

  // ===== CONTRACT PARSING APIs =====
  
  // Trigger contract parsing for a revision
  app.post('/api/contract-review/revisions/:revisionId/parse-contract', async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Import parsing pipeline
      const { processContractRevision } = await import('./contractParsingPipeline');
      
      // Check if revision exists
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId))
        .limit(1);
      
      if (!revision) {
        return res.status(404).json({ error: 'Revision not found' });
      }
      
      // CASE 1: No contract file - Handle copy-forward scenario
      if (!revision.clientContractFileKey) {
        // Find the most recent previous revision that HAS parsedAssetId (within same project)
        const previousRevisions = await db
          .select()
          .from(contractReviewDocuments)
          .where(
            and(
              eq(contractReviewDocuments.projectId, revision.projectId),
              sql`${contractReviewDocuments.revisionNumber} < ${revision.revisionNumber}`,
              sql`${contractReviewDocuments.parsedAssetId} IS NOT NULL`
            )
          )
          .orderBy(desc(contractReviewDocuments.revisionNumber))
          .limit(1);
        
        if (previousRevisions.length > 0) {
          // Copy parsedAssetId from previous revision
          await db
            .update(contractReviewDocuments)
            .set({ parsedAssetId: previousRevisions[0].parsedAssetId })
            .where(eq(contractReviewDocuments.id, revisionId));
          
          return res.json({ 
            message: 'Contract data copied from previous revision', 
            revisionId,
            parsedAssetId: previousRevisions[0].parsedAssetId,
            copyForward: true
          });
        } else {
          return res.status(400).json({ 
            error: 'No contract file attached and no previous revision with parsed data to copy from' 
          });
        }
      }
      
      // CASE 2: Contract file exists - Trigger parsing
      // Check if parsing job already exists for this revision
      const { contractParsingJobs } = await import('@shared/schema');
      const existingJob = await db
        .select()
        .from(contractParsingJobs)
        .where(eq(contractParsingJobs.revisionId, revisionId))
        .limit(1);
      
      if (existingJob.length > 0) {
        const job = existingJob[0];
        if (job.status === 'processing') {
          return res.status(409).json({ error: 'Parsing already in progress for this revision' });
        }
        // If job failed or succeeded, allow re-parsing
      }
      
      // Trigger parsing asynchronously (don't await)
      processContractRevision(revisionId).catch(error => {
        console.error(`[API] Contract parsing failed for revision ${revisionId}:`, error);
      });
      
      res.json({ message: 'Contract parsing started', revisionId, copyForward: false });
    } catch (error) {
      console.error('Error triggering contract parsing:', error);
      res.status(500).json({ error: 'Failed to trigger contract parsing' });
    }
  });
  
  // Get contract parsing status for a revision
  app.get('/api/contract-review/revisions/:revisionId/parsing-status', async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Import parsing pipeline
      const { getParsingProgress } = await import('./contractParsingPipeline');
      
      const progress = await getParsingProgress(revisionId);
      
      if (!progress) {
        // No parsing job exists for this revision - check if it should copy-forward
        const [revision] = await db
          .select()
          .from(contractReviewDocuments)
          .where(eq(contractReviewDocuments.id, revisionId))
          .limit(1);
        
        if (!revision) {
          return res.status(404).json({ error: 'Revision not found' });
        }
        
        // If revision already has a parsedAssetId, it was copied forward
        if (revision.parsedAssetId) {
          return res.json({
            status: 'completed',
            message: 'Contract data copied from previous revision',
            parsedAssetId: revision.parsedAssetId,
            percentage: 100
          });
        }
        
        // No job and no parsed data
        return res.json({
          status: 'not_started',
          message: 'Contract parsing has not been initiated',
          percentage: 0
        });
      }
      
      res.json(progress);
    } catch (error) {
      console.error('Error fetching parsing status:', error);
      res.status(500).json({ error: 'Failed to fetch parsing status' });
    }
  });

  // Get TOC chunk for clause heading tooltips
  app.get('/api/contract-review/revisions/:revisionId/toc-chunk', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Import parsing schema
      const { contractLogicalParts, contractTextChunks } = await import('@shared/schema');
      
      // Get revision
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId))
        .limit(1);
      
      if (!revision) {
        return res.status(404).json({ error: 'Revision not found' });
      }
      
      // Basic existence check only - matching /rows endpoint behavior
      // NOTE: If stricter access control is needed, it should be added to both endpoints
      
      // Check if parsing is complete
      if (!revision.parsedAssetId) {
        return res.status(409).json({ 
          error: 'Contract parsing not yet complete',
          message: 'TOC data will be available once parsing finishes'
        });
      }
      
      // Find TOC logical part
      const tocParts = await db
        .select()
        .from(contractLogicalParts)
        .where(
          and(
            eq(contractLogicalParts.parsedAssetId, revision.parsedAssetId),
            eq(contractLogicalParts.partType, 'toc')
          )
        );
      
      if (tocParts.length === 0) {
        return res.status(404).json({ 
          error: 'TOC not found',
          message: 'No Table of Contents detected in this contract'
        });
      }
      
      if (tocParts.length > 1) {
        console.warn(`[TOC API] Multiple TOC parts found for parsedAssetId ${revision.parsedAssetId}, using first`);
      }
      
      const tocPart = tocParts[0];
      
      // Fetch TOC chunk (should be single chunk)
      const tocChunks = await db
        .select()
        .from(contractTextChunks)
        .where(eq(contractTextChunks.logicalPartId, tocPart.id));
      
      if (tocChunks.length === 0) {
        return res.status(404).json({ 
          error: 'TOC chunk not found',
          message: 'TOC has not been chunked yet'
        });
      }
      
      if (tocChunks.length > 1) {
        console.warn(`[TOC API] TOC split into ${tocChunks.length} chunks (expected 1), concatenating`);
      }
      
      // Use first chunk (or concatenate if multiple)
      const chunk = tocChunks[0];
      const tocText = tocChunks.length === 1 
        ? chunk.rawText
        : tocChunks.map(c => c.rawText).join('\n');
      
      // Set cache headers
      const etag = `"${chunk.id}"`;
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, max-age=300'); // 5 minutes
      
      // Check if client has cached version
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).send();
      }
      
      res.json({
        tocText,
        pageRange: {
          start: tocPart.startPage,
          end: tocPart.endPage
        },
        parsedAssetId: revision.parsedAssetId,
        chunkId: chunk.id
      });
    } catch (error) {
      console.error('Error fetching TOC chunk:', error);
      res.status(500).json({ error: 'Failed to fetch TOC chunk' });
    }
  });

  // Get Extended TOC for clause heading tooltips (all clause headings, not just PDF TOC)
  app.get('/api/contract-review/revisions/:revisionId/extended-toc', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Get revision to find parsedAssetId
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId))
        .limit(1);
      
      if (!revision) {
        return res.status(404).json({ error: 'Revision not found' });
      }
      
      if (!revision.parsedAssetId) {
        return res.status(404).json({ 
          error: 'Extended TOC not available',
          message: 'Contract has not been parsed yet'
        });
      }
      
      // Fetch extended TOC entries, sorted by orderIndex for hierarchical display
      const rawEntries = await db
        .select({
          clauseNumber: extendedToc.clauseNumber,
          description: extendedToc.description,
          pageNo: extendedToc.pageNo,
        })
        .from(extendedToc)
        .where(eq(extendedToc.parsedAssetId, revision.parsedAssetId))
        .orderBy(extendedToc.orderIndex);
      
      // Normalize clause numbers (trim whitespace, consistent format)
      const entries = rawEntries.map(entry => ({
        ...entry,
        clauseNumber: entry.clauseNumber.trim(),
      }));
      
      // Set cache headers (extended TOC doesn't change after parsing)
      const etag = `"extended-toc-${revision.parsedAssetId}"`;
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, max-age=3600'); // 1 hour
      
      // Check if client has cached version
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).send();
      }
      
      res.json({
        entries,
        parsedAssetId: revision.parsedAssetId,
      });
    } catch (error) {
      console.error('Error fetching extended TOC:', error);
      res.status(500).json({ error: 'Failed to fetch extended TOC' });
    }
  });

  // Update individual cell in active revision
  app.patch('/api/contract-review/revisions/:revisionId/cells/:cellId', async (req, res) => {
    try {
      const { revisionId, cellId } = req.params;
      const { value, editedBy } = req.body;
      
      // Import new schema tables
      const { contractReviewRevisionCells, contractReviewRevisionRows } = await import('@shared/schema');
      
      // Check if revision is active
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      if (!revision) {
        return res.status(404).json({ error: 'Revision not found' });
      }
      
      if (revision.status !== 'active') {
        return res.status(400).json({ error: 'Cannot edit superseded revision' });
      }
      
      const now = new Date();
      
      // Update the cell
      const [updatedCell] = await db
        .update(contractReviewRevisionCells)
        .set({ 
          value,
          lastEditedBy: editedBy,
          lastEditedAt: now,
        })
        .where(eq(contractReviewRevisionCells.id, cellId))
        .returning();
      
      // Get the row ID for the WebSocket broadcast
      const [cellWithRow] = await db
        .select({
          rowId: contractReviewRevisionRows.id,
        })
        .from(contractReviewRevisionCells)
        .innerJoin(
          contractReviewRevisionRows,
          eq(contractReviewRevisionCells.revisionRowId, contractReviewRevisionRows.id)
        )
        .where(eq(contractReviewRevisionCells.id, cellId));
      
      // Broadcast update via WebSocket
      if (updatedCell && cellWithRow) {
        contractReviewWS.broadcastCellUpdate(revisionId, {
          cellId: updatedCell.id,
          value: updatedCell.value || '',
          lastEditedBy: updatedCell.lastEditedBy || '',
          lastEditedAt: now.toISOString(),
          rowId: cellWithRow.rowId,
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating cell:', error);
      res.status(500).json({ error: 'Failed to update cell' });
    }
  });

  // ===== CELL CHAT APIs =====
  
  // Get chat messages for a cell
  app.get('/api/contract-review/cells/:cellId/chat-messages', async (req, res) => {
    try {
      const { cellId } = req.params;
      const { cellChatMessages } = await import('@shared/schema');
      
      console.log(`[Cell Chat] Fetching messages for cell ${cellId}`);
      
      const messages = await db
        .select()
        .from(cellChatMessages)
        .where(eq(cellChatMessages.cellId, cellId))
        .orderBy(cellChatMessages.createdAt);
      
      console.log(`[Cell Chat] Found ${messages.length} messages for cell ${cellId}`);
      
      res.json(messages);
    } catch (error) {
      console.error('Error fetching cell chat messages:', error);
      res.status(500).json({ error: 'Failed to fetch chat messages' });
    }
  });

  // Send a message and get AI response
  app.post('/api/contract-review/cells/:cellId/chat-messages', async (req, res) => {
    try {
      const { cellId } = req.params;
      const { content } = req.body;
      
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Message content is required' });
      }
      
      const { 
        cellChatMessages, 
        contractReviewRevisionCells,
        contractReviewRevisionRows,
        contractReviewDocuments 
      } = await import('@shared/schema');
      
      // Get cell info
      const [cell] = await db
        .select({
          cell: contractReviewRevisionCells,
          revisionId: contractReviewRevisionRows.revisionId,
        })
        .from(contractReviewRevisionCells)
        .innerJoin(
          contractReviewRevisionRows,
          eq(contractReviewRevisionCells.revisionRowId, contractReviewRevisionRows.id)
        )
        .where(eq(contractReviewRevisionCells.id, cellId));
      
      if (!cell) {
        return res.status(404).json({ error: 'Cell not found' });
      }
      
      console.log(`[Cell Chat] Saving user message for cell ${cellId}, revision ${cell.revisionId}`);
      
      // Save user message
      const [userMessage] = await db
        .insert(cellChatMessages)
        .values({
          cellId,
          revisionId: cell.revisionId,
          role: 'user',
          content,
          createdBy: (req as any).user?.sub || 'anonymous',
        })
        .returning();
      
      console.log(`[Cell Chat] User message saved with ID ${userMessage.id}`);
      
      // Get previous chat messages for context
      const previousMessages = await db
        .select()
        .from(cellChatMessages)
        .where(eq(cellChatMessages.cellId, cellId))
        .orderBy(cellChatMessages.createdAt);
      
      console.log(`[Cell Chat] Found ${previousMessages.length} previous messages for context`);
      
      // Generate AI response using Anthropic
      const { createAIProvider, getModelString } = await import('./aiProviders');
      const model = 'claude-sonnet-4-20250514';
      const aiProvider = createAIProvider(model);
      const modelString = getModelString(model);
      
      // Build conversation history for AI
      const conversationHistory = previousMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      
      // Add system prompt for cell chat
      const systemPrompt = `You are an AI assistant helping to refine contract review analysis. 
The current cell contains: "${cell.cell.value || '(empty)'}"

Answer the user's questions about this analysis. Be concise and helpful. 
If they ask you to suggest changes, provide clear, actionable recommendations.`;
      
      const completion = await aiProvider.createCompletion([
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
      ], {
        model: modelString,
        temperature: 0.7,
        maxTokens: 500,
      });
      
      const aiResponse = completion.content || 'I apologize, but I could not generate a response.';
      
      // Save AI response
      const [assistantMessage] = await db
        .insert(cellChatMessages)
        .values({
          cellId,
          revisionId: cell.revisionId,
          role: 'assistant',
          content: aiResponse,
          createdBy: null,
        })
        .returning();
      
      console.log(`[Cell Chat] Assistant message saved with ID ${assistantMessage.id}`);
      console.log(`[Cell Chat] Total messages for cell ${cellId}: ${previousMessages.length + 2}`);
      
      res.json(assistantMessage);
    } catch (error) {
      console.error('Error sending cell chat message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Update cell value based on chat conversation
  app.post('/api/contract-review/cells/:cellId/update-from-chat', async (req, res) => {
    try {
      const { cellId } = req.params;
      
      const { 
        cellChatMessages, 
        contractReviewRevisionCells,
        contractReviewRevisionRows,
      } = await import('@shared/schema');
      
      // Get chat history
      const messages = await db
        .select()
        .from(cellChatMessages)
        .where(eq(cellChatMessages.cellId, cellId))
        .orderBy(cellChatMessages.createdAt);
      
      if (messages.length === 0) {
        return res.status(400).json({ error: 'No conversation history to base update on' });
      }
      
      // Get cell info
      const [cell] = await db
        .select()
        .from(contractReviewRevisionCells)
        .where(eq(contractReviewRevisionCells.id, cellId));
      
      if (!cell) {
        return res.status(404).json({ error: 'Cell not found' });
      }
      
      // Use Anthropic to generate updated cell value based on conversation
      const { createAIProvider, getModelString } = await import('./aiProviders');
      const model = 'claude-sonnet-4-20250514';
      const aiProvider = createAIProvider(model);
      const modelString = getModelString(model);
      
      const conversationSummary = messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n\n');
      
      const systemPrompt = `Based on the following conversation about a contract review cell, 
generate an updated and improved analysis that incorporates the insights from the discussion.

Original cell value: "${cell.value || '(empty)'}"

Conversation:
${conversationSummary}

Provide ONLY the updated cell value, without any preamble or explanation.`;
      
      const completion = await aiProvider.createCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the updated cell value.' }
      ], {
        model: modelString,
        temperature: 0.7,
        maxTokens: 500,
      });
      
      const updatedValue = completion.content || cell.value;
      
      // Update the cell
      const now = new Date();
      const [updatedCell] = await db
        .update(contractReviewRevisionCells)
        .set({ 
          value: updatedValue,
          lastEditedBy: 'AI Assistant (Chat)',
          lastEditedAt: now,
        })
        .where(eq(contractReviewRevisionCells.id, cellId))
        .returning();
      
      res.json({ success: true, updatedValue });
    } catch (error) {
      console.error('Error updating cell from chat:', error);
      res.status(500).json({ error: 'Failed to update cell' });
    }
  });

  // ===== THREE-TABLE ARCHITECTURE APIs =====
  
  // Table 1: Get filtered template snapshot data (read-only)
  app.get('/api/contract-review/revisions/:revisionId/table1-template', async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      const { 
        contractReviewTemplateSnapshots,
        contractReviewSnapshotRows,
        contractReviewSnapshotCells,
        contractReviewRevisionRows,
      } = await import('@shared/schema');
      
      // Get revision with selected column IDs
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      if (!revision) {
        return res.status(404).json({ error: 'Revision not found' });
      }
      
      const selectedColumnIds = (revision.selectedTemplateColumnIds || []) as string[];
      
      // Get snapshot
      const snapshot = await db
        .select()
        .from(contractReviewTemplateSnapshots)
        .where(eq(contractReviewTemplateSnapshots.templateId, revision.templateId))
        .limit(1);
      
      if (snapshot.length === 0) {
        return res.json([]);
      }
      
      // Get revision rows with filtered snapshot cells
      const revisionRows = await db
        .select()
        .from(contractReviewRevisionRows)
        .where(eq(contractReviewRevisionRows.revisionId, revisionId))
        .orderBy(contractReviewRevisionRows.rowIndex);
      
      const tableData = await Promise.all(revisionRows.map(async (revRow) => {
        // Get all snapshot cells for this row
        const allSnapshotCells = await db
          .select()
          .from(contractReviewSnapshotCells)
          .where(eq(contractReviewSnapshotCells.snapshotRowId, revRow.snapshotRowId))
          .orderBy(contractReviewSnapshotCells.orderIndex);
        
        // Filter cells by selected column IDs
        const filteredCells = selectedColumnIds.length > 0
          ? allSnapshotCells.filter(cell => cell.templateColumnConfigId && selectedColumnIds.includes(cell.templateColumnConfigId))
          : allSnapshotCells;
        
        return {
          rowId: revRow.id,
          rowIndex: revRow.rowIndex,
          cells: filteredCells,
        };
      }));
      
      res.json(tableData);
    } catch (error) {
      console.error('Error fetching Table 1 data:', error);
      res.status(500).json({ error: 'Failed to fetch template data' });
    }
  });
  
  // Table 2: Get review work cells (3 fixed editable columns)
  app.get('/api/contract-review/revisions/:revisionId/table2-review', async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      const { 
        contractReviewRevisionRows,
        contractReviewRevisionCells,
      } = await import('@shared/schema');
      
      // Get revision rows
      const revisionRows = await db
        .select()
        .from(contractReviewRevisionRows)
        .where(eq(contractReviewRevisionRows.revisionId, revisionId))
        .orderBy(contractReviewRevisionRows.rowIndex);
      
      // Define the 3 fixed review work columns
      const reviewWorkColumns = ['summary_position', 'clause_ref', 'notes'];
      
      const tableData = await Promise.all(revisionRows.map(async (revRow) => {
        const cells = await db
          .select()
          .from(contractReviewRevisionCells)
          .where(
            and(
              eq(contractReviewRevisionCells.revisionRowId, revRow.id),
              sql`${contractReviewRevisionCells.columnKind} IN ('summary_position', 'clause_ref', 'notes')`
            )
          );
        
        return {
          rowId: revRow.id,
          rowIndex: revRow.rowIndex,
          cells,
        };
      }));
      
      res.json(tableData);
    } catch (error) {
      console.error('Error fetching Table 2 data:', error);
      res.status(500).json({ error: 'Failed to fetch review work data' });
    }
  });
  
  // Table 3: Get approvals for a revision
  app.get('/api/contract-review/revisions/:revisionId/table3-approvals', async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      const { 
        contractReviewRevisionRows,
        contractReviewApprovals,
      } = await import('@shared/schema');
      
      // Get all approvals for this revision's rows
      const approvals = await db
        .select({
          id: contractReviewApprovals.id,
          rowId: contractReviewApprovals.revisionRowId,
          rowIndex: contractReviewRevisionRows.rowIndex,
          comments: contractReviewApprovals.comments,
          proposedDeparture: contractReviewApprovals.proposedDeparture,
          status: contractReviewApprovals.status,
          reviewComments: contractReviewApprovals.reviewComments,
          reviewedBy: contractReviewApprovals.reviewedBy,
          reviewedAt: contractReviewApprovals.reviewedAt,
          createdBy: contractReviewApprovals.createdBy,
          createdAt: contractReviewApprovals.createdAt,
          updatedAt: contractReviewApprovals.updatedAt,
        })
        .from(contractReviewApprovals)
        .innerJoin(
          contractReviewRevisionRows,
          eq(contractReviewApprovals.revisionRowId, contractReviewRevisionRows.id)
        )
        .where(eq(contractReviewRevisionRows.revisionId, revisionId))
        .orderBy(contractReviewRevisionRows.rowIndex);
      
      res.json(approvals);
    } catch (error) {
      console.error('Error fetching Table 3 data:', error);
      res.status(500).json({ error: 'Failed to fetch approvals data' });
    }
  });
  
  // Table 3: Create new approval (lawyer proposes departure)
  app.post('/api/contract-review/revisions/:revisionId/table3-approvals', async (req, res) => {
    try {
      const { revisionId } = req.params;
      const { rowId, comments, proposedDeparture, createdBy } = req.body;
      
      const { contractReviewApprovals } = await import('@shared/schema');
      
      const [newApproval] = await db
        .insert(contractReviewApprovals)
        .values({
          revisionRowId: rowId,
          comments,
          proposedDeparture,
          status: 'pending',
          createdBy,
        })
        .returning();
      
      res.json(newApproval);
    } catch (error) {
      console.error('Error creating approval:', error);
      res.status(500).json({ error: 'Failed to create approval' });
    }
  });
  
  // Table 3: Update approval status (DOA approve/reject)
  app.patch('/api/contract-review/approvals/:approvalId', async (req, res) => {
    try {
      const { approvalId } = req.params;
      const { status, reviewComments, reviewedBy } = req.body;
      
      const { contractReviewApprovals } = await import('@shared/schema');
      
      const [updated] = await db
        .update(contractReviewApprovals)
        .set({
          status,
          reviewComments,
          reviewedBy,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contractReviewApprovals.id, approvalId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Approval not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating approval:', error);
      res.status(500).json({ error: 'Failed to update approval' });
    }
  });

  // Get AI usage logs for a project (with optional filters)
  app.get('/api/projects/:projectId/ai-usage-logs', async (req, res) => {
    try {
      const { projectId } = req.params;
      const { formName, eventType, personId, startDate, endDate } = req.query;
      
      const { aiUsageLogs, people } = await import('@shared/schema');
      
      // Build where conditions
      const conditions = [eq(aiUsageLogs.projectId, projectId)];
      
      if (formName && typeof formName === 'string') {
        conditions.push(eq(aiUsageLogs.formName, formName));
      }
      
      if (eventType && typeof eventType === 'string') {
        conditions.push(eq(aiUsageLogs.eventType, eventType));
      }
      
      if (personId && typeof personId === 'string') {
        conditions.push(eq(aiUsageLogs.personId, personId));
      }
      
      if (startDate && typeof startDate === 'string') {
        conditions.push(sql`${aiUsageLogs.createdAt} >= ${startDate}`);
      }
      
      if (endDate && typeof endDate === 'string') {
        conditions.push(sql`${aiUsageLogs.createdAt} <= ${endDate}`);
      }
      
      // Fetch AI usage logs with filters
      const logs = await db
        .select({
          id: aiUsageLogs.id,
          personId: aiUsageLogs.personId,
          personName: sql<string>`${people.givenName} || ' ' || ${people.familyName}`,
          personEmail: people.email,
          projectId: aiUsageLogs.projectId,
          formName: aiUsageLogs.formName,
          eventType: aiUsageLogs.eventType,
          modelUsed: aiUsageLogs.modelUsed,
          revisionId: aiUsageLogs.revisionId,
          revisionNumber: sql<number | null>`NULL`, // No longer joined with contract review
          rowId: aiUsageLogs.rowId,
          letterId: aiUsageLogs.letterId,
          rowIndex: sql<number | null>`NULL`, // No longer joined with rows
          inputTokens: aiUsageLogs.inputTokens,
          outputTokens: aiUsageLogs.outputTokens,
          totalTokens: aiUsageLogs.totalTokens,
          estimatedCost: aiUsageLogs.estimatedCost,
          clientInvoiceNumber: aiUsageLogs.clientInvoiceNumber,
          notes: aiUsageLogs.notes,
          createdAt: aiUsageLogs.createdAt,
        })
        .from(aiUsageLogs)
        .innerJoin(people, eq(aiUsageLogs.personId, people.id))
        .where(and(...conditions))
        .orderBy(desc(aiUsageLogs.createdAt));
      
      res.json(logs);
    } catch (error) {
      console.error('Error fetching AI usage logs:', error);
      res.status(500).json({ error: 'Failed to fetch AI usage logs' });
    }
  });

  // Import AI analysis job store
  const { analysisJobStore } = await import('./analysisJobStore');

  // Clear AI-generated content endpoint
  app.post('/api/contract-review/revisions/:revisionId/clear-ai-content', async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      console.log('[AI Clear] Clearing AI content for revision:', revisionId);
      
      // Import schema tables
      const { 
        contractReviewRevisionCells,
        contractReviewRevisionRows,
      } = await import('@shared/schema');
      
      // Clear content in all AI-generated cells for this revision in the three AI columns
      const targetColumns = ['Summary Position of Document', 'Cl. Ref', 'AI Proposed Mitigation'];
      const now = new Date();
      
      for (const columnHeader of targetColumns) {
        // First, get all cells that will be cleared so we can broadcast updates
        const cellsToUpdate = await db
          .select({
            cellId: contractReviewRevisionCells.id,
            rowId: contractReviewRevisionRows.id,
          })
          .from(contractReviewRevisionCells)
          .innerJoin(
            contractReviewRevisionRows,
            eq(contractReviewRevisionCells.revisionRowId, contractReviewRevisionRows.id)
          )
          .where(
            and(
              eq(contractReviewRevisionRows.revisionId, revisionId),
              eq(contractReviewRevisionCells.columnHeader, columnHeader),
              eq(contractReviewRevisionCells.columnKind, 'review_work'),
              sql`${contractReviewRevisionCells.columnConfigId} IS NULL`
            )
          );

        // Update the cells
        await db
          .update(contractReviewRevisionCells)
          .set({ 
            value: '-',
            lastEditedBy: 'System',
            lastEditedAt: now
          })
          .where(
            and(
              sql`${contractReviewRevisionCells.revisionRowId} IN (
                SELECT id FROM contract_review_revision_rows 
                WHERE revision_id = ${revisionId}
              )`,
              eq(contractReviewRevisionCells.columnHeader, columnHeader),
              eq(contractReviewRevisionCells.columnKind, 'review_work'),
              sql`${contractReviewRevisionCells.columnConfigId} IS NULL`
            )
          );

        // Broadcast WebSocket updates for each cleared cell
        for (const cell of cellsToUpdate) {
          contractReviewWS.broadcastCellUpdate(revisionId, {
            cellId: cell.cellId,
            value: '-',
            lastEditedBy: 'System',
            lastEditedAt: now.toISOString(),
            rowId: cell.rowId,
          });
        }

        console.log(`[AI Clear] Cleared and broadcasted ${cellsToUpdate.length} cells for column: ${columnHeader}`);
      }
      
      console.log('[AI Clear] AI content cleared successfully');
      
      res.json({ success: true });
    } catch (error) {
      console.error('[AI Clear] Error clearing AI content:', error);
      res.status(500).json({ error: 'Failed to clear AI content' });
    }
  });

  // Get AI analysis progress
  app.get('/api/contract-review/revisions/:revisionId/ai-analyze/:jobId/progress', async (req, res) => {
    const { jobId } = req.params;
    const job = analysisJobStore.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found or expired' });
    }
    
    // Return appropriate status code based on job status
    if (job.status === 'failed') {
      return res.status(500).json(job);
    } else if (job.status === 'completed') {
      return res.status(200).json(job);
    } else {
      return res.status(202).json(job);
    }
  });

  // AI Analysis endpoint - analyzes baseline positions in background
  app.post('/api/contract-review/revisions/:revisionId/ai-analyze', async (req, res) => {
    const { revisionId } = req.params;
    
    try {
      console.log('[AI Batch] Validating revision and creating job:', revisionId);
      
      // Get current user's personId
      let personId: string | undefined;
      const person = (req as any).person;
      if (person) {
        personId = person.id;
      }
      
      // Import schema tables
      const { 
        contractReviewDocuments,
        contractReviewRevisionRows,
        projects,
      } = await import('@shared/schema');

      // Check if revision is active
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      if (!revision || revision.status !== 'active') {
        return res.status(400).json({ error: 'Can only analyze active revisions' });
      }

      // Get total row count
      const rows = await db
        .select()
        .from(contractReviewRevisionRows)
        .where(eq(contractReviewRevisionRows.revisionId, revisionId))
        .orderBy(contractReviewRevisionRows.rowIndex);

      // Create job with user context
      const job = analysisJobStore.createJob(revisionId, revision.projectId, rows.length, personId);
      console.log('[AI Batch] Created job:', job.jobId);

      // Return job ID immediately
      res.json({ jobId: job.jobId });

      // Start background processing
      setImmediate(async () => {
        await runBackgroundAnalysis(job.jobId, revisionId);
      });

    } catch (error) {
      console.error('[AI Batch] Failed to start analysis:', error);
      res.status(500).json({ error: 'Failed to start AI analysis' });
    }
  });

  // Background analysis function
  async function runBackgroundAnalysis(jobId: string, revisionId: string) {
    try {
      console.log(`[AI Batch] Background analysis starting for job ${jobId}`);

      // Import AI provider abstraction
      const { createAIProvider, getModelString } = await import('./aiProviders');

      const { 
        contractReviewDocuments,
        contractReviewRevisionRows,
        contractReviewRevisionCells,
        contractReviewSnapshotCells,
        templateColumnConfigs,
        templateRows,
        projects,
        businessUnits,
        companies,
        aiUsageLogs,
      } = await import('@shared/schema');
      
      const { buildSystemPrompt, buildUserPrompt } = await import('./contractReviewPrompts');

      // Get revision
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      if (!revision) {
        analysisJobStore.failJob(jobId, 'Revision not found');
        return;
      }
      
      // Get company settings for AI customization
      let company = null;
      try {
        const projectResult = await db
          .select()
          .from(projects)
          .where(eq(projects.id, revision.projectId))
          .limit(1);
        
        if (projectResult.length > 0) {
          const project = projectResult[0];
          const businessUnitResult = await db
            .select()
            .from(businessUnits)
            .where(eq(businessUnits.id, project.businessUnitId!))
            .limit(1);
          
          if (businessUnitResult.length > 0) {
            const businessUnit = businessUnitResult[0];
            const companyResult = await db
              .select()
              .from(companies)
              .where(eq(companies.id, businessUnit.companyId!))
              .limit(1);
            
            if (companyResult.length > 0) {
              company = companyResult[0];
            }
          }
        }
      } catch (error) {
        console.log('[AI] Could not fetch company settings:', error);
      }
      
      console.log('[AI Batch] Using company settings:', company ? {
        name: company.name,
        persona: company.aiExpertPersona,
        jurisdiction: company.aiJurisdiction,
        industry: company.aiIndustryFocus,
        riskTolerance: company.aiRiskTolerance,
      } : 'No company settings');
      
      // Build system prompt with company customizations
      const systemPrompt = buildSystemPrompt(company);

      if (!revision.templateId) {
        analysisJobStore.failJob(jobId, 'Template not found for this revision');
        return;
      }

      // Get template columns to find "Baseline Position" or "Benchmark"
      const columns = await db
        .select()
        .from(templateColumnConfigs)
        .where(eq(templateColumnConfigs.templateId, revision.templateId));

      const baselineColumn = columns.find(c => {
        const header = c.columnHeader.toLowerCase();
        return header.includes('baseline position') || 
               header.includes('benchmark') ||
               header.includes('base line');
      });
      const clRefColumn = columns.find(c => 
        c.columnHeader.toLowerCase().includes('cl. ref') || c.columnHeader.toLowerCase().includes('clause ref')
      );
      const approvalColumn = columns.find(c => 
        c.columnHeader.toLowerCase().includes('approval required')
      );

      if (!baselineColumn) {
        analysisJobStore.failJob(jobId, 'Required column not found: Template must have a "Baseline Position" or "Benchmark" column');
        return;
      }

      // Get all template rows
      const templateRowsData = await db
        .select()
        .from(templateRows)
        .where(eq(templateRows.templateId, revision.templateId!))
        .orderBy(templateRows.rowIndex);

      const aiGeneratedCellIds: string[] = [];
      let analyzedCount = 0;
      let errorCount = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      // Helper function to delay between API calls
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Find the uploaded contract document for this revision or closest previous revision
      let contractContent = '';
      let contractFileName = '';
      
      // First try to find contract for this revision
      if (revision.clientContractFileKey && revision.clientContractFileName) {
        try {
          const objectStorage = new ObjectStorageService();
          const file = await objectStorage.getObjectEntityFile(revision.clientContractFileKey);
          const [buffer] = await file.download();
          
          // Extract text from contract
          contractContent = await extractTextFromContract(
            buffer, 
            revision.clientContractFileName
          );
          
          contractFileName = revision.clientContractFileName;
          console.log(`[AI] Extracted ${contractContent.length} characters from ${contractFileName}`);
        } catch (error: any) {
          console.log(`[AI] No contract found for current revision (${error.message}), will search previous revisions`);
        }
      }
      
      // If no contract on this revision, search backwards through previous revisions
      if (!contractContent) {
        const previousRevisions = await db
          .select()
          .from(contractReviewDocuments)
          .where(
            and(
              eq(contractReviewDocuments.projectId, revision.projectId),
              eq(contractReviewDocuments.templateId, revision.templateId)
            )
          )
          .orderBy(desc(contractReviewDocuments.revisionNumber));
        
        for (const prevRev of previousRevisions) {
          if (prevRev.clientContractFileKey && prevRev.clientContractFileName && prevRev.id !== revisionId) {
            try {
              const objectStorage = new ObjectStorageService();
              const file = await objectStorage.getObjectEntityFile(prevRev.clientContractFileKey);
              const [buffer] = await file.download();
              
              // Extract text from contract
              contractContent = await extractTextFromContract(
                buffer, 
                prevRev.clientContractFileName
              );
              
              contractFileName = prevRev.clientContractFileName;
              console.log(`[AI] Found contract from revision ${prevRev.revisionNumber}, extracted ${contractContent.length} characters`);
              break;
            } catch (error) {
              continue;
            }
          }
        }
      }
      
      if (!contractContent) {
        analysisJobStore.failJob(jobId, 'No contract document found for analysis. Please upload a contract first.');
        return;
      }
      
      // Import token estimation utility (but not chunking - we use full contract for quality)
      const { estimateTokenCount } = await import('./contractChunking');
      console.log(`[AI Batch] Contract loaded: ${contractContent.length} chars (~${estimateTokenCount(contractContent)} total tokens)`);
      
      // Find Risk Item column
      const riskItemColumn = columns.find(c => 
        c.columnHeader.toLowerCase().includes('risk item')
      );

      // Create AI provider based on company's selected model
      const selectedModel = company?.aiContractReviewModel || 'claude-sonnet-4-20250514';
      const aiProvider = createAIProvider(selectedModel);
      const modelString = getModelString(selectedModel);
      console.log(`[AI Batch] Using AI model: ${selectedModel} (${modelString})`);

      // Helper function to strip markdown code fences from AI responses
      const stripMarkdownCodeFence = (text: string): string => {
        // Remove ```json and ``` markers that Claude sometimes adds
        return text.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      };

      // Helper function to call AI (retry logic now in abstraction layer)
      const callAI = async (baselineValue: string, riskItem: string, rowIndex: number) => {
        // Use FULL CONTRACT for analysis (not chunks) for better quality
        // Claude Sonnet 4 has 200K context window, we use 100K for contract
        // GPT-4o has 128K context window, we use 20K for contract
        const MAX_CONTENT_TOKENS = company?.aiContractReviewModel === 'claude-sonnet-4' ? 100000 : 20000;
        const maxContentChars = MAX_CONTENT_TOKENS * 4; // 1 token ≈ 4 chars
        
        let fullContent = contractContent;
        if (fullContent.length > maxContentChars) {
          console.log(`[AI Batch] Row ${rowIndex}: Truncating full contract from ${fullContent.length} to ${maxContentChars} chars (model: ${company?.aiContractReviewModel})`);
          fullContent = fullContent.substring(0, maxContentChars) + '\n\n[... Document truncated due to size limits ...]';
        }
        
        const estimatedTokens = estimateTokenCount(fullContent) + estimateTokenCount(systemPrompt);
        console.log(`[AI Batch] Row ${rowIndex}: Using FULL contract (≈${estimatedTokens} tokens, ${fullContent.length} chars)`);
        
        try {
          const result = await aiProvider.createCompletion([
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: buildUserPrompt(riskItem, baselineValue, fullContent) + '\n\nIMPORTANT: Respond with ONLY raw JSON, no markdown formatting or code blocks.',
            },
          ], {
            model: modelString,
            maxTokens: 16000,
            temperature: 0,
          });
          
          const cleanedContent = stripMarkdownCodeFence(result.content.trim() || '{}');
          
          // Parse JSON with robust error handling
          let parsed;
          try {
            parsed = JSON.parse(cleanedContent);
          } catch (parseError: any) {
            console.error(`[AI Batch] Row ${rowIndex} JSON parse error:`, parseError.message);
            console.error(`[AI Batch] Row ${rowIndex} Failed content (first 500 chars):`, cleanedContent.substring(0, 500));
            
            // Try to fix common JSON issues
            try {
              // Remove control characters that break JSON
              const fixedContent = cleanedContent.replace(/[\x00-\x1F\x7F]/g, '');
              parsed = JSON.parse(fixedContent);
              console.log(`[AI Batch] Row ${rowIndex} JSON fixed successfully`);
            } catch (secondError) {
              throw new Error(`AI returned invalid JSON for row ${rowIndex}: ${parseError.message}`);
            }
          }
          
          return { parsed, usage: result.usage };
        } catch (error: any) {
          console.error(`[AI Batch] Row ${rowIndex} failed:`, error.message);
          throw error;
        }
      };

      // Track start time for duration calculation
      const analysisStartTime = Date.now();

      // Get all revision rows
      const revisionRows = await db
        .select()
        .from(contractReviewRevisionRows)
        .where(eq(contractReviewRevisionRows.revisionId, revisionId))
        .orderBy(contractReviewRevisionRows.rowIndex);

      const totalRows = revisionRows.length;

      for (let i = 0; i < revisionRows.length; i++) {
        const revisionRow = revisionRows[i];
        
        // Update progress
        analysisJobStore.updateProgress(jobId, i + 1);
        
        try {
          // Get baseline position from snapshot cells (template columns)
          const [baselineSnapshotCell] = await db
            .select()
            .from(contractReviewSnapshotCells)
            .where(
              and(
                eq(contractReviewSnapshotCells.snapshotRowId, revisionRow.snapshotRowId),
                eq(contractReviewSnapshotCells.templateColumnConfigId, baselineColumn.id)
              )
            );

          if (!baselineSnapshotCell || !baselineSnapshotCell.value) continue;
          
          // Get risk item if column exists
          let riskItemValue = 'N/A';
          if (riskItemColumn) {
            const [riskItemCell] = await db
              .select()
              .from(contractReviewSnapshotCells)
              .where(
                and(
                  eq(contractReviewSnapshotCells.snapshotRowId, revisionRow.snapshotRowId),
                  eq(contractReviewSnapshotCells.templateColumnConfigId, riskItemColumn.id)
                )
              );
            if (riskItemCell && riskItemCell.value) {
              riskItemValue = riskItemCell.value;
            }
          }

          // Use AI to analyze (retry logic in provider layer)
          const aiResponse = await callAI(baselineSnapshotCell.value, riskItemValue, revisionRow.rowIndex);
          const aiResult = aiResponse.parsed;
          const aiUsage = aiResponse.usage;

          if (aiResult && aiResult.summary) {
            const now = new Date();

            // Update Summary Position column (review_work version, not template)
            const summaryColumnHeader = 'Summary Position of Document';
            const [existingSummaryCell] = await db
              .select()
              .from(contractReviewRevisionCells)
              .where(
                and(
                  eq(contractReviewRevisionCells.revisionRowId, revisionRow.id),
                  eq(contractReviewRevisionCells.columnHeader, summaryColumnHeader),
                  eq(contractReviewRevisionCells.columnKind, 'review_work'),
                  isNull(contractReviewRevisionCells.columnConfigId)
                )
              );

            let summaryCellId: string;
            if (existingSummaryCell) {
              await db
                .update(contractReviewRevisionCells)
                .set({
                  value: aiResult.summary,
                  originalAiValue: aiResult.summary,
                  lastEditedBy: 'AI Assistant',
                  lastEditedAt: now,
                })
                .where(eq(contractReviewRevisionCells.id, existingSummaryCell.id));
              summaryCellId = existingSummaryCell.id;
            } else {
              const [inserted] = await db
                .insert(contractReviewRevisionCells)
                .values({
                  revisionRowId: revisionRow.id,
                  columnConfigId: null,
                  columnKind: 'review_work',
                  columnHeader: summaryColumnHeader,
                  value: aiResult.summary,
                  originalAiValue: aiResult.summary,
                  lastEditedBy: 'AI Assistant',
                  lastEditedAt: now,
                })
                .returning();
              summaryCellId = inserted.id;
            }

            // Broadcast WebSocket update for Summary Position
            contractReviewWS.broadcastCellUpdate(revisionId, {
              cellId: summaryCellId,
              value: aiResult.summary,
              lastEditedBy: 'AI Assistant',
              lastEditedAt: now.toISOString(),
              rowId: revisionRow.id,
            });

            aiGeneratedCellIds.push(`${revisionRow.rowIndex}-summary-position`);

            // Update Cl. Ref column (review_work version, not template)
            // Always update, even if no clause numbers found (to show AI has looked)
            const clauseRefValue = (aiResult.clauseNumbers && aiResult.clauseNumbers.length > 0) 
              ? aiResult.clauseNumbers.join('\n') 
              : 'No specific clauses found';
            const clRefColumnHeader = 'Cl. Ref';
            
            const [existingClRefCell] = await db
                .select()
                .from(contractReviewRevisionCells)
                .where(
                  and(
                    eq(contractReviewRevisionCells.revisionRowId, revisionRow.id),
                    eq(contractReviewRevisionCells.columnHeader, clRefColumnHeader),
                    eq(contractReviewRevisionCells.columnKind, 'review_work'),
                    isNull(contractReviewRevisionCells.columnConfigId)
                  )
                );

              let clRefCellId: string;
              if (existingClRefCell) {
                await db
                  .update(contractReviewRevisionCells)
                  .set({
                    value: clauseRefValue,
                    originalAiValue: clauseRefValue,
                    lastEditedBy: 'AI Assistant',
                    lastEditedAt: now,
                  })
                  .where(eq(contractReviewRevisionCells.id, existingClRefCell.id));
                clRefCellId = existingClRefCell.id;
              } else {
                const [inserted] = await db
                  .insert(contractReviewRevisionCells)
                  .values({
                    revisionRowId: revisionRow.id,
                    columnConfigId: null,
                    columnKind: 'review_work',
                    columnHeader: clRefColumnHeader,
                    value: clauseRefValue,
                    originalAiValue: clauseRefValue,
                    lastEditedBy: 'AI Assistant',
                    lastEditedAt: now,
                  })
                  .returning();
                clRefCellId = inserted.id;
              }

            // Broadcast WebSocket update for Cl. Ref
            contractReviewWS.broadcastCellUpdate(revisionId, {
              cellId: clRefCellId,
              value: clauseRefValue,
              lastEditedBy: 'AI Assistant',
              lastEditedAt: now.toISOString(),
              rowId: revisionRow.id,
            });

            aiGeneratedCellIds.push(`${revisionRow.rowIndex}-cl-ref`);

            // Update AI Proposed Mitigation column if mitigation was generated
            if (aiResult.proposedMitigation) {
              const mitigationColumnHeader = 'AI Proposed Mitigation';
              
              const [existingMitigationCell] = await db
                .select()
                .from(contractReviewRevisionCells)
                .where(
                  and(
                    eq(contractReviewRevisionCells.revisionRowId, revisionRow.id),
                    eq(contractReviewRevisionCells.columnHeader, mitigationColumnHeader),
                    eq(contractReviewRevisionCells.columnKind, 'review_work'),
                    isNull(contractReviewRevisionCells.columnConfigId)
                  )
                );

              let mitigationCellId: string;
              if (existingMitigationCell) {
                await db
                  .update(contractReviewRevisionCells)
                  .set({
                    value: aiResult.proposedMitigation,
                    originalAiValue: aiResult.proposedMitigation,
                    lastEditedBy: 'AI Assistant',
                    lastEditedAt: now,
                  })
                  .where(eq(contractReviewRevisionCells.id, existingMitigationCell.id));
                mitigationCellId = existingMitigationCell.id;
              } else {
                const [inserted] = await db
                  .insert(contractReviewRevisionCells)
                  .values({
                    revisionRowId: revisionRow.id,
                    columnConfigId: null,
                    columnKind: 'review_work',
                    columnHeader: mitigationColumnHeader,
                    value: aiResult.proposedMitigation,
                    originalAiValue: aiResult.proposedMitigation,
                    lastEditedBy: 'AI Assistant',
                    lastEditedAt: now,
                  })
                  .returning();
                mitigationCellId = inserted.id;
              }

              // Broadcast WebSocket update for AI Proposed Mitigation
              contractReviewWS.broadcastCellUpdate(revisionId, {
                cellId: mitigationCellId,
                value: aiResult.proposedMitigation,
                lastEditedBy: 'AI Assistant',
                lastEditedAt: now.toISOString(),
                rowId: revisionRow.id,
              });
              
              aiGeneratedCellIds.push(`${revisionRow.rowIndex}-ai-mitigation`);
            }

            // Update Approval Required column if it exists
            if (approvalColumn && aiResult.approvalRequired) {
              const [existingApprovalCell] = await db
                .select()
                .from(contractReviewRevisionCells)
                .where(
                  and(
                    eq(contractReviewRevisionCells.revisionRowId, revisionRow.id),
                    eq(contractReviewRevisionCells.columnConfigId, approvalColumn.id)
                  )
                );

              if (existingApprovalCell) {
                await db
                  .update(contractReviewRevisionCells)
                  .set({
                    value: aiResult.approvalRequired,
                    originalAiValue: aiResult.approvalRequired,
                    lastEditedBy: 'AI Assistant',
                    lastEditedAt: now,
                  })
                  .where(eq(contractReviewRevisionCells.id, existingApprovalCell.id));
              } else {
                await db
                  .insert(contractReviewRevisionCells)
                  .values({
                    revisionRowId: revisionRow.id,
                    columnConfigId: approvalColumn.id,
                    columnKind: 'review_work',
                    columnHeader: approvalColumn.columnHeader,
                    value: aiResult.approvalRequired,
                    originalAiValue: aiResult.approvalRequired,
                    lastEditedBy: 'AI Assistant',
                    lastEditedAt: now,
                  });
              }

              aiGeneratedCellIds.push(`${revisionRow.rowIndex}-${approvalColumn.id}`);
            }

            analyzedCount++;
            analysisJobStore.addSuccess(jobId, revisionRow.rowIndex, aiGeneratedCellIds.slice(-3)); // Last 3 cells added
          }

          // Track tokens
          if (totalInputTokens > 0 || totalOutputTokens > 0) {
            analysisJobStore.addTokens(jobId, totalInputTokens, totalOutputTokens);
          }

          // Add delay between API calls to avoid rate limiting
          await delay(2000); // 2s delay between calls to respect rate limits
        } catch (error: any) {
          console.error(`[AI Analysis] Failed to analyze row ${revisionRow.rowIndex}:`, error.message);
          errorCount++;
          
          // Track error in job store
          const errorMessage = error.status === 429 
            ? `OpenAI rate limit exceeded. Your API key has hit its quota or rate limit.`
            : error.message || 'Unknown error';
          analysisJobStore.addError(jobId, revisionRow.rowIndex, errorMessage);
          
          // Continue with other rows even if one fails
        }
      }

      // Broadcast revision update
      contractReviewWS.broadcastRevisionUpdate(revisionId, revision.projectId);

      // Calculate duration
      const durationMs = Date.now() - analysisStartTime;

      console.log(`[AI Analysis] Completed: ${analyzedCount} successful, ${errorCount} failed`);
      console.log(`[AI Analysis] Tokens: ${totalInputTokens} input, ${totalOutputTokens} output`);

      // Get job for cost calculation and logging
      const job = analysisJobStore.getJob(jobId);
      if (job) {
        console.log(`[AI Analysis] Estimated cost: $${job.estimatedCost.toFixed(4)}`);

        // Log usage for invoicing if we have user context
        if (job.personId) {
          try {
            await db.insert(aiUsageLogs).values({
              projectId: job.projectId,
              personId: job.personId,
              formName: 'Contract Review',
              eventType: 'batch',
              modelUsed: selectedModel,
              revisionId: job.revisionId,
              rowId: null,
              inputTokens: job.totalInputTokens,
              outputTokens: job.totalOutputTokens,
              totalTokens: job.totalInputTokens + job.totalOutputTokens,
              durationMs: durationMs,
              estimatedCost: job.estimatedCost.toFixed(4),
              notes: `Batch analysis: ${job.analyzedCount} rows analyzed, ${job.errorCount} errors`,
            });
            console.log(`[AI Analysis] Usage logged for user ${job.personId} (${job.analyzedCount} rows, $${job.estimatedCost.toFixed(4)})`);
          } catch (error) {
            console.error('[AI Analysis] Failed to log usage:', error);
          }
        } else {
          console.log('[AI Analysis] Usage logging skipped (no user context)');
        }
      }

      // Mark job as complete
      analysisJobStore.completeJob(jobId);
      
    } catch (error: any) {
      console.error('[AI Background] Error in analysis:', error);
      analysisJobStore.failJob(jobId, error.message || 'AI analysis failed');
    }
  }

  // Single-row AI Analysis endpoint
  app.post('/api/contract-review/revisions/:revisionId/rows/:rowIndex/ai-analyze', async (req, res) => {
    console.log('[AI Single-Row] === ENDPOINT CALLED ===');
    console.log('[AI Single-Row] Revision ID:', req.params.revisionId);
    console.log('[AI Single-Row] Row Index:', req.params.rowIndex);
    try {
      const { revisionId, rowIndex } = req.params;
      
      // Import AI provider abstraction
      const { createAIProvider, getModelString } = await import('./aiProviders');

      // Import schema tables
      const { 
        contractReviewDocuments,
        contractReviewRevisionRows,
        contractReviewRevisionCells,
        contractReviewSnapshotCells,
        templateColumnConfigs,
        projects,
        businessUnits,
        companies,
        aiUsageLogs,
      } = await import('@shared/schema');
      
      // Import prompt building functions
      const { buildSystemPrompt, buildUserPrompt } = await import('./contractReviewPrompts');

      // Check if revision is active
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      if (!revision || revision.status !== 'active') {
        return res.status(400).json({ error: 'Can only analyze active revisions' });
      }
      
      // Get company settings for AI customization
      let company = null;
      try {
        const projectResult = await db
          .select()
          .from(projects)
          .where(eq(projects.id, revision.projectId))
          .limit(1);
        
        if (projectResult.length > 0) {
          const project = projectResult[0];
          const businessUnitResult = await db
            .select()
            .from(businessUnits)
            .where(eq(businessUnits.id, project.businessUnitId!))
            .limit(1);
          
          if (businessUnitResult.length > 0) {
            const businessUnit = businessUnitResult[0];
            const companyResult = await db
              .select()
              .from(companies)
              .where(eq(companies.id, businessUnit.companyId!))
              .limit(1);
            
            if (companyResult.length > 0) {
              company = companyResult[0];
            }
          }
        }
      } catch (error) {
        console.log('[AI] Could not fetch company settings:', error);
      }
      
      console.log('[AI Single-Row] Using company settings:', company ? {
        name: company.name,
        persona: company.aiExpertPersona,
        jurisdiction: company.aiJurisdiction,
        industry: company.aiIndustryFocus,
        riskTolerance: company.aiRiskTolerance,
      } : 'No company settings');
      
      // Build system prompt with company customizations
      const systemPrompt = buildSystemPrompt(company);

      if (!revision.templateId) {
        return res.status(400).json({ error: 'Template not found for this revision' });
      }

      // Get template columns
      const columns = await db
        .select()
        .from(templateColumnConfigs)
        .where(eq(templateColumnConfigs.templateId, revision.templateId));

      console.log('[AI Single-Row] Template columns found:', columns.map(c => c.columnHeader));

      const baselineColumn = columns.find(c => {
        const header = c.columnHeader.toLowerCase();
        return header.includes('baseline position') || 
               header.includes('benchmark') ||
               header.includes('base line');
      });
      const clRefColumn = columns.find(c => 
        c.columnHeader.toLowerCase().includes('cl. ref') || c.columnHeader.toLowerCase().includes('clause ref')
      );
      const approvalColumn = columns.find(c => 
        c.columnHeader.toLowerCase().includes('approval required')
      );
      const riskItemColumn = columns.find(c => 
        c.columnHeader.toLowerCase().includes('risk item')
      );

      console.log('[AI Single-Row] Baseline column found:', baselineColumn ? baselineColumn.columnHeader : 'NONE');

      if (!baselineColumn) {
        const errorMsg = `Required column not found: Template must have a "Baseline Position" or "Benchmark" column. Found columns: ${columns.map(c => c.columnHeader).join(', ')}`;
        console.log('[AI Single-Row] ERROR:', errorMsg);
        return res.status(400).json({ 
          error: errorMsg
        });
      }
      
      // Find the uploaded contract document
      let contractContent = '';
      let contractFileName = '';
      
      if (revision.clientContractFileKey && revision.clientContractFileName) {
        try {
          const objectStorage = new ObjectStorageService();
          const file = await objectStorage.getObjectEntityFile(revision.clientContractFileKey);
          const [buffer] = await file.download();
          contractContent = await extractTextFromContract(buffer, revision.clientContractFileName);
          contractFileName = revision.clientContractFileName;
          console.log(`[AI Single-Row] Extracted ${contractContent.length} characters from ${contractFileName}`);
        } catch (error: any) {
          console.log(`[AI Single-Row] No contract found for current revision (${error.message}), will search previous revisions`);
        }
      }
      
      // If no contract on this revision, search backwards
      if (!contractContent) {
        const previousRevisions = await db
          .select()
          .from(contractReviewDocuments)
          .where(
            and(
              eq(contractReviewDocuments.projectId, revision.projectId),
              eq(contractReviewDocuments.templateId, revision.templateId)
            )
          )
          .orderBy(desc(contractReviewDocuments.revisionNumber));
        
        for (const prevRev of previousRevisions) {
          if (prevRev.clientContractFileKey && prevRev.clientContractFileName && prevRev.id !== revisionId) {
            try {
              const objectStorage = new ObjectStorageService();
              const file = await objectStorage.getObjectEntityFile(prevRev.clientContractFileKey);
              const [buffer] = await file.download();
              contractContent = await extractTextFromContract(buffer, prevRev.clientContractFileName);
              contractFileName = prevRev.clientContractFileName;
              console.log(`[AI Single-Row] Found contract from revision ${prevRev.revisionNumber}, extracted ${contractContent.length} characters`);
              break;
            } catch (error) {
              continue;
            }
          }
        }
      }
      
      if (!contractContent) {
        return res.status(400).json({ error: 'No contract document found. Please upload a contract first.' });
      }

      // Truncate contract content to prevent token limit errors
      // Claude Sonnet 4 has 200K context window, we use 100K tokens for contract
      // to leave room for prompt, baseline, and response (GPT-4o: 128K, so 80K for contract)
      const MAX_CONTRACT_TOKENS = company?.aiContractReviewModel === 'claude-sonnet-4' ? 100000 : 20000;
      const maxContractChars = MAX_CONTRACT_TOKENS * 4; // Rough estimate: 1 token ≈ 4 chars
      if (contractContent.length > maxContractChars) {
        console.log(`[AI Single-Row] Truncating contract from ${contractContent.length} to ${maxContractChars} chars (model: ${company?.aiContractReviewModel})`);
        contractContent = contractContent.substring(0, maxContractChars) + '\n\n[... Document truncated due to size limits ...]';
      }

      // Get the specific revision row
      const [revisionRow] = await db
        .select()
        .from(contractReviewRevisionRows)
        .where(
          and(
            eq(contractReviewRevisionRows.revisionId, revisionId),
            eq(contractReviewRevisionRows.rowIndex, parseInt(rowIndex))
          )
        );

      if (!revisionRow) {
        return res.status(404).json({ error: 'Row not found' });
      }

      // Get baseline position from snapshot cells
      const [baselineSnapshotCell] = await db
        .select()
        .from(contractReviewSnapshotCells)
        .where(
          and(
            eq(contractReviewSnapshotCells.snapshotRowId, revisionRow.snapshotRowId),
            eq(contractReviewSnapshotCells.templateColumnConfigId, baselineColumn.id)
          )
        );

      if (!baselineSnapshotCell || !baselineSnapshotCell.value) {
        return res.status(400).json({ error: 'No baseline position found for this row' });
      }
      
      // Get risk item
      let riskItemValue = 'N/A';
      if (riskItemColumn) {
        const [riskItemCell] = await db
          .select()
          .from(contractReviewSnapshotCells)
          .where(
            and(
              eq(contractReviewSnapshotCells.snapshotRowId, revisionRow.snapshotRowId),
              eq(contractReviewSnapshotCells.templateColumnConfigId, riskItemColumn.id)
            )
          );
        if (riskItemCell && riskItemCell.value) {
          riskItemValue = riskItemCell.value;
        }
      }

      // Track start time for duration calculation
      const analysisStartTime = Date.now();

      // Helper function to delay between API calls
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Create AI provider based on company's selected model
      const selectedModel = company?.aiContractReviewModel || 'claude-sonnet-4-20250514';
      const aiProvider = createAIProvider(selectedModel);
      const modelString = getModelString(selectedModel);
      console.log(`[AI Single-Row] Using AI model: ${selectedModel} (${modelString})`);

      // Helper function to strip markdown code fences from AI responses
      const stripMarkdownCodeFence = (text: string): string => {
        // Remove ```json and ``` markers that Claude sometimes adds
        return text.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      };

      // Use AI to analyze (retry logic in provider layer)
      let completionResult;
      try {
        completionResult = await aiProvider.createCompletion([
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: buildUserPrompt(riskItemValue, baselineSnapshotCell.value, contractContent) + '\n\nIMPORTANT: Respond with ONLY raw JSON, no markdown formatting or code blocks.',
          },
        ], {
          model: modelString,
          maxTokens: 16000,
          temperature: 0,
        });

        console.log('[AI Single-Row] AI response received');
      } catch (error: any) {
        console.error('[AI Single-Row] AI request failed:', error.message);
        
        // Provider already handled retries, so this is a final failure
        if (error.message?.includes('rate limit')) {
          return res.status(429).json({ error: error.message });
        }
        
        return res.status(500).json({ 
          error: error.message || 'AI analysis failed' 
        });
      }

      const content = stripMarkdownCodeFence(completionResult.content.trim() || '{}');
      console.log('[AI Single-Row] Raw AI response:', content.substring(0, 500));
      
      // Parse JSON with robust error handling
      let aiResult;
      try {
        aiResult = JSON.parse(content);
      } catch (parseError: any) {
        console.error('[AI Single-Row] JSON parse error:', parseError.message);
        console.error('[AI Single-Row] Failed content:', content);
        
        // Try to fix common JSON issues
        let fixedContent = content;
        
        // Fix unescaped quotes in strings (this is tricky, but we can try)
        // Look for patterns like "text": "value with "quotes" inside"
        // This is a simple fix that won't work in all cases
        try {
          // Remove control characters that break JSON
          fixedContent = fixedContent.replace(/[\x00-\x1F\x7F]/g, '');
          
          // Try parsing again
          aiResult = JSON.parse(fixedContent);
          console.log('[AI Single-Row] JSON fixed successfully');
        } catch (secondError) {
          return res.status(500).json({ 
            error: `AI returned invalid JSON: ${parseError.message}. Please try again.`
          });
        }
      }
      console.log('[AI Single-Row] Parsed AI result:', aiResult);
      
      // Calculate estimated cost based on actual token usage
      const inputCostPer1k = selectedModel.includes('claude') ? 0.003 : 0.0025; // Claude Sonnet 4: $3/1M, GPT-4o: $2.5/1M
      const outputCostPer1k = selectedModel.includes('claude') ? 0.015 : 0.010; // Claude Sonnet 4: $15/1M, GPT-4o: $10/1M
      const estimatedCost = (
        (completionResult.usage.inputTokens / 1000) * inputCostPer1k +
        (completionResult.usage.outputTokens / 1000) * outputCostPer1k
      ).toFixed(4);

      if (aiResult && aiResult.summary) {
        const now = new Date();
        const updatedCellIds: string[] = [];

        // Update Summary Position column (review_work version, not template)
        const summaryColumnHeader = 'Summary Position of Document';
        const [existingSummaryCell] = await db
          .select()
          .from(contractReviewRevisionCells)
          .where(
            and(
              eq(contractReviewRevisionCells.revisionRowId, revisionRow.id),
              eq(contractReviewRevisionCells.columnHeader, summaryColumnHeader),
              eq(contractReviewRevisionCells.columnKind, 'review_work'),
              isNull(contractReviewRevisionCells.columnConfigId)
            )
          );

        if (existingSummaryCell) {
          console.log('[AI Single-Row] Updating existing Summary Position cell:', existingSummaryCell.id);
          await db
            .update(contractReviewRevisionCells)
            .set({
              value: aiResult.summary,
              originalAiValue: aiResult.summary,
              lastEditedBy: 'AI Assistant',
              lastEditedAt: now,
            })
            .where(eq(contractReviewRevisionCells.id, existingSummaryCell.id));
          console.log('[AI Single-Row] Updated Summary Position cell with value:', aiResult.summary);
        } else {
          console.log('[AI Single-Row] Inserting new Summary Position cell');
          await db
            .insert(contractReviewRevisionCells)
            .values({
              revisionRowId: revisionRow.id,
              columnConfigId: null,
              columnKind: 'review_work',
              columnHeader: summaryColumnHeader,
              value: aiResult.summary,
              originalAiValue: aiResult.summary,
              lastEditedBy: 'AI Assistant',
              lastEditedAt: now,
            });
          console.log('[AI Single-Row] Inserted new Summary Position cell with value:', aiResult.summary);
        }

        updatedCellIds.push(`${revisionRow.rowIndex}-summary-position`);
        console.log('[AI Single-Row] Added cell ID to updatedCellIds:', `${revisionRow.rowIndex}-summary-position`);

        // Update Cl. Ref column (review_work version, not template)
        if (aiResult.clauseNumbers && aiResult.clauseNumbers.length > 0) {
          const clauseRefValue = aiResult.clauseNumbers.join('\n');
          const clRefColumnHeader = 'Cl. Ref';
          
          const [existingClRefCell] = await db
            .select()
            .from(contractReviewRevisionCells)
            .where(
              and(
                eq(contractReviewRevisionCells.revisionRowId, revisionRow.id),
                eq(contractReviewRevisionCells.columnHeader, clRefColumnHeader),
                eq(contractReviewRevisionCells.columnKind, 'review_work'),
                isNull(contractReviewRevisionCells.columnConfigId)
              )
            );

          if (existingClRefCell) {
            await db
              .update(contractReviewRevisionCells)
              .set({
                value: clauseRefValue,
                originalAiValue: clauseRefValue,
                lastEditedBy: 'AI Assistant',
                lastEditedAt: now,
              })
              .where(eq(contractReviewRevisionCells.id, existingClRefCell.id));
          } else {
            await db
              .insert(contractReviewRevisionCells)
              .values({
                revisionRowId: revisionRow.id,
                columnConfigId: null,
                columnKind: 'review_work',
                columnHeader: clRefColumnHeader,
                value: clauseRefValue,
                originalAiValue: clauseRefValue,
                lastEditedBy: 'AI Assistant',
                lastEditedAt: now,
              });
          }

          updatedCellIds.push(`${revisionRow.rowIndex}-cl-ref`);
        }

        // Update AI Proposed Mitigation column if mitigation was generated
        if (aiResult.proposedMitigation) {
          const mitigationColumnHeader = 'AI Proposed Mitigation';
          
          const [existingMitigationCell] = await db
            .select()
            .from(contractReviewRevisionCells)
            .where(
              and(
                eq(contractReviewRevisionCells.revisionRowId, revisionRow.id),
                eq(contractReviewRevisionCells.columnHeader, mitigationColumnHeader),
                eq(contractReviewRevisionCells.columnKind, 'review_work'),
                isNull(contractReviewRevisionCells.columnConfigId)
              )
            );

          if (existingMitigationCell) {
            await db
              .update(contractReviewRevisionCells)
              .set({
                value: aiResult.proposedMitigation,
                originalAiValue: aiResult.proposedMitigation,
                lastEditedBy: 'AI Assistant',
                lastEditedAt: now,
              })
              .where(eq(contractReviewRevisionCells.id, existingMitigationCell.id));
          } else {
            await db
              .insert(contractReviewRevisionCells)
              .values({
                revisionRowId: revisionRow.id,
                columnConfigId: null,
                columnKind: 'review_work',
                columnHeader: mitigationColumnHeader,
                value: aiResult.proposedMitigation,
                originalAiValue: aiResult.proposedMitigation,
                lastEditedBy: 'AI Assistant',
                lastEditedAt: now,
              });
          }
          
          updatedCellIds.push(`${revisionRow.rowIndex}-ai-mitigation`);
        }

        // Update Approval Required column if it exists
        if (approvalColumn && aiResult.approvalRequired) {
          const [existingApprovalCell] = await db
            .select()
            .from(contractReviewRevisionCells)
            .where(
              and(
                eq(contractReviewRevisionCells.revisionRowId, revisionRow.id),
                eq(contractReviewRevisionCells.columnConfigId, approvalColumn.id)
              )
            );

          if (existingApprovalCell) {
            await db
              .update(contractReviewRevisionCells)
              .set({
                value: aiResult.approvalRequired,
                originalAiValue: aiResult.approvalRequired,
                lastEditedBy: 'AI Assistant',
                lastEditedAt: now,
              })
              .where(eq(contractReviewRevisionCells.id, existingApprovalCell.id));
          } else {
            await db
              .insert(contractReviewRevisionCells)
              .values({
                revisionRowId: revisionRow.id,
                columnConfigId: approvalColumn.id,
                columnKind: 'review_work',
                columnHeader: approvalColumn.columnHeader,
                value: aiResult.approvalRequired,
                originalAiValue: aiResult.approvalRequired,
                lastEditedBy: 'AI Assistant',
                lastEditedAt: now,
              });
          }

          updatedCellIds.push(`${revisionRow.rowIndex}-${approvalColumn.id}`);
        }

        // Broadcast revision update
        contractReviewWS.broadcastRevisionUpdate(revisionId, revision.projectId);

        // Calculate duration
        const durationMs = Date.now() - analysisStartTime;

        // Get current user's personId for logging
        const person = (req as any).person;
        if (person) {
          try {
            // Write usage log to database for invoicing
            // Note: Token counts not available when using abstraction layer, set to 0
            await db.insert(aiUsageLogs).values({
              projectId: revision.projectId,
              personId: person.id,
              formName: 'Contract Review',
              eventType: 'row',
              modelUsed: selectedModel,
              revisionId,
              rowId: revisionRow.id,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              durationMs,
              estimatedCost: estimatedCost, // Already a string from line 2535
              notes: `Single row analysis (row ${revisionRow.rowIndex}) using ${selectedModel}`,
            });
            console.log(`[AI Single-Row] Usage logged for user ${person.id}, row ${revisionRow.id} (${durationMs}ms)`);
          } catch (error) {
            console.error('[AI Single-Row] Failed to log usage:', error);
          }
        }

        const responseData = { 
          success: true,
          summary: aiResult.summary,
          clauseNumbers: aiResult.clauseNumbers || [],
          approvalRequired: aiResult.approvalRequired,
          aiGeneratedCellIds: updatedCellIds,
        };
        console.log('[AI Single-Row] Sending response:', JSON.stringify(responseData, null, 2));
        res.json(responseData);
      } else {
        console.log('[AI Single-Row] ERROR: AI did not generate a summary, aiResult:', aiResult);
        res.status(500).json({ error: 'AI did not generate a summary' });
      }
    } catch (error: any) {
      console.error('Error in single-row AI analysis:', error);
      
      // Provide specific error message for rate limits
      if (error.status === 429) {
        return res.status(429).json({ 
          error: 'OpenAI rate limit exceeded. Your API key has hit its quota or rate limit. Please wait and try again later, or upgrade your OpenAI plan.' 
        });
      }
      
      res.status(500).json({ error: error.message || 'AI analysis failed' });
    }
  });
  
  // Legacy endpoint for backward compatibility - updates multiple cells at once
  app.patch('/api/contract-review/revisions/:revisionId/cells', async (req, res) => {
    try {
      const { revisionId } = req.params;
      const { rowIndex, cells } = req.body;
      
      // Check if revision is active
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId));
      
      if (!revision) {
        return res.status(404).json({ error: 'Revision not found' });
      }
      
      if (revision.status !== 'active') {
        return res.status(400).json({ error: 'Cannot edit superseded revision' });
      }
      
      // Update or insert row
      const existingRow = await db
        .select()
        .from(contractReviewRows)
        .where(
          and(
            eq(contractReviewRows.contractReviewDocumentId, revisionId),
            eq(contractReviewRows.rowIndex, rowIndex)
          )
        );
      
      if (existingRow.length > 0) {
        await db
          .update(contractReviewRows)
          .set({ cells })
          .where(eq(contractReviewRows.id, existingRow[0].id));
      } else {
        await db
          .insert(contractReviewRows)
          .values({
            contractReviewDocumentId: revisionId,
            rowIndex,
            cells,
          });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating cells:', error);
      res.status(500).json({ error: 'Failed to update cells' });
    }
  });

  // Contract Review Row Comments Routes
  
  // Get comments for a specific row in a revision
  app.get('/api/contract-review/rows/:rowId/comments', async (req, res) => {
    try {
      const { rowId } = req.params;
      const { revisionId } = req.query;
      
      const comments = await db
        .select()
        .from(contractReviewRowComments)
        .where(
          and(
            eq(contractReviewRowComments.contractReviewRowId, rowId),
            revisionId ? eq(contractReviewRowComments.revisionId, revisionId as string) : undefined
          )
        )
        .orderBy(contractReviewRowComments.createdAt);
      
      res.json(comments);
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  });

  // Create a new comment on a row
  app.post('/api/contract-review/rows/:rowId/comments', async (req, res) => {
    try {
      const { rowId } = req.params;
      const validatedData = insertContractReviewRowCommentSchema.parse({
        ...req.body,
        contractReviewRowId: rowId,
      });
      
      const [newComment] = await db
        .insert(contractReviewRowComments)
        .values(validatedData)
        .returning();
      
      res.json(newComment);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  });

  // Delete a comment
  app.delete('/api/contract-review/comments/:commentId', async (req, res) => {
    try {
      const { commentId } = req.params;
      
      await db
        .delete(contractReviewRowComments)
        .where(eq(contractReviewRowComments.id, commentId));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  });

  // Update column selection for a revision
  app.patch('/api/contract-review/revisions/:revisionId/column-selection', async (req, res) => {
    try {
      const { revisionId } = req.params;
      const { selectedTemplateColumnIds } = req.body;
      
      await db
        .update(contractReviewDocuments)
        .set({ selectedTemplateColumnIds })
        .where(eq(contractReviewDocuments.id, revisionId));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating column selection:', error);
      res.status(500).json({ error: 'Failed to update column selection' });
    }
  });

  // Approval Routes
  // IMPORTANT: These endpoints currently accept user IDs from the client for the mock auth system.
  // TODO: Once real authentication is implemented, replace client-provided user IDs with 
  // server-side session/JWT validation (req.user.id) and add role-based authorization checks
  // to verify the user has permission to create/update/delete approvals for this project.

  // Get all approvals for a revision row
  app.get('/api/contract-review/rows/:rowId/approvals', async (req, res) => {
    try {
      const { rowId } = req.params;
      const { contractReviewApprovals } = await import('@shared/schema');
      
      const approvals = await db
        .select()
        .from(contractReviewApprovals)
        .where(eq(contractReviewApprovals.revisionRowId, rowId))
        .orderBy(contractReviewApprovals.createdAt);
      
      res.json(approvals);
    } catch (error) {
      console.error('Error fetching approvals:', error);
      res.status(500).json({ error: 'Failed to fetch approvals' });
    }
  });

  // Create a new approval for a revision row
  app.post('/api/contract-review/rows/:rowId/approvals', async (req, res) => {
    try {
      const { rowId } = req.params;
      const { contractReviewApprovals, contractReviewRevisionRows, insertContractReviewApprovalSchema } = await import('@shared/schema');
      
      const validatedData = insertContractReviewApprovalSchema.parse({
        ...req.body,
        revisionRowId: rowId,
      });
      
      const [newApproval] = await db
        .insert(contractReviewApprovals)
        .values(validatedData)
        .returning();
      
      // Get revisionId from the row to broadcast
      const [row] = await db
        .select({ revisionId: contractReviewRevisionRows.revisionId })
        .from(contractReviewRevisionRows)
        .where(eq(contractReviewRevisionRows.id, rowId))
        .limit(1);
      
      if (row) {
        contractReviewWS.broadcastApprovalUpdate(row.revisionId, {
          rowId,
          action: 'created',
          approval: newApproval,
        });
      }
      
      res.json(newApproval);
    } catch (error) {
      console.error('Error creating approval:', error);
      res.status(500).json({ error: 'Failed to create approval' });
    }
  });

  // Update an approval (for DOA review)
  app.patch('/api/contract-review/approvals/:approvalId', async (req, res) => {
    try {
      const { approvalId } = req.params;
      const { status, reviewComments, reviewedBy } = req.body;
      const { contractReviewApprovals, contractReviewRevisionRows } = await import('@shared/schema');
      
      // Get the approval before updating to get revisionRowId and revisionId
      const [existingApproval] = await db
        .select()
        .from(contractReviewApprovals)
        .where(eq(contractReviewApprovals.id, approvalId))
        .limit(1);
      
      const [updatedApproval] = await db
        .update(contractReviewApprovals)
        .set({
          status,
          reviewComments,
          reviewedBy,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contractReviewApprovals.id, approvalId))
        .returning();
      
      // Get revisionId from the row to broadcast
      if (existingApproval) {
        console.log('[Approval Update] existingApproval found:', existingApproval.id, 'revisionRowId:', existingApproval.revisionRowId);
        const [row] = await db
          .select({ revisionId: contractReviewRevisionRows.revisionId })
          .from(contractReviewRevisionRows)
          .where(eq(contractReviewRevisionRows.id, existingApproval.revisionRowId))
          .limit(1);
        
        console.log('[Approval Update] row found:', row ? row.revisionId : 'null');
        if (row) {
          contractReviewWS.broadcastApprovalUpdate(row.revisionId, {
            rowId: existingApproval.revisionRowId,
            action: 'updated',
            approval: updatedApproval,
          });
        } else {
          console.log('[Approval Update] No row found for revisionRowId:', existingApproval.revisionRowId);
        }
      } else {
        console.log('[Approval Update] No existing approval found for id:', approvalId);
      }
      
      res.json(updatedApproval);
    } catch (error) {
      console.error('Error updating approval:', error);
      res.status(500).json({ error: 'Failed to update approval' });
    }
  });

  // Delete an approval
  app.delete('/api/contract-review/approvals/:approvalId', async (req, res) => {
    try {
      const { approvalId } = req.params;
      const { contractReviewApprovals, contractReviewRevisionRows } = await import('@shared/schema');
      
      // Get the approval before deleting to get revisionRowId and revisionId
      const [existingApproval] = await db
        .select()
        .from(contractReviewApprovals)
        .where(eq(contractReviewApprovals.id, approvalId))
        .limit(1);
      
      await db
        .delete(contractReviewApprovals)
        .where(eq(contractReviewApprovals.id, approvalId));
      
      // Get revisionId from the row to broadcast
      if (existingApproval) {
        const [row] = await db
          .select({ revisionId: contractReviewRevisionRows.revisionId })
          .from(contractReviewRevisionRows)
          .where(eq(contractReviewRevisionRows.id, existingApproval.revisionRowId))
          .limit(1);
        
        if (row) {
          contractReviewWS.broadcastApprovalUpdate(row.revisionId, {
            rowId: existingApproval.revisionRowId,
            action: 'deleted',
            approval: existingApproval,
          });
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting approval:', error);
      res.status(500).json({ error: 'Failed to delete approval' });
    }
  });

  // Business Unit Routes
  
  // Get all business units
  app.get('/api/business-units', async (req, res) => {
    try {
      const { companyId } = req.query;
      
      if (companyId && typeof companyId === 'string') {
        const allBusinessUnits = await db
          .select()
          .from(businessUnits)
          .where(eq(businessUnits.companyId, companyId))
          .orderBy(businessUnits.name);
        res.json(allBusinessUnits);
      } else {
        const allBusinessUnits = await db
          .select()
          .from(businessUnits)
          .orderBy(businessUnits.name);
        res.json(allBusinessUnits);
      }
    } catch (error) {
      console.error('Error fetching business units:', error);
      res.status(500).json({ error: 'Failed to fetch business units' });
    }
  });

  // Get single business unit
  app.get('/api/business-units/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db
        .select({
          id: businessUnits.id,
          name: businessUnits.name,
          abn: businessUnits.abn,
          notes: businessUnits.notes,
          companyId: businessUnits.companyId,
          companyName: companies.name,
        })
        .from(businessUnits)
        .leftJoin(companies, eq(businessUnits.companyId, companies.id))
        .where(eq(businessUnits.id, id));
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'Business unit not found' });
      }
      
      res.json(result[0]);
    } catch (error) {
      console.error('Error fetching business unit:', error);
      res.status(500).json({ error: 'Failed to fetch business unit' });
    }
  });

  // Create business unit
  app.post('/api/business-units', async (req, res) => {
    try {
      const validatedData = insertBusinessUnitSchema.parse(req.body);
      const newBusinessUnit = await db
        .insert(businessUnits)
        .values(validatedData)
        .returning();
      
      res.json(newBusinessUnit[0]);
    } catch (error) {
      console.error('Error creating business unit:', error);
      res.status(500).json({ error: 'Failed to create business unit' });
    }
  });

  // Update business unit
  app.patch('/api/business-units/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertBusinessUnitSchema.partial().parse(req.body);
      
      const updated = await db
        .update(businessUnits)
        .set(validatedData)
        .where(eq(businessUnits.id, id))
        .returning();
      
      if (updated.length === 0) {
        return res.status(404).json({ error: 'Business unit not found' });
      }
      
      res.json(updated[0]);
    } catch (error) {
      console.error('Error updating business unit:', error);
      res.status(500).json({ error: 'Failed to update business unit' });
    }
  });

  // Delete business unit
  app.delete('/api/business-units/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if there are any projects assigned to this business unit
      const existingProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.businessUnitId, id))
        .limit(1);
      
      if (existingProjects.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete business unit with assigned projects',
          message: 'This business unit has projects assigned to it. Please reassign or delete the projects first.'
        });
      }
      
      const deleted = await db
        .delete(businessUnits)
        .where(eq(businessUnits.id, id))
        .returning();
      
      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Business unit not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting business unit:', error);
      res.status(500).json({ error: 'Failed to delete business unit' });
    }
  });

  // Contract Template Routes
  
  // Get all templates for a business unit
  app.get('/api/business-units/:businessUnitId/templates', async (req, res) => {
    try {
      const { businessUnitId } = req.params;
      const templates = await db
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.businessUnitId, businessUnitId))
        .orderBy(desc(contractTemplates.createdAt));
      
      res.json(templates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  });

  // Create template for a business unit
  app.post('/api/business-units/:businessUnitId/templates', async (req, res) => {
    try {
      const { businessUnitId } = req.params;
      const validatedData = insertContractTemplateSchema.parse({
        ...req.body,
        businessUnitId // Ensure businessUnitId from URL is used
      });
      
      // If isActive is true, mark all other templates for this business unit as inactive
      if (validatedData.isActive) {
        await db
          .update(contractTemplates)
          .set({ isActive: false })
          .where(eq(contractTemplates.businessUnitId, businessUnitId));
      }
      
      // Create new template
      const newTemplate = await db
        .insert(contractTemplates)
        .values(validatedData)
        .returning();
      
      res.json(newTemplate[0]);
    } catch (error) {
      console.error('Error creating template:', error);
      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  // Create template
  app.post('/api/templates', async (req, res) => {
    try {
      const validatedData = insertContractTemplateSchema.parse(req.body);
      
      // Mark all other templates for this business unit as inactive
      await db
        .update(contractTemplates)
        .set({ isActive: false })
        .where(eq(contractTemplates.businessUnitId, validatedData.businessUnitId));
      
      // Create new active template
      const newTemplate = await db
        .insert(contractTemplates)
        .values(validatedData)
        .returning();
      
      res.json(newTemplate[0]);
    } catch (error) {
      console.error('Error creating template:', error);
      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  // Get single template
  app.get('/api/templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const template = await db
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.id, id));
      
      if (template.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.json(template[0]);
    } catch (error) {
      console.error('Error fetching template:', error);
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  });

  // Delete template
  app.delete('/api/templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if there are any contract review documents using this template
      const linkedDocuments = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.templateId, id))
        .limit(1);
      
      if (linkedDocuments.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete template with linked data',
          message: 'This template is being used by contract review documents. Please remove or update those documents first.'
        });
      }
      
      // Delete associated column configurations first
      await db
        .delete(templateColumnConfigs)
        .where(eq(templateColumnConfigs.templateId, id));
      
      // Delete the template
      const deleted = await db
        .delete(contractTemplates)
        .where(eq(contractTemplates.id, id))
        .returning();
      
      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting template:', error);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  // Project Routes
  
  // Get all projects
  app.get('/api/projects', async (req, res) => {
    try {
      const { companyId, businessUnitId } = req.query;
      
      // Define consistent project shape for all queries
      const projectSelect = {
        id: projects.id,
        projectCode: projects.projectCode,
        name: projects.name,
        client: projects.client,
        location: projects.location,
        businessUnitId: projects.businessUnitId,
        status: projects.status,
        phase: projects.phase,
        tenderStartDate: projects.tenderStartDate,
        tenderEndDate: projects.tenderEndDate,
        deliveryStartDate: projects.deliveryStartDate,
        deliveryEndDate: projects.deliveryEndDate,
        defectsPeriodStartDate: projects.defectsPeriodStartDate,
        defectsPeriodEndDate: projects.defectsPeriodEndDate,
        closedStartDate: projects.closedStartDate,
        closedEndDate: projects.closedEndDate,
        sharepointFolderPath: projects.sharepointFolderPath,
        contractDocumentPath: projects.contractDocumentPath,
        contractSpecificationPath: projects.contractSpecificationPath,
        projectRevenue: projects.projectRevenue,
        projectProfit: projects.projectProfit,
        createdAt: projects.createdAt,
      };
      
      if (businessUnitId && typeof businessUnitId === 'string') {
        // Filter projects by specific business unit
        const allProjects = await db
          .select(projectSelect)
          .from(projects)
          .where(eq(projects.businessUnitId, businessUnitId))
          .orderBy(desc(projects.createdAt));
        
        res.json(allProjects);
      } else if (companyId && typeof companyId === 'string') {
        // Filter projects by company through business units
        const allProjects = await db
          .select(projectSelect)
          .from(projects)
          .innerJoin(businessUnits, eq(projects.businessUnitId, businessUnits.id))
          .where(eq(businessUnits.companyId, companyId))
          .orderBy(desc(projects.createdAt));
        
        res.json(allProjects);
      } else {
        // Return all projects if no company filter
        const allProjects = await db
          .select(projectSelect)
          .from(projects)
          .orderBy(desc(projects.createdAt));
        
        res.json(allProjects);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  // Get single project
  app.get('/api/projects/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const project = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id));
      
      if (project.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json(project[0]);
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  // Create project
  app.post('/api/projects', async (req, res) => {
    try {
      const validatedData = insertProjectSchema.parse(req.body);
      const newProject = await db
        .insert(projects)
        .values(validatedData)
        .returning();
      
      res.json(newProject[0]);
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // Update project
  app.patch('/api/projects/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertProjectSchema.partial().parse(req.body);
      
      const updated = await db
        .update(projects)
        .set(validatedData)
        .where(eq(projects.id, id))
        .returning();
      
      if (updated.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json(updated[0]);
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // Delete project
  app.delete('/api/projects/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await db
        .delete(projects)
        .where(eq(projects.id, id))
        .returning();
      
      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting project:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // Company Routes
  
  // Get all companies
  app.get('/api/companies', async (req, res) => {
    try {
      const allCompanies = await db
        .select()
        .from(companies)
        .orderBy(companies.name);
      
      // Get business unit counts for each company
      const companiesWithCounts = await Promise.all(
        allCompanies.map(async (company) => {
          const buCount = await db
            .select()
            .from(businessUnits)
            .where(eq(businessUnits.companyId, company.id));
          
          return {
            ...company,
            businessUnitCount: buCount.length
          };
        })
      );
      
      res.json(companiesWithCounts);
    } catch (error) {
      console.error('Error fetching companies:', error);
      res.status(500).json({ error: 'Failed to fetch companies' });
    }
  });

  // Get single company
  app.get('/api/companies/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, id));
      
      if (company.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }
      
      // Get business unit count
      const buCount = await db
        .select()
        .from(businessUnits)
        .where(eq(businessUnits.companyId, id));
      
      const companyWithCount = {
        ...company[0],
        businessUnitCount: buCount.length
      };
      
      res.json(companyWithCount);
    } catch (error) {
      console.error('Error fetching company:', error);
      res.status(500).json({ error: 'Failed to fetch company' });
    }
  });

  // Create company
  app.post('/api/companies', async (req, res) => {
    try {
      const validatedData = insertCompanySchema.parse(req.body);
      const newCompany = await db
        .insert(companies)
        .values(validatedData)
        .returning();
      
      res.json(newCompany[0]);
    } catch (error) {
      console.error('Error creating company:', error);
      res.status(500).json({ error: 'Failed to create company' });
    }
  });

  // Update company
  app.patch('/api/companies/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertCompanySchema.partial().parse(req.body);
      
      const updated = await db
        .update(companies)
        .set(validatedData)
        .where(eq(companies.id, id))
        .returning();
      
      if (updated.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }
      
      res.json(updated[0]);
    } catch (error) {
      console.error('Error updating company:', error);
      res.status(500).json({ error: 'Failed to update company' });
    }
  });

  // Delete company
  app.delete('/api/companies/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if company has any business units
      const existingBUs = await db
        .select()
        .from(businessUnits)
        .where(eq(businessUnits.companyId, id));
      
      if (existingBUs.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete company with existing business units',
          businessUnitCount: existingBUs.length 
        });
      }
      
      const deleted = await db
        .delete(companies)
        .where(eq(companies.id, id))
        .returning();
      
      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting company:', error);
      res.status(500).json({ error: 'Failed to delete company' });
    }
  });

  // Company Theme Settings Routes
  
  // Get company theme settings
  app.get('/api/companies/:id/theme-settings', isAuthenticated, async (req, res) => {
    try {
      const { id: companyId } = req.params;
      
      // Check if company exists
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }
      
      // Get or create theme settings
      let [settings] = await db
        .select()
        .from(companyThemeSettings)
        .where(eq(companyThemeSettings.companyId, companyId))
        .limit(1);
      
      if (!settings) {
        // Create default settings if they don't exist
        [settings] = await db
          .insert(companyThemeSettings)
          .values({
            companyId,
            rowDensity: 'wide', // default
          })
          .returning();
      }
      
      res.json(settings);
    } catch (error) {
      console.error('Error fetching company theme settings:', error);
      res.status(500).json({ error: 'Failed to fetch theme settings' });
    }
  });

  // Update company theme settings
  app.patch('/api/companies/:id/theme-settings', isAuthenticated, async (req, res) => {
    try {
      const { id: companyId } = req.params;
      const validatedData = insertCompanyThemeSettingsSchema.partial().parse(req.body);
      
      // Check if company exists
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }
      
      // Check if settings exist
      const [existing] = await db
        .select()
        .from(companyThemeSettings)
        .where(eq(companyThemeSettings.companyId, companyId))
        .limit(1);
      
      let updated;
      if (existing) {
        // Update existing settings
        [updated] = await db
          .update(companyThemeSettings)
          .set({
            ...validatedData,
            updatedAt: new Date(),
          })
          .where(eq(companyThemeSettings.companyId, companyId))
          .returning();
      } else {
        // Create new settings
        [updated] = await db
          .insert(companyThemeSettings)
          .values({
            companyId,
            ...validatedData,
          })
          .returning();
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating company theme settings:', error);
      res.status(500).json({ error: 'Failed to update theme settings' });
    }
  });

  // Resource Types Routes
  
  // Get all resource types for a company
  app.get('/api/companies/:companyId/resource-types', async (req, res) => {
    try {
      const { companyId } = req.params;
      const companyResourceTypes = await db
        .select()
        .from(resourceTypes)
        .where(eq(resourceTypes.companyId, companyId))
        .orderBy(resourceTypes.sortingIndex);
      
      res.json(companyResourceTypes);
    } catch (error) {
      console.error('Error fetching resource types:', error);
      res.status(500).json({ error: 'Failed to fetch resource types' });
    }
  });

  // Get single resource type
  app.get('/api/resource-types/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [resourceType] = await db
        .select()
        .from(resourceTypes)
        .where(eq(resourceTypes.id, id))
        .limit(1);
      
      if (!resourceType) {
        return res.status(404).json({ error: 'Resource type not found' });
      }
      
      res.json(resourceType);
    } catch (error) {
      console.error('Error fetching resource type:', error);
      res.status(500).json({ error: 'Failed to fetch resource type' });
    }
  });

  // Create resource type
  app.post('/api/companies/:companyId/resource-types', async (req, res) => {
    try {
      const { companyId } = req.params;
      const validatedData = insertResourceTypeSchema.parse({
        ...req.body,
        companyId,
      });

      // Get max sorting index for this company
      const existingResourceTypes = await db
        .select()
        .from(resourceTypes)
        .where(eq(resourceTypes.companyId, companyId))
        .orderBy(desc(resourceTypes.sortingIndex))
        .limit(1);

      const maxIndex = existingResourceTypes.length > 0 ? existingResourceTypes[0].sortingIndex : -1;

      const [newResourceType] = await db
        .insert(resourceTypes)
        .values({
          ...validatedData,
          sortingIndex: maxIndex + 1,
        })
        .returning();
      
      // Broadcast to WebSocket clients
      resourceTypesWS.broadcastToCompany(companyId, {
        type: 'resource_type_created',
        data: newResourceType
      });

      res.json(newResourceType);
    } catch (error) {
      console.error('Error creating resource type:', error);
      if (error instanceof Error && error.message.includes('resource_types_company_code_unique')) {
        return res.status(400).json({ error: 'Resource code already exists for this company' });
      }
      if (error instanceof Error && error.message.includes('resource_code_single_capital')) {
        return res.status(400).json({ error: 'Resource code must be a single capital letter (A-Z)' });
      }
      res.status(500).json({ error: 'Failed to create resource type' });
    }
  });

  // Update resource type
  app.patch('/api/resource-types/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertResourceTypeSchema.partial().parse(req.body);
      
      const [updated] = await db
        .update(resourceTypes)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(resourceTypes.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Resource type not found' });
      }
      
      // Broadcast to WebSocket clients
      resourceTypesWS.broadcastToCompany(updated.companyId, {
        type: 'resource_type_updated',
        data: updated
      });

      res.json(updated);
    } catch (error) {
      console.error('Error updating resource type:', error);
      if (error instanceof Error && error.message.includes('resource_types_company_code_unique')) {
        return res.status(400).json({ error: 'Resource code already exists for this company' });
      }
      if (error instanceof Error && error.message.includes('resource_code_single_capital')) {
        return res.status(400).json({ error: 'Resource code must be a single capital letter (A-Z)' });
      }
      res.status(500).json({ error: 'Failed to update resource type' });
    }
  });

  // Delete resource type
  app.delete('/api/resource-types/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [deleted] = await db
        .delete(resourceTypes)
        .where(eq(resourceTypes.id, id))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: 'Resource type not found' });
      }
      
      // Broadcast to WebSocket clients
      resourceTypesWS.broadcastToCompany(deleted.companyId, {
        type: 'resource_type_deleted',
        data: { id }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting resource type:', error);
      res.status(500).json({ error: 'Failed to delete resource type' });
    }
  });

  // Bulk create resource types (for smart import)
  app.post('/api/companies/:companyId/resource-types/bulk-create', isAuthenticated, async (req, res) => {
    try {
      const { companyId } = req.params;
      const { resTypes } = req.body as { resTypes: string[] };

      if (!Array.isArray(resTypes) || resTypes.length === 0) {
        return res.status(400).json({ error: 'resTypes must be a non-empty array' });
      }

      // Get existing resource types to avoid duplicates
      const existingResourceTypes = await db
        .select({ resType: resourceTypes.resType })
        .from(resourceTypes)
        .where(eq(resourceTypes.companyId, companyId));

      const existingResTypesSet = new Set(
        existingResourceTypes.map(rt => rt.resType.trim().toLowerCase())
      );

      // Get max sorting index to append new types at the end
      const [maxSortingResult] = await db
        .select({ maxIndex: sql<number>`COALESCE(MAX(${resourceTypes.sortingIndex}), -1)` })
        .from(resourceTypes)
        .where(eq(resourceTypes.companyId, companyId));

      let nextSortingIndex = (maxSortingResult?.maxIndex ?? -1) + 1;

      // Filter out duplicates and create new resource types
      const newResourceTypes: any[] = [];
      const skipped: string[] = [];
      const created: string[] = [];

      for (const resType of resTypes) {
        const trimmed = resType.trim();
        if (!trimmed) continue;

        // Check for duplicate (case-insensitive)
        if (existingResTypesSet.has(trimmed.toLowerCase())) {
          skipped.push(trimmed);
          continue;
        }

        newResourceTypes.push({
          companyId,
          resType: trimmed,
          resourceDescription: trimmed, // Default description = same as name
          sortingIndex: nextSortingIndex++,
        });

        created.push(trimmed);
        existingResTypesSet.add(trimmed.toLowerCase()); // Prevent duplicates within this batch
      }

      // Insert new resource types
      let insertedTypes: any[] = [];
      if (newResourceTypes.length > 0) {
        insertedTypes = await db
          .insert(resourceTypes)
          .values(newResourceTypes)
          .returning();

        // Broadcast to WebSocket clients
        for (const type of insertedTypes) {
          resourceTypesWS.broadcastToCompany(companyId, {
            type: 'resource_type_created',
            data: type
          });
        }
      }

      res.json({
        created: insertedTypes,
        createdCount: insertedTypes.length,
        skipped,
        skippedCount: skipped.length,
      });
    } catch (error) {
      console.error('Error bulk creating resource types:', error);
      res.status(500).json({ error: 'Failed to bulk create resource types' });
    }
  });

  // Reorder resource types (update sorting_index for all resource types)
  app.post('/api/companies/:companyId/resource-types/reorder', async (req, res) => {
    try {
      const { companyId } = req.params;
      const { resourceTypeIds } = req.body as { resourceTypeIds: string[] };
      
      if (!Array.isArray(resourceTypeIds)) {
        return res.status(400).json({ error: 'resourceTypeIds must be an array' });
      }

      // Update each resource type's sorting index based on array position
      await Promise.all(
        resourceTypeIds.map((resourceTypeId, index) =>
          db
            .update(resourceTypes)
            .set({ 
              sortingIndex: index,
              updatedAt: new Date(),
            })
            .where(eq(resourceTypes.id, resourceTypeId))
        )
      );

      // Fetch updated resource types
      const updatedResourceTypes = await db
        .select()
        .from(resourceTypes)
        .where(eq(resourceTypes.companyId, companyId))
        .orderBy(resourceTypes.sortingIndex);
      
      // Broadcast to WebSocket clients
      resourceTypesWS.broadcastToCompany(companyId, {
        type: 'resource_types_reordered',
        data: { companyId, resourceTypes: updatedResourceTypes }
      });

      res.json(updatedResourceTypes);
    } catch (error) {
      console.error('Error reordering resource types:', error);
      res.status(500).json({ error: 'Failed to reorder resource types' });
    }
  });

  // RFI Routes
  
  // Get all RFIs
  app.get('/api/rfis', async (req, res) => {
    try {
      const allRFIs = await db
        .select()
        .from(rfis)
        .orderBy(desc(rfis.createdAt));
      
      res.json(allRFIs);
    } catch (error) {
      console.error('Error fetching RFIs:', error);
      res.status(500).json({ error: 'Failed to fetch RFIs' });
    }
  });

  // Get RFIs by project
  app.get('/api/projects/:projectId/rfis', async (req, res) => {
    try {
      const { projectId } = req.params;
      const projectRFIs = await db
        .select()
        .from(rfis)
        .where(eq(rfis.projectId, projectId))
        .orderBy(desc(rfis.createdAt));
      
      res.json(projectRFIs);
    } catch (error) {
      console.error('Error fetching project RFIs:', error);
      res.status(500).json({ error: 'Failed to fetch project RFIs' });
    }
  });

  // Get single RFI
  app.get('/api/rfis/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const rfi = await db
        .select()
        .from(rfis)
        .where(eq(rfis.id, id));
      
      if (rfi.length === 0) {
        return res.status(404).json({ error: 'RFI not found' });
      }
      
      res.json(rfi[0]);
    } catch (error) {
      console.error('Error fetching RFI:', error);
      res.status(500).json({ error: 'Failed to fetch RFI' });
    }
  });

  // Create RFI
  app.post('/api/rfis', async (req, res) => {
    try {
      const validatedData = insertRFISchema.parse(req.body);
      const newRFI = await db
        .insert(rfis)
        .values(validatedData)
        .returning();
      
      res.json(newRFI[0]);
    } catch (error) {
      console.error('Error creating RFI:', error);
      res.status(500).json({ error: 'Failed to create RFI' });
    }
  });

  // Update RFI
  app.patch('/api/rfis/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertRFISchema.partial().parse(req.body);
      
      const updated = await db
        .update(rfis)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(rfis.id, id))
        .returning();
      
      if (updated.length === 0) {
        return res.status(404).json({ error: 'RFI not found' });
      }
      
      res.json(updated[0]);
    } catch (error) {
      console.error('Error updating RFI:', error);
      res.status(500).json({ error: 'Failed to update RFI' });
    }
  });

  // Delete RFI
  app.delete('/api/rfis/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await db
        .delete(rfis)
        .where(eq(rfis.id, id))
        .returning();
      
      if (deleted.length === 0) {
        return res.status(404).json({ error: 'RFI not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting RFI:', error);
      res.status(500).json({ error: 'Failed to delete RFI' });
    }
  });

  // === RFI COMMENTS ROUTES ===
  
  // Get comments for an RFI
  app.get('/api/rfis/:rfiId/comments', async (req, res) => {
    try {
      const { rfiId } = req.params;
      const comments = await db
        .select({
          id: rfiComments.id,
          rfiId: rfiComments.rfiId,
          userAccountId: rfiComments.userAccountId,
          content: rfiComments.content,
          attachments: rfiComments.attachments,
          createdAt: rfiComments.createdAt,
          updatedAt: rfiComments.updatedAt,
          authorName: people.givenName,
          authorFamilyName: people.familyName,
          authorEmail: people.email,
        })
        .from(rfiComments)
        .leftJoin(userAccounts, eq(rfiComments.userAccountId, userAccounts.id))
        .leftJoin(people, eq(userAccounts.personId, people.id))
        .where(eq(rfiComments.rfiId, rfiId))
        .orderBy(rfiComments.createdAt);
      
      res.json(comments);
    } catch (error) {
      console.error('Error fetching RFI comments:', error);
      res.status(500).json({ error: 'Failed to fetch RFI comments' });
    }
  });

  // Create comment for an RFI
  app.post('/api/rfis/:rfiId/comments', async (req, res) => {
    try {
      const { rfiId } = req.params;
      const validatedData = insertRFICommentSchema.parse({
        ...req.body,
        rfiId,
      });
      
      const newComment = await db
        .insert(rfiComments)
        .values(validatedData)
        .returning();
      
      res.json(newComment[0]);
    } catch (error) {
      console.error('Error creating RFI comment:', error);
      res.status(500).json({ error: 'Failed to create RFI comment' });
    }
  });

  // Update comment
  app.patch('/api/rfi-comments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertRFICommentSchema.partial().parse(req.body);
      
      const updated = await db
        .update(rfiComments)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(rfiComments.id, id))
        .returning();
      
      if (updated.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      
      res.json(updated[0]);
    } catch (error) {
      console.error('Error updating comment:', error);
      res.status(500).json({ error: 'Failed to update comment' });
    }
  });

  // Delete comment
  app.delete('/api/rfi-comments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await db
        .delete(rfiComments)
        .where(eq(rfiComments.id, id))
        .returning();
      
      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  });

  // === USER MANAGEMENT ROUTES ===

  // Get all users (using new RBAC schema)
  app.get('/api/users', async (req, res) => {
    try {
      // PERFORMANCE FIX: Batch fetch users with their current roles in one query
      // Get all users with person details
      const usersData = await db
        .select({
          id: userAccounts.id,
          username: userAccounts.username,
          mfaEnabled: userAccounts.mfaEnabled,
          personId: people.id,
          givenName: people.givenName,
          familyName: people.familyName,
          email: people.email,
          mobile: people.mobile,
          employeeNo: people.employeeNo,
          isActive: people.isActive,
        })
        .from(userAccounts)
        .innerJoin(people, eq(userAccounts.personId, people.id));

      if (usersData.length === 0) {
        return res.json([]);
      }

      // Batch fetch all current employment roles in ONE query
      const userIds = usersData.map(u => u.id);
      const { inArray } = await import('drizzle-orm');
      const allCurrentRoles = await db
        .select({
          userAccountId: userEmploymentHistory.userAccountId,
          roleTitle: employmentRoles.title,
          startDate: userEmploymentHistory.startDate,
        })
        .from(userEmploymentHistory)
        .innerJoin(employmentRoles, eq(userEmploymentHistory.employmentRoleId, employmentRoles.id))
        .where(
          and(
            inArray(userEmploymentHistory.userAccountId, userIds),
            isNull(userEmploymentHistory.endDate)
          )
        )
        .orderBy(desc(userEmploymentHistory.startDate));

      // Group roles by user and take the most recent
      const rolesByUser = new Map<string, string>();
      for (const role of allCurrentRoles) {
        if (!rolesByUser.has(role.userAccountId)) {
          rolesByUser.set(role.userAccountId, role.roleTitle);
        }
      }

      // Assemble users with their roles
      const usersWithRoles = usersData.map(user => ({
        ...user,
        currentEmploymentRole: rolesByUser.get(user.id) || null,
      }));
      
      res.json(usersWithRoles);
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  });

  // Create new person
  app.post('/api/people', async (req, res) => {
    try {
      const validatedData = insertPersonSchema.parse(req.body);
      const [newPerson] = await db.insert(people).values(validatedData).returning();
      res.json(newPerson);
    } catch (error) {
      console.error('Error creating person:', error);
      res.status(500).json({ error: 'Failed to create person' });
    }
  });

  // Create new user account
  app.post('/api/user-accounts', async (req, res) => {
    try {
      const { personId, username, passwordHash, mfaEnabled } = req.body;
      
      // Hash the password before storing
      const hashedPassword = await bcrypt.hash(passwordHash, 10);
      
      const [newUserAccount] = await db.insert(userAccounts).values({
        personId,
        username,
        passwordHash: hashedPassword,
        mfaEnabled: mfaEnabled || false,
      }).returning();
      
      res.json(newUserAccount);
    } catch (error) {
      console.error('Error creating user account:', error);
      res.status(500).json({ error: 'Failed to create user account' });
    }
  });

  // === RBAC ROUTES ===

  // Get all roles
  app.get('/api/rbac/roles', async (req, res) => {
    try {
      const allRoles = await db.select().from(roles);
      res.json(allRoles);
    } catch (error) {
      console.error('Error getting roles:', error);
      res.status(500).json({ error: 'Failed to get roles' });
    }
  });

  // Get all permissions
  app.get('/api/rbac/permissions', async (req, res) => {
    try {
      const allPermissions = await db.select().from(permissions);
      res.json(allPermissions);
    } catch (error) {
      console.error('Error getting permissions:', error);
      res.status(500).json({ error: 'Failed to get permissions' });
    }
  });

  // Get all project roles
  app.get('/api/rbac/project-roles', async (req, res) => {
    try {
      const allProjectRoles = await db.select().from(projectRoles);
      res.json(allProjectRoles);
    } catch (error) {
      console.error('Error getting project roles:', error);
      res.status(500).json({ error: 'Failed to get project roles' });
    }
  });

  // Get user's global permissions
  app.get('/api/rbac/users/:userAccountId/permissions', async (req, res) => {
    try {
      const { userAccountId } = req.params;
      const perms = await rbacService.getCurrentGlobalPermissions(userAccountId);
      res.json({ permissions: perms });
    } catch (error) {
      console.error('Error getting user permissions:', error);
      res.status(500).json({ error: 'Failed to get permissions' });
    }
  });

  // Get user's project permissions
  app.get('/api/rbac/users/:userAccountId/projects/:projectId/permissions', async (req, res) => {
    try {
      const { userAccountId, projectId } = req.params;
      const perms = await rbacService.getCurrentProjectPermissions(userAccountId, projectId);
      res.json({ permissions: perms });
    } catch (error) {
      console.error('Error getting project permissions:', error);
      res.status(500).json({ error: 'Failed to get permissions' });
    }
  });

  // Get user's roles
  app.get('/api/rbac/users/:userAccountId/roles', async (req, res) => {
    try {
      const { userAccountId } = req.params;
      const userRolesData = await rbacService.getUserRoles(userAccountId);
      res.json(userRolesData);
    } catch (error) {
      console.error('Error getting user roles:', error);
      res.status(500).json({ error: 'Failed to get user roles' });
    }
  });

  // Assign global role to user
  app.post('/api/rbac/users/:userAccountId/roles', async (req, res) => {
    try {
      const { userAccountId } = req.params;
      const { roleCode, startDate, endDate } = req.body;

      await rbacService.assignGlobalRole(userAccountId, roleCode, startDate, endDate);
      res.json({ success: true });
    } catch (error) {
      console.error('Error assigning role:', error);
      res.status(500).json({ error: 'Failed to assign role' });
    }
  });

  // Get user's projects
  app.get('/api/rbac/users/:userAccountId/projects', async (req, res) => {
    try {
      const { userAccountId } = req.params;
      const projects = await rbacService.getUserProjects(userAccountId);
      res.json(projects);
    } catch (error) {
      console.error('Error getting user projects:', error);
      res.status(500).json({ error: 'Failed to get user projects' });
    }
  });

  // Get project members
  app.get('/api/rbac/projects/:projectId/members', async (req, res) => {
    try {
      const { projectId } = req.params;
      const members = await rbacService.getProjectMembers(projectId);
      res.json(members);
    } catch (error) {
      console.error('Error getting project members:', error);
      res.status(500).json({ error: 'Failed to get project members' });
    }
  });

  // Assign user to project
  app.post('/api/rbac/projects/:projectId/members', async (req, res) => {
    try {
      const { projectId } = req.params;
      const { userAccountId, projectRoleCode, assignedByUserId, notes } = req.body;

      await rbacService.assignProjectRole(
        projectId,
        userAccountId,
        projectRoleCode,
        assignedByUserId,
        notes
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error assigning project role:', error);
      res.status(500).json({ error: 'Failed to assign project role' });
    }
  });

  // Update project member role
  app.patch('/api/rbac/projects/:projectId/members/:membershipId', async (req, res) => {
    try {
      const { membershipId } = req.params;
      const { projectRoleId, notes } = req.body;

      const updateData: any = {};
      if (projectRoleId) updateData.projectRoleId = projectRoleId;
      if (notes !== undefined) updateData.notes = notes;

      await db
        .update(projectMemberships)
        .set(updateData)
        .where(eq(projectMemberships.id, membershipId));

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating project member:', error);
      res.status(500).json({ error: 'Failed to update project member' });
    }
  });

  // Remove user from project
  app.delete('/api/rbac/projects/:projectId/members/:userAccountId', async (req, res) => {
    try {
      const { projectId, userAccountId } = req.params;
      await rbacService.removeFromProject(projectId, userAccountId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing from project:', error);
      res.status(500).json({ error: 'Failed to remove from project' });
    }
  });

  // Get user account details
  app.get('/api/rbac/users/:userAccountId', async (req, res) => {
    try {
      const { userAccountId } = req.params;
      const details = await rbacService.getUserAccountDetails(userAccountId);
      
      if (!details) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(details);
    } catch (error) {
      console.error('Error getting user details:', error);
      res.status(500).json({ error: 'Failed to get user details' });
    }
  });

  // === EMPLOYMENT ROLES ROUTES ===

  // Get all employment roles for a company
  app.get('/api/employment-roles', async (req, res) => {
    try {
      const { companyId } = req.query;
      
      let query = db.select().from(employmentRoles);
      if (companyId) {
        query = query.where(eq(employmentRoles.companyId, companyId as string)) as any;
      }
      
      const allRoles = await query;
      res.json(allRoles);
    } catch (error) {
      console.error('Error getting employment roles:', error);
      res.status(500).json({ error: 'Failed to get employment roles' });
    }
  });

  // Create new employment role
  app.post('/api/employment-roles', async (req, res) => {
    try {
      const validatedData = insertEmploymentRoleSchema.parse(req.body);
      const [newRole] = await db.insert(employmentRoles).values(validatedData).returning();
      res.json(newRole);
    } catch (error: any) {
      console.error('Error creating employment role:', error);
      
      // Check for unique constraint violations
      if (error.code === '23505') {
        if (error.constraint === 'employment_roles_company_title_unique') {
          return res.status(400).json({ 
            error: 'An employment role with this title already exists for this company' 
          });
        }
        if (error.constraint === 'employment_roles_company_doa_acronym_unique') {
          return res.status(400).json({ 
            error: 'An employment role with this DOA acronym already exists for this company' 
          });
        }
      }
      
      res.status(500).json({ error: 'Failed to create employment role' });
    }
  });

  // Update employment role
  app.patch('/api/employment-roles/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, doaAcronym, description, isActive } = req.body;
      
      const [updated] = await db
        .update(employmentRoles)
        .set({ title, doaAcronym, description, isActive })
        .where(eq(employmentRoles.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Employment role not found' });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating employment role:', error);
      
      // Check for unique constraint violations
      if (error.code === '23505') {
        if (error.constraint === 'employment_roles_company_title_unique') {
          return res.status(400).json({ 
            error: 'An employment role with this title already exists for this company' 
          });
        }
        if (error.constraint === 'employment_roles_company_doa_acronym_unique') {
          return res.status(400).json({ 
            error: 'An employment role with this DOA acronym already exists for this company' 
          });
        }
      }
      
      res.status(500).json({ error: 'Failed to update employment role' });
    }
  });

  // Delete (deactivate) employment role
  app.delete('/api/employment-roles/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(employmentRoles)
        .set({ isActive: false })
        .where(eq(employmentRoles.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Employment role not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deactivating employment role:', error);
      res.status(500).json({ error: 'Failed to deactivate employment role' });
    }
  });

  // Get user's employment history
  app.get('/api/users/:userAccountId/employment-history', async (req, res) => {
    try {
      const { userAccountId } = req.params;
      
      const history = await db
        .select({
          id: userEmploymentHistory.id,
          employmentRoleId: userEmploymentHistory.employmentRoleId,
          roleTitle: employmentRoles.title,
          roleDescription: employmentRoles.description,
          startDate: userEmploymentHistory.startDate,
          endDate: userEmploymentHistory.endDate,
          notes: userEmploymentHistory.notes,
          assignedByUserId: userEmploymentHistory.assignedByUserId,
          createdAt: userEmploymentHistory.createdAt,
        })
        .from(userEmploymentHistory)
        .innerJoin(employmentRoles, eq(userEmploymentHistory.employmentRoleId, employmentRoles.id))
        .where(eq(userEmploymentHistory.userAccountId, userAccountId))
        .orderBy(desc(userEmploymentHistory.startDate));
      
      res.json(history);
    } catch (error) {
      console.error('Error getting employment history:', error);
      res.status(500).json({ error: 'Failed to get employment history' });
    }
  });

  // Get user's current employment role
  app.get('/api/users/:userAccountId/current-employment-role', async (req, res) => {
    try {
      const { userAccountId } = req.params;
      
      const [current] = await db
        .select({
          id: userEmploymentHistory.id,
          employmentRoleId: userEmploymentHistory.employmentRoleId,
          roleTitle: employmentRoles.title,
          roleDescription: employmentRoles.description,
          startDate: userEmploymentHistory.startDate,
          endDate: userEmploymentHistory.endDate,
          notes: userEmploymentHistory.notes,
        })
        .from(userEmploymentHistory)
        .innerJoin(employmentRoles, eq(userEmploymentHistory.employmentRoleId, employmentRoles.id))
        .where(
          and(
            eq(userEmploymentHistory.userAccountId, userAccountId),
            isNull(userEmploymentHistory.endDate)
          )
        )
        .orderBy(desc(userEmploymentHistory.startDate))
        .limit(1);
      
      res.json(current || null);
    } catch (error) {
      console.error('Error getting current employment role:', error);
      res.status(500).json({ error: 'Failed to get current employment role' });
    }
  });

  // Assign/update user employment role (promotion)
  app.post('/api/users/:userAccountId/employment-history', async (req, res) => {
    try {
      const { userAccountId } = req.params;
      const validatedData = insertUserEmploymentHistorySchema.parse({
        userAccountId,
        ...req.body
      });
      
      // End current employment role if exists
      await db
        .update(userEmploymentHistory)
        .set({ endDate: validatedData.startDate })
        .where(
          and(
            eq(userEmploymentHistory.userAccountId, userAccountId),
            isNull(userEmploymentHistory.endDate)
          )
        );
      
      // Create new employment history entry
      const [newHistory] = await db
        .insert(userEmploymentHistory)
        .values(validatedData)
        .returning();
      
      res.json(newHistory);
    } catch (error) {
      console.error('Error assigning employment role:', error);
      res.status(500).json({ error: 'Failed to assign employment role' });
    }
  });

  // Project Roles Routes
  app.get('/api/project-roles', async (req, res) => {
    try {
      const roles = await db.select().from(projectRoles);
      res.json(roles);
    } catch (error) {
      console.error('Error fetching project roles:', error);
      res.status(500).json({ error: 'Failed to fetch project roles' });
    }
  });

  // Project Assignments Routes (using projectMemberships table)
  app.post('/api/project-assignments', async (req, res) => {
    try {
      const { userAccountId, projectId, projectRoleId, notes } = req.body;
      
      const validatedData = insertProjectMembershipSchema.parse({
        userAccountId,
        projectId,
        projectRoleId,
        notes,
        startDate: new Date().toISOString(),
      });
      
      const [newAssignment] = await db
        .insert(projectMemberships)
        .values(validatedData)
        .returning();
      
      res.json(newAssignment);
    } catch (error) {
      console.error('Error creating project assignment:', error);
      res.status(500).json({ error: 'Failed to create project assignment' });
    }
  });

  // Contract Review Migration Endpoints
  app.post('/api/admin/migrate-contract-review', async (req, res) => {
    try {
      const { migrateContractReviewData } = await import('./migrations/migrateContractReview');
      const result = await migrateContractReviewData();
      res.json(result);
    } catch (error: any) {
      console.error('Migration error:', error);
      res.status(500).json({ error: error.message || 'Migration failed' });
    }
  });

  app.post('/api/admin/verify-contract-review-migration', async (req, res) => {
    try {
      const { verifyMigration } = await import('./migrations/migrateContractReview');
      const result = await verifyMigration();
      res.json(result);
    } catch (error: any) {
      console.error('Verification error:', error);
      res.status(500).json({ error: error.message || 'Verification failed' });
    }
  });

  // =====================================================
  // AI CORRESPONDENCE LETTER ROUTES
  // =====================================================

  // Get all letters for a project
  // Note: This endpoint returns ONLY uploaded letters for the Letter Register
  // SharePoint letters are accessed separately for AI search recommendations
  app.get('/api/projects/:projectId/correspondence/letters', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const letters = await db
        .select()
        .from(correspondenceLetters)
        .where(
          and(
            eq(correspondenceLetters.projectId, projectId),
            eq(correspondenceLetters.source, 'upload') // Only show uploaded letters in register
          )
        )
        .orderBy(desc(correspondenceLetters.letterNumber));
      
      res.json(letters);
    } catch (error) {
      console.error('Error fetching correspondence letters:', error);
      res.status(500).json({ error: 'Failed to fetch letters' });
    }
  });

  // Upload a new letter
  app.post('/api/projects/:projectId/correspondence/upload', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const file = req.file;
      const { fileName: unsafeFileName, sender, recipient, subject, letterDate, category } = req.body;
      
      if (!file || file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'PDF file is required' });
      }
      
      if (!unsafeFileName || !unsafeFileName.trim()) {
        return res.status(400).json({ error: 'File name is required' });
      }
      
      // SECURITY: Sanitize filename to prevent path traversal attacks
      const path = await import('path');
      
      // First, reject filenames with percent-encoding to prevent encoded traversal attacks
      if (unsafeFileName.includes('%')) {
        return res.status(400).json({ error: 'File name cannot contain percent characters' });
      }
      
      let fileName = path.basename(unsafeFileName); // Remove any path components
      fileName = fileName.replace(/\.\./g, ''); // Remove any remaining '..' sequences
      fileName = fileName.replace(/[\/\\]/g, ''); // Remove path separators
      fileName = fileName.trim();
      
      // Validate sanitized filename
      if (!fileName || fileName.length === 0) {
        return res.status(400).json({ error: 'Invalid file name after sanitization' });
      }
      
      // Validate filename length (max 255 characters to be safe)
      if (fileName.length > 255) {
        return res.status(400).json({ error: 'File name too long (max 255 characters)' });
      }
      
      // Enforce PDF extension
      if (!fileName.toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({ error: 'File name must end with .pdf extension' });
      }

      // Track embedding tokens outside transaction for logging
      let embeddingTokens = 0;

      // Use transaction to safely get next letter number, upload, and insert
      // This prevents race conditions when multiple letters are uploaded simultaneously
      const [letter] = await db.transaction(async (tx) => {
        // Lock the project row to serialize letter number assignment
        // This ensures proper sequencing even when the project has no letters yet
        await tx
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .for('update');
        
        // Get the next sequential letter number for this project
        const maxLetterResult = await tx
          .select({ maxNumber: sql<number>`COALESCE(MAX(${correspondenceLetters.letterNumber}), 0)` })
          .from(correspondenceLetters)
          .where(eq(correspondenceLetters.projectId, projectId));
        
        const nextLetterNumber = (maxLetterResult[0]?.maxNumber || 0) + 1;

        // Upload to object storage (inside transaction so we can clean up on failure)
        const objectStorageService = new ObjectStorageService();
        const objectStorageFileName = `correspondence_${Date.now()}_${fileName}`;
        const objectPath = await objectStorageService.uploadFile(file.buffer, objectStorageFileName);

        // Extract text from PDF for embedding generation
        let extractedText = '';
        let embeddingVector: string | null = null;
        
        try {
          extractedText = await extractTextFromPDF(file.buffer);
          
          // Prepare text with metadata for better semantic search
          const textForEmbedding = prepareTextForEmbedding(
            extractedText,
            sender,
            recipient,
            subject
          );
          
          // Generate embedding using Voyage AI (voyage-law-2 for legal documents)
          const { embedding, usage } = await generateEmbedding(textForEmbedding, true);
          embeddingVector = JSON.stringify(embedding);
          embeddingTokens = usage?.total_tokens || 0;
        } catch (embeddingError) {
          console.error('Error generating embedding:', embeddingError);
          // Continue without embedding - letter will still be uploaded
        }

        // Insert letter with the sequential number
        return await tx
          .insert(correspondenceLetters)
          .values({
            projectId,
            letterNumber: nextLetterNumber,
            fileName: fileName, // Use sanitized custom filename
            fileUrl: objectPath,
            fileKey: objectPath,
            extractedText,
            embeddingVector,
            sender,
            recipient,
            subject,
            letterDate,
            category: category || 'general',
            source: 'upload',
            uploadedBy: null, // TODO: Implement proper user account lookup
          })
          .returning();
      });

      // Log AI usage for embedding generation
      if (embeddingTokens > 0) {
        const person = (req as any).person;
        if (person) {
          try {
            // voyage-law-2 pricing: $0.12 per 1M tokens
            const estimatedCost = (embeddingTokens / 1_000_000) * 0.12;
            
            await db.insert(aiUsageLogs).values({
              projectId,
              personId: person.id,
              formName: 'AI Letter',
              eventType: 'AI Indexing',
              modelUsed: 'voyage-law-2',
              revisionId: null,
              rowId: null,
              letterId: letter.id,
              inputTokens: embeddingTokens,
              outputTokens: 0, // Embeddings don't have output tokens
              totalTokens: embeddingTokens,
              estimatedCost: estimatedCost.toFixed(4),
              clientInvoiceNumber: null,
              notes: `Letter upload: ${file.originalname}`,
            });
            console.log(`[AI Letter] Embedding usage logged for letter ${letter.id}`);
          } catch (error) {
            console.error('[AI Letter] Failed to log embedding usage:', error);
          }
        }
      }
      
      // Upload to SharePoint (if configured)
      try {
        const spSettings = await db
          .select()
          .from(projectSharePointSettings)
          .where(eq(projectSharePointSettings.projectId, projectId))
          .limit(1);
        
        if (spSettings.length > 0 && spSettings[0].correspondenceFolderPath) {
          const { SharePointService } = await import('./sharepoint');
          const spService = new SharePointService();
          
          console.log(`[SharePoint Upload] Uploading ${fileName} to SharePoint folder: ${spSettings[0].correspondenceFolderPath}`);
          
          const uploadResult = await spService.uploadFile(
            spSettings[0].sharePointSiteUrl,
            spSettings[0].correspondenceFolderPath,
            fileName,
            file.buffer
          );
          
          if (uploadResult.success) {
            console.log(`[SharePoint Upload] Successfully uploaded ${fileName} to SharePoint: ${uploadResult.filePath}`);
          } else {
            console.error(`[SharePoint Upload] Failed to upload ${fileName}:`, uploadResult.error);
          }
        } else {
          console.log('[SharePoint Upload] SharePoint not configured for this project - skipping upload');
        }
      } catch (spError) {
        // Log error but don't fail the request - SharePoint upload is optional
        console.error('[SharePoint Upload] Error uploading to SharePoint:', spError);
      }
      
      res.json(letter);
    } catch (error) {
      console.error('Error uploading letter:', error);
      res.status(500).json({ error: 'Failed to upload letter' });
    }
  });

  // Search similar letters using AI semantic search
  app.post('/api/projects/:projectId/correspondence/search', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { letterId } = req.body;
      
      if (!letterId) {
        return res.status(400).json({ error: 'Letter ID is required' });
      }

      // Get the query letter with its embedding
      const [queryLetter] = await db
        .select()
        .from(correspondenceLetters)
        .where(eq(correspondenceLetters.id, letterId))
        .limit(1);

      if (!queryLetter) {
        return res.status(404).json({ error: 'Letter not found' });
      }

      // Get all other letters in the project with embeddings
      const projectLetters = await db
        .select()
        .from(correspondenceLetters)
        .where(eq(correspondenceLetters.projectId, projectId));

      // Filter letters - exclude the query letter itself and letters dated after the selected letter
      // This prevents suggesting "future" letters that didn't exist when the selected letter was written
      const eligibleLetters = projectLetters.filter(letter => {
        // Exclude the query letter itself
        if (letter.id === letterId) return false;
        
        // If the query letter has a date, exclude letters dated after it
        if (queryLetter.letterDate) {
          // If the candidate letter has no date, exclude it (we can't determine chronology)
          if (!letter.letterDate) return false;
          
          // Exclude letters dated after the query letter
          const queryDate = new Date(queryLetter.letterDate);
          const letterDate = new Date(letter.letterDate);
          if (letterDate > queryDate) return false;
        }
        // If query letter has no date, include all letters (can't apply date filter)
        
        return true; // Include letters on or before the query letter's date
      });

      let similarLetters: any[] = [];

      // Perform semantic search using embeddings if query letter has an embedding
      if (queryLetter.embeddingVector) {
        try {
          const queryEmbedding = JSON.parse(queryLetter.embeddingVector) as number[];
          
          // Find similar letters from eligible letters (filtered by date)
          similarLetters = findSimilarLetters(
            queryEmbedding,
            eligibleLetters,
            10 // Top 10 most similar
          );
        } catch (error) {
          console.error('Error in semantic similarity search:', error);
        }
      }

      // Note: SharePoint documents are now indexed in the database
      // The search above already includes both uploaded letters and indexed SharePoint documents

      // If still no results, return other eligible letters (respecting date filter)
      if (similarLetters.length === 0) {
        similarLetters = eligibleLetters.slice(0, 10);
      }
      
      res.json(similarLetters);
    } catch (error) {
      console.error('Error searching letters:', error);
      res.status(500).json({ error: 'Failed to search letters' });
    }
  });

  // Get a single letter
  app.get('/api/correspondence/letters/:letterId', isAuthenticated, async (req, res) => {
    try {
      const { letterId } = req.params;
      
      const [letter] = await db
        .select()
        .from(correspondenceLetters)
        .where(eq(correspondenceLetters.id, letterId));
      
      if (!letter) {
        return res.status(404).json({ error: 'Letter not found' });
      }
      
      res.json(letter);
    } catch (error) {
      console.error('Error fetching letter:', error);
      res.status(500).json({ error: 'Failed to fetch letter' });
    }
  });

  // Delete a letter
  app.delete('/api/correspondence/letters/:letterId', isAuthenticated, async (req, res) => {
    try {
      const { letterId } = req.params;
      console.log('[DELETE] Attempting to delete letter:', letterId);
      
      // Get the letter to check if it exists and get file key
      const [letter] = await db
        .select()
        .from(correspondenceLetters)
        .where(eq(correspondenceLetters.id, letterId));
      
      console.log('[DELETE] Letter found:', letter ? 'yes' : 'no');
      
      if (!letter) {
        return res.status(404).json({ error: 'Letter not found' });
      }
      
      // Delete file from object storage if it exists
      if (letter.fileKey) {
        try {
          console.log('[DELETE] Deleting file from storage:', letter.fileKey);
          const objectStorageService = new ObjectStorageService();
          await objectStorageService.deleteFile(letter.fileKey);
          console.log('[DELETE] File deleted from storage');
        } catch (error) {
          console.error('Error deleting file from storage:', error);
          // Continue with DB deletion even if file deletion fails
        }
      }
      
      // Delete the letter from database
      console.log('[DELETE] Deleting letter from database:', letterId);
      const result = await db
        .delete(correspondenceLetters)
        .where(eq(correspondenceLetters.id, letterId))
        .returning();
      
      console.log('[DELETE] Database delete result:', result);
      
      res.json({ success: true, message: 'Letter deleted successfully' });
    } catch (error) {
      console.error('Error deleting letter:', error);
      res.status(500).json({ error: 'Failed to delete letter' });
    }
  });

  // Proxy endpoint to stream PDF files (handles both uploaded and SharePoint letters)
  app.get('/api/correspondence/letters/:letterId/pdf', isAuthenticated, async (req, res) => {
    try {
      const { letterId } = req.params;
      
      // Get the letter from database
      const [letter] = await db
        .select()
        .from(correspondenceLetters)
        .where(eq(correspondenceLetters.id, letterId));
      
      if (!letter) {
        return res.status(404).json({ error: 'Letter not found' });
      }

      // Handle SharePoint letters
      if (letter.source === 'sharepoint' && letter.sharePointFileId) {
        try {
          // Get SharePoint settings
          const [settings] = await db
            .select()
            .from(projectSharePointSettings)
            .where(eq(projectSharePointSettings.projectId, letter.projectId));

          if (!settings?.sharePointSiteUrl || !settings?.correspondenceFolderPath) {
            return res.status(404).json({ error: 'SharePoint not configured' });
          }

          // Download PDF from SharePoint
          const sharepointService = new SharePointService();
          const pdfBuffer = await sharepointService.downloadFile(
            settings.sharePointSiteUrl,
            settings.correspondenceFolderPath,
            letter.sharePointFileId
          );

          // Stream the PDF
          res.setHeader('Content-Type', 'application/pdf');
          // Encode filename to handle special characters in HTTP headers
          const safeFileName = encodeURIComponent(letter.fileName);
          res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeFileName}`);
          res.send(pdfBuffer);
        } catch (error) {
          console.error('Error downloading SharePoint PDF:', error);
          return res.status(500).json({ error: 'Failed to download SharePoint PDF' });
        }
      } 
      // Handle uploaded letters (redirect to file URL)
      else if (letter.fileUrl) {
        return res.redirect(letter.fileUrl);
      } else {
        return res.status(404).json({ error: 'PDF file not available' });
      }
    } catch (error) {
      console.error('Error streaming PDF:', error);
      res.status(500).json({ error: 'Failed to stream PDF' });
    }
  });

  // Get letter generation progress
  app.get('/api/correspondence/generation-progress/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const { getProgress } = await import('./letterGenerationProgress');
      const progress = getProgress(sessionId);
      
      if (progress) {
        res.json(progress);
      } else {
        res.json({ stage: 'Initializing...', progress: 0, completed: false, timestamp: new Date() });
      }
    } catch (error: any) {
      console.error('Error getting progress:', error);
      res.status(500).json({ error: error.message || 'Failed to get progress' });
    }
  });

  // Generate AI response
  app.post('/api/projects/:projectId/correspondence/generate-response', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { originalLetterId, referenceLetterIds, customInstructions, sessionId } = req.body;
      
      // Get user's person ID from session
      const currentUserId = (req as any).user?.claims?.sub;
      if (!currentUserId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      // Look up person by replitAuthId
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(eq(people.replitAuthId, currentUserId))
        .limit(1);
      
      if (!person) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Generate AI draft letter with logging
      const { generateAIDraftLetter } = await import('./aiLetterGeneration');
      const result = await generateAIDraftLetter(
        projectId,
        originalLetterId,
        referenceLetterIds || [],
        customInstructions || '',
        person.id,
        sessionId // Pass sessionId for progress tracking
      );
      
      res.json({
        generatedResponse: result.generatedLetter,
        usage: result.usage,
      });
    } catch (error: any) {
      console.error('Error generating AI response:', error);
      res.status(500).json({ error: error.message || 'Failed to generate AI response' });
    }
  });

  // Save draft letter
  app.post('/api/projects/:projectId/correspondence/save-draft', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { 
        originalLetterId, 
        draftContent, 
        subject,
        referenceLetterIds,
        customInstructions,
        aiModel,
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCost
      } = req.body;
      
      if (!draftContent) {
        return res.status(400).json({ error: 'Draft content is required' });
      }
      
      // Get user's person ID from session
      const currentUserId = (req as any).user?.claims?.sub;
      if (!currentUserId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      // Look up person and their userAccount
      const [person] = await db
        .select({ 
          id: people.id,
          userAccountId: userAccounts.id 
        })
        .from(people)
        .leftJoin(userAccounts, eq(userAccounts.personId, people.id))
        .where(eq(people.replitAuthId, currentUserId))
        .limit(1);
      
      if (!person) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Save to correspondenceResponses table
      const [savedDraft] = await db.insert(correspondenceResponses).values({
        projectId,
        originalLetterId: originalLetterId || null,
        referenceLetterIds: referenceLetterIds ? JSON.stringify(referenceLetterIds) : null,
        customInstructions: customInstructions || null,
        generatedResponse: draftContent,
        aiModel: aiModel || 'claude-sonnet-4-20250514',
        inputTokens: inputTokens || null,
        outputTokens: outputTokens || null,
        totalCost: estimatedCost ? String(estimatedCost) : null,
        status: 'draft',
        createdBy: person.userAccountId || person.id, // Use userAccountId if available, fallback to personId
      }).returning();
      
      res.json({
        id: savedDraft.id,
        message: 'Draft saved successfully',
      });
    } catch (error: any) {
      console.error('Error saving draft:', error);
      res.status(500).json({ error: error.message || 'Failed to save draft' });
    }
  });

  // Export draft letter to Word
  app.post('/api/projects/:projectId/correspondence/export-word', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { draftContent } = req.body;
      
      if (!draftContent) {
        return res.status(400).json({ error: 'Draft content is required' });
      }
      
      // Get project name for the document title
      const [project] = await db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      
      const projectName = project?.name || 'Draft Letter';
      
      // Generate Word document
      const { generateLetterWordDocument } = await import('./wordExport');
      const buffer = await generateLetterWordDocument(draftContent, projectName);
      
      // Send the file
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${projectName.replace(/[^a-z0-9]/gi, '_')}_Draft_${timestamp}.docx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error('Error exporting to Word:', error);
      res.status(500).json({ error: error.message || 'Failed to export to Word' });
    }
  });

  // Check SharePoint connection status
  app.get('/api/sharepoint/connection-status', isAuthenticated, async (req, res) => {
    try {
      const { checkSharePointConnection } = await import('./sharepoint');
      const status = await checkSharePointConnection();
      res.json(status);
    } catch (error) {
      console.error('Error checking SharePoint connection:', error);
      res.status(500).json({ error: 'Failed to check connection status' });
    }
  });

  // Test SharePoint folder access
  app.post('/api/sharepoint/test-connection', isAuthenticated, async (req, res) => {
    try {
      const { siteUrl, folderPath } = req.body;
      
      if (!siteUrl || !folderPath) {
        return res.status(400).json({ error: 'Site URL and folder path are required' });
      }
      
      // Detect if path is a file or folder by checking for file extension
      const hasExtension = /\.(pdf|docx?|xlsx?|txt|pptx?)$/i.test(folderPath);
      
      if (hasExtension) {
        // Test file access
        const { testSharePointFileAccess } = await import('./sharepoint');
        const result = await testSharePointFileAccess(siteUrl, folderPath);
        res.json(result);
      } else {
        // Test folder access
        const { testSharePointFolderAccess } = await import('./sharepoint');
        const result = await testSharePointFolderAccess(siteUrl, folderPath);
        res.json(result);
      }
    } catch (error) {
      console.error('Error testing SharePoint connection:', error);
      res.status(500).json({ error: 'Failed to test connection' });
    }
  });

  // Get SharePoint settings for a project
  app.get('/api/projects/:projectId/sharepoint-settings', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const [settings] = await db
        .select()
        .from(projectSharePointSettings)
        .where(eq(projectSharePointSettings.projectId, projectId));
      
      res.json(settings || null);
    } catch (error) {
      console.error('Error fetching SharePoint settings:', error);
      res.status(500).json({ error: 'Failed to fetch SharePoint settings' });
    }
  });

  // Update/Create SharePoint settings for a project
  app.post('/api/projects/:projectId/sharepoint-settings', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { sharePointSiteUrl, correspondenceFolderPath, siteId, driveId } = req.body;
      
      const [existing] = await db
        .select()
        .from(projectSharePointSettings)
        .where(eq(projectSharePointSettings.projectId, projectId));
      
      if (existing) {
        // Update
        const [updated] = await db
          .update(projectSharePointSettings)
          .set({
            sharePointSiteUrl,
            correspondenceFolderPath,
            siteId,
            driveId,
            updatedAt: new Date(),
          })
          .where(eq(projectSharePointSettings.id, existing.id))
          .returning();
        
        res.json(updated);
      } else {
        // Create
        const [created] = await db
          .insert(projectSharePointSettings)
          .values({
            projectId,
            sharePointSiteUrl,
            correspondenceFolderPath,
            siteId,
            driveId,
          })
          .returning();
        
        res.json(created);
      }
    } catch (error) {
      console.error('Error saving SharePoint settings:', error);
      res.status(500).json({ error: 'Failed to save SharePoint settings' });
    }
  });

  // Check embedding status for all letters in a project
  app.get('/api/projects/:projectId/correspondence/embedding-status', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const allLetters = await db
        .select({
          id: correspondenceLetters.id,
          letterNumber: correspondenceLetters.letterNumber,
          fileName: correspondenceLetters.fileName,
          source: correspondenceLetters.source,
          hasEmbedding: sql<boolean>`embedding_vector IS NOT NULL`,
          hasExtractedText: sql<boolean>`extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 50`,
        })
        .from(correspondenceLetters)
        .where(eq(correspondenceLetters.projectId, projectId))
        .orderBy(correspondenceLetters.letterNumber);
      
      const stats = {
        total: allLetters.length,
        withEmbedding: allLetters.filter(l => l.hasEmbedding).length,
        withoutEmbedding: allLetters.filter(l => !l.hasEmbedding).length,
        withText: allLetters.filter(l => l.hasExtractedText).length,
        withoutText: allLetters.filter(l => !l.hasExtractedText).length,
      };
      
      res.json({
        stats,
        letters: allLetters,
      });
    } catch (error) {
      console.error('Error checking embedding status:', error);
      res.status(500).json({ error: 'Failed to check embedding status' });
    }
  });

  // Regenerate embeddings for all letters in a project (for letters uploaded before embedding feature)
  app.post('/api/projects/:projectId/correspondence/regenerate-embeddings', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      console.log(`[Regenerate Embeddings] Starting for project ${projectId}`);
      
      // Get all letters without embeddings OR without extracted text
      const lettersToProcess = await db
        .select()
        .from(correspondenceLetters)
        .where(
          and(
            eq(correspondenceLetters.projectId, projectId),
            eq(correspondenceLetters.source, 'upload'), // Only process uploaded letters
            sql`(embedding_vector IS NULL OR extracted_text IS NULL OR LENGTH(extracted_text) < 50)` // Missing embedding or text
          )
        );
      
      console.log(`[Regenerate Embeddings] Found ${lettersToProcess.length} letters needing processing`);
      
      let processed = 0;
      let errors = 0;
      
      // Process each letter
      for (const letter of lettersToProcess) {
        try {
          let extractedText = letter.extractedText;
          
          // If no text, extract from PDF
          if (!extractedText || extractedText.length < 50) {
            console.log(`[Regenerate Embeddings] Extracting text from: ${letter.fileName}`);
            
            // Check if fileUrl exists
            if (!letter.fileUrl) {
              console.log(`[Regenerate Embeddings] No file URL for ${letter.fileName}`);
              errors++;
              continue;
            }
            
            try {
              // Download PDF from object storage
              const objectStorageService = new ObjectStorageService();
              const file = await objectStorageService.getObjectEntityFile(letter.fileUrl);
              const [pdfBuffer] = await file.download();
              
              // Extract text from PDF using pdf-parse v2.x API
              const { PDFParse } = await import('pdf-parse');
              const parser = new PDFParse({ data: pdfBuffer });
              const result = await parser.getText();
              await parser.destroy();
              extractedText = result.text.trim();
              
              if (!extractedText || extractedText.length < 50) {
                console.log(`[Regenerate Embeddings] Insufficient text in ${letter.fileName}`);
                errors++;
                continue;
              }
              
              console.log(`[Regenerate Embeddings] Extracted ${extractedText.length} chars from ${letter.fileName}`);
            } catch (downloadError) {
              console.error(`[Regenerate Embeddings] Failed to download/parse ${letter.fileName}:`, downloadError);
              errors++;
              continue;
            }
          }
          
          // Prepare text for embedding
          const embeddingText = prepareTextForEmbedding(
            extractedText,
            letter.sender || undefined,
            letter.recipient || undefined,
            letter.subject || undefined
          );
          
          // Generate embedding using Voyage AI (voyage-law-2 for legal documents)
          const { embedding } = await generateEmbedding(embeddingText, true);
          const embeddingVector = JSON.stringify(embedding);
          
          // Update letter with both text and embedding
          await db
            .update(correspondenceLetters)
            .set({ 
              extractedText,
              embeddingVector 
            })
            .where(eq(correspondenceLetters.id, letter.id));
          
          console.log(`[Regenerate Embeddings] ✅ Processed: ${letter.fileName}`);
          processed++;
          
        } catch (error) {
          console.error(`[Regenerate Embeddings] ❌ Error processing ${letter.fileName}:`, error);
          errors++;
        }
      }
      
      console.log(`[Regenerate Embeddings] Complete: ${processed} processed, ${errors} errors`);
      
      res.json({
        success: true,
        processed,
        errors,
        message: `Generated embeddings for ${processed} letters${errors > 0 ? ` (${errors} errors)` : ''}`
      });
    } catch (error) {
      console.error('Error regenerating embeddings:', error);
      res.status(500).json({ error: 'Failed to regenerate embeddings' });
    }
  });

  // Sync SharePoint documents to database (index for AI search)
  app.post('/api/projects/:projectId/sharepoint-sync', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      // Get SharePoint settings
      const [spSettings] = await db
        .select()
        .from(projectSharePointSettings)
        .where(
          and(
            eq(projectSharePointSettings.projectId, projectId),
            eq(projectSharePointSettings.isActive, true)
          )
        )
        .limit(1);
      
      if (!spSettings) {
        return res.status(404).json({ error: 'SharePoint not configured for this project' });
      }
      
      console.log(`[SharePoint Sync] Starting sync for project ${projectId}`);
      
      // Run sync
      const result = await syncSharePointDocuments(
        projectId,
        spSettings.sharePointSiteUrl,
        spSettings.correspondenceFolderPath,
        db
      );
      
      // Update last synced timestamp
      await db
        .update(projectSharePointSettings)
        .set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projectSharePointSettings.id, spSettings.id));
      
      console.log(`[SharePoint Sync] Complete:`, result);
      
      // Log AI usage for SharePoint indexing
      if (result.totalTokens > 0) {
        const person = (req as any).person;
        if (person) {
          try {
            // text-embedding-3-small pricing: $0.02 per 1M tokens
            const estimatedCost = (result.totalTokens / 1_000_000) * 0.02;
            
            await db.insert(aiUsageLogs).values({
              projectId,
              personId: person.id,
              formName: 'AI Letter',
              eventType: 'AI Indexing',
              modelUsed: 'text-embedding-3-small',
              revisionId: null,
              rowId: null,
              letterId: null,
              inputTokens: result.totalTokens,
              outputTokens: 0, // Embeddings don't have output tokens
              totalTokens: result.totalTokens,
              estimatedCost: estimatedCost.toFixed(4),
              clientInvoiceNumber: null,
              notes: `SharePoint sync: indexed ${result.indexed} documents`,
            });
            console.log(`[SharePoint Sync] AI usage logged: ${result.totalTokens} tokens`);
          } catch (error) {
            console.error('[SharePoint Sync] Failed to log AI usage:', error);
          }
        }
      }
      
      res.json({
        success: true,
        ...result,
        message: `Indexed ${result.indexed} documents, skipped ${result.skipped}, deleted ${result.deleted || 0}, ${result.errors} errors`
      });
    } catch (error) {
      console.error('Error syncing SharePoint:', error);
      res.status(500).json({ error: 'Failed to sync SharePoint documents' });
    }
  });

  // Programs Routes (XER Files - Gantt Chart)
  
  // Upload XER file and create program
  app.post('/api/projects/:projectId/programs/upload', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { name, isContractBaseline, isBaselineApproved, comments } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const file = req.file;
      const person = req.person;

      // Get or create user account
      let userAccount = await db
        .select()
        .from(userAccounts)
        .where(eq(userAccounts.personId, person.id))
        .limit(1)
        .then(rows => rows[0]);

      if (!userAccount) {
        // Auto-create user account for Replit Auth user (no password needed for OAuth users)
        const [newUserAccount] = await db
          .insert(userAccounts)
          .values({
            personId: person.id,
            username: person.email || `user_${person.id.slice(0, 8)}`,
            passwordHash: '', // OAuth users don't have password
            mfaEnabled: false,
          })
          .returning();
        userAccount = newUserAccount;
      }

      // Parse XER file to extract data date and schedule data
      const xerData = await parseXERBuffer(file.buffer);
      const dataDate = xerData.project?.dataDate || null;

      // Compute AI schedule insights
      const { computeScheduleInsights } = await import('./scheduleInsights');
      const insights = computeScheduleInsights(xerData);

      // If setting as contract baseline, clear existing contract baseline
      if (isContractBaseline === 'true' || isContractBaseline === true) {
        await db
          .update(programs)
          .set({ isContractBaseline: false })
          .where(eq(programs.projectId, projectId));
      }

      // Upload file to object storage
      const objectStorage = new ObjectStorageService();
      const fileKey = await objectStorage.uploadFile(file.buffer, file.originalname);

      // Create program record with insights
      const [program] = await db.insert(programs).values({
        projectId,
        name: name || file.originalname,
        fileKey,
        fileSize: file.size,
        dataDate,
        isContractBaseline: isContractBaseline === 'true' || isContractBaseline === true,
        isBaselineApproved: isBaselineApproved === 'true' || isBaselineApproved === true,
        comments: comments || null,
        xerData,
        insights: insights as any,
        uploadedByUserId: userAccount.id
      }).returning();

      res.json(program);
    } catch (error) {
      console.error('Error uploading program:', error);
      res.status(500).json({ error: 'Failed to upload program' });
    }
  });

  // Get all programs for a project
  app.get('/api/projects/:projectId/programs', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const projectPrograms = await db
        .select()
        .from(programs)
        .where(eq(programs.projectId, projectId))
        .orderBy(desc(programs.dataDate));

      // Recalculate critical path for cached XER data
      const programsWithRecalculatedFloat = projectPrograms.map(program => {
        if (!program.xerData) return program;
        
        try {
          const xerData = program.xerData as any;
          if (xerData.tasks && xerData.relationships) {
            // Re-calculate critical path on the cached data
            const tasksWithFloat = calculateCriticalPath(xerData.tasks, xerData.relationships);
            
            console.log(`[CPM] Recalculated float for program ${program.id}: ${tasksWithFloat.filter((t: any) => t.totalFloat !== null && t.totalFloat <= 0).length} critical out of ${tasksWithFloat.length} tasks`);
            
            return {
              ...program,
              xerData: {
                ...xerData,
                tasks: tasksWithFloat
              }
            };
          }
        } catch (error) {
          console.error('Error recalculating critical path for program:', program.id, error);
        }
        
        return program;
      });

      res.json(programsWithRecalculatedFloat);
    } catch (error) {
      console.error('Error fetching programs:', error);
      res.status(500).json({ error: 'Failed to fetch programs' });
    }
  });

  // Update program (baseline status, comments)
  app.patch('/api/programs/:programId', isAuthenticated, async (req, res) => {
    try {
      const { programId } = req.params;
      const { isContractBaseline, isBaselineApproved, comments } = req.body;

      // Get current program to check project
      const [currentProgram] = await db
        .select()
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);

      if (!currentProgram) {
        return res.status(404).json({ error: 'Program not found' });
      }

      // If setting as contract baseline, clear existing contract baseline
      if (isContractBaseline === true) {
        await db
          .update(programs)
          .set({ isContractBaseline: false })
          .where(eq(programs.projectId, currentProgram.projectId));
      }

      // Update program
      const [updatedProgram] = await db
        .update(programs)
        .set({
          isContractBaseline: isContractBaseline !== undefined ? isContractBaseline : currentProgram.isContractBaseline,
          isBaselineApproved: isBaselineApproved !== undefined ? isBaselineApproved : currentProgram.isBaselineApproved,
          comments: comments !== undefined ? comments : currentProgram.comments
        })
        .where(eq(programs.id, programId))
        .returning();

      res.json(updatedProgram);
    } catch (error) {
      console.error('Error updating program:', error);
      res.status(500).json({ error: 'Failed to update program' });
    }
  });

  // Delete program
  app.delete('/api/programs/:programId', isAuthenticated, async (req, res) => {
    try {
      const { programId } = req.params;

      // Get program to delete file from object storage
      const [program] = await db
        .select()
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);

      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      // Delete file from object storage
      const objectStorage = new ObjectStorageService();
      try {
        await objectStorage.deleteFile(program.fileKey);
      } catch (error) {
        console.error('Error deleting file from object storage:', error);
      }

      // Delete program from database
      await db.delete(programs).where(eq(programs.id, programId));

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting program:', error);
      res.status(500).json({ error: 'Failed to delete program' });
    }
  });

  // Download program XER file
  app.get('/api/programs/:programId/download', isAuthenticated, async (req, res) => {
    try {
      const { programId } = req.params;

      const [program] = await db
        .select()
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);

      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      const objectStorage = new ObjectStorageService();
      const file = await objectStorage.getObjectEntityFile(program.fileKey);
      const [buffer] = await file.download();

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${program.name}"`);
      res.send(buffer);
    } catch (error) {
      console.error('Error downloading program:', error);
      res.status(500).json({ error: 'Failed to download program' });
    }
  });

  // === RISK REGISTER ENDPOINTS ===

  // Get all risk register revisions for a project
  app.get('/api/projects/:projectId/risk-revisions', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      // Housekeeping: Ensure default consequence types exist when accessing risk register
      await db.transaction(async (tx) => {
        await ensureDefaultConsequenceTypes(projectId, tx);
      });
      
      const revisions = await db
        .select()
        .from(riskRegisterRevisions)
        .where(eq(riskRegisterRevisions.projectId, projectId))
        .orderBy(desc(riskRegisterRevisions.revisionNumber));
      
      res.json(revisions);
    } catch (error) {
      console.error('Error fetching risk revisions:', error);
      res.status(500).json({ error: 'Failed to fetch risk revisions' });
    }
  });

  // Get active risk register revision for a project
  app.get('/api/projects/:projectId/risk-revisions/active', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const [activeRevision] = await db
        .select()
        .from(riskRegisterRevisions)
        .where(
          and(
            eq(riskRegisterRevisions.projectId, projectId),
            eq(riskRegisterRevisions.status, 'active')
          )
        )
        .limit(1);
      
      if (!activeRevision) {
        // Create initial revision if none exists
        const personId = (req as any).person.id;
        console.log(`Creating initial risk register revision for project ${projectId} by user ${personId}`);
        const [newRevision] = await db
          .insert(riskRegisterRevisions)
          .values({
            projectId,
            revisionNumber: 1,
            revisionName: 'Initial Risk Register',
            status: 'active',
            createdById: personId,
          })
          .returning();
        
        // Housekeeping: Ensure default consequence types (Financial, Time) exist
        await ensureDefaultConsequenceTypes(projectId);
        
        return res.json(newRevision);
      }
      
      // Housekeeping: Always ensure default consequence types exist when accessing risk register
      await ensureDefaultConsequenceTypes(projectId);
      
      res.json(activeRevision);
    } catch (error) {
      console.error('Error fetching active risk revision:', error);
      res.status(500).json({ error: 'Failed to fetch active risk revision' });
    }
  });

  // Create new risk register revision (copies from previous active revision)
  app.post('/api/projects/:projectId/risk-revisions', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const personId = (req as any).person.id;
      const { revisionName, notes } = req.body;

      await db.transaction(async (tx) => {
        // Get current active revision
        const [currentActive] = await tx
          .select()
          .from(riskRegisterRevisions)
          .where(
            and(
              eq(riskRegisterRevisions.projectId, projectId),
              eq(riskRegisterRevisions.status, 'active')
            )
          )
          .limit(1);

        if (!currentActive) {
          throw new Error('No active revision found');
        }

        // Mark current active as superseded
        await tx
          .update(riskRegisterRevisions)
          .set({ status: 'superseded' })
          .where(eq(riskRegisterRevisions.id, currentActive.id));

        // Create new revision
        const [newRevision] = await tx
          .insert(riskRegisterRevisions)
          .values({
            projectId,
            revisionNumber: currentActive.revisionNumber + 1,
            revisionName: revisionName || `Revision ${currentActive.revisionNumber + 1}`,
            notes,
            status: 'active',
            createdById: personId,
          })
          .returning();
        
        // Housekeeping: Ensure default consequence types (Financial, Time) exist
        await ensureDefaultConsequenceTypes(projectId, tx);

        // Copy all risks from previous revision
        const previousRisks = await tx
          .select()
          .from(risks)
          .where(eq(risks.revisionId, currentActive.id));

        for (const oldRisk of previousRisks) {
          const { id, createdAt, updatedAt, ...riskData } = oldRisk;
          const [newRisk] = await tx
            .insert(risks)
            .values({
              ...riskData,
              revisionId: newRevision.id,
            })
            .returning();

          // Copy associated actions
          const oldActions = await tx
            .select()
            .from(riskActions)
            .where(eq(riskActions.riskId, oldRisk.id));

          for (const oldAction of oldActions) {
            const { id: actionId, createdAt: actCreatedAt, updatedAt: actUpdatedAt, ...actionData } = oldAction;
            await tx.insert(riskActions).values({
              ...actionData,
              riskId: newRisk.id,
            });
          }
        }

        res.status(201).json(newRevision);
      });
    } catch (error) {
      console.error('Error creating risk revision:', error);
      res.status(500).json({ error: 'Failed to create risk revision' });
    }
  });

  // Get all risks for a project's active revision
  app.get('/api/projects/:projectId/risks', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { revisionId } = req.query;

      let targetRevisionId = revisionId as string;

      // If no revisionId provided, get the active revision
      if (!targetRevisionId) {
        const [activeRevision] = await db
          .select()
          .from(riskRegisterRevisions)
          .where(
            and(
              eq(riskRegisterRevisions.projectId, projectId),
              eq(riskRegisterRevisions.status, 'active')
            )
          )
          .limit(1);

        if (!activeRevision) {
          return res.json([]);
        }

        targetRevisionId = activeRevision.id;
      }

      const projectRisks = await db
        .select()
        .from(risks)
        .where(eq(risks.revisionId, targetRevisionId))
        .orderBy(risks.riskNumber);
      
      res.json(projectRisks);
    } catch (error) {
      console.error('Error fetching risks:', error);
      res.status(500).json({ error: 'Failed to fetch risks' });
    }
  });

  // Create a new risk in the active revision
  app.post('/api/projects/:projectId/risks', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const personId = (req as any).person.id;
      
      // Get active revision (or create initial revision if none exists)
      let [activeRevision] = await db
        .select()
        .from(riskRegisterRevisions)
        .where(
          and(
            eq(riskRegisterRevisions.projectId, projectId),
            eq(riskRegisterRevisions.status, 'active')
          )
        )
        .limit(1);

      if (!activeRevision) {
        // Defensively create initial revision if none exists
        console.log(`Creating initial risk register revision for project ${projectId} during risk creation`);
        const [newRevision] = await db
          .insert(riskRegisterRevisions)
          .values({
            projectId,
            revisionNumber: 1,
            revisionName: 'Initial Risk Register',
            status: 'active',
            createdById: personId,
          })
          .returning();
        
        // Ensure default consequence types exist
        await ensureDefaultConsequenceTypes(projectId);
        
        activeRevision = newRevision;
      }
      
      // Get the next risk number for this revision based on risk type
      const riskType = req.body.riskType || 'threat'; // Default to threat
      const prefix = riskType === 'opportunity' ? 'O' : 'R';
      
      const existingRisks = await db
        .select({ riskNumber: risks.riskNumber })
        .from(risks)
        .where(eq(risks.revisionId, activeRevision.id));
      
      // Filter existing risks by prefix and get max number for that type
      const existingNumbers = existingRisks
        .filter(r => r.riskNumber.startsWith(prefix))
        .map(r => parseInt(r.riskNumber.substring(1)) || 0);
      
      const maxNumber = existingNumbers.length > 0 
        ? Math.max(...existingNumbers)
        : 0;
      const newRiskNumber = `${prefix}${String(maxNumber + 1).padStart(3, '0')}`;
      
      const [newRisk] = await db
        .insert(risks)
        .values({
          revisionId: activeRevision.id,
          riskNumber: newRiskNumber,
          createdById: personId,
          ...req.body,
        })
        .returning();
      
      // Broadcast risk creation via WebSocket
      riskRegisterWS.broadcastRiskUpdate(projectId, 'created', newRisk);
      
      res.status(201).json(newRisk);
    } catch (error) {
      console.error('Error creating risk:', error);
      res.status(500).json({ error: 'Failed to create risk' });
    }
  });

  // Get a single risk with full details
  app.get('/api/risks/:riskId', isAuthenticated, async (req, res) => {
    try {
      const { riskId } = req.params;
      const [risk] = await db
        .select()
        .from(risks)
        .where(eq(risks.id, riskId))
        .limit(1);
      
      if (!risk) {
        return res.status(404).json({ error: 'Risk not found' });
      }
      
      res.json(risk);
    } catch (error) {
      console.error('Error fetching risk:', error);
      res.status(500).json({ error: 'Failed to fetch risk' });
    }
  });

  // Update a risk
  app.patch('/api/risks/:riskId', isAuthenticated, async (req, res) => {
    try {
      const { riskId } = req.params;
      const [updatedRisk] = await db
        .update(risks)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(risks.id, riskId))
        .returning();
      
      if (!updatedRisk) {
        return res.status(404).json({ error: 'Risk not found' });
      }
      
      // Get projectId from the revision to broadcast
      const [revision] = await db
        .select({ projectId: riskRegisterRevisions.projectId })
        .from(riskRegisterRevisions)
        .where(eq(riskRegisterRevisions.id, updatedRisk.revisionId))
        .limit(1);
      
      if (revision) {
        riskRegisterWS.broadcastRiskUpdate(revision.projectId, 'updated', updatedRisk);
      }
      
      res.json(updatedRisk);
    } catch (error) {
      console.error('Error updating risk:', error);
      res.status(500).json({ error: 'Failed to update risk' });
    }
  });

  // Delete a risk
  app.delete('/api/risks/:riskId', isAuthenticated, async (req, res) => {
    try {
      const { riskId } = req.params;
      
      // Get risk and projectId before deletion
      const [riskToDelete] = await db
        .select({ risk: risks, projectId: riskRegisterRevisions.projectId })
        .from(risks)
        .innerJoin(riskRegisterRevisions, eq(risks.revisionId, riskRegisterRevisions.id))
        .where(eq(risks.id, riskId))
        .limit(1);
      
      await db.delete(risks).where(eq(risks.id, riskId));
      
      // Broadcast deletion via WebSocket
      if (riskToDelete) {
        riskRegisterWS.broadcastRiskUpdate(riskToDelete.projectId, 'deleted', riskToDelete.risk);
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting risk:', error);
      res.status(500).json({ error: 'Failed to delete risk' });
    }
  });

  // AI-powered distribution analysis for a single risk
  app.post('/api/risks/:riskId/ai-distribution', isAuthenticated, async (req, res) => {
    try {
      const { riskId } = req.params;
      const { modelName, operationId } = req.body; // Optional: specify AI model and operation ID
      
      // Fetch the risk
      const [risk] = await db
        .select()
        .from(risks)
        .where(eq(risks.id, riskId))
        .limit(1);
      
      if (!risk) {
        return res.status(404).json({ error: 'Risk not found' });
      }
      
      // Validate that risk has required quantitative values
      if (!risk.optimisticP10 || !risk.likelyP50 || !risk.pessimisticP90) {
        return res.status(400).json({ 
          error: 'Risk must have P10, P50, and P90 values for distribution analysis' 
        });
      }
      
      // Get company's preferred AI model
      let selectedModel = modelName || 'claude-sonnet-4-20250514';
      try {
        const [revision] = await db
          .select()
          .from(riskRegisterRevisions)
          .where(eq(riskRegisterRevisions.id, risk.revisionId))
          .limit(1);
        
        if (revision) {
          const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, revision.projectId))
            .limit(1);
          
          if (project) {
            const [bu] = await db
              .select()
              .from(businessUnits)
              .where(eq(businessUnits.id, project.businessUnitId!))
              .limit(1);
            
            if (bu) {
              const [company] = await db
                .select()
                .from(companies)
                .where(eq(companies.id, bu.companyId!))
                .limit(1);
              
              // Use company's letter model preference (similar models work for quantitative analysis)
              if (company?.aiLetterModel) {
                selectedModel = company.aiLetterModel;
              }
            }
          }
        }
      } catch (error) {
        console.log('Could not fetch company AI model preference:', error);
      }
      
      // Call AI service
      const { analyzeRiskDistribution } = await import('./riskDistributionAI');
      const recommendation = await analyzeRiskDistribution({
        id: risk.id,
        riskNumber: risk.riskNumber,
        title: risk.title,
        optimisticP10: risk.optimisticP10,
        likelyP50: risk.likelyP50,
        pessimisticP90: risk.pessimisticP90
      }, selectedModel, operationId);
      
      // Get projectId for logging
      const [revision] = await db
        .select({ projectId: riskRegisterRevisions.projectId })
        .from(riskRegisterRevisions)
        .where(eq(riskRegisterRevisions.id, risk.revisionId))
        .limit(1);
      
      // Log AI usage if we have usage data
      if (recommendation.usage && revision) {
        const personId = (req as any).person.id;
        
        // Calculate estimated cost
        const inputCostPer1k = selectedModel.includes('claude') ? 0.003 : 0.0025;
        const outputCostPer1k = selectedModel.includes('claude') ? 0.015 : 0.010;
        const estimatedCost = (
          (recommendation.usage.inputTokens / 1000) * inputCostPer1k +
          (recommendation.usage.outputTokens / 1000) * outputCostPer1k
        );
        
        await db.insert(aiUsageLogs).values({
          projectId: revision.projectId,
          personId: personId,
          formName: 'Risk Register',
          eventType: 'ai_distribution_analysis',
          inputTokens: recommendation.usage.inputTokens,
          outputTokens: recommendation.usage.outputTokens,
          totalTokens: recommendation.usage.totalTokens,
          estimatedCost: estimatedCost.toFixed(4),
          modelUsed: selectedModel,
        });
      }
      
      // Update the risk with AI recommendation
      const [updatedRisk] = await db
        .update(risks)
        .set({
          distributionModel: recommendation.distributionModel,
          isDistributionAiSelected: true,
          updatedAt: new Date()
        })
        .where(eq(risks.id, riskId))
        .returning();
      
      res.json({
        risk: updatedRisk,
        recommendation
      });
    } catch (error: any) {
      console.error('Error analyzing risk distribution:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to analyze distribution' 
      });
    }
  });

  // AI-powered bulk distribution analysis for multiple risks
  app.post('/api/projects/:projectId/risks/ai-distribution-bulk', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { revisionId, modelName } = req.body;
      
      // Get target revision
      let targetRevisionId = revisionId;
      if (!targetRevisionId) {
        const [activeRevision] = await db
          .select()
          .from(riskRegisterRevisions)
          .where(
            and(
              eq(riskRegisterRevisions.projectId, projectId),
              eq(riskRegisterRevisions.status, 'active')
            )
          )
          .limit(1);
        
        if (!activeRevision) {
          return res.status(400).json({ error: 'No active revision found' });
        }
        targetRevisionId = activeRevision.id;
      }
      
      // Fetch all risks in the revision
      const projectRisks = await db
        .select()
        .from(risks)
        .where(eq(risks.revisionId, targetRevisionId));
      
      // Filter risks with required quantitative values
      const validRisks = projectRisks.filter(r => 
        r.optimisticP10 && r.likelyP50 && r.pessimisticP90
      );
      
      if (validRisks.length === 0) {
        return res.status(400).json({ 
          error: 'No risks with complete quantitative values (P10/P50/P90) found' 
        });
      }
      
      // Get company's preferred AI model
      let selectedModel = modelName || 'claude-sonnet-4-20250514';
      try {
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        
        if (project) {
          const [bu] = await db
            .select()
            .from(businessUnits)
            .where(eq(businessUnits.id, project.businessUnitId!))
            .limit(1);
          
          if (bu) {
            const [company] = await db
              .select()
              .from(companies)
              .where(eq(companies.id, bu.companyId!))
              .limit(1);
            
            if (company?.aiLetterModel) {
              selectedModel = company.aiLetterModel;
            }
          }
        }
      } catch (error) {
        console.log('Could not fetch company AI model preference:', error);
      }
      
      // Call AI service for bulk analysis
      const { analyzeBulkRiskDistributions } = await import('./riskDistributionAI');
      const recommendations = await analyzeBulkRiskDistributions(
        validRisks.map(r => ({
          id: r.id,
          riskNumber: r.riskNumber,
          title: r.title,
          optimisticP10: r.optimisticP10,
          likelyP50: r.likelyP50,
          pessimisticP90: r.pessimisticP90
        })),
        selectedModel
      );
      
      // Aggregate usage data from all recommendations
      const totalUsage = recommendations.reduce(
        (acc, rec) => {
          if (rec.usage) {
            acc.inputTokens += rec.usage.inputTokens;
            acc.outputTokens += rec.usage.outputTokens;
            acc.totalTokens += rec.usage.totalTokens;
          }
          return acc;
        },
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      );
      
      // Log AI usage if we have usage data
      if (totalUsage.totalTokens > 0) {
        const personId = (req as any).person.id;
        
        // Calculate estimated cost
        const inputCostPer1k = selectedModel.includes('claude') ? 0.003 : 0.0025;
        const outputCostPer1k = selectedModel.includes('claude') ? 0.015 : 0.010;
        const estimatedCost = (
          (totalUsage.inputTokens / 1000) * inputCostPer1k +
          (totalUsage.outputTokens / 1000) * outputCostPer1k
        );
        
        await db.insert(aiUsageLogs).values({
          projectId,
          personId: personId,
          formName: 'Risk Register',
          eventType: 'ai_distribution_bulk_analysis',
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          totalTokens: totalUsage.totalTokens,
          estimatedCost: estimatedCost.toFixed(4),
          modelUsed: selectedModel,
        });
      }
      
      // Update all risks with recommendations
      const updates = await Promise.all(
        recommendations.map(rec => 
          db
            .update(risks)
            .set({
              distributionModel: rec.distributionModel,
              isDistributionAiSelected: true,
              updatedAt: new Date()
            })
            .where(eq(risks.id, rec.riskId))
            .returning()
        )
      );
      
      res.json({
        analyzed: recommendations.length,
        total: validRisks.length,
        recommendations,
        updatedRisks: updates.flat()
      });
    } catch (error: any) {
      console.error('Error analyzing bulk distributions:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to analyze distributions' 
      });
    }
  });

  // Run Monte Carlo simulation for risk quantification
  app.post('/api/projects/:projectId/monte-carlo', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { revisionId, monteCarloIterations, targetPercentile } = req.body;
      
      // Get target revision
      let targetRevisionId = revisionId;
      let monteCarloSettings = { iterations: 10000, targetPercentile: 80 };
      
      if (!targetRevisionId) {
        const [activeRevision] = await db
          .select()
          .from(riskRegisterRevisions)
          .where(
            and(
              eq(riskRegisterRevisions.projectId, projectId),
              eq(riskRegisterRevisions.status, 'active')
            )
          )
          .limit(1);
        
        if (!activeRevision) {
          return res.status(400).json({ error: 'No active revision found' });
        }
        targetRevisionId = activeRevision.id;
        monteCarloSettings = {
          iterations: activeRevision.monteCarloIterations,
          targetPercentile: activeRevision.targetPercentile,
        };
      } else {
        const [revision] = await db
          .select()
          .from(riskRegisterRevisions)
          .where(eq(riskRegisterRevisions.id, targetRevisionId))
          .limit(1);
        
        if (revision) {
          monteCarloSettings = {
            iterations: revision.monteCarloIterations,
            targetPercentile: revision.targetPercentile,
          };
        }
      }
      
      // Override with provided settings if present (allows running with current UI values)
      if (monteCarloIterations !== undefined) {
        monteCarloSettings.iterations = monteCarloIterations;
      }
      if (targetPercentile !== undefined) {
        monteCarloSettings.targetPercentile = targetPercentile;
      }
      
      // Fetch all risks in the revision
      const projectRisks = await db
        .select()
        .from(risks)
        .where(eq(risks.revisionId, targetRevisionId));
      
      // Filter risks with required quantitative values and distribution models
      const validRisks = projectRisks.filter(r => 
        r.optimisticP10 != null &&
        r.likelyP50 != null &&
        r.pessimisticP90 != null &&
        r.probability != null &&
        r.distributionModel != null
      );
      
      if (validRisks.length === 0) {
        return res.status(400).json({ 
          error: 'No risks with complete data (P10/P50/P90, probability, distribution model) found' 
        });
      }
      
      // Run Monte Carlo simulation
      const { runMonteCarloSimulation } = await import('./monteCarlo');
      const results = runMonteCarloSimulation(
        validRisks.map(r => ({
          id: r.id,
          riskNumber: r.riskNumber,
          title: r.title,
          optimisticP10: r.optimisticP10!,
          likelyP50: r.likelyP50!,
          pessimisticP90: r.pessimisticP90!,
          probability: r.probability!,
          distributionModel: r.distributionModel as any,
        })),
        monteCarloSettings.iterations,
        monteCarloSettings.targetPercentile
      );
      
      // Save simulation snapshot to database for dashboard display
      await db.insert(monteCarloSnapshots).values({
        revisionId: targetRevisionId,
        projectId,
        iterations: monteCarloSettings.iterations,
        targetPercentile: monteCarloSettings.targetPercentile,
        p10: Math.round(results.p10),
        p50: Math.round(results.p50),
        p90: Math.round(results.p90),
        mean: Math.round(results.mean),
        stdDev: Math.round(results.stdDev),
        base: Math.round(results.base),
        targetValue: Math.round(results.targetValue),
        distribution: results.distribution as any,
        percentileTable: results.percentileTable as any,
        sensitivityAnalysis: results.sensitivityAnalysis as any,
      });
      
      res.json({
        ...results,
        settings: monteCarloSettings,
        risksAnalyzed: validRisks.length,
        totalRisks: projectRisks.length,
      });
    } catch (error: any) {
      console.error('Error running Monte Carlo simulation:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to run Monte Carlo simulation' 
      });
    }
  });

  // Get latest Monte Carlo simulation snapshot for a project
  app.get('/api/projects/:projectId/monte-carlo/latest', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      // Fetch the latest snapshot for this project
      const [snapshot] = await db
        .select()
        .from(monteCarloSnapshots)
        .where(eq(monteCarloSnapshots.projectId, projectId))
        .orderBy(desc(monteCarloSnapshots.createdAt))
        .limit(1);
      
      if (!snapshot) {
        return res.status(404).json({ error: 'No Monte Carlo simulation results found for this project' });
      }
      
      res.json(snapshot);
    } catch (error: any) {
      console.error('Error fetching latest Monte Carlo snapshot:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to fetch Monte Carlo snapshot' 
      });
    }
  });

  // AI Risk Analysis - Generate risks from contract documents
  app.post('/api/projects/:projectId/ai-risk-analysis', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { aiModel, operationId } = req.body;
      
      console.log('[AI Risk Analysis] Starting analysis for project:', projectId, 'with model:', aiModel);
      
      // Get user from authenticated session
      const person = (req as any).person;
      
      const { analyzeProjectRisks } = await import('./aiRiskAnalysis');
      const result = await analyzeProjectRisks(projectId, aiModel, operationId);
      
      console.log('[AI Risk Analysis] Analysis complete, found', result.risks.length, 'risks');
      
      // Calculate estimated cost based on token usage
      // GPT-4o pricing: $2.50/1M input, $10.00/1M output
      const inputCostPer1k = 0.0025;
      const outputCostPer1k = 0.010;
      const estimatedCost = (
        (result.usage.promptTokens / 1000) * inputCostPer1k +
        (result.usage.completionTokens / 1000) * outputCostPer1k
      );
      
      // Log AI usage
      await db.insert(aiUsageLogs).values({
        projectId,
        personId: person.id,
        formName: 'Risk Register',
        eventType: 'ai_risk_analysis',
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCost: estimatedCost.toFixed(4),
        modelUsed: aiModel || 'claude-sonnet-4-20250514',
      });
      
      res.json({
        risks: result.risks,
        count: result.risks.length
      });
    } catch (error: any) {
      console.error('[AI Risk Analysis] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to analyze project risks' 
      });
    }
  });

  // AI Risk Chat - Interactive risk development
  app.post('/api/projects/:projectId/ai-risk-chat', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { messages, aiModel } = req.body;
      
      console.log('[AI Risk Chat] Starting chat for project:', projectId);
      
      // Get user from authenticated session
      const person = (req as any).person;
      
      const { chatRiskDevelopment } = await import('./aiRiskAnalysis');
      const result = await chatRiskDevelopment(projectId, messages, aiModel);
      
      console.log('[AI Risk Chat] Chat complete, generated', result.risks?.length || 0, 'risks');
      
      // Calculate estimated cost
      const inputCostPer1k = aiModel === 'claude-sonnet-4' ? 0.003 : 0.0025;
      const outputCostPer1k = aiModel === 'claude-sonnet-4' ? 0.015 : 0.010;
      const estimatedCost = (
        (result.usage.promptTokens / 1000) * inputCostPer1k +
        (result.usage.completionTokens / 1000) * outputCostPer1k
      );
      
      // Log AI usage
      await db.insert(aiUsageLogs).values({
        projectId,
        personId: person.id,
        formName: 'Risk Register',
        eventType: 'ai_risk_chat',
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCost: estimatedCost.toFixed(4),
        modelUsed: aiModel || 'claude-sonnet-4-20250514',
      });
      
      res.json({
        message: result.message,
        risks: result.risks || []
      });
    } catch (error: any) {
      console.error('[AI Risk Chat] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to process chat message' 
      });
    }
  });

  // Get AI operation progress
  app.get('/api/ai-progress/:operationId', isAuthenticated, async (req, res) => {
    try {
      const { operationId } = req.params;
      const { AIProgressTracker } = await import('./aiProgressTracker');
      const progress = AIProgressTracker.getProgress(operationId);
      
      if (!progress) {
        return res.status(404).json({ error: 'Progress not found' });
      }
      
      res.json(progress);
    } catch (error) {
      console.error('Error fetching AI progress:', error);
      res.status(500).json({ error: 'Failed to fetch progress' });
    }
  });

  // Update Monte Carlo settings for a revision
  app.patch('/api/risk-revisions/:revisionId/monte-carlo-settings', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      const { monteCarloIterations, targetPercentile } = req.body;
      
      const updates: any = {};
      if (monteCarloIterations !== undefined) updates.monteCarloIterations = monteCarloIterations;
      if (targetPercentile !== undefined) updates.targetPercentile = targetPercentile;
      
      const [updated] = await db
        .update(riskRegisterRevisions)
        .set(updates)
        .where(eq(riskRegisterRevisions.id, revisionId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating Monte Carlo settings:', error);
      res.status(500).json({ error: 'Failed to update Monte Carlo settings' });
    }
  });

  // Get actions for a risk
  app.get('/api/risks/:riskId/actions', isAuthenticated, async (req, res) => {
    try {
      const { riskId } = req.params;
      const actions = await db
        .select()
        .from(riskActions)
        .where(eq(riskActions.riskId, riskId))
        .orderBy(riskActions.createdAt);
      
      res.json(actions);
    } catch (error) {
      console.error('Error fetching risk actions:', error);
      res.status(500).json({ error: 'Failed to fetch risk actions' });
    }
  });

  // Create a risk action
  app.post('/api/risks/:riskId/actions', isAuthenticated, async (req, res) => {
    try {
      const { riskId } = req.params;
      const personId = (req as any).person.id;
      
      const [newAction] = await db
        .insert(riskActions)
        .values({
          riskId,
          createdById: personId,
          ...req.body,
        })
        .returning();
      
      res.status(201).json(newAction);
    } catch (error) {
      console.error('Error creating risk action:', error);
      res.status(500).json({ error: 'Failed to create risk action' });
    }
  });

  // Update a risk action
  app.patch('/api/actions/:actionId', isAuthenticated, async (req, res) => {
    try {
      const { actionId } = req.params;
      const [updatedAction] = await db
        .update(riskActions)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(riskActions.id, actionId))
        .returning();
      
      if (!updatedAction) {
        return res.status(404).json({ error: 'Action not found' });
      }
      
      res.json(updatedAction);
    } catch (error) {
      console.error('Error updating risk action:', error);
      res.status(500).json({ error: 'Failed to update risk action' });
    }
  });

  // Get user's risk column preferences
  app.get('/api/user-risk-column-preferences', isAuthenticated, async (req, res) => {
    try {
      const personId = (req as any).person.id;
      const [preferences] = await db
        .select()
        .from(userRiskColumnPreferences)
        .where(eq(userRiskColumnPreferences.personId, personId))
        .limit(1);
      
      res.json(preferences || null);
    } catch (error) {
      console.error('Error fetching user risk column preferences:', error);
      res.status(500).json({ error: 'Failed to fetch column preferences' });
    }
  });

  // Save/update user's risk column preferences
  app.put('/api/user-risk-column-preferences', isAuthenticated, async (req, res) => {
    try {
      const personId = (req as any).person.id;
      const { visibleColumns, columnOrder, columnWidths } = req.body;
      
      const [preferences] = await db
        .insert(userRiskColumnPreferences)
        .values({
          personId: personId,
          visibleColumns,
          columnOrder,
          columnWidths,
        })
        .onConflictDoUpdate({
          target: userRiskColumnPreferences.personId,
          set: {
            visibleColumns,
            columnOrder,
            columnWidths,
            updatedAt: new Date(),
          },
        })
        .returning();
      
      res.json(preferences);
    } catch (error) {
      console.error('Error saving user risk column preferences:', error);
      res.status(500).json({ error: 'Failed to save column preferences' });
    }
  });

  // Get user's worksheet column preferences
  app.get('/api/user-worksheet-column-preferences', isAuthenticated, async (req, res) => {
    try {
      const personId = (req as any).person.id;
      const [preferences] = await db
        .select()
        .from(userWorksheetColumnPreferences)
        .where(eq(userWorksheetColumnPreferences.personId, personId))
        .limit(1);
      
      res.json(preferences || null);
    } catch (error) {
      console.error('Error fetching user worksheet column preferences:', error);
      res.status(500).json({ error: 'Failed to fetch column preferences' });
    }
  });

  // Save/update user's worksheet column preferences
  app.put('/api/user-worksheet-column-preferences', isAuthenticated, async (req, res) => {
    try {
      const personId = (req as any).person.id;
      const { columnWidths } = req.body;
      
      const [preferences] = await db
        .insert(userWorksheetColumnPreferences)
        .values({
          personId: personId,
          columnWidths,
        })
        .onConflictDoUpdate({
          target: userWorksheetColumnPreferences.personId,
          set: {
            columnWidths,
            updatedAt: new Date(),
          },
        })
        .returning();
      
      res.json(preferences);
    } catch (error) {
      console.error('Error saving user worksheet column preferences:', error);
      res.status(500).json({ error: 'Failed to save column preferences' });
    }
  });

  // Get quantitative settings for a project
  app.get('/api/projects/:projectId/quant-settings', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const [settings] = await db
        .select()
        .from(quantSettings)
        .where(eq(quantSettings.projectId, projectId))
        .limit(1);
      
      // Return default settings if none exist
      if (!settings) {
        return res.json({
          enabled: false,
          iterations: 5000,
          confidence: 90,
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error('Error fetching quant settings:', error);
      res.status(500).json({ error: 'Failed to fetch quant settings' });
    }
  });

  // Update quantitative settings
  app.put('/api/projects/:projectId/quant-settings', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      
      const [settings] = await db
        .insert(quantSettings)
        .values({
          projectId,
          ...req.body,
        })
        .onConflictDoUpdate({
          target: quantSettings.projectId,
          set: {
            ...req.body,
            updatedAt: new Date(),
          },
        })
        .returning();
      
      res.json(settings);
    } catch (error) {
      console.error('Error updating quant settings:', error);
      res.status(500).json({ error: 'Failed to update quant settings' });
    }
  });

  // === RISK RATING REFERENCE TABLES ===
  
  // Get likelihood scales for a project
  app.get('/api/projects/:projectId/likelihood-scales', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const scales = await db
        .select()
        .from(likelihoodScales)
        .where(eq(likelihoodScales.projectId, projectId))
        .orderBy(likelihoodScales.level);
      
      res.json(scales);
    } catch (error) {
      console.error('Error fetching likelihood scales:', error);
      res.status(500).json({ error: 'Failed to fetch likelihood scales' });
    }
  });

  // Update a likelihood scale
  app.patch('/api/likelihood-scales/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(likelihoodScales)
        .set(req.body)
        .where(eq(likelihoodScales.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Likelihood scale not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating likelihood scale:', error);
      res.status(500).json({ error: 'Failed to update likelihood scale' });
    }
  });

  // Get consequence scales for a project
  app.get('/api/projects/:projectId/consequence-scales', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const scales = await db
        .select()
        .from(consequenceScales)
        .where(eq(consequenceScales.projectId, projectId))
        .orderBy(consequenceScales.level, consequenceScales.dimension);
      
      res.json(scales);
    } catch (error) {
      console.error('Error fetching consequence scales:', error);
      res.status(500).json({ error: 'Failed to fetch consequence scales' });
    }
  });

  // Update a consequence scale
  app.patch('/api/consequence-scales/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(consequenceScales)
        .set(req.body)
        .where(eq(consequenceScales.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Consequence scale not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating consequence scale:', error);
      res.status(500).json({ error: 'Failed to update consequence scale' });
    }
  });

  // Get heatmap matrix for a project
  app.get('/api/projects/:projectId/heatmap-matrix', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const matrix = await db
        .select()
        .from(heatmapMatrix)
        .where(eq(heatmapMatrix.projectId, projectId))
        .orderBy(heatmapMatrix.likelihood, heatmapMatrix.impact);
      
      res.json(matrix);
    } catch (error) {
      console.error('Error fetching heatmap matrix:', error);
      res.status(500).json({ error: 'Failed to fetch heatmap matrix' });
    }
  });

  // Update a heatmap matrix cell
  app.patch('/api/heatmap-matrix/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(heatmapMatrix)
        .set(req.body)
        .where(eq(heatmapMatrix.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Heatmap matrix cell not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating heatmap matrix:', error);
      res.status(500).json({ error: 'Failed to update heatmap matrix' });
    }
  });

  // === DOA ESCALATION MATRIX ===
  
  // Get DOA escalation matrix for a project
  app.get('/api/projects/:projectId/doa-matrix', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const matrix = await db
        .select()
        .from(doaEscalationMatrix)
        .where(eq(doaEscalationMatrix.projectId, projectId))
        .orderBy(doaEscalationMatrix.band, doaEscalationMatrix.riskOrOpportunity);
      
      res.json(matrix);
    } catch (error) {
      console.error('Error fetching DOA matrix:', error);
      res.status(500).json({ error: 'Failed to fetch DOA matrix' });
    }
  });

  // Create or update a DOA escalation rule
  app.post('/api/projects/:projectId/doa-matrix', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { band, riskOrOpportunity, ...data } = req.body;

      // Upsert: insert or update if exists
      const [rule] = await db
        .insert(doaEscalationMatrix)
        .values({
          projectId,
          band,
          riskOrOpportunity,
          ...data,
        })
        .onConflictDoUpdate({
          target: [doaEscalationMatrix.projectId, doaEscalationMatrix.band, doaEscalationMatrix.riskOrOpportunity],
          set: {
            ...data,
          },
        })
        .returning();
      
      res.status(201).json(rule);
    } catch (error) {
      console.error('Error creating/updating DOA rule:', error);
      res.status(500).json({ error: 'Failed to create/update DOA rule' });
    }
  });

  // Update a DOA escalation rule
  app.patch('/api/doa-matrix/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(doaEscalationMatrix)
        .set(req.body)
        .where(eq(doaEscalationMatrix.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'DOA rule not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating DOA rule:', error);
      res.status(500).json({ error: 'Failed to update DOA rule' });
    }
  });

  // Delete a DOA escalation rule
  app.delete('/api/doa-matrix/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(doaEscalationMatrix).where(eq(doaEscalationMatrix.id, id));
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting DOA rule:', error);
      res.status(500).json({ error: 'Failed to delete DOA rule' });
    }
  });

  // === CONSEQUENCE TYPES ===
  
  // Get consequence types for a project
  app.get('/api/projects/:projectId/consequence-types', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const types = await db
        .select()
        .from(consequenceTypes)
        .where(eq(consequenceTypes.projectId, projectId))
        .orderBy(consequenceTypes.displayOrder, consequenceTypes.name);
      
      res.json(types);
    } catch (error) {
      console.error('Error fetching consequence types:', error);
      res.status(500).json({ error: 'Failed to fetch consequence types' });
    }
  });

  // Create a new consequence type
  app.post('/api/projects/:projectId/consequence-types', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const [newType] = await db
        .insert(consequenceTypes)
        .values({
          projectId,
          ...req.body,
        })
        .returning();
      
      // Create default ratings (levels 1-6) for the new type
      const ratings = [];
      for (let level = 1; level <= 6; level++) {
        ratings.push({
          consequenceTypeId: newType.id,
          level,
          description: null,
          numericValue: null,
        });
      }
      await db.insert(consequenceRatings).values(ratings);
      
      res.status(201).json(newType);
    } catch (error) {
      console.error('Error creating consequence type:', error);
      res.status(500).json({ error: 'Failed to create consequence type' });
    }
  });

  // Update a consequence type
  app.patch('/api/consequence-types/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(consequenceTypes)
        .set(req.body)
        .where(eq(consequenceTypes.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Consequence type not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating consequence type:', error);
      res.status(500).json({ error: 'Failed to update consequence type' });
    }
  });

  // Delete a consequence type (and its ratings cascade)
  app.delete('/api/projects/:projectId/consequence-types/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, id } = req.params;
      
      // Check if the type exists and belongs to this project
      const [type] = await db
        .select()
        .from(consequenceTypes)
        .where(and(
          eq(consequenceTypes.id, id),
          eq(consequenceTypes.projectId, projectId)
        ))
        .limit(1);
      
      if (!type) {
        return res.status(404).json({ error: 'Consequence type not found or does not belong to this project' });
      }
      
      if (type.isDefault) {
        return res.status(400).json({ error: 'Cannot delete default consequence types (Financial/Time)' });
      }
      
      await db.delete(consequenceTypes).where(eq(consequenceTypes.id, id));
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting consequence type:', error);
      res.status(500).json({ error: 'Failed to delete consequence type' });
    }
  });

  // === CONSEQUENCE RATINGS ===
  
  // Get all consequence ratings for a project (includes type info)
  app.get('/api/projects/:projectId/consequence-ratings', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const ratings = await db
        .select({
          id: consequenceRatings.id,
          consequenceTypeId: consequenceRatings.consequenceTypeId,
          level: consequenceRatings.level,
          description: consequenceRatings.description,
          numericValue: consequenceRatings.numericValue,
          typeName: consequenceTypes.name,
          isDefault: consequenceTypes.isDefault,
        })
        .from(consequenceRatings)
        .innerJoin(consequenceTypes, eq(consequenceRatings.consequenceTypeId, consequenceTypes.id))
        .where(eq(consequenceTypes.projectId, projectId))
        .orderBy(consequenceTypes.displayOrder, consequenceRatings.level);
      
      res.json(ratings);
    } catch (error) {
      console.error('Error fetching consequence ratings:', error);
      res.status(500).json({ error: 'Failed to fetch consequence ratings' });
    }
  });

  // Update a consequence rating
  app.patch('/api/consequence-ratings/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(consequenceRatings)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(consequenceRatings.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Consequence rating not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating consequence rating:', error);
      res.status(500).json({ error: 'Failed to update consequence rating' });
    }
  });

  // Upsert consequence rating (create or update by type and level)
  app.put('/api/projects/:projectId/consequence-ratings', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { consequenceTypeId, level, description } = req.body;

      // Verify the consequence type belongs to this project
      const [type] = await db
        .select()
        .from(consequenceTypes)
        .where(and(
          eq(consequenceTypes.id, consequenceTypeId),
          eq(consequenceTypes.projectId, projectId)
        ))
        .limit(1);

      if (!type) {
        return res.status(404).json({ error: 'Consequence type not found or does not belong to this project' });
      }

      // Check if rating exists
      const [existing] = await db
        .select()
        .from(consequenceRatings)
        .where(and(
          eq(consequenceRatings.consequenceTypeId, consequenceTypeId),
          eq(consequenceRatings.level, level)
        ))
        .limit(1);

      let result;
      if (existing) {
        // Update existing
        [result] = await db
          .update(consequenceRatings)
          .set({
            description,
            updatedAt: new Date(),
          })
          .where(eq(consequenceRatings.id, existing.id))
          .returning();
      } else {
        // Create new
        [result] = await db
          .insert(consequenceRatings)
          .values({
            consequenceTypeId,
            level,
            description,
            numericValue: null,
          })
          .returning();
      }

      res.json(result);
    } catch (error) {
      console.error('Error upserting consequence rating:', error);
      res.status(500).json({ error: 'Failed to update consequence rating' });
    }
  });

  // === eDiscovery API ===

  // Upload PST file
  app.post('/api/ediscovery/uploads', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: 'Company ID not found' });
      }

      // Calculate SHA-256 hash
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

      // Save PST file to temp storage (in production, use object storage)
      const fs = await import('fs/promises');
      const path = await import('path');
      const storageDir = path.join('/tmp', 'ediscovery-uploads');
      await fs.mkdir(storageDir, { recursive: true });
      
      const storageKey = path.join(storageDir, `${hash}.pst`);
      await fs.writeFile(storageKey, req.file.buffer);

      // Create upload record
      const { ediscoveryUploads } = await import('@shared/schema');
      const [upload] = await db.insert(ediscoveryUploads).values({
        companyId: user.companyId,
        projectId: req.body.projectId || null,
        filename: req.file.originalname,
        storageKey,
        sizeBytes: req.file.size,
        sha256: hash,
        status: 'pending',
        uploadedById: user.personId,
      }).returning();

      res.json({ uploadId: upload.id, upload });
    } catch (error) {
      console.error('Error uploading PST:', error);
      res.status(500).json({ error: 'Failed to upload PST file' });
    }
  });

  // Start PST ingestion
  app.post('/api/ediscovery/ingest/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as any;

      // Verify upload exists and belongs to user's company
      const { ediscoveryUploads } = await import('@shared/schema');
      const [upload] = await db
        .select()
        .from(ediscoveryUploads)
        .where(and(
          eq(ediscoveryUploads.id, id),
          eq(ediscoveryUploads.companyId, user.companyId)
        ))
        .limit(1);

      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      if (upload.status === 'processing') {
        return res.json({ status: 'processing', message: 'Already processing' });
      }

      if (upload.status === 'complete') {
        return res.json({ status: 'complete', message: 'Already processed' });
      }

      // Start ingestion in background (don't await)
      const { ingestPSTFile } = await import('./ediscoveryIngest');
      ingestPSTFile(id).catch(err => {
        console.error(`Background ingestion failed for ${id}:`, err);
      });

      res.json({ status: 'processing', message: 'Ingestion started' });
    } catch (error) {
      console.error('Error starting ingestion:', error);
      res.status(500).json({ error: 'Failed to start ingestion' });
    }
  });

  // Get upload status
  app.get('/api/ediscovery/uploads/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as any;

      const { ediscoveryUploads } = await import('@shared/schema');
      const [upload] = await db
        .select()
        .from(ediscoveryUploads)
        .where(and(
          eq(ediscoveryUploads.id, id),
          eq(ediscoveryUploads.companyId, user.companyId)
        ))
        .limit(1);

      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      res.json(upload);
    } catch (error) {
      console.error('Error getting upload status:', error);
      res.status(500).json({ error: 'Failed to get upload status' });
    }
  });

  // Search emails with hybrid search
  app.get('/api/ediscovery/emails', isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const {
        projectId,
        q = '',
        from,
        to,
        parties,
        dateFrom,
        dateTo,
        hasAttachments,
        limit = '50',
        offset = '0',
      } = req.query;

      const { ediscoveryEmails, ediscoveryUploads } = await import('@shared/schema');

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      // Build query conditions
      const conditions: any[] = [
        eq(ediscoveryEmails.companyId, user.companyId),
        eq(ediscoveryUploads.projectId, String(projectId))
      ];

      if (from) {
        conditions.push(eq(ediscoveryEmails.fromAddress, String(from).toLowerCase()));
      }

      if (dateFrom) {
        conditions.push(sql`${ediscoveryEmails.sentAt} >= ${dateFrom}`);
      }

      if (dateTo) {
        conditions.push(sql`${ediscoveryEmails.sentAt} <= ${dateTo}`);
      }

      if (hasAttachments === 'true') {
        conditions.push(eq(ediscoveryEmails.hasAttachments, true));
      } else if (hasAttachments === 'false') {
        conditions.push(eq(ediscoveryEmails.hasAttachments, false));
      }

      // Add text search if query provided
      if (q) {
        conditions.push(
          sql`(
            ${ediscoveryEmails.subject} ILIKE ${`%${q}%`} OR
            ${ediscoveryEmails.bodyText} ILIKE ${`%${q}%`} OR
            ${ediscoveryEmails.fromAddress} ILIKE ${`%${q}%`}
          )`
        );
      }

      // Query with join to ediscoveryUploads to filter by projectId
      const results = await db
        .select({
          id: ediscoveryEmails.id,
          subject: ediscoveryEmails.subject,
          fromAddress: ediscoveryEmails.fromAddress,
          toAddresses: ediscoveryEmails.toAddresses,
          sentAt: ediscoveryEmails.sentAt,
          snippet: ediscoveryEmails.snippet,
          hasAttachments: ediscoveryEmails.hasAttachments,
          sourceFilename: ediscoveryEmails.sourceFilename,
        })
        .from(ediscoveryEmails)
        .innerJoin(ediscoveryUploads, eq(ediscoveryEmails.uploadId, ediscoveryUploads.id))
        .where(and(...conditions))
        .orderBy(asc(ediscoveryEmails.sentAt))
        .limit(parseInt(String(limit)))
        .offset(parseInt(String(offset)));

      res.json({ items: results, total: results.length });
    } catch (error) {
      console.error('Error searching emails:', error);
      res.status(500).json({ error: 'Failed to search emails' });
    }
  });

  // Get email details with attachments
  app.get('/api/ediscovery/emails/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as any;

      const { ediscoveryEmails, ediscoveryAttachments } = await import('@shared/schema');

      // Get email - just check it exists, no company filtering needed
      // (emails are accessed through projects which already have access control)
      const [email] = await db
        .select()
        .from(ediscoveryEmails)
        .where(eq(ediscoveryEmails.id, id))
        .limit(1);

      if (!email) {
        return res.status(404).json({ error: 'Email not found' });
      }

      // Get attachments
      const attachments = await db
        .select()
        .from(ediscoveryAttachments)
        .where(eq(ediscoveryAttachments.emailId, id));

      res.json({ email, attachments });
    } catch (error) {
      console.error('Error getting email details:', error);
      res.status(500).json({ error: 'Failed to get email details' });
    }
  });

  // Get all uploads for company
  app.get('/api/ediscovery/uploads', isAuthenticated, async (req, res) => {
    try {
      const { ediscoveryUploads } = await import('@shared/schema');
      
      // Return all uploads - frontend will filter by project
      const uploads = await db
        .select()
        .from(ediscoveryUploads)
        .orderBy(desc(ediscoveryUploads.createdAt));

      res.json(uploads);
    } catch (error) {
      console.error('Error getting uploads:', error);
      res.status(500).json({ error: 'Failed to get uploads' });
    }
  });

  // Scan SharePoint folder for PST files
  app.post('/api/ediscovery/scan-pst-folder/:projectId', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const user = req.user as any;

      // Get project and SharePoint settings
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get SharePoint settings for this project
      const { projectSharePointSettings } = await import('@shared/schema');
      const [spSettings] = await db
        .select()
        .from(projectSharePointSettings)
        .where(eq(projectSharePointSettings.projectId, projectId))
        .limit(1);

      if (!project.pstFolderPath || !spSettings?.sharePointSiteUrl) {
        return res.status(400).json({ error: 'PST folder path or SharePoint site URL not configured' });
      }

      // Scan SharePoint folder for PST files
      const { scanSharePointPSTFolder } = await import('./sharepoint');
      const result = await scanSharePointPSTFolder(
        projectId,
        spSettings.sharePointSiteUrl,
        project.pstFolderPath
      );

      res.json(result);
    } catch (error) {
      console.error('Error scanning PST folder:', error);
      res.status(500).json({ error: 'Failed to scan PST folder' });
    }
  });

  // Get unique sender email addresses for a project
  app.get('/api/ediscovery/senders/:projectId', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const user = req.user as any;

      const { ediscoveryEmails, ediscoveryUploads } = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // Get distinct sender addresses for this project (PST files belong to projects only)
      const senders = await db
        .selectDistinct({ fromAddress: ediscoveryEmails.fromAddress })
        .from(ediscoveryEmails)
        .innerJoin(ediscoveryUploads, eq(ediscoveryEmails.uploadId, ediscoveryUploads.id))
        .where(eq(ediscoveryUploads.projectId, projectId))
        .orderBy(ediscoveryEmails.fromAddress);

      // Filter out null/empty senders and return array of strings
      const senderList = senders
        .map(s => s.fromAddress)
        .filter(s => s && s.trim())
        .sort();

      res.json(senderList);
    } catch (error) {
      console.error('Error fetching senders:', error);
      res.status(500).json({ error: 'Failed to fetch senders' });
    }
  });

  // AI-powered semantic search for emails
  app.post('/api/ediscovery/semantic-search', isAuthenticated, async (req, res) => {
    try {
      const { query, projectId, sourceFilename, tags, limit = 10, dateFrom, dateTo, sender, hasAttachments } = req.body;
      const user = req.user as any;

      if (!query || !query.trim()) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      // Generate embedding for search query using Voyage AI
      const { VoyageAIClient } = await import('voyageai');
      const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
      
      const embeddingResponse = await voyage.embed({
        input: [query],
        model: 'voyage-3-lite', // Use voyage-3-lite for email search
        inputType: 'query' // "query" for search queries vs "document" for indexing
      });
      
      const queryEmbedding = embeddingResponse.data?.[0]?.embedding || [];

      // Search emails using vector similarity
      const { ediscoveryEmails, ediscoveryEmailTags, ediscoveryUploads } = await import('@shared/schema');
      const { gte, lte, like } = await import('drizzle-orm');
      
      // Build conditions (PST files belong to projects, not companies)
      const conditions: any[] = [];
      
      if (sourceFilename) {
        conditions.push(eq(ediscoveryEmails.sourceFilename, sourceFilename));
      }

      // Date filters - convert string dates to Date objects
      if (dateFrom) {
        const dateFromObj = new Date(dateFrom);
        conditions.push(gte(ediscoveryEmails.sentAt, dateFromObj));
      }
      if (dateTo) {
        // Set to end of day (23:59:59) for inclusive search
        const dateToObj = new Date(dateTo);
        dateToObj.setHours(23, 59, 59, 999);
        conditions.push(lte(ediscoveryEmails.sentAt, dateToObj));
      }

      // Sender filter
      if (sender) {
        conditions.push(like(ediscoveryEmails.fromAddress, `%${sender}%`));
      }

      // Attachments filter
      if (typeof hasAttachments === 'boolean') {
        conditions.push(eq(ediscoveryEmails.hasAttachments, hasAttachments));
      }

      // Build query based on whether we need project filtering
      let emails: any[];
      
      if (projectId) {
        // With project filter - join with uploads
        const joinConditions = [
          eq(ediscoveryEmails.uploadId, ediscoveryUploads.id),
          eq(ediscoveryUploads.projectId, projectId),
        ];
        
        const results = await db
          .select({
            id: ediscoveryEmails.id,
            subject: ediscoveryEmails.subject,
            fromAddress: ediscoveryEmails.fromAddress,
            toAddresses: ediscoveryEmails.toAddresses,
            sentAt: ediscoveryEmails.sentAt,
            snippet: ediscoveryEmails.snippet,
            hasAttachments: ediscoveryEmails.hasAttachments,
            sourceFilename: ediscoveryEmails.sourceFilename,
            embedding: ediscoveryEmails.embedding,
          })
          .from(ediscoveryEmails)
          .innerJoin(ediscoveryUploads, and(...joinConditions))
          .where(and(...conditions))
          .limit(parseInt(String(limit)) * 2); // Fetch more for similarity filtering
        
        emails = results;
      } else {
        // Without project filter - simpler query
        emails = await db
          .select({
            id: ediscoveryEmails.id,
            subject: ediscoveryEmails.subject,
            fromAddress: ediscoveryEmails.fromAddress,
            toAddresses: ediscoveryEmails.toAddresses,
            sentAt: ediscoveryEmails.sentAt,
            snippet: ediscoveryEmails.snippet,
            hasAttachments: ediscoveryEmails.hasAttachments,
            sourceFilename: ediscoveryEmails.sourceFilename,
            embedding: ediscoveryEmails.embedding,
          })
          .from(ediscoveryEmails)
          .where(and(...conditions))
          .limit(parseInt(String(limit)) * 2); // Fetch more for similarity filtering
      }

      // Helper function: Calculate keyword match score
      const calculateKeywordScore = (email: any, searchQuery: string): number => {
        const queryTerms = searchQuery.toLowerCase().trim().split(/\s+/);
        const subject = (email.subject || '').toLowerCase();
        const fromAddress = (email.fromAddress || '').toLowerCase();
        const snippet = (email.snippet || '').toLowerCase();
        
        let matchCount = 0;
        let totalTerms = queryTerms.length;
        
        // Count how many query terms appear in subject, from, or snippet
        for (const term of queryTerms) {
          const inSubject = subject.includes(term);
          const inFrom = fromAddress.includes(term);
          const inSnippet = snippet.includes(term);
          
          if (inSubject || inFrom || inSnippet) {
            matchCount++;
            
            // Bonus: Exact match in subject gets extra weight
            if (inSubject) {
              matchCount += 0.5;
            }
          }
        }
        
        // Normalize to 0-1 range (can exceed 1.0 if subject matches)
        return Math.min(matchCount / totalTerms, 1.5) / 1.5;
      };

      // Calculate hybrid score (keyword + semantic) for each email
      const results = emails
        .map((email: any) => {
          try {
            // Calculate semantic similarity
            const emailEmbedding = JSON.parse(email.embedding || '[]');
            let semanticScore = 0;
            
            if (emailEmbedding.length > 0) {
              let dotProduct = 0;
              let normA = 0;
              let normB = 0;
              for (let i = 0; i < queryEmbedding.length; i++) {
                dotProduct += queryEmbedding[i] * (emailEmbedding[i] || 0);
                normA += queryEmbedding[i] * queryEmbedding[i];
                normB += (emailEmbedding[i] || 0) * (emailEmbedding[i] || 0);
              }
              semanticScore = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            }
            
            // Calculate keyword match score
            const keywordScore = calculateKeywordScore(email, query);
            
            // Hybrid scoring: 60% keyword + 40% semantic
            // This ensures exact matches get high scores while still benefiting from semantic understanding
            const hybridScore = (keywordScore * 0.6) + (semanticScore * 0.4);

            return { 
              ...email, 
              similarity: hybridScore,
              keywordScore, // Include for debugging
              semanticScore, // Include for debugging
              embedding: undefined 
            };
          } catch (error) {
            console.error('Error calculating similarity:', error);
            return { ...email, similarity: 0, embedding: undefined };
          }
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, parseInt(String(limit)));

      // If tags filter is provided, filter results
      if (tags && tags.length > 0) {
        const emailIds = results.map(r => r.id);
        
        // Short-circuit if no results to filter
        if (emailIds.length === 0) {
          return res.json({ items: [], total: 0 });
        }

        // Use inArray helper for proper parameterization
        const { inArray } = await import('drizzle-orm');
        const emailTags = await db
          .select()
          .from(ediscoveryEmailTags)
          .where(inArray(ediscoveryEmailTags.emailId, emailIds));

        const tagMap = new Map();
        emailTags.forEach(t => {
          if (!tagMap.has(t.emailId)) {
            tagMap.set(t.emailId, []);
          }
          tagMap.get(t.emailId).push(t.label);
        });

        const filteredResults = results.filter(r => {
          const emailTags = tagMap.get(r.id) || [];
          return tags.some((tag: string) => emailTags.includes(tag));
        });

        res.json({ items: filteredResults, total: filteredResults.length });
      } else {
        res.json({ items: results, total: results.length });
      }
    } catch (error) {
      console.error('Error in semantic search:', error);
      res.status(500).json({ error: 'Failed to perform semantic search' });
    }
  });

  // Export email to PDF and save to SharePoint
  app.post('/api/ediscovery/emails/:emailId/export-pdf', isAuthenticated, async (req, res) => {
    try {
      const { emailId } = req.params;
      const { projectId } = req.body;
      const user = req.user as any;

      // Get email details
      const { ediscoveryEmails } = await import('@shared/schema');
      const [email] = await db
        .select()
        .from(ediscoveryEmails)
        .where(and(
          eq(ediscoveryEmails.id, emailId),
          eq(ediscoveryEmails.companyId, user.companyId)
        ))
        .limit(1);

      if (!email) {
        return res.status(404).json({ error: 'Email not found' });
      }

      // Generate archival filename: YYYYMMDD_HHMMSS_Subject.pdf
      const sentDate = email.sentAt ? new Date(email.sentAt) : new Date();
      const dateStr = sentDate.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = sentDate.toISOString().slice(11, 19).replace(/:/g, '');
      const subjectSlug = (email.subject || 'NoSubject')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 50);
      const pdfFilename = `${dateStr}_${timeStr}_${subjectSlug}.pdf`;

      // Generate PDF using @react-pdf/renderer
      const { Document, Page, Text, View, pdf } = await import('@react-pdf/renderer');
      const React = await import('react');

      // Create PDF document
      const EmailPDF = React.createElement(Document, {},
        React.createElement(Page, { style: { padding: 30 } },
          React.createElement(View, { style: { marginBottom: 20 } },
            React.createElement(Text, { style: { fontSize: 18, marginBottom: 10 } }, email.subject || 'No Subject'),
            React.createElement(Text, { style: { fontSize: 12, marginBottom: 5 } }, `From: ${email.fromAddress || 'Unknown'}`),
            React.createElement(Text, { style: { fontSize: 12, marginBottom: 5 } }, `To: ${email.toAddresses?.join(', ') || 'Unknown'}`),
            email.ccAddresses && email.ccAddresses.length > 0 && React.createElement(Text, { style: { fontSize: 12, marginBottom: 5 } }, `CC: ${email.ccAddresses.join(', ')}`),
            React.createElement(Text, { style: { fontSize: 12, marginBottom: 10 } }, `Date: ${sentDate.toLocaleString()}`)
          ),
          React.createElement(View, { style: { borderTop: '1px solid #ccc', paddingTop: 20 } },
            React.createElement(Text, { style: { fontSize: 11 } }, email.bodyText || 'No content')
          )
        )
      );

      // Generate PDF buffer
      const pdfBuffer = await pdf(EmailPDF).toBuffer();

      // If projectId is provided, upload to SharePoint
      if (projectId) {
        try {
          // Get SharePoint settings
          const { projectSharePointSettings } = await import('@shared/schema');
          const [spSettings] = await db
            .select()
            .from(projectSharePointSettings)
            .where(eq(projectSharePointSettings.projectId, projectId))
            .limit(1);

          if (spSettings?.sharePointSiteUrl) {
            // Upload to SharePoint Archived_Emails subfolder
            const { SharePointService } = await import('./sharepoint');
            const sharePointService = new SharePointService();
            
            const archivedFolder = 'Archived_Emails';
            const uploadPath = `${archivedFolder}/${pdfFilename}`;
            
            // Note: SharePointService doesn't have an upload method yet
            // This would need to be implemented in SharePointService
            // For now, we'll just download the PDF
            console.log(`PDF generated: ${pdfFilename} (SharePoint upload not yet implemented)`);
          }
        } catch (uploadError) {
          console.error('Error uploading to SharePoint:', uploadError);
          // Continue even if SharePoint upload fails
        }
      }

      // Send PDF as download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error exporting email to PDF:', error);
      res.status(500).json({ error: 'Failed to export email to PDF' });
    }
  });

  // Get tags for an email
  app.get('/api/ediscovery/emails/:emailId/tags', isAuthenticated, async (req, res) => {
    try {
      const { emailId } = req.params;
      const user = req.user as any;

      const { ediscoveryEmailTags } = await import('@shared/schema');
      const tags = await db
        .select()
        .from(ediscoveryEmailTags)
        .where(eq(ediscoveryEmailTags.emailId, emailId));

      res.json(tags);
    } catch (error) {
      console.error('Error getting email tags:', error);
      res.status(500).json({ error: 'Failed to get email tags' });
    }
  });

  // Add tag to email
  app.post('/api/ediscovery/emails/:emailId/tags', isAuthenticated, async (req, res) => {
    try {
      const { emailId } = req.params;
      const { label } = req.body;
      const user = req.user as any;

      if (!label || !label.trim()) {
        return res.status(400).json({ error: 'Tag label is required' });
      }

      const { ediscoveryEmailTags } = await import('@shared/schema');
      
      // Check if tag already exists for this email
      const existing = await db
        .select()
        .from(ediscoveryEmailTags)
        .where(and(
          eq(ediscoveryEmailTags.emailId, emailId),
          eq(ediscoveryEmailTags.label, label.trim())
        ))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Tag already exists' });
      }

      const [newTag] = await db.insert(ediscoveryEmailTags).values({
        emailId,
        label: label.trim(),
        createdById: user.id,
      }).returning();

      res.json(newTag);
    } catch (error) {
      console.error('Error adding email tag:', error);
      res.status(500).json({ error: 'Failed to add email tag' });
    }
  });

  // Remove tag from email
  app.delete('/api/ediscovery/emails/:emailId/tags/:tagId', isAuthenticated, async (req, res) => {
    try {
      const { emailId, tagId } = req.params;
      const user = req.user as any;

      const { ediscoveryEmailTags } = await import('@shared/schema');
      
      const deleted = await db
        .delete(ediscoveryEmailTags)
        .where(and(
          eq(ediscoveryEmailTags.id, tagId),
          eq(ediscoveryEmailTags.emailId, emailId)
        ))
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing email tag:', error);
      res.status(500).json({ error: 'Failed to remove email tag' });
    }
  });

  // Ingest PST file from SharePoint
  app.post('/api/ediscovery/ingest-from-sharepoint/:projectId', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { fileId, fileName, filePath, fileSize } = req.body;
      const user = req.user as any;

      // Get project and business unit
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get business unit to get companyId
      const { businessUnits } = await import('@shared/schema');
      const [businessUnit] = await db
        .select()
        .from(businessUnits)
        .where(eq(businessUnits.id, project.businessUnitId!))
        .limit(1);

      if (!businessUnit) {
        return res.status(404).json({ error: 'Business unit not found' });
      }

      // Get SharePoint settings
      const { projectSharePointSettings } = await import('@shared/schema');
      const [spSettings] = await db
        .select()
        .from(projectSharePointSettings)
        .where(eq(projectSharePointSettings.projectId, projectId))
        .limit(1);

      if (!spSettings?.sharePointSiteUrl) {
        return res.status(400).json({ error: 'SharePoint site URL not configured' });
      }

      // Calculate SHA-256 hash (will be updated after download)
      const placeholderHash = 'pending';

      // Create upload record
      const { ediscoveryUploads } = await import('@shared/schema');
      const [upload] = await db.insert(ediscoveryUploads).values({
        companyId: businessUnit.companyId,
        projectId,
        filename: fileName,
        sizeBytes: fileSize,
        sha256: placeholderHash,
        uploadedById: user.id,
        status: 'pending',
        emailCount: 0,
        attachmentCount: 0,
        storageKey: filePath, // Store SharePoint path temporarily
        sourcePath: filePath,
        scanDetectedAt: new Date(),
      }).returning();

      // Download PST file from SharePoint to temp location
      const { SharePointService } = await import('./sharepoint');
      const sharePointService = new SharePointService();
      
      console.log(`Downloading PST file ${fileName} from SharePoint...`);
      const fileBuffer = await sharePointService.downloadFile(
        spSettings.sharePointSiteUrl,
        '', // folder path not needed when using file ID
        fileId
      );
      
      // Calculate actual SHA-256 hash
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      
      // Save to temp storage
      const fs = await import('fs/promises');
      const path = await import('path');
      const tempPath = path.join('/tmp', 'ediscovery-uploads', `${upload.id}.pst`);
      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, fileBuffer);
      
      // Update storage key and hash
      await db
        .update(ediscoveryUploads)
        .set({ 
          storageKey: tempPath,
          sha256: hash
        })
        .where(eq(ediscoveryUploads.id, upload.id));

      // Start ingestion in background
      const { ingestPSTFile } = await import('./ediscoveryIngest');
      ingestPSTFile(upload.id).catch(err => {
        console.error(`Background PST ingestion failed for ${upload.id}:`, err);
      });

      res.json({ 
        message: 'PST ingestion started',
        uploadId: upload.id 
      });
    } catch (error) {
      console.error('Error ingesting PST from SharePoint:', error);
      res.status(500).json({ error: 'Failed to ingest PST file' });
    }
  });

  // Retry stuck PST upload
  app.post('/api/ediscovery/retry-upload/:uploadId', isAuthenticated, async (req, res) => {
    try {
      const { uploadId } = req.params;

      const { ediscoveryUploads } = await import('@shared/schema');

      // Get upload record
      const [upload] = await db
        .select()
        .from(ediscoveryUploads)
        .where(eq(ediscoveryUploads.id, uploadId))
        .limit(1);

      console.log(`[Retry Upload] ID: ${uploadId}, Found: ${!!upload}, Status: ${upload?.status}`);

      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      if (upload.status !== 'pending' && upload.status !== 'failed') {
        console.log(`[Retry Upload] Rejecting - status is ${upload.status}, not pending or failed`);
        return res.status(400).json({ error: `Can only retry uploads in pending or failed status. Current status: ${upload.status}` });
      }

      // Restart ingestion
      const { ingestPSTFile } = await import('./ediscoveryIngest');
      console.log(`[PST Retry] Restarting ingestion for upload ${uploadId}: ${upload.filename}`);
      
      ingestPSTFile(uploadId).catch(err => {
        console.error(`Background PST ingestion failed for ${uploadId}:`, err);
      });

      res.json({ 
        message: 'Processing restarted',
        uploadId 
      });
    } catch (error) {
      console.error('Error retrying PST upload:', error);
      res.status(500).json({ error: 'Failed to retry upload' });
    }
  });

  // === CONTRACT NOTICES ROUTES ===
  
  // Get or generate contract notices for a project revision
  app.get('/api/projects/:projectId/contract-notices', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { revisionId, force } = req.query;
      const crypto = await import('crypto');
      
      if (!revisionId || typeof revisionId !== 'string') {
        return res.status(400).json({ error: 'revisionId query parameter is required' });
      }
      
      const forceRefresh = force === 'true';
      
      // Get project to access company settings and contract paths
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Get company settings for AI model
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, project.businessUnitId ? (
          await db.select({ companyId: businessUnits.companyId })
            .from(businessUnits)
            .where(eq(businessUnits.id, project.businessUnitId))
            .limit(1)
        )[0]?.companyId || '' : ''))
        .limit(1);
      
      const model = company?.aiContractReviewModel || 'claude-sonnet-4-20250514';
      const promptVersion = 'notices-v4-plantuml-optimized';
      
      // Get contract revision document
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId))
        .limit(1);
      
      if (!revision) {
        return res.status(404).json({ error: 'Contract revision not found' });
      }
      
      // Fetch contract content from revision upload (priority) or SharePoint fallback
      let contractText = '';
      
      if (revision.clientContractFileUrl) {
        // First priority: Fetch from uploaded contract file in revision
        try {
          const { ObjectStorageService } = await import('./objectStorage');
          const objectStorage = new ObjectStorageService();
          
          // Extract path from URL - handle both full URLs and paths
          let filePath = revision.clientContractFileUrl;
          if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            // Full URL - extract pathname
            const url = new URL(filePath);
            filePath = url.pathname;
          }
          // Otherwise it's already a path like "/objects/templates/..."
          
          const file = await objectStorage.getObjectEntityFile(filePath);
          const [fileBuffer] = await file.download();
          
          const { extractTextFromPDF } = await import('./semanticSearch');
          contractText = await extractTextFromPDF(fileBuffer);
        } catch (error: any) {
          console.error('Error fetching contract from revision upload:', error);
          return res.status(500).json({ 
            error: 'Failed to fetch uploaded contract document: ' + (error.message || 'Unknown error')
          });
        }
      } else if (project.contractDocumentPath && project.contractDocumentPath.trim().length > 0 &&
                 project.sharepointFolderPath && project.sharepointFolderPath.trim().length > 0) {
        // Second priority: Fetch from SharePoint
        try {
          const { SharePointService } = await import('./sharepoint');
          const sharepointService = new SharePointService();
          const fileBuffer = await sharepointService.downloadFileByPath(
            project.sharepointFolderPath,
            project.contractDocumentPath
          );
          
          const { extractTextFromPDF } = await import('./semanticSearch');
          contractText = await extractTextFromPDF(fileBuffer);
        } catch (error: any) {
          console.error('Error fetching contract from SharePoint:', error);
          return res.status(500).json({ 
            error: 'Failed to fetch contract document from SharePoint: ' + (error.message || 'Unknown error')
          });
        }
      } else {
        // Provide specific error message based on what's missing
        const missingParts = [];
        if (!project.sharepointFolderPath || project.sharepointFolderPath.trim().length === 0) {
          missingParts.push('SharePoint Folder Path');
        }
        if (!project.contractDocumentPath || project.contractDocumentPath.trim().length === 0) {
          missingParts.push('Contract Document Path');
        }
        
        let errorMessage = 'No contract document available. ';
        if (missingParts.length > 0) {
          errorMessage += `Missing: ${missingParts.join(' and ')}. `;
        }
        errorMessage += 'Please configure these paths in Project Settings → Contract Documentation Paths, or upload a contract file directly to the Contract Review revision.';
        
        return res.status(400).json({ 
          error: errorMessage
        });
      }
      
      if (!contractText || contractText.trim().length === 0) {
        return res.status(400).json({ 
          error: 'Contract document is empty or could not be read'
        });
      }
      
      // Map model name to actual model string for consistency
      const { getModelString } = await import('./aiProviders');
      const actualModel = getModelString(model);
      
      // Generate etag for caching
      const contentHash = crypto.createHash('sha256')
        .update(contractText + '|' + promptVersion + '|' + actualModel)
        .digest('hex');
      
      // Check if cached result exists and is valid
      const { contractNotices } = await import('@shared/schema');
      const [existingCache] = await db
        .select()
        .from(contractNotices)
        .where(and(
          eq(contractNotices.projectId, projectId),
          eq(contractNotices.revisionId, revisionId)
        ))
        .limit(1);
      
      if (!forceRefresh && existingCache && existingCache.contentEtag === contentHash) {
        // Return cached result
        return res.json({
          cached: true,
          model: existingCache.model,
          promptVersion: existingCache.promptVersion,
          etag: existingCache.contentEtag,
          updatedAt: existingCache.updatedAt,
          data: existingCache.noticesJson
        });
      }
      
      // Run AI analysis
      console.log('[Contract Notices] Analyzing contract with AI...');
      
      const { createAIProvider } = await import('./aiProviders');
      const aiProvider = createAIProvider(actualModel);
      
      // Build the AI prompt
      const systemPrompt = `You are a senior contracts analyst and product counsel. Analyze the supplied contract and extract ALL notice requirements with EXPLICIT DURATIONS (NUMBERS ONLY), CLAUSE REFERENCES, and complete flow-on effects for PlantUML activity diagram generation.

IDENTIFY ALL NOTICE-TRIGGERING LANGUAGE:
Look for these keywords and their variations:
- "Notice" / "notify" / "notification"
- "Inform" / "information"
- "Advise" / "advice"
- "Communicate" / "communication"
- "Alert"
- "Report" / "reporting"
- "Disclose" / "disclosure"
- "Submit" / "submission"
- "Provide written..." / "in writing"
- "Shall give..." / "must give..."
- "Warn" / "warning"
- "Request" / "application"
- "Acknowledge" / "acknowledgement"
- "Certify" / "certification"
- "Consent" / "approval"

SPECIAL ATTENTION to notices related to:
- Variations/Change Orders
- Claims/Disputes
- Delays/Extensions of Time
- Force Majeure events
- Defects/Non-conformance
- Termination/Suspension
- Payment issues
- Safety incidents
- Site conditions
- Breaches/Defaults
- Insurance claims
- Progress reporting (recurring)
- Monthly/periodic submissions (recurring)

DURATION STANDARDIZATION RULES:
Convert all timeframes to NUMBERS (days only):
- "Immediately" / "Forthwith" = 0
- "Within X days" = X
- "Within X business days" = X (note if business days)
- "Within X weeks" = [X × 7]
- "Within 1 month" = 30
- "Within X months" = [X × 30]
- "Prior to [event]" = 0 (relative to that event)
- "Reasonable time" = Note as "TBD" + estimate if contract defines
- "As soon as practicable" = "ASAP" + estimate from context

Always express durations as:
- Absolute day number from trigger (e.g., "Day 7", "Day 21")
- Duration between events (e.g., "Duration: 14 days")
- Total elapsed time (e.g., "Total: 35 days")

CRITICAL: Map FLOW-ON EFFECTS with EXPLICIT DURATIONS (NUMBERS ONLY) and CLAUSE REFERENCES:
1. Response Required: Must the recipient respond? If yes:
   - Response timeframe: [NUMBER] days (e.g., 14 days, not "within 14 days")
   - Response clause reference
   - Response notice ID
   - What response must contain
2. Duration Between Each Step: Specify as [NUMBER] days only
3. Subsequent Actions with Durations:
   - Decision points with timeframes: [NUMBER] days
   - Alternative pathways: [NUMBER] days for each path
   - Follow-up notices: [NUMBER] days to issue
   - Meetings/consultations: [NUMBER] days notice required
   - Dispute resolution: [NUMBER] days at each stage
4. Consequences with Time Bars:
   - Time bar period: [NUMBER] days (if claim barred after this period)
   - Deemed acceptance/rejection: [NUMBER] days of no response
5. Loop-backs: Cycle duration in days (NUMBER ONLY)

Return a JSON object with this structure:
{
  "notices": [
    {
      "notice_id": "unique identifier (e.g., VAR-01, DELAY-01, TERM-01)",
      "title": "short descriptive label (e.g., Variation Notice)",
      "clause_ref": "clause number/heading (e.g., Cl 10.2)",
      "trigger_condition": "exact condition that triggers the notice (quote key text)",
      "trigger_clause": "clause reference for trigger event (e.g., Cl 10.1)",
      "required_action": "what must be sent/done",
      "sender_party": "party who sends (normalize: use 'Contractor', 'Principal', 'Client', etc.)",
      "recipient_party": "party who receives (normalize party name)",
      "delivery_methods": ["email", "courier", "registered mail", etc.],
      "notice_address_or_channel": "addresses/emails if specified, otherwise 'Not specified'",
      "lead_time": {"value": 0, "unit": "days", "relative_to": "trigger_event|deadline|renewal_date", "business_days": true},
      "lead_time_days": 0,
      "time_calculation_rules": "business days vs calendar days, time zone if stated, countdown rules",
      "content_requirements": ["required elements to include in notice"],
      "recurring": false,
      "recurrence_frequency": "if recurring: daily|weekly|monthly|quarterly, otherwise null",
      "recurrence_frequency_days": 0,
      "response_required": false,
      "response_timeframe": {"value": 0, "unit": "days", "business_days": true},
      "response_timeframe_days": 0,
      "response_clause": "clause reference for response requirement (e.g., Cl 10.3)",
      "response_notice_id": "ID of the response notice if it triggers one",
      "no_response_consequence": "what happens if no response within timeframe (e.g., deemed approved)",
      "no_response_clause": "clause reference for no response consequence",
      "subsequent_actions": ["What happens after notice is given - include clause references"],
      "decision_points": ["Approve/Reject options with clause references and durations"],
      "follow_up_notices": ["Notice IDs and descriptions with timeframes and clause references"],
      "consequences_if_compliant": "What happens if notice given properly (with clause reference)",
      "consequences_if_compliant_clause": "clause reference",
      "consequences_if_not_given": "What happens if notice not given or late (with clause reference)",
      "consequences_if_not_given_clause": "clause reference for time bar or penalty",
      "time_bar_days": null,
      "loop_back": false,
      "loop_duration_days": null,
      "cure_period": {"value": null, "unit": "days"},
      "escalation_path": "dispute resolution or escalation steps with clause references and timeframes",
      "escalation_clause": "clause reference for escalation",
      "total_process_duration_min_days": 0,
      "total_process_duration_max_days": 0,
      "risk_notes": "ambiguities or risky terms",
      "source_quote": "up to 75 words quoting the controlling sentence(s) from the contract",
      "plantuml": "Individual PlantUML activity diagram for THIS SPECIFIC NOTICE using the format detailed below - MUST include party swimlanes, timing notes, clause references, and time bars"
    }
  ],
  "plantuml": "Combined PlantUML activity diagram showing the 5-10 most complex notice chains together - see format below",
  "summary": [
    "Total notices identified: X",
    "Recurring notices: X (frequencies)",
    "Critical time bars: List notices with strict deadlines",
    "Deemed provisions: List where no response = deemed acceptance/rejection",
    "Longest notice chain: Notice ID - X to Y days"
  ],
  "confidence": 0.95,
  "assumptions": ["Any assumptions or ambiguities encountered"]
}

PLANTUML ACTIVITY DIAGRAM REQUIREMENTS:

CRITICAL: Generate TWO types of PlantUML diagrams:

1. INDIVIDUAL DIAGRAM for EACH notice (stored in each notice's "plantuml" field)
   - Show the complete flow for THIS SPECIFIC NOTICE ONLY
   - Include party swimlanes (|Contractor|, |Principal|)
   - Include all timing details (Day 0, Day 7, Duration notes)
   - Include all clause references (Clause X.X)
   - Include time bars if applicable
   - Include decision branches for responses
   - Use the EXACT same format as the combined diagram below

2. COMBINED DIAGRAM (stored in top-level "plantuml" field)
   - Show the 5-10 most complex notice chains together
   - Group related notices visually
   - Use the same formatting as individual diagrams

CRITICAL PlantUML SYNTAX RULES (for BOTH individual and combined):
- Use COLORED swimlanes to distinguish parties: |#FFE8E0|Contractor|, |#E8F5E9|Principal|, |#E0F7FA|Government Agency|, |#FFF3E0|Superintendent|, |#F3E5F5|Consultant|
- Use proper activity syntax: :Action Description\\n(Clause X.X);
- Use notes for durations: note right: Day X\\n(within X days) end note
- Use if/else for decision branches: if (Question?) then (Yes) ... else (No) ... endif
- Use detach for loop-backs (instead of stop)
- Use floating notes for time bars: floating note left: TIME BAR: X days\\n(Clause X.X)

PARTY COLOR MAPPING (MUST use these exact very light blush colors at ~25% opacity):
- Contractor: #FFE8E0 (very light orange/coral)
- Principal/Client: #E8F5E9 (very light green)
- Government Agency: #E0F7FA (very light cyan)
- Superintendent: #FFF3E0 (very light amber)
- Consultant: #F3E5F5 (very light purple)
- Subcontractor: #FFEBEE (very light red)
- Other parties: #F5F5F5 (light gray)

REQUIRED ELEMENTS FOR EACH NOTICE FLOW (both individual and combined):
1. Party Swimlanes WITH COLORS: |#FFE8E0|Contractor|, |#E8F5E9|Principal| (NOT partition syntax, MUST include color code)
2. Activities with clause refs: :Issue Notice\\n(Clause 10.2);
3. Duration Notes: note right: Day 7\\n(within 7 days)\\nDuration: 7 days end note
4. Decision Branches: if (Response?) then (Approve - Clause 10.3.1)
5. Time Bar Note: floating note left: TIME BAR: X days\\n(Clause X.X)

DURATION FORMATTING IN PLANTUML:
- Use "Day X" format for absolute days from trigger
- Use "(within X days)" to show the timeframe
- Use "Duration: X days" for step durations
- Example note format:
  note right
    Day 21 (within 14 days)
    Duration: 14 days
  end note

Example PlantUML format (use this EXACT format for BOTH individual and combined):
@startuml Notice_Flow_VAR01
title Variation Notice Flow (Clause 10)

|#FFE8E0|Contractor|
start
:Trigger Event Occurs\\n(Clause 10.1);
note right: Day 0

:Issue Variation Notice\\n(Clause 10.2);
note right
  Day 7
  (within 7 days)
end note

|#E8F5E9|Principal|
:Receive Notice\\n(Clause 10.3);
note right: Day 7

if (Response?) then (Approve - Clause 10.3.1)
  note right: Within 14 days (Day 21)
  :Work Proceeds\\n(Clause 10.4);
  note right: Duration: 14 days
  stop
  
else (Reject - Clause 10.3.2)
  note right: Within 14 days (Day 21)
  |#FFE8E0|Contractor|
  :Revise & Resubmit\\n(Clause 10.5);
  note right
    Within 7 days (Day 28)
    Duration: 7 days
  end note
  detach
  
else (More Info - Clause 10.3.3)
  note right: Within 14 days (Day 21)
  |#FFE8E0|Contractor|
  :Provide Information\\n(Clause 10.3.4);
  note right
    Within 7 days (Day 28)
    Duration: 7 days
  end note
  |#E8F5E9|Principal|
  :Re-assess;
  detach
  
else (No Response - Clause 10.3.5)
  note right
    After 14 days (Day 21)
    Deemed Approved
    Duration: 14 days
  end note
  |#FFE8E0|Contractor|
  :Work Proceeds\\n(Clause 10.6);
  stop
endif

floating note left: TIME BAR: 28 days from trigger\\n(Clause 10.7)

@enduml

CRITICAL REQUIREMENTS:
- Be COMPREHENSIVE - extract EVERY notice requirement in the contract
- No hallucinations - every notice MUST include clause_ref, source_quote, and all duration fields
- Convert ALL timeframes to NUMBERS (days only) using the duration standardization rules
- Use PlantUML partition syntax for party swimlanes: partition "Contractor" { }
- Use proper PlantUML activity syntax with clause refs: :Action\\n(Clause X.X);
- Use note syntax for durations: note right: Day X\\n(within X days) end note
- Use if/else/endif for decision branches with clause refs: if (Response?) then (Approve - Clause X.X)
- Use detach for loop-backs (not stop)
- Use floating note for time bars: floating note left: TIME BAR: X days\\n(Clause X.X)
- Flag recurring notices with frequency in days (recurring: true, recurrence_frequency_days: 30)
- Map complete flow-on effects with EXPLICIT DURATIONS (NUMBERS ONLY) between each step
- Include response requirements with exact timeframes in days (NUMBER format)
- Identify notice loops/cycles with total loop duration in days
- Calculate total process duration (min and max days) for each notice
- Identify time bars (days after which claim is barred - NUMBER format)
- Identify deemed provisions (what happens after X days of no response - NUMBER format)
- Express ALL durations as absolute day numbers (e.g., "Day 7", "Day 21")
- Show duration between events (e.g., "Duration: 14 days")
- Use partitions to show which party performs each action in PlantUML
- Prefer strictest interpretation; flag ambiguities in risk_notes
- Confidence between 0 and 1
- Return ONLY valid JSON, no extra prose`;

      const userPrompt = `Analyze this contract and extract all notice obligations:\n\n${contractText.substring(0, 100000)}`;
      
      const startTime = Date.now();
      let aiResult: any;
      
      try {
        const completion = await aiProvider.createCompletion([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          model: actualModel,
          temperature: 0,
          maxTokens: 16000
        });
        
        // Parse AI response as JSON
        const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('AI response did not contain valid JSON');
        }
        
        aiResult = JSON.parse(jsonMatch[0]);
        const durationMs = Date.now() - startTime;
        
        // Log AI usage
        const { aiUsageLogs } = await import('@shared/schema');
        
        // Get current user
        const user = req.user as any;
        let personId = user?.id;
        
        await db.insert(aiUsageLogs).values({
          projectId,
          personId,
          formName: 'Contract Notices',
          eventType: 'notices_analysis',
          modelUsed: actualModel,
          revisionId,
          inputTokens: completion.usage.inputTokens,
          outputTokens: completion.usage.outputTokens,
          totalTokens: completion.usage.totalTokens,
          durationMs,
          estimatedCost: '0.00', // Calculate based on model pricing if needed
          notes: `Extracted ${aiResult.notices?.length || 0} notice obligations`
        });
        
      } catch (error: any) {
        console.error('AI analysis error:', error);
        return res.status(500).json({ 
          error: 'AI analysis failed: ' + (error.message || 'Unknown error')
        });
      }
      
      // Generate and store parent clause flowcharts
      if (aiResult.notices && Array.isArray(aiResult.notices)) {
        const clauseGroupsMap = new Map<string, any[]>();
        
        // Group notices by parent clause
        aiResult.notices.forEach((notice: any) => {
          const clauseRef = notice.clause_ref || 'Unknown';
          const parentClause = clauseRef.split('.')[0].replace(/^Cl\s*/i, '').trim();
          
          if (!clauseGroupsMap.has(parentClause)) {
            clauseGroupsMap.set(parentClause, []);
          }
          clauseGroupsMap.get(parentClause)!.push(notice);
        });
        
        // Generate PlantUML for each parent clause group using THE SAME DETAILED FORMAT as overview
        const parentClauseFlowcharts: Record<string, string> = {};
        
        // Color mapping for parties (very light blush colors at ~25% opacity for subtle swimlane distinction)
        const getPartyColor = (partyName: string): string => {
          const normalized = partyName.toLowerCase();
          if (normalized.includes('contractor')) return '#FFE8E0'; // Very light orange/coral (25% opacity)
          if (normalized.includes('principal')) return '#E8F5E9'; // Very light green (25% opacity)
          if (normalized.includes('client')) return '#E8F5E9'; // Very light green (same as principal)
          if (normalized.includes('government')) return '#E0F7FA'; // Very light cyan (25% opacity)
          if (normalized.includes('agency')) return '#E0F7FA'; // Very light cyan
          if (normalized.includes('superintendent')) return '#FFF3E0'; // Very light amber (25% opacity)
          if (normalized.includes('consultant')) return '#F3E5F5'; // Very light purple (25% opacity)
          if (normalized.includes('subcontractor')) return '#FFEBEE'; // Very light red (25% opacity)
          return '#F5F5F5'; // Light gray for unknown parties
        };
        
        for (const [parentClause, childNotices] of Array.from(clauseGroupsMap.entries())) {
          if (childNotices.length === 0) continue;
          
          const sanitize = (text: string, maxLen: number = 200) => {
            if (!text) return 'N/A';
            return text.substring(0, maxLen)
              .replace(/"/g, "'")
              .replace(/\|/g, "-")
              .replace(/\n/g, "\\n")
              .replace(/\s+/g, " ")
              .trim();
          };
          
          const lines: string[] = ['@startuml'];
          lines.push('title Clause ' + parentClause + ' - Notice Flow');
          lines.push('skinparam BackgroundColor transparent');
          lines.push('skinparam Shadowing false');
          lines.push('');
          
          // Process each notice with full swimlane detail
          childNotices.forEach((notice: any, noticeIndex: number) => {
            const senderParty = notice.sender_party || 'Party A';
            const recipientParty = notice.recipient_party || 'Party B';
            
            // Start with sender's swimlane with color
            const senderColor = getPartyColor(senderParty);
            lines.push(`|${senderColor}|${senderParty}|`);
            lines.push('start');
            
            // Trigger event
            const triggerText = sanitize(notice.trigger_condition || 'Event Occurs', 150);
            lines.push(`:${triggerText};`);
            
            // Add timing/lead time if present
            if (notice.lead_time?.value) {
              const leadTime = `Day ${notice.lead_time.value}`;
              const businessDays = notice.lead_time.business_days ? ' (BD)' : '';
              lines.push(`floating note right: ${leadTime}${businessDays}`);
            } else {
              lines.push(`floating note right: Day 0`);
            }
            
            // Notice action
            const noticeTitle = sanitize(notice.title, 100);
            const clauseRef = notice.clause_ref ? `\\n(Clause ${notice.clause_ref})` : '';
            lines.push(`:Issue ${noticeTitle}${clauseRef};`);
            
            // Duration on notice action
            if (notice.lead_time?.value) {
              lines.push(`note right: Duration: ${notice.lead_time.value} ${notice.lead_time.unit}`);
            } else {
              lines.push(`note right: Duration: 0 days`);
            }
            
            // Switch to recipient's swimlane with color
            const recipientColor = getPartyColor(recipientParty);
            lines.push(`|${recipientColor}|${recipientParty}|`);
            lines.push(`:Receive ${noticeTitle};`);
            
            // Add time bar if present
            if (notice.time_bar_days) {
              lines.push(`floating note left: TIME BAR\\nDay ${notice.time_bar_days}`);
            }
            
            // Flow-on effects and responses
            if (notice.flow_on_effects && notice.flow_on_effects.length > 0) {
              notice.flow_on_effects.forEach((effect: any, effectIndex: number) => {
                const effectParty = effect.party || recipientParty;
                const effectColor = getPartyColor(effectParty);
                lines.push(`|${effectColor}|${effectParty}|`);
                
                const effectDesc = sanitize(effect.description || effect.action || 'Action Required', 120);
                lines.push(`:${effectDesc};`);
                
                if (effect.duration_days) {
                  lines.push(`note right: Duration: ${effect.duration_days} days`);
                }
                
                // Decision points
                if (effect.decision_point) {
                  lines.push(`if (${sanitize(effect.decision_point, 80)}?) then (yes)`);
                  if (effect.if_yes) {
                    lines.push(`  :${sanitize(effect.if_yes, 100)};`);
                  }
                  lines.push(`else (no)`);
                  if (effect.if_no) {
                    lines.push(`  :${sanitize(effect.if_no, 100)};`);
                  }
                  lines.push(`endif`);
                }
              });
            }
            
            // Response required
            if (notice.response_required) {
              const responseParty = notice.recipient_party || 'Party B';
              const responseColor = getPartyColor(responseParty);
              lines.push(`|${responseColor}|${responseParty}|`);
              
              const responseDesc = notice.response_description 
                ? sanitize(notice.response_description, 120)
                : 'Provide Response';
              lines.push(`:${responseDesc};`);
              
              if (notice.response_timeframe_days) {
                lines.push(`floating note right: Duration: ${notice.response_timeframe_days} days`);
              } else {
                lines.push(`floating note right: Duration: TBD`);
              }
            }
            
            // Consequences
            if (notice.consequences_if_compliant) {
              lines.push(`:${sanitize(notice.consequences_if_compliant, 120)};`);
            }
            
            // Add separator between notices if not the last one
            if (noticeIndex < childNotices.length - 1) {
              lines.push('');
              lines.push('stop');
              lines.push('');
            } else {
              lines.push('stop');
            }
          });
          
          lines.push('@enduml');
          
          parentClauseFlowcharts[parentClause] = lines.join('\n');
        }
        
        // Add parent clause flowcharts to aiResult
        aiResult.parentClauseFlowcharts = parentClauseFlowcharts;
      }
      
      // Save or update cache
      if (existingCache) {
        await db
          .update(contractNotices)
          .set({
            noticesJson: aiResult,
            contentEtag: contentHash,
            model: actualModel,
            promptVersion,
            updatedAt: new Date()
          })
          .where(eq(contractNotices.id, existingCache.id));
      } else {
        await db.insert(contractNotices).values({
          projectId,
          revisionId,
          noticesJson: aiResult,
          contentEtag: contentHash,
          model: actualModel,
          promptVersion
        });
      }
      
      res.json({
        cached: false,
        model: actualModel,
        promptVersion,
        etag: contentHash,
        updatedAt: new Date(),
        data: aiResult
      });
      
    } catch (error: any) {
      console.error('Error generating contract notices:', error);
      res.status(500).json({ 
        error: 'Failed to generate contract notices: ' + (error.message || 'Unknown error')
      });
    }
  });

  // === CONTRACT VIEWER ROUTES ===
  
  // Helper function to verify revision access
  async function verifyRevisionAccess(revisionId: string, person: Person): Promise<boolean> {
    // Super admins have access to all companies
    if (person.isSuperAdmin) {
      console.log('[verifyRevisionAccess] Super admin access granted');
      return true;
    }
    
    const userCompanyId = person.companyId;
    if (!userCompanyId) {
      console.log('[verifyRevisionAccess] No company ID for user');
      return false;
    }
    
    const [revision] = await db
      .select()
      .from(contractReviewDocuments)
      .where(eq(contractReviewDocuments.id, revisionId))
      .limit(1);
    
    if (!revision) {
      console.log('[verifyRevisionAccess] Revision not found:', revisionId);
      return false;
    }
    
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, revision.projectId))
      .limit(1);
    
    if (!project || !project.businessUnitId) {
      console.log('[verifyRevisionAccess] Project not found or missing businessUnitId:', { projectId: revision.projectId, found: !!project, hasBusinessUnit: !!project?.businessUnitId });
      return false;
    }
    
    const [businessUnit] = await db
      .select()
      .from(businessUnits)
      .where(eq(businessUnits.id, project.businessUnitId))
      .limit(1);
    
    if (!businessUnit) {
      console.log('[verifyRevisionAccess] Business unit not found:', project.businessUnitId);
      return false;
    }
    
    const hasAccess = businessUnit.companyId === userCompanyId;
    console.log('[verifyRevisionAccess] Final check:', {
      businessUnitCompanyId: businessUnit.companyId,
      userCompanyId,
      hasAccess
    });
    
    return hasAccess;
  }

  // Get contract metadata (clauses + definitions) for a revision
  app.get('/api/contract-review/revisions/:revisionId/metadata', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Get user's company
      const person = (req as any).person;
      
      // Verify access
      const hasAccess = await verifyRevisionAccess(revisionId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      let [clauses, definitions] = await Promise.all([
        db.select().from(contractClauses).where(eq(contractClauses.revisionId, revisionId)),
        db.select().from(contractDefinitions).where(eq(contractDefinitions.revisionId, revisionId)),
      ]);

      // If no metadata exists, automatically extract it (automatic extraction on first view)
      if (clauses.length === 0 && definitions.length === 0) {
        console.log(`[ContractMetadata] No metadata found for revision ${revisionId}, triggering automatic extraction...`);
        try {
          // Use Claude API extraction with prompt caching (90% cost reduction)
          await extractAndSaveContractMetadata(revisionId);
          
          // Re-query the database to get the saved records
          [clauses, definitions] = await Promise.all([
            db.select().from(contractClauses).where(eq(contractClauses.revisionId, revisionId)),
            db.select().from(contractDefinitions).where(eq(contractDefinitions.revisionId, revisionId)),
          ]);
          console.log(`[ContractMetadata] Automatic extraction complete: ${clauses.length} clauses, ${definitions.length} definitions`);
        } catch (extractError: any) {
          console.error('[ContractMetadata] Automatic extraction failed:', extractError.message);
          console.error('[ContractMetadata] Full error:', extractError);
          // Return empty arrays on extraction failure - don't block the UI
        }
      }

      res.json({ clauses, definitions });
    } catch (error) {
      console.error('Error fetching contract metadata:', error);
      res.status(500).json({ error: 'Failed to fetch contract metadata' });
    }
  });

  // Force regenerate contract metadata (clauses + definitions) for a revision
  app.post('/api/contract-review/revisions/:revisionId/metadata/regenerate', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Get user's company and verify access
      const person = (req as any).person;
      
      const hasAccess = await verifyRevisionAccess(revisionId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Generate unique operation ID
      const operationId = `metadata-extraction-${revisionId}-${Date.now()}`;
      
      // Create progress tracker for Claude API extraction
      const { AIProgressTracker } = await import('./aiProgressTracker');
      const progressTracker = new AIProgressTracker(operationId, [
        { name: 'Starting extraction', weight: 10 },
        { name: 'Extracting metadata with Claude API', weight: 70 },
        { name: 'Saving metadata to database', weight: 20 }
      ]);
      
      // Start extraction in background using Claude API with prompt caching
      (async () => {
        try {
          await extractAndSaveContractMetadata(revisionId, progressTracker);
        } catch (error: any) {
          console.error('Background metadata extraction failed:', error);
          progressTracker.error(error.message || 'Failed to extract metadata');
        }
      })();
      
      // Return operation ID immediately
      res.json({ 
        operationId
      });
    } catch (error: any) {
      console.error('Error starting metadata regeneration:', error);
      res.status(500).json({ error: 'Failed to start metadata regeneration: ' + (error.message || 'Unknown error') });
    }
  });

  // Download contract PDF for viewing
  app.get('/api/contract-review/revisions/:revisionId/download', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Get user's company and verify access
      const person = (req as any).person;
      
      const hasAccess = await verifyRevisionAccess(revisionId, person);
      console.log('[PDF Download] Access check:', { revisionId, companyId: person.companyId, isSuperAdmin: person.isSuperAdmin, hasAccess });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Get revision to find file key
      const [revision] = await db
        .select()
        .from(contractReviewDocuments)
        .where(eq(contractReviewDocuments.id, revisionId))
        .limit(1);
      
      if (!revision || !revision.clientContractFileKey) {
        console.log('[PDF Download] File not found:', { revision: !!revision, hasFileKey: !!revision?.clientContractFileKey });
        return res.status(404).json({ error: 'Contract file not found' });
      }
      
      console.log('[PDF Download] Downloading from object storage:', revision.clientContractFileKey);
      
      // Download file from object storage
      const objectStorage = new ObjectStorageService();
      const file = await objectStorage.getObjectEntityFile(revision.clientContractFileKey);
      const [buffer] = await file.download();
      
      // Serve as PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${revision.clientContractFileName || 'contract.pdf'}"`);
      res.send(buffer);
    } catch (error) {
      console.error('Error downloading contract PDF:', error);
      res.status(500).json({ error: 'Failed to download contract PDF' });
    }
  });

  // Get all sticky notes for a revision
  app.get('/api/contract-review/revisions/:revisionId/notes', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      
      // Get user's company and verify access
      const person = (req as any).person;
      
      const hasAccess = await verifyRevisionAccess(revisionId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const notes = await db
        .select()
        .from(contractNotes)
        .where(eq(contractNotes.revisionId, revisionId))
        .orderBy(contractNotes.createdAt);

      res.json(notes);
    } catch (error) {
      console.error('Error fetching contract notes:', error);
      res.status(500).json({ error: 'Failed to fetch contract notes' });
    }
  });

  // Create a new sticky note
  app.post('/api/contract-review/revisions/:revisionId/notes', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      const { pageIndex, x, y, content } = req.body;
      
      // Get authenticated user and verify access
      const person = (req as any).person;
      
      const hasAccess = await verifyRevisionAccess(revisionId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const authorName = `${person.givenName} ${person.familyName}`;

      const validatedData = insertContractNoteSchema.parse({
        revisionId,
        companyId: person.companyId,
        authorId: person.id,
        authorName,
        pageIndex,
        x,
        y,
        content,
      });

      const [newNote] = await db
        .insert(contractNotes)
        .values(validatedData)
        .returning();

      res.status(201).json(newNote);
    } catch (error) {
      console.error('Error creating contract note:', error);
      res.status(500).json({ error: 'Failed to create contract note' });
    }
  });

  // Update a sticky note
  app.patch('/api/contract-review/notes/:noteId', isAuthenticated, async (req, res) => {
    try {
      const { noteId } = req.params;
      const { content } = req.body;

      const [updatedNote] = await db
        .update(contractNotes)
        .set({ 
          content, 
          updatedAt: new Date() 
        })
        .where(eq(contractNotes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error('Error updating contract note:', error);
      res.status(500).json({ error: 'Failed to update contract note' });
    }
  });

  // Delete a sticky note
  app.delete('/api/contract-review/notes/:noteId', isAuthenticated, async (req, res) => {
    try {
      const { noteId } = req.params;

      await db.delete(contractNotes).where(eq(contractNotes.id, noteId));

      res.status(204).end();
    } catch (error) {
      console.error('Error deleting contract note:', error);
      res.status(500).json({ error: 'Failed to delete contract note' });
    }
  });

  // Get all AI threads for a revision
  app.get('/api/contract-review/revisions/:revisionId/ai-threads', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;

      // Get user's company and verify access
      const person = (req as any).person;
      
      const hasAccess = await verifyRevisionAccess(revisionId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const threads = await db
        .select()
        .from(aiThreads)
        .where(eq(aiThreads.revisionId, revisionId))
        .orderBy(aiThreads.createdAt);

      res.json(threads);
    } catch (error) {
      console.error('Error fetching AI threads:', error);
      res.status(500).json({ error: 'Failed to fetch AI threads' });
    }
  });

  // Create a new AI thread
  app.post('/api/contract-review/revisions/:revisionId/ai-threads', isAuthenticated, async (req, res) => {
    try {
      const { revisionId } = req.params;
      const { anchor, title, firstMessage } = req.body;

      // Get authenticated user and verify access
      const person = (req as any).person;
      
      const hasAccess = await verifyRevisionAccess(revisionId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [newThread] = await db
        .insert(aiThreads)
        .values({
          revisionId,
          companyId: person.companyId,
          anchor,
          title,
          createdBy: person.id,
        })
        .returning();

      // Create first message
      const validatedMessage = insertAiMessageSchema.parse({
        threadId: newThread.id,
        role: 'user',
        content: firstMessage,
      });

      await db.insert(aiMessages).values(validatedMessage);

      // TODO: Optionally call AI and store assistant message

      res.status(201).json(newThread);
    } catch (error) {
      console.error('Error creating AI thread:', error);
      res.status(500).json({ error: 'Failed to create AI thread' });
    }
  });

  // Get all messages for an AI thread
  app.get('/api/ai-threads/:threadId/messages', isAuthenticated, async (req, res) => {
    try {
      const { threadId } = req.params;

      const messages = await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.threadId, threadId))
        .orderBy(aiMessages.createdAt);

      res.json(messages);
    } catch (error) {
      console.error('Error fetching AI thread messages:', error);
      res.status(500).json({ error: 'Failed to fetch AI thread messages' });
    }
  });

  // Add a message to an AI thread
  app.post('/api/ai-threads/:threadId/messages', isAuthenticated, async (req, res) => {
    try {
      const { threadId } = req.params;
      const { content } = req.body;

      const validatedMessage = insertAiMessageSchema.parse({
        threadId,
        role: 'user',
        content,
      });

      const [newMessage] = await db
        .insert(aiMessages)
        .values(validatedMessage)
        .returning();

      // TODO: Call AI provider and persist assistant reply

      res.status(201).json(newMessage);
    } catch (error) {
      console.error('Error adding message to AI thread:', error);
      res.status(500).json({ error: 'Failed to add message to AI thread' });
    }
  });

  // === BOQ (BILL OF QUANTITIES) ROUTES ===

  // Get all BOQ revisions for a project
  app.get('/api/projects/:projectId/boq/revisions', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { boqRevisions } = await import('@shared/schema');

      const revisions = await db
        .select()
        .from(boqRevisions)
        .where(eq(boqRevisions.projectId, projectId))
        .orderBy(boqRevisions.revisionNumber);

      res.json(revisions);
    } catch (error) {
      console.error('Error fetching BOQ revisions:', error);
      res.status(500).json({ error: 'Failed to fetch BOQ revisions' });
    }
  });

  // Get active BOQ revision for a project
  app.get('/api/projects/:projectId/boq/revisions/active', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { boqRevisions } = await import('@shared/schema');

      const [activeRevision] = await db
        .select()
        .from(boqRevisions)
        .where(and(
          eq(boqRevisions.projectId, projectId),
          eq(boqRevisions.isActive, true)
        ))
        .limit(1);

      res.json(activeRevision || null);
    } catch (error) {
      console.error('Error fetching active BOQ revision:', error);
      res.status(500).json({ error: 'Failed to fetch active BOQ revision' });
    }
  });

  // Create new BOQ revision
  app.post('/api/projects/:projectId/boq/revisions', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { revisionName, notes } = req.body;
      
      // Get authenticated user's person ID
      const person = (req as any).person;
      const personId = person.id;

      const { boqRevisions, boqItems } = await import('@shared/schema');

      await db.transaction(async (tx) => {
        // Get current active revision
        const [currentActive] = await tx
          .select()
          .from(boqRevisions)
          .where(and(
            eq(boqRevisions.projectId, projectId),
            eq(boqRevisions.isActive, true)
          ))
          .limit(1);

        let revisionNumber = 1;
        if (currentActive) {
          // Mark current active as inactive
          await tx
            .update(boqRevisions)
            .set({ isActive: false })
            .where(eq(boqRevisions.id, currentActive.id));
          
          revisionNumber = currentActive.revisionNumber + 1;
        }

        // Create new revision
        const [newRevision] = await tx
          .insert(boqRevisions)
          .values({
            projectId,
            revisionNumber,
            revisionName: revisionName || `Revision ${revisionNumber}`,
            notes,
            isActive: true,
            createdById: personId,
          })
          .returning();

        // Copy items from previous revision if exists
        if (currentActive) {
          const previousItems = await tx
            .select()
            .from(boqItems)
            .where(eq(boqItems.revisionId, currentActive.id));

          if (previousItems.length > 0) {
            for (const oldItem of previousItems) {
              const { id, createdAt, updatedAt, ...itemData } = oldItem;
              await tx.insert(boqItems).values({
                ...itemData,
                revisionId: newRevision.id,
              });
            }
          }
        }

        res.status(201).json(newRevision);
      });
    } catch (error) {
      console.error('Error creating BOQ revision:', error);
      res.status(500).json({ error: 'Failed to create BOQ revision' });
    }
  });

  // Get BOQ items for a revision
  app.get('/api/projects/:projectId/boq/items', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { revisionId } = req.query;
      const { boqItems, boqRevisions } = await import('@shared/schema');

      let targetRevisionId = revisionId as string;

      // If no revision specified, get active revision
      if (!targetRevisionId) {
        const [activeRevision] = await db
          .select()
          .from(boqRevisions)
          .where(and(
            eq(boqRevisions.projectId, projectId),
            eq(boqRevisions.isActive, true)
          ))
          .limit(1);

        if (!activeRevision) {
          return res.json([]);
        }
        targetRevisionId = activeRevision.id;
      }

      const items = await db
        .select()
        .from(boqItems)
        .where(eq(boqItems.revisionId, targetRevisionId))
        .orderBy(boqItems.sortingIndex);

      res.json(items);
    } catch (error) {
      console.error('Error fetching BOQ items:', error);
      res.status(500).json({ error: 'Failed to fetch BOQ items' });
    }
  });

  // Create BOQ item
  app.post('/api/projects/:projectId/boq/items', isAuthenticated, async (req, res) => {
    try {
      const itemData = req.body;
      const { boqItems, insertBoqItemSchema } = await import('@shared/schema');

      const validatedData = insertBoqItemSchema.parse(itemData);
      
      let newItem;
      
      // If sortingIndex is provided, shift other items and insert in same transaction
      if (validatedData.sortingIndex !== undefined && validatedData.sortingIndex !== null) {
        newItem = await db.transaction(async (tx) => {
          // Shift items with sortingIndex >= new item's index
          await tx
            .update(boqItems)
            .set({ 
              sortingIndex: sql`${boqItems.sortingIndex} + 1`,
              updatedAt: new Date()
            })
            .where(and(
              eq(boqItems.revisionId, validatedData.revisionId),
              sql`${boqItems.sortingIndex} >= ${validatedData.sortingIndex}`
            ));
          
          // Insert the new item within the same transaction
          const [inserted] = await tx
            .insert(boqItems)
            .values(validatedData)
            .returning();
          
          return inserted;
        });
      } else {
        // No sortingIndex shift needed
        const [inserted] = await db
          .insert(boqItems)
          .values(validatedData)
          .returning();
        
        newItem = inserted;
      }

      res.status(201).json(newItem);
    } catch (error) {
      console.error('Error creating BOQ item:', error);
      res.status(500).json({ error: 'Failed to create BOQ item' });
    }
  });

  // Update BOQ item
  app.put('/api/projects/:projectId/boq/items/:itemId', isAuthenticated, async (req, res) => {
    try {
      const { itemId } = req.params;
      const itemData = req.body;
      const { boqItems } = await import('@shared/schema');

      const [updatedItem] = await db
        .update(boqItems)
        .set({ ...itemData, updatedAt: new Date() })
        .where(eq(boqItems.id, itemId))
        .returning();

      if (!updatedItem) {
        return res.status(404).json({ error: 'BOQ item not found' });
      }

      res.json(updatedItem);
    } catch (error) {
      console.error('Error updating BOQ item:', error);
      res.status(500).json({ error: 'Failed to update BOQ item' });
    }
  });

  // Delete BOQ item
  app.delete('/api/projects/:projectId/boq/items/:itemId', isAuthenticated, async (req, res) => {
    try {
      const { itemId } = req.params;
      const { boqItems } = await import('@shared/schema');

      await db
        .delete(boqItems)
        .where(eq(boqItems.id, itemId));

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting BOQ item:', error);
      res.status(500).json({ error: 'Failed to delete BOQ item' });
    }
  });

  // Reorder BOQ items
  app.post('/api/projects/:projectId/boq/items/reorder', isAuthenticated, async (req, res) => {
    try {
      const { items } = req.body; // Array of {id, sortingIndex}
      const { boqItems } = await import('@shared/schema');

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Invalid request body' });
      }

      // Update each item's sortingIndex
      await db.transaction(async (tx) => {
        for (const item of items) {
          await tx
            .update(boqItems)
            .set({ 
              sortingIndex: item.sortingIndex,
              updatedAt: new Date()
            })
            .where(eq(boqItems.id, item.id));
        }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error reordering BOQ items:', error);
      res.status(500).json({ error: 'Failed to reorder BOQ items' });
    }
  });

  // Get event tag statuses for a project
  app.get('/api/projects/:projectId/boq/event-tag-statuses', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { pEventTagStatuses } = await import('@shared/schema');

      const statuses = await db
        .select()
        .from(pEventTagStatuses)
        .where(eq(pEventTagStatuses.projectId, projectId))
        .orderBy(pEventTagStatuses.sortingIndex);

      res.json(statuses);
    } catch (error) {
      console.error('Error fetching event tag statuses:', error);
      res.status(500).json({ error: 'Failed to fetch event tag statuses' });
    }
  });

  // Seed base event tag statuses
  app.post('/api/projects/:projectId/boq/event-tag-statuses/seed', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { pEventTagStatuses, insertPEventTagStatusSchema } = await import('@shared/schema');

      const baseStatuses = [
        { name: 'Identified', sortingIndex: 0 },
        { name: 'Drafting', sortingIndex: 1 },
        { name: 'Submitted', sortingIndex: 2 },
        { name: 'Queried', sortingIndex: 3 },
        { name: 'Approved', sortingIndex: 4 },
        { name: 'Rejected', sortingIndex: 5 },
        { name: 'On Hold', sortingIndex: 6 },
      ];

      const createdStatuses = [];
      for (const status of baseStatuses) {
        const validatedData = insertPEventTagStatusSchema.parse({
          projectId,
          ...status,
        });
        
        const [created] = await db
          .insert(pEventTagStatuses)
          .values(validatedData)
          .onConflictDoNothing()
          .returning();
        
        if (created) {
          createdStatuses.push(created);
        }
      }

      res.status(201).json(createdStatuses);
    } catch (error) {
      console.error('Error seeding event tag statuses:', error);
      res.status(500).json({ error: 'Failed to seed event tag statuses' });
    }
  });

  // Get pricing basis options for a project
  app.get('/api/projects/:projectId/boq/pricing-basis', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { pPricingBasis } = await import('@shared/schema');

      const pricingBasis = await db
        .select()
        .from(pPricingBasis)
        .where(eq(pPricingBasis.projectId, projectId))
        .orderBy(pPricingBasis.sortingIndex);

      res.json(pricingBasis);
    } catch (error) {
      console.error('Error fetching pricing basis:', error);
      res.status(500).json({ error: 'Failed to fetch pricing basis' });
    }
  });

  // Seed base pricing basis options
  app.post('/api/projects/:projectId/boq/pricing-basis/seed', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { pPricingBasis, insertPPricingBasisSchema } = await import('@shared/schema');

      const basePricingBasis = [
        { name: 'Lump Sum', sortingIndex: 0 },
        { name: 'Rates', sortingIndex: 1 },
        { name: 'Rates + Daywork', sortingIndex: 2 },
        { name: 'Cost Plus', sortingIndex: 3 },
      ];

      const createdPricingBasis = [];
      for (const pricing of basePricingBasis) {
        const validatedData = insertPPricingBasisSchema.parse({
          projectId,
          ...pricing,
        });
        
        const [created] = await db
          .insert(pPricingBasis)
          .values(validatedData)
          .onConflictDoNothing()
          .returning();
        
        if (created) {
          createdPricingBasis.push(created);
        }
      }

      res.status(201).json(createdPricingBasis);
    } catch (error) {
      console.error('Error seeding pricing basis:', error);
      res.status(500).json({ error: 'Failed to seed pricing basis' });
    }
  });

  // BOQ Excel import - preview
  app.post('/api/projects/:projectId/boq/import/preview', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      const { projectId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { parseRawRows, detectHeaderRow } = await import('./utils/excelParser');
      
      const rawRows = await parseRawRows(file.buffer, 25);
      
      // Get suggested header row number (1-indexed)
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer);
      const worksheet = workbook.worksheets[0];
      
      const suggestedHeaderRow = detectHeaderRow(worksheet);

      res.json({
        rawRows,
        headerRowNumber: suggestedHeaderRow,
      });
    } catch (error) {
      console.error('Error previewing BOQ Excel file:', error);
      res.status(500).json({ error: 'Failed to preview Excel file' });
    }
  });

  // In-memory progress tracking for BOQ imports
  const boqImportProgress = new Map<string, {
    total: number;
    current: number;
    status: 'processing' | 'complete' | 'error';
    message?: string;
    importedCount?: number;
    failedCount?: number;
    failedRows?: Array<{ row: number; itemNumber: string; description: string; reason: string }>;
    validationIssues?: Array<{ field: string; missingCount: number }>;
  }>();

  // BOQ Excel import - progress check
  app.get('/api/projects/:projectId/boq/import/progress/:importId', isAuthenticated, (req, res) => {
    const { importId } = req.params;
    const progress = boqImportProgress.get(importId);
    
    if (!progress) {
      return res.status(404).json({ error: 'Import not found' });
    }
    
    res.json(progress);
  });

  // BOQ Excel import - commit
  app.post('/api/projects/:projectId/boq/import/commit', isAuthenticated, upload.single('file'), async (req, res) => {
    const { projectId } = req.params;
    const file = req.file;
    const { revisionId, columnMapping, headerRowNumber, importId, deleteExisting } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!revisionId) {
      return res.status(400).json({ error: 'Revision ID is required' });
    }

    if (!importId) {
      return res.status(400).json({ error: 'Import ID is required' });
    }

    // Start processing async (don't await)
    (async () => {
      try {
        const { parseExcelDataFull } = await import('./utils/excelParser');
        const { boqItems, insertBoqItemSchema } = await import('@shared/schema');

        // Parse column mapping JSON
        const mapping = typeof columnMapping === 'string' 
          ? JSON.parse(columnMapping) 
          : columnMapping;

        // Parse header row number
        const headerRow = headerRowNumber ? parseInt(headerRowNumber.toString()) : 1;

        // Delete existing items if requested
        if (deleteExisting === 'true' || deleteExisting === true) {
          await db.delete(boqItems).where(eq(boqItems.revisionId, revisionId));
          console.log(`[BOQ Import] Deleted existing items for revision ${revisionId}`);
        }

        // Parse all rows from Excel using the user-selected header row
        const excelRows = await parseExcelDataFull(file.buffer, mapping, headerRow);
        
        console.log(`[BOQ Import] Column mapping:`, JSON.stringify(mapping, null, 2));
        console.log(`[BOQ Import] First 3 rows data:`, excelRows.slice(0, 3).map(r => ({
          itemNumber: r.itemNumber,
          description: r.description?.toString().substring(0, 50),
          unit: r.unit,
          quantity: r.quantity,
          rate: r.rate,
        })));

        // Initialize progress
        boqImportProgress.set(importId, {
          total: excelRows.length,
          current: 0,
          status: 'processing',
        });

        // Helper function to safely convert numeric values to strings
        const toNumericString = (value: any): string | null => {
          if (value === null || value === undefined || value === '') return null;
          
          // Handle formula objects - extract result if available
          if (typeof value === 'object') {
            if ('result' in value) value = value.result;
            else if ('formula' in value) return null; // Formula without result, skip
            else if ('sharedFormula' in value) return null; // Shared formula without result, skip
          }
          
          // Convert to number then to string to ensure valid format
          const num = typeof value === 'number' ? value : parseFloat(value.toString());
          return !isNaN(num) && isFinite(num) ? num.toString() : null;
        };

        // Import rows into database
        const importedItems = [];
        const failedRows: Array<{ row: number; itemNumber: string; description: string; reason: string }> = [];
        
        for (let i = 0; i < excelRows.length; i++) {
          const row = excelRows[i];
          try {
            // Convert Excel row to BOQ item format (numeric fields must be strings for Postgres NUMERIC)
            const itemData = {
              revisionId,
              itemNumber: row.itemNumber?.toString() || '',
              description: row.description?.toString() || '',
              unit: row.unit?.toString() || null,
              quantity: toNumericString(row.quantity),
              rate: toNumericString(row.rate),
              amount: toNumericString(row.amount),
              notes: row.notes?.toString() || null,
              sortingIndex: i,
            };

            // Validate and insert
            const validatedData = insertBoqItemSchema.parse(itemData);
            const [created] = await db
              .insert(boqItems)
              .values(validatedData)
              .returning();

            if (created) {
              importedItems.push(created);
            }
          } catch (rowError: any) {
            // Track failure with details
            const reason = rowError?.message || 'Unknown error';
            failedRows.push({
              row: i + 1,
              itemNumber: row.itemNumber?.toString() || '(no item #)',
              description: row.description?.toString()?.substring(0, 100) || '(no description)',
              reason,
            });
            console.error(`Error importing BOQ row ${i + 1}:`, reason, row);
            // Continue with next row
          }

          // Update progress
          boqImportProgress.set(importId, {
            total: excelRows.length,
            current: i + 1,
            status: 'processing',
            importedCount: importedItems.length,
            failedCount: failedRows.length,
          });
        }

        // Post-import validation: check for missing critical fields
        const validationIssues: Array<{ field: string; missingCount: number }> = [];
        const fieldChecks = ['itemNumber', 'description', 'unit', 'quantity', 'rate'];
        
        for (const field of fieldChecks) {
          const missingCount = importedItems.filter(item => 
            item[field as keyof typeof item] === null || 
            item[field as keyof typeof item] === undefined || 
            item[field as keyof typeof item] === ''
          ).length;
          
          if (missingCount > 0) {
            validationIssues.push({ field, missingCount });
            console.log(`[BOQ Import] WARNING: ${missingCount} items missing ${field}`);
          }
        }

        // Mark as complete with summary
        boqImportProgress.set(importId, {
          total: excelRows.length,
          current: excelRows.length,
          status: 'complete',
          message: `Successfully imported ${importedItems.length} of ${excelRows.length} items${failedRows.length > 0 ? ` (${failedRows.length} failed)` : ''}`,
          importedCount: importedItems.length,
          failedCount: failedRows.length,
          failedRows: failedRows.length > 0 ? failedRows : undefined,
          validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
        });

        // Clean up after 1 minute
        setTimeout(() => {
          boqImportProgress.delete(importId);
        }, 60000);
      } catch (error) {
        console.error('Error importing BOQ Excel file:', error);
        boqImportProgress.set(importId, {
          total: 0,
          current: 0,
          status: 'error',
          message: 'Failed to import Excel file',
        });
      }
    })();

    // Return immediately
    res.status(202).json({
      message: 'Import started',
      importId,
    });
  });

  // === GLOBAL VARIABLES ROUTES ===

  // Get all global variables for a project
  app.get('/api/projects/:projectId/global-variables', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { globalVariables } = await import('@shared/schema');

      const variables = await db
        .select()
        .from(globalVariables)
        .where(eq(globalVariables.projectId, projectId))
        .orderBy(globalVariables.variableName);

      res.json(variables);
    } catch (error) {
      console.error('Error fetching global variables:', error);
      res.status(500).json({ error: 'Failed to fetch global variables' });
    }
  });

  // Create a new global variable
  app.post('/api/projects/:projectId/global-variables', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { globalVariables, insertGlobalVariableSchema } = await import('@shared/schema');
      
      const validated = insertGlobalVariableSchema.parse({
        ...req.body,
        projectId,
      });

      const [variable] = await db
        .insert(globalVariables)
        .values(validated)
        .returning();

      // Broadcast WebSocket update
      globalVariablesWS.broadcastToProject(projectId, {
        type: 'global_variable_created',
        data: variable
      });

      res.status(201).json(variable);
    } catch (error: any) {
      console.error('Error creating global variable:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('global_variables_project_variable_unique')) {
        return res.status(409).json({ 
          error: 'Variable name already exists for this project',
          field: 'variableName'
        });
      }
      
      res.status(500).json({ error: 'Failed to create global variable' });
    }
  });

  // Update a global variable
  app.patch('/api/projects/:projectId/global-variables/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, id } = req.params;
      const { globalVariables } = await import('@shared/schema');

      const [variable] = await db
        .update(globalVariables)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(globalVariables.id, id))
        .returning();

      if (!variable) {
        return res.status(404).json({ error: 'Global variable not found' });
      }

      // Broadcast WebSocket update
      globalVariablesWS.broadcastToProject(projectId, {
        type: 'global_variable_updated',
        data: variable
      });

      res.json(variable);
    } catch (error: any) {
      console.error('Error updating global variable:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('global_variables_project_variable_unique')) {
        return res.status(409).json({ 
          error: 'Variable name already exists for this project',
          field: 'variableName'
        });
      }
      
      res.status(500).json({ error: 'Failed to update global variable' });
    }
  });

  // Delete a global variable
  app.delete('/api/projects/:projectId/global-variables/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, id } = req.params;
      const { globalVariables } = await import('@shared/schema');

      const [variable] = await db
        .delete(globalVariables)
        .where(eq(globalVariables.id, id))
        .returning();

      if (!variable) {
        return res.status(404).json({ error: 'Global variable not found' });
      }

      // Broadcast WebSocket update
      globalVariablesWS.broadcastToProject(projectId, {
        type: 'global_variable_deleted',
        data: variable
      });

      res.json(variable);
    } catch (error) {
      console.error('Error deleting global variable:', error);
      res.status(500).json({ error: 'Failed to delete global variable' });
    }
  });

  // === RESOURCE RATES ===

  // Get all resource rates for a project
  app.get('/api/projects/:projectId/resource-rates', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { resourceRates, resourceTypes } = await import('@shared/schema');

      const rates = await db
        .select({
          id: resourceRates.id,
          projectId: resourceRates.projectId,
          resourceTypeId: resourceRates.resourceTypeId,
          resourceTypeName: resourceTypes.resType,
          code: resourceRates.code,
          description: resourceRates.description,
          unit: resourceRates.unit,
          tenderRate: resourceRates.tenderRate,
          costRate: resourceRates.costRate,
          createdAt: resourceRates.createdAt,
          updatedAt: resourceRates.updatedAt,
        })
        .from(resourceRates)
        .leftJoin(resourceTypes, eq(resourceRates.resourceTypeId, resourceTypes.id))
        .where(eq(resourceRates.projectId, projectId));
        // No ORDER BY - let frontend handle all sorting

      res.json(rates);
    } catch (error) {
      console.error('Error fetching resource rates:', error);
      res.status(500).json({ error: 'Failed to fetch resource rates' });
    }
  });

  // Create a new resource rate
  app.post('/api/projects/:projectId/resource-rates', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { resourceRates, insertResourceRateSchema, projects, businessUnits, resourceTypes } = await import('@shared/schema');
      
      const validated = insertResourceRateSchema.parse({
        ...req.body,
        projectId,
      });

      // Validate that resourceTypeId exists and belongs to the project's company
      if (validated.resourceTypeId) {
        const [project] = await db
          .select({
            companyId: businessUnits.companyId
          })
          .from(projects)
          .leftJoin(businessUnits, eq(projects.businessUnitId, businessUnits.id))
          .where(eq(projects.id, projectId))
          .limit(1);

        if (!project || !project.companyId) {
          return res.status(400).json({ error: 'Project not found or has no business unit' });
        }

        // Verify resourceTypeId belongs to this company
        const [resourceType] = await db
          .select()
          .from(resourceTypes)
          .where(and(
            eq(resourceTypes.id, validated.resourceTypeId),
            eq(resourceTypes.companyId, project.companyId)
          ))
          .limit(1);

        if (!resourceType) {
          return res.status(400).json({ 
            error: 'Invalid resource type for this company',
            field: 'resourceTypeId'
          });
        }
      }

      const [rate] = await db
        .insert(resourceRates)
        .values(validated)
        .returning();

      // Fetch the complete rate with resource type info for broadcasting
      const [completeRate] = await db
        .select({
          id: resourceRates.id,
          projectId: resourceRates.projectId,
          resourceTypeId: resourceRates.resourceTypeId,
          resourceTypeName: resourceTypes.resType,
          code: resourceRates.code,
          description: resourceRates.description,
          unit: resourceRates.unit,
          tenderRate: resourceRates.tenderRate,
          costRate: resourceRates.costRate,
          createdAt: resourceRates.createdAt,
          updatedAt: resourceRates.updatedAt,
        })
        .from(resourceRates)
        .leftJoin(resourceTypes, eq(resourceRates.resourceTypeId, resourceTypes.id))
        .where(eq(resourceRates.id, rate.id))
        .limit(1);

      // Broadcast WebSocket update with full resource type info
      resourceRatesWS.broadcastToProject(projectId, {
        type: 'resource_rate_created',
        data: completeRate || rate
      });

      res.status(201).json(completeRate || rate);
    } catch (error: any) {
      console.error('Error creating resource rate:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('resource_rates_project_code_unique')) {
        return res.status(409).json({ 
          error: 'Code already exists for this project',
          field: 'code'
        });
      }

      res.status(500).json({ error: 'Failed to create resource rate' });
    }
  });

  // Update a resource rate
  app.patch('/api/projects/:projectId/resource-rates/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, id } = req.params;
      const { resourceRates, insertResourceRateSchema, projects, businessUnits, resourceTypes } = await import('@shared/schema');

      // Validate and parse request body with partial schema
      const validated = insertResourceRateSchema.partial().parse(req.body);

      // If resourceTypeId is being updated, validate it against company's resource types
      if ('resourceTypeId' in validated && validated.resourceTypeId) {
        // Get project's company ID via business unit
        const [project] = await db
          .select({
            companyId: businessUnits.companyId
          })
          .from(projects)
          .leftJoin(businessUnits, eq(projects.businessUnitId, businessUnits.id))
          .where(eq(projects.id, projectId))
          .limit(1);

        if (!project || !project.companyId) {
          return res.status(400).json({ error: 'Project not found or has no business unit' });
        }

        // Verify resourceTypeId belongs to this company
        const [resourceType] = await db
          .select()
          .from(resourceTypes)
          .where(and(
            eq(resourceTypes.id, validated.resourceTypeId),
            eq(resourceTypes.companyId, project.companyId)
          ))
          .limit(1);

        if (!resourceType) {
          return res.status(400).json({ 
            error: 'Invalid resource type for this company',
            field: 'resourceTypeId'
          });
        }
      }

      // Update with ownership check - only allow updating rates that belong to this project
      const [rate] = await db
        .update(resourceRates)
        .set({
          ...validated,
          updatedAt: new Date(),
        })
        .where(and(
          eq(resourceRates.id, id),
          eq(resourceRates.projectId, projectId)
        ))
        .returning();

      if (!rate) {
        return res.status(404).json({ error: 'Resource rate not found' });
      }

      // Fetch the complete rate with resource type info for broadcasting
      const [completeRate] = await db
        .select({
          id: resourceRates.id,
          projectId: resourceRates.projectId,
          resourceTypeId: resourceRates.resourceTypeId,
          resourceTypeName: resourceTypes.resType,
          code: resourceRates.code,
          description: resourceRates.description,
          unit: resourceRates.unit,
          tenderRate: resourceRates.tenderRate,
          costRate: resourceRates.costRate,
          createdAt: resourceRates.createdAt,
          updatedAt: resourceRates.updatedAt,
        })
        .from(resourceRates)
        .leftJoin(resourceTypes, eq(resourceRates.resourceTypeId, resourceTypes.id))
        .where(eq(resourceRates.id, rate.id))
        .limit(1);

      // Broadcast WebSocket update with full resource type info
      resourceRatesWS.broadcastToProject(projectId, {
        type: 'resource_rate_updated',
        data: completeRate || rate
      });

      res.json(completeRate || rate);
    } catch (error: any) {
      console.error('Error updating resource rate:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('resource_rates_project_code_unique')) {
        return res.status(409).json({ 
          error: 'Code already exists for this project',
          field: 'code'
        });
      }

      res.status(500).json({ error: 'Failed to update resource rate' });
    }
  });

  // Delete a resource rate
  app.delete('/api/projects/:projectId/resource-rates/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, id } = req.params;
      const { resourceRates } = await import('@shared/schema');

      // Delete with ownership check - only allow deleting rates that belong to this project
      const [rate] = await db
        .delete(resourceRates)
        .where(and(
          eq(resourceRates.id, id),
          eq(resourceRates.projectId, projectId)
        ))
        .returning();

      if (!rate) {
        return res.status(404).json({ error: 'Resource rate not found' });
      }

      // Broadcast WebSocket update
      resourceRatesWS.broadcastToProject(projectId, {
        type: 'resource_rate_deleted',
        data: rate
      });

      res.json(rate);
    } catch (error) {
      console.error('Error deleting resource rate:', error);
      res.status(500).json({ error: 'Failed to delete resource rate' });
    }
  });

  // Bulk import resource rates from Excel
  app.post('/api/projects/:projectId/resource-rates/bulk-import', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { rows } = req.body as { rows: Array<{
        resType: string;
        code: string;
        description: string | null;
        unit: string | null;
        tenderRate: string | null;
        costRate: string | null;
      }> };

      if (!rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: 'Invalid request: rows array required' });
      }

      const { resourceRates, projects, businessUnits, resourceTypes } = await import('@shared/schema');

      // Get project's company ID via business unit
      const [project] = await db
        .select({
          companyId: businessUnits.companyId
        })
        .from(projects)
        .leftJoin(businessUnits, eq(projects.businessUnitId, businessUnits.id))
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project || !project.companyId) {
        return res.status(400).json({ error: 'Project not found or has no business unit' });
      }

      // Get existing codes to check for duplicates
      const existingRates = await db
        .select({ code: resourceRates.code })
        .from(resourceRates)
        .where(eq(resourceRates.projectId, projectId));

      const existingCodes = new Set(existingRates.map(r => r.code));

      // Get valid resource types for this company (with IDs)
      const companyResourceTypes = await db
        .select({ id: resourceTypes.id, resType: resourceTypes.resType })
        .from(resourceTypes)
        .where(eq(resourceTypes.companyId, project.companyId));

      // Create lookup map: resType text → ID (with case-insensitive mapping for single letters)
      const resTypeToIdMap = new Map(
        companyResourceTypes.map(rt => [rt.resType.trim(), rt.id])
      );
      
      // Add case-insensitive mappings for single-letter codes (e.g., 'l' → 'L')
      for (const rt of companyResourceTypes) {
        if (rt.resType.length === 1) {
          resTypeToIdMap.set(rt.resType.toLowerCase().trim(), rt.id);
        }
      }

      // Helper function to check if string has alpha characters
      const hasAlphaCharacter = (str: string): boolean => {
        return /[a-zA-Z]/.test(str);
      };

      let imported = 0;
      let skippedDuplicate = 0;
      const errors: string[] = [];
      const unknownResourceTypes: string[] = [];

      // First pass: detect and auto-create unknown resource types
      const seenUnknownTypes = new Set<string>();
      for (const row of rows) {
        const trimmedResType = (row.resType || '').trim();
        if (trimmedResType && hasAlphaCharacter(trimmedResType) && !resTypeToIdMap.has(trimmedResType)) {
          if (!seenUnknownTypes.has(trimmedResType)) {
            unknownResourceTypes.push(trimmedResType);
            seenUnknownTypes.add(trimmedResType);
          }
        }
      }

      // Auto-create unknown resource types
      if (unknownResourceTypes.length > 0) {
        console.log(`[Resource Rates] Auto-creating ${unknownResourceTypes.length} unknown resource types:`, unknownResourceTypes);
        
        // Get max sorting index
        const maxIndexResult = await db
          .select({ maxIndex: sql<number>`COALESCE(MAX(${resourceTypes.sortingIndex}), -1)` })
          .from(resourceTypes)
          .where(eq(resourceTypes.companyId, project.companyId));
        
        let nextIndex = (maxIndexResult[0]?.maxIndex ?? -1) + 1;

        // Create each unknown type
        for (const typeName of unknownResourceTypes) {
          // Auto-uppercase single-letter codes to satisfy database constraint: ^[A-Z]$
          const normalizedTypeName = typeName.length === 1 ? typeName.toUpperCase() : typeName;
          
          const [newType] = await db
            .insert(resourceTypes)
            .values({
              companyId: project.companyId,
              resType: normalizedTypeName,
              resourceDescription: `Auto-created: ${normalizedTypeName}`,
              sortingIndex: nextIndex++,
            })
            .returning({ id: resourceTypes.id, resType: resourceTypes.resType });
          
          // Add to lookup map with BOTH original and normalized names for flexible matching
          resTypeToIdMap.set(newType.resType.trim(), newType.id);
          if (typeName !== normalizedTypeName) {
            resTypeToIdMap.set(typeName.trim(), newType.id); // Allow lowercase 'l' → 'L' mapping
          }
          console.log(`[Resource Rates] Created resource type: ${newType.resType} (ID: ${newType.id})`);
        }
      }

      // Process each row (all types are valid at this point)
      for (const row of rows) {
        try {
          // Server-side validation: trim and validate required fields
          const trimmedResType = (row.resType || '').trim();
          const trimmedCode = (row.code || '').trim();

          // Validate required fields are not empty
          if (!trimmedResType || !trimmedCode) {
            errors.push(`Row with code "${row.code || '(empty)'}": RES_TYPE and CODE are required`);
            continue;
          }

          // Server-side validation: enforce alpha character rule for RES_TYPE
          if (!hasAlphaCharacter(trimmedResType)) {
            errors.push(`Row with code "${trimmedCode}": RES_TYPE must contain at least one alphabetic character (got "${trimmedResType}")`);
            continue;
          }

          // Skip if code already exists (check against trimmed code)
          if (existingCodes.has(trimmedCode)) {
            skippedDuplicate++;
            continue;
          }

          // Lookup resourceTypeId
          const resourceTypeId = resTypeToIdMap.get(trimmedResType);
          if (!resourceTypeId) {
            errors.push(`Row with code "${trimmedCode}": Resource type "${trimmedResType}" not found`);
            continue;
          }

          // Insert the rate with both resourceTypeId (new) and resType (legacy, for transition)
          await db.insert(resourceRates).values({
            projectId,
            resourceTypeId,
            resType: trimmedResType, // Keep legacy field during migration
            code: trimmedCode,
            description: row.description ? row.description.trim() || null : null,
            unit: row.unit ? row.unit.trim() || null : null,
            tenderRate: row.tenderRate,
            costRate: row.costRate,
          });

          // Add to existing codes set
          existingCodes.add(trimmedCode);
          imported++;

          // Broadcast WebSocket update for each import with resource type code
          const [newRate] = await db
            .select({
              id: resourceRates.id,
              projectId: resourceRates.projectId,
              resourceTypeId: resourceRates.resourceTypeId,
              resourceTypeName: resourceTypes.resType,
              code: resourceRates.code,
              description: resourceRates.description,
              unit: resourceRates.unit,
              tenderRate: resourceRates.tenderRate,
              costRate: resourceRates.costRate,
              createdAt: resourceRates.createdAt,
              updatedAt: resourceRates.updatedAt,
            })
            .from(resourceRates)
            .leftJoin(resourceTypes, eq(resourceRates.resourceTypeId, resourceTypes.id))
            .where(and(
              eq(resourceRates.projectId, projectId),
              eq(resourceRates.code, trimmedCode)
            ))
            .limit(1);

          if (newRate) {
            resourceRatesWS.broadcastToProject(projectId, {
              type: 'resource_rate_created',
              data: newRate
            });
          }
        } catch (error: any) {
          errors.push(`Row with code "${row.code || '(unknown)'}": ${error.message}`);
        }
      }

      res.json({
        total: rows.length,
        imported,
        skippedDuplicate,
        errors,
      });
    } catch (error: any) {
      console.error('Error bulk importing resource rates:', error);
      res.status(500).json({ error: 'Failed to bulk import resource rates' });
    }
  });

  // === WORKSHEETS ===

  // Helper function to verify project access
  async function verifyProjectAccess(projectId: string, person: Person): Promise<boolean> {
    console.log('[verifyProjectAccess] Starting verification:', { projectId, personId: person.id, email: person.email, isSuperAdmin: person.isSuperAdmin });
    
    // Super admins have access to all companies
    if (person.isSuperAdmin) {
      console.log('[verifyProjectAccess] User is super admin - access granted');
      return true;
    }
    
    const userCompanyId = person.companyId;
    if (!userCompanyId) {
      console.log('[verifyProjectAccess] User has no companyId - access denied:', { personId: person.id, email: person.email });
      return false;
    }
    
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    
    if (!project || !project.businessUnitId) {
      console.log('[verifyProjectAccess] Project not found or missing businessUnitId:', { projectId, found: !!project, hasBusinessUnit: !!project?.businessUnitId });
      return false;
    }
    
    const [businessUnit] = await db
      .select()
      .from(businessUnits)
      .where(eq(businessUnits.id, project.businessUnitId))
      .limit(1);
    
    if (!businessUnit) {
      console.log('[verifyProjectAccess] Business unit not found:', project.businessUnitId);
      return false;
    }
    
    const hasAccess = businessUnit.companyId === userCompanyId;
    console.log('[verifyProjectAccess] Final check:', {
      businessUnitCompanyId: businessUnit.companyId,
      userCompanyId,
      hasAccess
    });
    
    return hasAccess;
  }

  // Get all worksheets for a project
  app.get('/api/projects/:projectId/worksheets', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheets } = await import('@shared/schema');

      const items = await db
        .select()
        .from(worksheets)
        .where(eq(worksheets.projectId, projectId));

      res.json(items);
    } catch (error) {
      console.error('Error fetching worksheets:', error);
      res.status(500).json({ error: 'Failed to fetch worksheets' });
    }
  });

  // Create a new worksheet
  app.post('/api/projects/:projectId/worksheets', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheets, insertWorksheetSchema } = await import('@shared/schema');
      
      const validated = insertWorksheetSchema.parse({
        ...req.body,
        projectId,
      });

      const [worksheet] = await db
        .insert(worksheets)
        .values(validated)
        .returning();

      // Broadcast WebSocket update
      worksheetsWS.broadcastToProject(projectId, {
        type: 'worksheet_created',
        data: worksheet
      });

      res.status(201).json(worksheet);
    } catch (error: any) {
      console.error('Error creating worksheet:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('worksheets_project_code_unique')) {
        return res.status(409).json({ 
          error: 'Code already exists for this project',
          field: 'wkshtCode'
        });
      }

      res.status(500).json({ error: 'Failed to create worksheet' });
    }
  });

  // Update a worksheet
  app.patch('/api/projects/:projectId/worksheets/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, id } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheets, insertWorksheetSchema } = await import('@shared/schema');

      // Validate and parse request body with partial schema
      const validated = insertWorksheetSchema.partial().parse(req.body);

      // Update with ownership check - only allow updating worksheets that belong to this project
      const [worksheet] = await db
        .update(worksheets)
        .set({
          ...validated,
          updatedAt: new Date(),
        })
        .where(and(
          eq(worksheets.id, id),
          eq(worksheets.projectId, projectId)
        ))
        .returning();

      if (!worksheet) {
        return res.status(404).json({ error: 'Worksheet not found' });
      }

      // Broadcast WebSocket update
      worksheetsWS.broadcastToProject(projectId, {
        type: 'worksheet_updated',
        data: worksheet
      });

      res.json(worksheet);
    } catch (error: any) {
      console.error('Error updating worksheet:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('worksheets_project_code_unique')) {
        return res.status(409).json({ 
          error: 'Code already exists for this project',
          field: 'wkshtCode'
        });
      }

      res.status(500).json({ error: 'Failed to update worksheet' });
    }
  });

  // Reorder worksheets (batch update sortingIndex)
  app.patch('/api/projects/:projectId/worksheets/reorder', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheets } = await import('@shared/schema');
      const { worksheets: reorderedItems } = req.body as { worksheets: { id: string; sortingIndex: number }[] };

      if (!Array.isArray(reorderedItems)) {
        return res.status(400).json({ error: 'Invalid reorder data' });
      }

      // Update all worksheets with new sortingIndex in a transaction
      await db.transaction(async (tx) => {
        for (const item of reorderedItems) {
          await tx
            .update(worksheets)
            .set({ 
              sortingIndex: item.sortingIndex,
              updatedAt: new Date()
            })
            .where(and(
              eq(worksheets.id, item.id),
              eq(worksheets.projectId, projectId)
            ));
        }
      });

      // Broadcast WebSocket update
      worksheetsWS.broadcastToProject(projectId, {
        type: 'worksheets_reordered',
        data: { projectId }
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error reordering worksheets:', error);
      res.status(500).json({ error: 'Failed to reorder worksheets' });
    }
  });

  // Delete a worksheet
  app.delete('/api/projects/:projectId/worksheets/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, id } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheets } = await import('@shared/schema');

      // Delete with ownership check - only allow deleting worksheets that belong to this project
      const [worksheet] = await db
        .delete(worksheets)
        .where(and(
          eq(worksheets.id, id),
          eq(worksheets.projectId, projectId)
        ))
        .returning();

      if (!worksheet) {
        return res.status(404).json({ error: 'Worksheet not found' });
      }

      // Broadcast WebSocket update
      worksheetsWS.broadcastToProject(projectId, {
        type: 'worksheet_deleted',
        data: worksheet
      });

      res.json(worksheet);
    } catch (error) {
      console.error('Error deleting worksheet:', error);
      res.status(500).json({ error: 'Failed to delete worksheet' });
    }
  });

  // === WORKSHEET ITEMS ROUTES ===

  // Get all items for a worksheet
  app.get('/api/projects/:projectId/worksheets/:worksheetId/items', isAuthenticated, async (req, res) => {
    try {
      const { projectId, worksheetId } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheetItems } = await import('@shared/schema');
      
      const items = await db
        .select()
        .from(worksheetItems)
        .where(eq(worksheetItems.worksheetId, worksheetId));

      res.json(items);
    } catch (error) {
      console.error('Error fetching worksheet items:', error);
      res.status(500).json({ error: 'Failed to fetch worksheet items' });
    }
  });

  // Create a new worksheet item
  app.post('/api/projects/:projectId/worksheets/:worksheetId/items', isAuthenticated, async (req, res) => {
    try {
      const { projectId, worksheetId } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheetItems, insertWorksheetItemSchema, resourceRates } = await import('@shared/schema');
      const { parseFormula } = await import('./utils/formulaParser');
      
      const validated = insertWorksheetItemSchema.parse({
        ...req.body,
        worksheetId,
      });

      // Compute result from formula
      const result = parseFormula(validated.formula);

      // Get tender rate from resource if available
      let tenderRate = 0;
      if (validated.resourceRateId) {
        const [resource] = await db
          .select()
          .from(resourceRates)
          .where(eq(resourceRates.id, validated.resourceRateId));
        if (resource) {
          tenderRate = parseFloat(resource.tenderRate || '0');
        }
      }

      // Compute total = tenderRate * result
      const total = Math.round(tenderRate * result * 100) / 100;

      const [item] = await db
        .insert(worksheetItems)
        .values({
          ...validated,
          result: result.toString(),
          total: total.toString(),
        })
        .returning();

      res.status(201).json(item);
    } catch (error: any) {
      console.error('Error creating worksheet item:', error);
      res.status(500).json({ error: 'Failed to create worksheet item' });
    }
  });

  // Update a worksheet item
  app.patch('/api/projects/:projectId/worksheets/:worksheetId/items/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, worksheetId, id } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheetItems, insertWorksheetItemSchema, resourceRates } = await import('@shared/schema');
      const { parseFormula } = await import('./utils/formulaParser');

      // Validate and parse request body with partial schema
      const validated = insertWorksheetItemSchema.partial().parse(req.body);

      // Get the current item to access existing values
      const [currentItem] = await db
        .select()
        .from(worksheetItems)
        .where(and(
          eq(worksheetItems.id, id),
          eq(worksheetItems.worksheetId, worksheetId)
        ));

      if (!currentItem) {
        return res.status(404).json({ error: 'Worksheet item not found' });
      }

      // Determine final formula (use updated or existing)
      const finalFormula = validated.formula !== undefined ? validated.formula : currentItem.formula;
      
      // Compute result from formula
      const result = parseFormula(finalFormula);

      // Determine final resourceRateId (use updated or existing)
      const finalResourceRateId = validated.resourceRateId !== undefined 
        ? validated.resourceRateId 
        : currentItem.resourceRateId;

      // Get tender rate from resource if available
      let tenderRate = 0;
      if (finalResourceRateId) {
        const [resource] = await db
          .select()
          .from(resourceRates)
          .where(eq(resourceRates.id, finalResourceRateId));
        if (resource) {
          tenderRate = parseFloat(resource.tenderRate || '0');
        }
      }

      // Compute total = tenderRate * result
      const total = Math.round(tenderRate * result * 100) / 100;

      // Update with ownership check - only allow updating items that belong to this worksheet
      const [item] = await db
        .update(worksheetItems)
        .set({
          ...validated,
          result: result.toString(),
          total: total.toString(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(worksheetItems.id, id),
          eq(worksheetItems.worksheetId, worksheetId)
        ))
        .returning();

      res.json(item);
    } catch (error: any) {
      console.error('Error updating worksheet item:', error);
      res.status(500).json({ error: 'Failed to update worksheet item' });
    }
  });

  // Delete a worksheet item
  app.delete('/api/projects/:projectId/worksheets/:worksheetId/items/:id', isAuthenticated, async (req, res) => {
    try {
      const { projectId, worksheetId, id } = req.params;
      const person = (req as any).person;
      
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { worksheetItems } = await import('@shared/schema');

      // Delete with ownership check - only allow deleting items that belong to this worksheet
      const [item] = await db
        .delete(worksheetItems)
        .where(and(
          eq(worksheetItems.id, id),
          eq(worksheetItems.worksheetId, worksheetId)
        ))
        .returning();

      if (!item) {
        return res.status(404).json({ error: 'Worksheet item not found' });
      }

      res.json(item);
    } catch (error) {
      console.error('Error deleting worksheet item:', error);
      res.status(500).json({ error: 'Failed to delete worksheet item' });
    }
  });

  // Worksheets Excel import - preview
  app.post('/api/projects/:projectId/worksheets/import/preview', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      const { projectId } = req.params;
      const person = (req as any).person;
      const file = req.file;

      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { parseRawRows, detectHeaderRow } = await import('./utils/excelParser');
      
      const rawRows = await parseRawRows(file.buffer, 25);
      
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer);
      const worksheet = workbook.worksheets[0];
      
      const suggestedHeaderRow = detectHeaderRow(worksheet);

      res.json({
        rawRows,
        headerRowNumber: suggestedHeaderRow,
      });
    } catch (error) {
      console.error('Error previewing Worksheets Excel file:', error);
      res.status(500).json({ error: 'Failed to preview Excel file' });
    }
  });

  // In-memory progress tracking for Worksheets imports
  const worksheetsImportProgress = new Map<string, {
    total: number;
    current: number;
    status: 'processing' | 'complete' | 'error';
    error?: string;
    importedCount?: number;
    failedCount?: number;
    failedRows?: Array<{ row: number; wkshtCode: string; description: string; reason: string }>;
  }>();

  // Worksheets Excel import - progress check
  app.get('/api/projects/:projectId/worksheets/import/progress/:importId', isAuthenticated, (req, res) => {
    const { importId } = req.params;
    const progress = worksheetsImportProgress.get(importId);
    
    if (!progress) {
      return res.status(404).json({ error: 'Import not found' });
    }
    
    res.json(progress);
  });

  // Worksheets Excel import - commit
  app.post('/api/projects/:projectId/worksheets/import/commit', isAuthenticated, upload.single('file'), async (req, res) => {
    const { projectId } = req.params;
    const person = (req as any).person;
    const file = req.file;
    const { columnMapping, headerRowNumber, importId } = req.body;

    try {
      // Verify project access
      const hasAccess = await verifyProjectAccess(projectId, person);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!importId) {
        return res.status(400).json({ error: 'Import ID is required' });
      }

      // Start processing async
      (async () => {
        try {
          const { parseExcelDataFull } = await import('./utils/excelParser');
          const { worksheets, insertWorksheetSchema } = await import('@shared/schema');

          const mapping = typeof columnMapping === 'string' 
            ? JSON.parse(columnMapping) 
            : columnMapping;

          const headerRow = headerRowNumber ? parseInt(headerRowNumber.toString()) : 1;

          const excelRows = await parseExcelDataFull(file.buffer, mapping, headerRow);
          
          console.log(`[Worksheets Import] Starting import of ${excelRows.length} rows`);
          console.log(`[Worksheets Import] Column mapping:`, JSON.stringify(mapping, null, 2));

          worksheetsImportProgress.set(importId, {
            total: excelRows.length,
            current: 0,
            status: 'processing',
            importedCount: 0,
            failedCount: 0,
            failedRows: []
          });

          let importedCount = 0;
          let failedCount = 0;
          const failedRows: Array<{ row: number; wkshtCode: string; description: string; reason: string }> = [];

          for (let i = 0; i < excelRows.length; i++) {
            const rowNum = i + headerRow + 1;
            const row = excelRows[i];

            try {
              const wkshtCode = row.wkshtCode?.toString().trim() || '';
              const description = row.description?.toString().trim() || '';
              const unit = row.unit?.toString().trim() || '';

              if (!wkshtCode) {
                failedRows.push({
                  row: rowNum,
                  wkshtCode: '',
                  description,
                  reason: 'Missing worksheet code'
                });
                failedCount++;
                continue;
              }

              if (!description) {
                failedRows.push({
                  row: rowNum,
                  wkshtCode,
                  description: '',
                  reason: 'Missing description'
                });
                failedCount++;
                continue;
              }

              const validated = insertWorksheetSchema.parse({
                projectId,
                wkshtCode,
                description,
                unit: unit || null,
              });

              const [worksheet] = await db
                .insert(worksheets)
                .values(validated)
                .returning();

              worksheetsWS.broadcastToProject(projectId, {
                type: 'worksheet_created',
                data: worksheet
              });

              importedCount++;
            } catch (error: any) {
              console.error(`[Worksheets Import] Failed to import row ${rowNum}:`, error);
              
              let reason = 'Unknown error';
              if (error.code === '23505') {
                reason = 'Duplicate code';
              } else if (error.message) {
                reason = error.message;
              }

              failedRows.push({
                row: rowNum,
                wkshtCode: row.wkshtCode?.toString() || '',
                description: row.description?.toString() || '',
                reason
              });
              failedCount++;
            }

            worksheetsImportProgress.set(importId, {
              total: excelRows.length,
              current: i + 1,
              status: 'processing',
              importedCount,
              failedCount,
              failedRows
            });
          }

          worksheetsImportProgress.set(importId, {
            total: excelRows.length,
            current: excelRows.length,
            status: 'complete',
            importedCount,
            failedCount,
            failedRows
          });

          console.log(`[Worksheets Import] Complete: ${importedCount} imported, ${failedCount} failed`);

        } catch (error: any) {
          console.error('[Worksheets Import] Fatal error:', error);
          worksheetsImportProgress.set(importId, {
            total: 0,
            current: 0,
            status: 'error',
            error: error.message || 'Unknown error occurred'
          });
        }
      })().catch((error) => {
        console.error('[Worksheets Import] Async handler error:', error);
      });

      res.json({ message: 'Import started', importId });
    } catch (error: any) {
      console.error('[Worksheets Import] Request error:', error);
      res.status(500).json({ error: 'Failed to start import' });
    }
  });

  // === PROCUREMENT: SUBCONTRACT TEMPLATES ===

  // Upload subcontract template PDF
  app.post('/api/companies/:companyId/subcontract-templates/upload', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { companyId } = req.params;
      const { title, definedName } = req.body;

      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.uploadFile(req.file.buffer, req.file.originalname);

      // Extract page count from PDF
      const pdfText = await extractTextFromPDF(req.file.buffer);
      const pageCount = pdfText.split('\n--- Page ').length - 1;

      const { subcontractTemplates, insertSubcontractTemplateSchema } = await import('@shared/schema');
      
      const validated = insertSubcontractTemplateSchema.parse({
        companyId,
        title: title || req.file.originalname,
        definedName: definedName || req.file.originalname.replace('.pdf', ''),
        fileKey: objectPath,
        pageCount: pageCount || 0,
        createdBy: req.user!.id,
      });

      const [template] = await db
        .insert(subcontractTemplates)
        .values(validated)
        .returning();

      res.status(201).json(template);
    } catch (error) {
      console.error('Error uploading template:', error);
      res.status(500).json({ error: 'Failed to upload template' });
    }
  });

  // Upload head contract PDF for a project
  app.post('/api/projects/:projectId/head-contract/upload', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { projectId } = req.params;
      const { projects } = await import('@shared/schema');

      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.uploadFile(req.file.buffer, req.file.originalname);

      const [project] = await db
        .update(projects)
        .set({ headContractFileKey: objectPath })
        .where(eq(projects.id, projectId))
        .returning();

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      res.json({ fileKey: objectPath });
    } catch (error) {
      console.error('Error uploading head contract:', error);
      res.status(500).json({ error: 'Failed to upload head contract' });
    }
  });

  // Upload specifications PDF for a project
  app.post('/api/projects/:projectId/specifications/upload', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { projectId } = req.params;
      const { projects } = await import('@shared/schema');

      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.uploadFile(req.file.buffer, req.file.originalname);

      const [project] = await db
        .update(projects)
        .set({ specificationsFileKey: objectPath })
        .where(eq(projects.id, projectId))
        .returning();

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      res.json({ fileKey: objectPath });
    } catch (error) {
      console.error('Error uploading specifications:', error);
      res.status(500).json({ error: 'Failed to upload specifications' });
    }
  });

  // Get all subcontract templates for a company
  app.get('/api/companies/:companyId/subcontract-templates', isAuthenticated, async (req, res) => {
    try {
      const { companyId } = req.params;
      const { subcontractTemplates } = await import('@shared/schema');

      const templates = await db
        .select()
        .from(subcontractTemplates)
        .where(eq(subcontractTemplates.companyId, companyId))
        .orderBy(desc(subcontractTemplates.createdAt));

      res.json(templates);
    } catch (error) {
      console.error('Error fetching subcontract templates:', error);
      res.status(500).json({ error: 'Failed to fetch subcontract templates' });
    }
  });

  // Create new subcontract template
  app.post('/api/companies/:companyId/subcontract-templates', isAuthenticated, async (req, res) => {
    try {
      const { companyId } = req.params;
      const { subcontractTemplates, insertSubcontractTemplateSchema } = await import('@shared/schema');
      
      const validated = insertSubcontractTemplateSchema.parse({
        ...req.body,
        companyId,
        createdBy: req.user!.id,
      });

      const [template] = await db
        .insert(subcontractTemplates)
        .values(validated)
        .returning();

      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating subcontract template:', error);
      res.status(500).json({ error: 'Failed to create subcontract template' });
    }
  });

  // Get template details
  app.get('/api/subcontract-templates/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { subcontractTemplates } = await import('@shared/schema');

      const [template] = await db
        .select()
        .from(subcontractTemplates)
        .where(eq(subcontractTemplates.id, id))
        .limit(1);

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json(template);
    } catch (error) {
      console.error('Error fetching template:', error);
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  });

  // Update template
  app.patch('/api/subcontract-templates/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { subcontractTemplates } = await import('@shared/schema');

      const [updated] = await db
        .update(subcontractTemplates)
        .set({ 
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(subcontractTemplates.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating template:', error);
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  // Delete template
  app.delete('/api/subcontract-templates/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { subcontractTemplates } = await import('@shared/schema');

      const [deleted] = await db
        .delete(subcontractTemplates)
        .where(eq(subcontractTemplates.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting template:', error);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  // Get all special condition drafts for a project
  app.get('/api/projects/:projectId/special-conditions', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { specialConditionDrafts } = await import('@shared/schema');

      const drafts = await db
        .select()
        .from(specialConditionDrafts)
        .where(eq(specialConditionDrafts.projectId, projectId))
        .orderBy(desc(specialConditionDrafts.version));

      res.json(drafts);
    } catch (error) {
      console.error('Error fetching special condition drafts:', error);
      res.status(500).json({ error: 'Failed to fetch special condition drafts' });
    }
  });

  // Create new special condition draft
  app.post('/api/projects/:projectId/special-conditions', isAuthenticated, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { specialConditionDrafts, insertSpecialConditionDraftSchema, projects, businessUnits } = await import('@shared/schema');
      
      // Get project to retrieve companyId
      const [project] = await db
        .select({ companyId: businessUnits.companyId })
        .from(projects)
        .innerJoin(businessUnits, eq(projects.businessUnitId, businessUnits.id))
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const validated = insertSpecialConditionDraftSchema.parse({
        ...req.body,
        projectId,
        companyId: project.companyId,
        createdBy: req.user!.id,
      });

      const [draft] = await db
        .insert(specialConditionDrafts)
        .values(validated)
        .returning();

      res.status(201).json(draft);
    } catch (error) {
      console.error('Error creating special condition draft:', error);
      res.status(500).json({ error: 'Failed to create special condition draft' });
    }
  });

  // Get draft details with blocks
  app.get('/api/special-conditions/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { specialConditionDrafts, specialConditionBlocks } = await import('@shared/schema');

      const [draft] = await db
        .select()
        .from(specialConditionDrafts)
        .where(eq(specialConditionDrafts.id, id))
        .limit(1);

      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      const blocks = await db
        .select()
        .from(specialConditionBlocks)
        .where(eq(specialConditionBlocks.draftId, id))
        .orderBy(specialConditionBlocks.sort);

      res.json({ draft, blocks });
    } catch (error) {
      console.error('Error fetching draft:', error);
      res.status(500).json({ error: 'Failed to fetch draft' });
    }
  });

  // Update draft
  app.patch('/api/special-conditions/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { specialConditionDrafts } = await import('@shared/schema');

      const [updated] = await db
        .update(specialConditionDrafts)
        .set({ 
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(specialConditionDrafts.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating draft:', error);
      res.status(500).json({ error: 'Failed to update draft' });
    }
  });

  // Delete draft
  app.delete('/api/special-conditions/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { specialConditionDrafts } = await import('@shared/schema');

      const [deleted] = await db
        .delete(specialConditionDrafts)
        .where(eq(specialConditionDrafts.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting draft:', error);
      res.status(500).json({ error: 'Failed to delete draft' });
    }
  });

  // Add block to draft
  app.post('/api/special-conditions/:id/blocks', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { specialConditionBlocks, insertSpecialConditionBlockSchema } = await import('@shared/schema');
      
      const validated = insertSpecialConditionBlockSchema.parse({
        ...req.body,
        draftId: id,
      });

      const [block] = await db
        .insert(specialConditionBlocks)
        .values(validated)
        .returning();

      res.status(201).json(block);
    } catch (error) {
      console.error('Error adding block:', error);
      res.status(500).json({ error: 'Failed to add block' });
    }
  });

  // Update block
  app.patch('/api/special-conditions/:draftId/blocks/:blockId', isAuthenticated, async (req, res) => {
    try {
      const { blockId } = req.params;
      const { specialConditionBlocks } = await import('@shared/schema');

      const [updated] = await db
        .update(specialConditionBlocks)
        .set({ 
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(specialConditionBlocks.id, blockId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Block not found' });
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating block:', error);
      res.status(500).json({ error: 'Failed to update block' });
    }
  });

  // Delete block
  app.delete('/api/special-conditions/:draftId/blocks/:blockId', isAuthenticated, async (req, res) => {
    try {
      const { blockId } = req.params;
      const { specialConditionBlocks } = await import('@shared/schema');

      const [deleted] = await db
        .delete(specialConditionBlocks)
        .where(eq(specialConditionBlocks.id, blockId))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Block not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting block:', error);
      res.status(500).json({ error: 'Failed to delete block' });
    }
  });

  // Generate AI special conditions
  app.post('/api/special-conditions/:id/generate', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { generateSpecialConditions } = await import('./aiSpecialConditions');
      const { specialConditionBlocks } = await import('@shared/schema');

      // Generate special conditions using AI
      const result = await generateSpecialConditions(id, req.user!.id);

      // Clear existing AI-generated blocks
      await db
        .delete(specialConditionBlocks)
        .where(eq(specialConditionBlocks.draftId, id));

      // Insert new blocks
      if (result.blocks.length > 0) {
        await db
          .insert(specialConditionBlocks)
          .values(
            result.blocks.map(block => ({
              ...block,
              draftId: id,
            }))
          );
      }

      res.json({
        success: true,
        blocksGenerated: result.blocks.length,
        usage: result.usage,
      });
    } catch (error: any) {
      console.error('Error generating special conditions:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to generate special conditions' 
      });
    }
  });

  // Export special conditions to DOCX
  app.get('/api/special-conditions/:id/export/docx', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { generateSpecialConditionsWord } = await import('./specialConditionsExport');

      const buffer = await generateSpecialConditionsWord(id);

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="special-conditions-${id}.docx"`,
        'Content-Length': buffer.length,
      });

      res.send(buffer);
    } catch (error: any) {
      console.error('Error exporting special conditions to DOCX:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to export special conditions' 
      });
    }
  });

  // Export special conditions to PDF (redirects to DOCX)
  app.get('/api/special-conditions/:id/export/pdf', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { generateSpecialConditionsPDF } = await import('./specialConditionsExport');

      const result = await generateSpecialConditionsPDF(id);
      
      // Return JSON response suggesting DOCX export instead
      res.status(501).json(result);
    } catch (error: any) {
      console.error('Error handling PDF export request:', error);
      res.status(500).json({ 
        error: 'Failed to process PDF export request. Please use DOCX export.' 
      });
    }
  });

  const httpServer = createServer(app);
  
  // Initialize WebSocket for real-time contract review updates
  contractReviewWS.initialize(httpServer);
  console.log('[WS] Contract Review WebSocket server initialized');
  
  // Initialize WebSocket for real-time risk register updates
  riskRegisterWS.initialize(httpServer);
  console.log('[RiskWS] Risk Register WebSocket server initialized');
  
  // Initialize WebSocket for real-time resource types updates
  resourceTypesWS.initialize(httpServer);
  console.log('[ResourceTypesWS] Resource Types WebSocket server initialized');
  
  // Initialize WebSocket for real-time global variables updates
  globalVariablesWS.initialize(httpServer);
  console.log('[GlobalVariablesWS] Global Variables WebSocket server initialized');
  
  // Initialize WebSocket for real-time resource rates updates
  resourceRatesWS.initialize(httpServer);
  console.log('[ResourceRatesWS] Resource Rates WebSocket server initialized');
  
  // Initialize WebSocket for real-time worksheets updates
  worksheetsWS.initialize(httpServer);
  console.log('[WorksheetsWS] Worksheets WebSocket server initialized');

  return httpServer;
}
