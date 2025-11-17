import { db } from "../db";
import { 
  contractReviewDocuments,
  contractReviewRows,
  contractReviewTemplateSnapshots,
  contractReviewSnapshotRows,
  contractReviewSnapshotCells,
  contractReviewRevisionRows,
  contractReviewRevisionCells,
  templateRows,
  templateColumnConfigs,
} from "@shared/schema";
import { eq, and, sql, asc } from "drizzle-orm";

interface LegacyCell {
  columnId: string;
  type?: 'template' | 'review';
  columnType?: string;
  value?: string;
  employmentRoleId?: string;
  lastEditedAt?: string;
  lastEditedBy?: string;
}

interface MigrationProgress {
  projectId: string;
  templateId: string;
  snapshotId?: string;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

/**
 * Migrates legacy contract review JSONB data to normalized dual-table structure
 * - Creates snapshots for template reference (non-editable columns)
 * - Creates revision rows/cells for working data (editable columns)
 */
export async function migrateContractReviewData() {
  console.log('🚀 Starting contract review migration...');
  
  const results: MigrationProgress[] = [];
  
  try {
    // Step 1: Get all revisions grouped by project and template
    const allRevisions = await db
      .select()
      .from(contractReviewDocuments)
      .orderBy(asc(contractReviewDocuments.createdAt));
    
    if (allRevisions.length === 0) {
      console.log('✅ No revisions to migrate');
      return { success: true, results: [] };
    }
    
    // Group revisions by (projectId, templateId)
    const revisionGroups = new Map<string, typeof allRevisions>();
    
    for (const revision of allRevisions) {
      const key = `${revision.projectId}:${revision.templateId}`;
      if (!revisionGroups.has(key)) {
        revisionGroups.set(key, []);
      }
      revisionGroups.get(key)!.push(revision);
    }
    
    console.log(`📊 Found ${revisionGroups.size} project/template combinations`);
    
    // Step 2: Process each project/template group
    for (const [groupKey, revisions] of Array.from(revisionGroups.entries())) {
      const [projectId, templateId] = groupKey.split(':');
      const progress: MigrationProgress = { projectId, templateId, status: 'pending' };
      
      try {
        await db.transaction(async (tx) => {
          // Step 2a: Check if snapshot already exists (by templateId only - one snapshot per template)
          const existingSnapshot = await tx
            .select()
            .from(contractReviewTemplateSnapshots)
            .where(eq(contractReviewTemplateSnapshots.templateId, templateId))
            .limit(1);
          
          let snapshotId: string;
          
          if (existingSnapshot.length > 0) {
            console.log(`  ⏭️  Snapshot already exists for ${groupKey}`);
            snapshotId = existingSnapshot[0].id;
          } else {
            // Step 2b: Create snapshot from first revision's template
            const firstRevision = revisions[0];
            
            // Get template rows
            const templateRowsData = await tx
              .select()
              .from(templateRows)
              .where(eq(templateRows.templateId, templateId))
              .orderBy(asc(templateRows.rowIndex));
            
            if (templateRowsData.length === 0) {
              throw new Error(`No template rows found for template ${templateId}`);
            }
            
            // Get template column configs
            const columnConfigs = await tx
              .select()
              .from(templateColumnConfigs)
              .where(eq(templateColumnConfigs.templateId, templateId))
              .orderBy(asc(templateColumnConfigs.orderIndex));
            
            // Create snapshot
            const [snapshot] = await tx
              .insert(contractReviewTemplateSnapshots)
              .values({
                templateId,
                createdRevisionId: firstRevision.id,
              })
              .returning();
            
            snapshotId = snapshot.id;
            console.log(`  ✨ Created snapshot ${snapshotId} for ${groupKey}`);
            
            // Create snapshot rows
            const snapshotRowsData = [];
            for (const templateRow of templateRowsData) {
              const [snapshotRow] = await tx
                .insert(contractReviewSnapshotRows)
                .values({
                  snapshotId,
                  templateRowId: templateRow.id,
                  rowIndex: templateRow.rowIndex,
                })
                .returning();
              
              snapshotRowsData.push({ ...snapshotRow, templateRow });
            }
            
            // Create snapshot cells (NON-EDITABLE columns only)
            const nonEditableConfigs = columnConfigs.filter(c => !c.isEditable);
            
            for (const snapshotRowData of snapshotRowsData) {
              const templateCells = (snapshotRowData.templateRow.cells as any[]) || [];
              
              for (const config of nonEditableConfigs) {
                const cell = templateCells.find((c: any) => c.columnId === config.id);
                
                await tx.insert(contractReviewSnapshotCells).values({
                  snapshotRowId: snapshotRowData.id,
                  templateColumnConfigId: config.id,
                  columnHeader: config.columnHeader,
                  value: cell?.value || '',
                  employmentRoleId: cell?.employmentRoleId || null,
                  orderIndex: config.orderIndex,
                });
              }
            }
            
            console.log(`  📝 Created ${snapshotRowsData.length} snapshot rows with non-editable cells`);
          }
          
          progress.snapshotId = snapshotId;
          
          // Step 2c: Create revision rows and cells for each revision
          const snapshotRowsForRevision = await tx
            .select()
            .from(contractReviewSnapshotRows)
            .where(eq(contractReviewSnapshotRows.snapshotId, snapshotId))
            .orderBy(asc(contractReviewSnapshotRows.rowIndex));
          
          // Get column configs for this template
          const columnConfigs = await tx
            .select()
            .from(templateColumnConfigs)
            .where(eq(templateColumnConfigs.templateId, templateId));
          
          const editableConfigs = columnConfigs.filter(c => c.isEditable);
          
          let previousRevisionId: string | null = null;
          
          for (const revision of revisions) {
            // Check if revision rows already exist
            const existingRevisionRows = await tx
              .select()
              .from(contractReviewRevisionRows)
              .where(eq(contractReviewRevisionRows.revisionId, revision.id))
              .limit(1);
            
            if (existingRevisionRows.length > 0) {
              console.log(`  ⏭️  Revision rows already exist for revision ${revision.revisionNumber}`);
              previousRevisionId = revision.id;
              continue;
            }
            
            // Get legacy rows for this revision
            const legacyRows = await tx
              .select()
              .from(contractReviewRows)
              .where(eq(contractReviewRows.contractReviewDocumentId, revision.id))
              .orderBy(asc(contractReviewRows.rowIndex));
            
            // Create revision rows
            for (let i = 0; i < snapshotRowsForRevision.length; i++) {
              const snapshotRow = snapshotRowsForRevision[i];
              const legacyRow = legacyRows[i]; // Should match by rowIndex
              
              const [revisionRow] = await tx
                .insert(contractReviewRevisionRows)
                .values({
                  revisionId: revision.id,
                  snapshotRowId: snapshotRow.id,
                  rowIndex: snapshotRow.rowIndex,
                  sourceRevisionId: previousRevisionId,
                })
                .returning();
              
              // Extract cells from legacy JSONB
              const legacyCells = (legacyRow?.cells as LegacyCell[]) || [];
              
              // Create revision cells for EDITABLE template columns
              for (const config of editableConfigs) {
                const cell = legacyCells.find(c => c.columnId === config.id && c.type === 'template');
                
                if (cell) {
                  await tx.insert(contractReviewRevisionCells).values({
                    revisionRowId: revisionRow.id,
                    columnConfigId: config.id,
                    columnKind: 'template_editable',
                    columnHeader: config.columnHeader,
                    value: cell.value || '',
                    lastEditedBy: cell.lastEditedBy || null,
                    lastEditedAt: cell.lastEditedAt ? new Date(cell.lastEditedAt) : null,
                  });
                }
              }
              
              // Create revision cells for REVIEW columns
              const reviewColumnMap: Record<string, string> = {
                'current_position': 'current_position',
                'clause_ref': 'clause_ref',
                'bid_notes': 'bid_notes',
                'complies': 'complies',
                'proposed_departure': 'proposed_departure',
                'comments': 'comments',
              };
              
              for (const [columnType, columnKind] of Object.entries(reviewColumnMap)) {
                const cell = legacyCells.find(c => c.type === 'review' && c.columnType === columnType);
                
                if (cell) {
                  await tx.insert(contractReviewRevisionCells).values({
                    revisionRowId: revisionRow.id,
                    columnConfigId: null,
                    columnKind,
                    columnHeader: null,
                    value: cell.value || '',
                    lastEditedBy: cell.lastEditedBy || null,
                    lastEditedAt: cell.lastEditedAt ? new Date(cell.lastEditedAt) : null,
                  });
                }
              }
            }
            
            console.log(`  ✅ Migrated revision ${revision.revisionNumber} (${legacyRows.length} rows)`);
            previousRevisionId = revision.id;
          }
        });
        
        progress.status = 'completed';
        console.log(`✅ Completed migration for ${groupKey}`);
        
      } catch (error: any) {
        progress.status = 'failed';
        progress.error = error.message;
        console.error(`❌ Failed to migrate ${groupKey}:`, error);
      }
      
      results.push(progress);
    }
    
    const successful = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    console.log(`\n📊 Migration Summary:`);
    console.log(`  ✅ Successful: ${successful}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📝 Total: ${results.length}`);
    
    return {
      success: failed === 0,
      results,
      summary: { successful, failed, total: results.length }
    };
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Verify migration by comparing data integrity
 */
export async function verifyMigration() {
  console.log('🔍 Verifying migration...');
  
  const issues: string[] = [];
  
  try {
    // Check 1: All revisions should have corresponding revision rows
    const totalRevisions = await db.select({ count: sql<number>`count(*)` })
      .from(contractReviewDocuments);
    
    const totalRevisionRows = await db.select({ count: sql<number>`count(DISTINCT ${contractReviewRevisionRows.revisionId})` })
      .from(contractReviewRevisionRows);
    
    if (totalRevisions[0].count !== totalRevisionRows[0].count) {
      issues.push(`Mismatch: ${totalRevisions[0].count} revisions but ${totalRevisionRows[0].count} have revision rows`);
    }
    
    // Check 2: Legacy row count should match new revision row count
    const legacyRowCount = await db.select({ count: sql<number>`count(*)` })
      .from(contractReviewRows);
    
    const newRowCount = await db.select({ count: sql<number>`count(*)` })
      .from(contractReviewRevisionRows);
    
    if (legacyRowCount[0].count !== newRowCount[0].count) {
      issues.push(`Row count mismatch: ${legacyRowCount[0].count} legacy rows vs ${newRowCount[0].count} new rows`);
    }
    
    console.log('✅ Verification complete');
    console.log(`  Total revisions: ${totalRevisions[0].count}`);
    console.log(`  Total legacy rows: ${legacyRowCount[0].count}`);
    console.log(`  Total new rows: ${newRowCount[0].count}`);
    
    if (issues.length > 0) {
      console.log(`\n⚠️  Issues found:`);
      issues.forEach(issue => console.log(`  - ${issue}`));
      return { success: false, issues };
    }
    
    return { success: true, issues: [] };
    
  } catch (error: any) {
    console.error('❌ Verification failed:', error);
    return { success: false, issues: [error.message] };
  }
}
