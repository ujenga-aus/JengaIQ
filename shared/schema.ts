import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, unique, check, index, numeric, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === REPLIT AUTH SESSION STORAGE ===
// Session storage table for Replit Auth (from javascript_log_in_with_replit blueprint)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Legacy users table - kept for backward compatibility during migration
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// === NEW NORMALIZED SCHEMA ===

// People - HR/contact details
export const people = pgTable("people", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id"), // Nullable for legacy data, will be set for all Replit Auth users
  replitAuthId: varchar("replit_auth_id").unique(), // Links to Replit Auth user.claims.sub
  givenName: text("given_name").notNull(),
  familyName: text("family_name").notNull(),
  email: text("email").notNull(), // Email is not unique since replitAuthId is the stable identifier
  profileImageUrl: text("profile_image_url"), // From Replit Auth
  mobile: text("mobile"),
  employeeNo: text("employee_no"),
  isActive: boolean("is_active").notNull().default(true),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false), // Super admins can access all companies
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPersonSchema = createInsertSchema(people).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof people.$inferSelect;

// User Accounts - login/auth
export const userAccounts = pgTable("user_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserAccountSchema = createInsertSchema(userAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserAccount = z.infer<typeof insertUserAccountSchema>;
export type UserAccount = typeof userAccounts.$inferSelect;

// Roles - organization-wide roles
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
});

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

// Permissions - granular permissions
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  description: text("description"),
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
});

export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

// Role Permissions - maps roles to permissions
export const rolePermissions = pgTable("role_permissions", {
  roleId: varchar("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: { name: "role_permissions_pkey", columns: [table.roleId, table.permissionId] }
}));

export const insertRolePermissionSchema = createInsertSchema(rolePermissions);
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

// User Roles - assigns roles to users with effective dates
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAccountId: varchar("user_account_id").notNull().references(() => userAccounts.id, { onDelete: "cascade" }),
  roleId: varchar("role_id").notNull().references(() => roles.id),
  startDate: text("start_date").notNull().default(sql`CURRENT_DATE::text`),
  endDate: text("end_date"),
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
});

export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

// Employment Roles - job titles/positions within the company
export const employmentRoles = pgTable("employment_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  doaAcronym: text("doa_acronym"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueTitlePerCompany: unique("employment_roles_company_title_unique").on(table.companyId, table.title),
  uniqueDoaAcronymPerCompany: unique("employment_roles_company_doa_acronym_unique").on(table.companyId, table.doaAcronym)
}));

export const insertEmploymentRoleSchema = createInsertSchema(employmentRoles).omit({
  id: true,
  createdAt: true,
});

export type InsertEmploymentRole = z.infer<typeof insertEmploymentRoleSchema>;
export type EmploymentRole = typeof employmentRoles.$inferSelect;

// User Employment History - tracks employment role assignments and promotions
export const userEmploymentHistory = pgTable("user_employment_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAccountId: varchar("user_account_id").notNull().references(() => userAccounts.id, { onDelete: "cascade" }),
  employmentRoleId: varchar("employment_role_id").notNull().references(() => employmentRoles.id),
  startDate: text("start_date").notNull().default(sql`CURRENT_DATE::text`),
  endDate: text("end_date"),
  notes: text("notes"),
  assignedByUserId: varchar("assigned_by_user_id").references(() => userAccounts.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserEmploymentHistorySchema = createInsertSchema(userEmploymentHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertUserEmploymentHistory = z.infer<typeof insertUserEmploymentHistorySchema>;
export type UserEmploymentHistory = typeof userEmploymentHistory.$inferSelect;

// Project Roles - roles specific to projects
export const projectRoles = pgTable("project_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
});

export const insertProjectRoleSchema = createInsertSchema(projectRoles).omit({
  id: true,
});

export type InsertProjectRole = z.infer<typeof insertProjectRoleSchema>;
export type ProjectRole = typeof projectRoles.$inferSelect;

// Project Role Permissions - maps project roles to permissions
export const projectRolePermissions = pgTable("project_role_permissions", {
  projectRoleId: varchar("project_role_id").notNull().references(() => projectRoles.id, { onDelete: "cascade" }),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: { name: "project_role_permissions_pkey", columns: [table.projectRoleId, table.permissionId] }
}));

export const insertProjectRolePermissionSchema = createInsertSchema(projectRolePermissions);
export type InsertProjectRolePermission = z.infer<typeof insertProjectRolePermissionSchema>;
export type ProjectRolePermission = typeof projectRolePermissions.$inferSelect;

// Project Memberships - assigns users to projects with roles
export const projectMemberships = pgTable("project_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userAccountId: varchar("user_account_id").notNull().references(() => userAccounts.id, { onDelete: "cascade" }),
  projectRoleId: varchar("project_role_id").notNull().references(() => projectRoles.id),
  startDate: text("start_date").notNull().default(sql`CURRENT_DATE::text`),
  endDate: text("end_date"),
  assignedByUserId: varchar("assigned_by_user_id").references(() => userAccounts.id),
  notes: text("notes"),
});

export const insertProjectMembershipSchema = createInsertSchema(projectMemberships).omit({
  id: true,
});

export type InsertProjectMembership = z.infer<typeof insertProjectMembershipSchema>;
export type ProjectMembership = typeof projectMemberships.$inferSelect;

// Template Column Configuration
export const templateColumnConfigs = pgTable("template_column_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: text("template_id").notNull(), // References contract_templates.id
  columnHeader: text("column_header").notNull(),
  isEditable: boolean("is_editable").notNull().default(true),
  orderIndex: integer("order_index").notNull(),
  isDoaAcronymColumn: boolean("is_doa_acronym_column").notNull().default(false),
});

export const insertTemplateColumnConfigSchema = createInsertSchema(templateColumnConfigs).omit({
  id: true,
});

export type InsertTemplateColumnConfig = z.infer<typeof insertTemplateColumnConfigSchema>;
export type TemplateColumnConfig = typeof templateColumnConfigs.$inferSelect;

// Template Rows - stores template data relationally with FK to employment roles for DOA columns
export const templateRows = pgTable("template_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: text("template_id").notNull(), // References contract_templates.id
  rowIndex: integer("row_index").notNull(),
  cells: jsonb("cells").notNull(), // Array of {columnId: string, value?: string, employmentRoleId?: string}
});

export const insertTemplateRowSchema = createInsertSchema(templateRows).omit({
  id: true,
});

export type InsertTemplateRow = z.infer<typeof insertTemplateRowSchema>;
export type TemplateRow = typeof templateRows.$inferSelect;

// Contract Review Document (represents a revision)
export const contractReviewDocuments = pgTable("contract_review_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: text("project_id").notNull(),
  templateId: text("template_id").notNull(), // References contract_templates.id
  revisionNumber: integer("revision_number").notNull(),
  clientContractFileName: text("client_contract_file_name"),
  clientContractFileUrl: text("client_contract_file_url"), // Object storage URL
  clientContractFileKey: text("client_contract_file_key"), // Object storage key for deletion
  parsedAssetId: varchar("parsed_asset_id"), // FK to contract_parsed_assets (nullable, set after parsing or copy-forward from previous revision)
  selectedTemplateColumnIds: jsonb("selected_template_column_ids"), // Array of column IDs user wants to see
  notes: text("notes"), // Revision notes
  status: text("status").notNull().default("active"), // 'active' | 'superseded'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const insertContractReviewDocumentSchema = createInsertSchema(contractReviewDocuments).omit({
  id: true,
  createdAt: true,
});

export type InsertContractReviewDocument = z.infer<typeof insertContractReviewDocumentSchema>;
export type ContractReviewDocument = typeof contractReviewDocuments.$inferSelect;

// Contract Review Row (one row per template row, with cells for both template columns and review columns)
// Cell structure in JSONB array:
// - Template columns: {columnId: string, type: 'template', value?: string, employmentRoleId?: string, lastEditedAt?: string, lastEditedBy?: string}
// - Review columns: {columnId: string, type: 'review', columnType: 'current_position'|'clause_ref'|'bid_notes'|'complies'|'proposed_departure'|'comments', value?: string, lastEditedAt?: string, lastEditedBy?: string}
// Note: DOA Comments are in separate contractReviewRowComments table
export const contractReviewRows = pgTable("contract_review_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractReviewDocumentId: varchar("contract_review_document_id").notNull(),
  rowIndex: integer("row_index").notNull(),
  cells: jsonb("cells").notNull(), // Array of cell objects as described above
});

export const insertContractReviewRowSchema = createInsertSchema(contractReviewRows).omit({
  id: true,
});

export type InsertContractReviewRow = z.infer<typeof insertContractReviewRowSchema>;
export type ContractReviewRow = typeof contractReviewRows.$inferSelect;

// Contract Review Row Comments (DOA and general comments)
export const contractReviewRowComments = pgTable("contract_review_row_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractReviewRowId: varchar("contract_review_row_id").notNull(), // References contract_review_rows.id
  revisionId: varchar("revision_id").notNull(), // References contract_review_documents.id
  commentType: text("comment_type").notNull(), // 'general' | 'doa'
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const insertContractReviewRowCommentSchema = createInsertSchema(contractReviewRowComments).omit({
  id: true,
  createdAt: true,
});

export type InsertContractReviewRowComment = z.infer<typeof insertContractReviewRowCommentSchema>;
export type ContractReviewRowComment = typeof contractReviewRowComments.$inferSelect;

// Contract Review Template Snapshots (locked template reference shared across revisions)
export const contractReviewTemplateSnapshots = pgTable("contract_review_template_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => contractTemplates.id, { onDelete: 'cascade' }),
  createdRevisionId: varchar("created_revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // One snapshot per template (shared across all projects using this template)
  uniqueTemplate: unique("template_snapshot_unique").on(table.templateId),
}));

export const insertContractReviewTemplateSnapshotSchema = createInsertSchema(contractReviewTemplateSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertContractReviewTemplateSnapshot = z.infer<typeof insertContractReviewTemplateSnapshotSchema>;
export type ContractReviewTemplateSnapshot = typeof contractReviewTemplateSnapshots.$inferSelect;

// Contract Review Snapshot Rows (row structure from template for non-editable reference)
export const contractReviewSnapshotRows = pgTable("contract_review_snapshot_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotId: varchar("snapshot_id").notNull().references(() => contractReviewTemplateSnapshots.id, { onDelete: 'cascade' }),
  templateRowId: varchar("template_row_id").notNull().references(() => templateRows.id, { onDelete: 'cascade' }),
  rowIndex: integer("row_index").notNull(),
}, (table) => ({
  uniqueSnapshotRow: unique("snapshot_rows_snapshot_template_row_unique").on(table.snapshotId, table.templateRowId),
  uniqueSnapshotRowIndex: unique("snapshot_rows_snapshot_row_index_unique").on(table.snapshotId, table.rowIndex),
}));

export const insertContractReviewSnapshotRowSchema = createInsertSchema(contractReviewSnapshotRows).omit({
  id: true,
});

export type InsertContractReviewSnapshotRow = z.infer<typeof insertContractReviewSnapshotRowSchema>;
export type ContractReviewSnapshotRow = typeof contractReviewSnapshotRows.$inferSelect;

// Contract Review Snapshot Cells (NON-EDITABLE columns from template)
export const contractReviewSnapshotCells = pgTable("contract_review_snapshot_cells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotRowId: varchar("snapshot_row_id").notNull().references(() => contractReviewSnapshotRows.id, { onDelete: 'cascade' }),
  templateColumnConfigId: varchar("template_column_config_id").notNull().references(() => templateColumnConfigs.id, { onDelete: 'cascade' }),
  columnHeader: text("column_header").notNull(),
  value: text("value"),
  employmentRoleId: varchar("employment_role_id").references(() => employmentRoles.id, { onDelete: 'set null' }),
  orderIndex: integer("order_index").notNull(),
}, (table) => ({
  uniqueSnapshotCellColumn: unique("snapshot_cells_row_column_unique").on(table.snapshotRowId, table.templateColumnConfigId),
  uniqueSnapshotCellOrder: unique("snapshot_cells_row_order_unique").on(table.snapshotRowId, table.orderIndex),
}));

export const insertContractReviewSnapshotCellSchema = createInsertSchema(contractReviewSnapshotCells).omit({
  id: true,
});

export type InsertContractReviewSnapshotCell = z.infer<typeof insertContractReviewSnapshotCellSchema>;
export type ContractReviewSnapshotCell = typeof contractReviewSnapshotCells.$inferSelect;

// Contract Review Revision Rows (working data per revision, links to snapshot rows)
export const contractReviewRevisionRows = pgTable("contract_review_revision_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: 'cascade' }),
  snapshotRowId: varchar("snapshot_row_id").notNull().references(() => contractReviewSnapshotRows.id, { onDelete: 'cascade' }),
  rowIndex: integer("row_index").notNull(),
  sourceRevisionId: varchar("source_revision_id").references(() => contractReviewDocuments.id, { onDelete: 'set null' }),
}, (table) => ({
  uniqueRevisionRow: unique("revision_rows_revision_snapshot_row_unique").on(table.revisionId, table.snapshotRowId),
  uniqueRevisionRowIndex: unique("revision_rows_revision_row_index_unique").on(table.revisionId, table.rowIndex),
}));

export const insertContractReviewRevisionRowSchema = createInsertSchema(contractReviewRevisionRows).omit({
  id: true,
});

export type InsertContractReviewRevisionRow = z.infer<typeof insertContractReviewRevisionRowSchema>;
export type ContractReviewRevisionRow = typeof contractReviewRevisionRows.$inferSelect;

// Contract Review Revision Cells (Table 2: Review work columns only)
// Fixed columns: Summary Position, CL Ref, Bid Team Notes, Comply
export const contractReviewRevisionCells = pgTable("contract_review_revision_cells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionRowId: varchar("revision_row_id").notNull().references(() => contractReviewRevisionRows.id, { onDelete: 'cascade' }),
  columnConfigId: varchar("column_config_id").references(() => templateColumnConfigs.id, { onDelete: 'set null' }),
  columnKind: text("column_kind").notNull(),
  columnHeader: text("column_header"),
  value: text("value"),
  originalAiValue: text("original_ai_value"), // Stores original AI-generated text for track changes
  lastEditedBy: text("last_edited_by"),
  lastEditedAt: timestamp("last_edited_at"),
}, (table) => ({
  uniqueRevisionCell: unique("revision_cells_row_kind_config_header_unique").on(table.revisionRowId, table.columnKind, table.columnConfigId, table.columnHeader),
  // Table 2 review work columns only (Proposed Departure and Comments moved to Table 3)
  validColumnKind: check("revision_cells_column_kind_check", sql`${table.columnKind} IN ('template_editable', 'review_work', 'summary_position', 'clause_ref', 'bid_notes', 'complies')`),
}));

export const insertContractReviewRevisionCellSchema = createInsertSchema(contractReviewRevisionCells).omit({
  id: true,
});

export type InsertContractReviewRevisionCell = z.infer<typeof insertContractReviewRevisionCellSchema>;
export type ContractReviewRevisionCell = typeof contractReviewRevisionCells.$inferSelect;

// Contract Document Chunks (for RAG - stores text chunks and embeddings per revision)
export const contractDocumentChunks = pgTable("contract_document_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: 'cascade' }),
  chunkIndex: integer("chunk_index").notNull(), // Order of chunk in document
  chunkText: text("chunk_text").notNull(), // The actual text content
  embedding: text("embedding").notNull(), // JSON string of embedding vector (1536 dimensions for text-embedding-3-small)
  tokenCount: integer("token_count").notNull(), // Number of tokens in this chunk
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueChunk: unique("contract_chunks_revision_index_unique").on(table.revisionId, table.chunkIndex),
}));

export const insertContractDocumentChunkSchema = createInsertSchema(contractDocumentChunks).omit({
  id: true,
  createdAt: true,
});

export type InsertContractDocumentChunk = z.infer<typeof insertContractDocumentChunkSchema>;
export type ContractDocumentChunk = typeof contractDocumentChunks.$inferSelect;

// Cell Chat Messages (conversation about AI analysis per cell)
export const cellChatMessages = pgTable("cell_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cellId: varchar("cell_id").notNull().references(() => contractReviewRevisionCells.id, { onDelete: 'cascade' }),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: 'cascade' }), // For easier querying per revision
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdBy: text("created_by"), // User ID for 'user' role messages, null for 'assistant'
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  validRole: check("cell_chat_role_check", sql`${table.role} IN ('user', 'assistant')`),
}));

export const insertCellChatMessageSchema = createInsertSchema(cellChatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertCellChatMessage = z.infer<typeof insertCellChatMessageSchema>;
export type CellChatMessage = typeof cellChatMessages.$inferSelect;

// Contract Review Approvals (Table 3: DOA approval workflow - one-to-many with revision rows)
// When Comply = "No", lawyer proposes solutions that DOA can approve/reject
export const contractReviewApprovals = pgTable("contract_review_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionRowId: varchar("revision_row_id").notNull().references(() => contractReviewRevisionRows.id, { onDelete: 'cascade' }),
  proposedDeparture: text("proposed_departure"), // Lawyer's proposed solution
  comments: text("comments"), // Lawyer's comments
  status: text("status").notNull().default('pending'), // pending/approved/rejected
  reviewComments: text("review_comments"), // DOA's approval/rejection comments
  reviewedBy: text("reviewed_by"), // User ID who approved/rejected
  reviewedAt: timestamp("reviewed_at"), // When approved/rejected
  createdBy: text("created_by").notNull(), // Lawyer who created proposal
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  validStatus: check("approval_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
}));

export const insertContractReviewApprovalSchema = createInsertSchema(contractReviewApprovals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractReviewApproval = z.infer<typeof insertContractReviewApprovalSchema>;
export type ContractReviewApproval = typeof contractReviewApprovals.$inferSelect;

// AI Usage Log (tracks AI analysis usage for billing/invoicing across all features)
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  formName: text("form_name").notNull(), // 'Contract Review' | 'AI Letter'
  eventType: text("event_type").notNull(), // Contract Review: 'whole'/'row' | AI Letter: 'AI Indexing'/'Letter Drafting'
  modelUsed: text("model_used").notNull(), // e.g., 'gpt-4o', 'gpt-4o-mini', 'o1'
  revisionId: varchar("revision_id").references(() => contractReviewDocuments.id, { onDelete: "cascade" }), // Only for Contract Review
  rowId: varchar("row_id").references(() => contractReviewRevisionRows.id, { onDelete: "set null" }), // Only for Contract Review single row
  letterId: varchar("letter_id"), // Only for AI Letter
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  durationMs: integer("duration_ms"), // Duration in milliseconds
  estimatedCost: text("estimated_cost").notNull(), // Stored as string to preserve decimal precision (e.g., "0.0234")
  clientInvoiceNumber: text("client_invoice_number"), // For billing/invoicing
  notes: text("notes"), // Additional context
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

// Contract Notices (AI-powered notice extraction and caching per contract revision)
export const contractNotices = pgTable("contract_notices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revisionId: varchar("revision_id").notNull(), // References contract_review_documents.id
  noticesJson: jsonb("notices_json").notNull(), // {notices: [], mermaid: "", summary: [], confidence: 0-1, assumptions: []}
  contentEtag: varchar("content_etag", { length: 128 }).notNull(), // sha256(contractContent + promptVersion + model)
  model: varchar("model", { length: 64 }).notNull(), // e.g., "claude-sonnet-4-20250514"
  promptVersion: varchar("prompt_version", { length: 32 }).notNull(), // e.g., "notices-v1"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContractNoticeSchema = createInsertSchema(contractNotices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractNotice = z.infer<typeof insertContractNoticeSchema>;
export type ContractNotice = typeof contractNotices.$inferSelect;

// Business Units
export const businessUnits = pgTable("business_units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  abn: text("abn"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueNamePerCompany: unique("business_units_company_name_unique").on(table.companyId, table.name)
}));

export const insertBusinessUnitSchema = createInsertSchema(businessUnits).omit({
  id: true,
  createdAt: true,
});

export type InsertBusinessUnit = z.infer<typeof insertBusinessUnitSchema>;
export type BusinessUnit = typeof businessUnits.$inferSelect;

// Contract Templates
export const contractTemplates = pgTable("contract_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessUnitId: varchar("business_unit_id").notNull().references(() => businessUnits.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  fileName: text("file_name").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedDate: text("uploaded_date").notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
});

export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type ContractTemplate = typeof contractTemplates.$inferSelect;

// Projects
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectCode: text("project_code").notNull().unique(),
  name: text("name").notNull(),
  client: text("client"),
  location: text("location"),
  businessUnitId: varchar("business_unit_id").references(() => businessUnits.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"), // 'active' | 'onhold' | 'complete'
  phase: text("phase").notNull().default("tender"), // 'tender' | 'delivery' | 'defectsPeriod' | 'closed'
  tenderStartDate: text("tender_start_date"),
  tenderEndDate: text("tender_end_date"),
  deliveryStartDate: text("delivery_start_date"),
  deliveryEndDate: text("delivery_end_date"),
  defectsPeriodStartDate: text("defects_period_start_date"),
  defectsPeriodEndDate: text("defects_period_end_date"),
  closedStartDate: text("closed_start_date"),
  closedEndDate: text("closed_end_date"),
  sharepointFolderPath: text("sharepoint_folder_path"), // SharePoint folder path for AI correspondence search
  contractDocumentPath: text("contract_document_path"), // SharePoint path to Final Contract & Schedules
  contractSpecificationPath: text("contract_specification_path"), // SharePoint path to Contract Specifications
  pstFolderPath: text("pst_folder_path"), // SharePoint path to PST files folder for eDiscovery
  projectRevenue: text("project_revenue"), // Total project revenue for profit margin calculation
  projectProfit: text("project_profit"), // Gross margin/profit amount for risk consequence calculations
  // Procurement: Subcontract Templates
  headContractFileKey: text("head_contract_file_key"), // Object storage key for head contract PDF
  specificationsFileKey: text("specifications_file_key"), // Object storage key for specifications PDF
  subcontractTemplateId: varchar("subcontract_template_id").references(() => subcontractTemplates.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueNamePerBusinessUnit: unique("projects_business_unit_name_unique").on(table.businessUnitId, table.name)
}));

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Companies
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  abn: text("abn"),
  address: text("address"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notes: text("notes"),
  aiExpertPersona: text("ai_expert_persona"),
  aiJurisdiction: text("ai_jurisdiction"),
  aiIndustryFocus: text("ai_industry_focus"),
  aiRiskTolerance: text("ai_risk_tolerance"),
  aiContractReviewModel: text("ai_contract_review_model").default('claude-sonnet-4-20250514'),
  aiLetterModel: text("ai_letter_model").default('claude-sonnet-4-20250514'),
  // Layout preferences
  gridRowSpacing: text("grid_row_spacing").default('narrow'), // narrow, medium, wide
  // Theme colors
  tableHeaderBg: text("table_header_bg").default('#f1f5f9'), // muted bg
  tableHeaderFg: text("table_header_fg").default('#0f172a'), // foreground
  lockedColumnBg: text("locked_column_bg").default('#fef3c7'), // amber-100
  lockedColumnFg: text("locked_column_fg").default('#78350f'), // amber-900
  formBg: text("form_bg").default('#ffffff'), // white
  formBorder: text("form_border").default('#e2e8f0'), // border
  formAccent: text("form_accent").default('#3b82f6'), // blue-500
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// Company Theme Settings
export const companyThemeSettings = pgTable("company_theme_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  rowDensity: text("row_density").notNull().default('wide'), // 'narrow' | 'medium' | 'wide'
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  check("row_density_check", sql`${table.rowDensity} IN ('narrow', 'medium', 'wide')`)
]);

export const insertCompanyThemeSettingsSchema = createInsertSchema(companyThemeSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertCompanyThemeSettings = z.infer<typeof insertCompanyThemeSettingsSchema>;
export type CompanyThemeSettings = typeof companyThemeSettings.$inferSelect;

// Resource Types - Company-wide resource type codes and descriptions with custom sorting
export const resourceTypes = pgTable("resource_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  resType: text("res_type").notNull(),
  resourceDescription: text("resource_description").notNull(),
  sortingIndex: integer("sorting_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("resource_types_company_code_unique").on(table.companyId, table.resType),
  check("resource_code_single_capital", sql`${table.resType} ~ '^[A-Z]$'`)
]);

export const insertResourceTypeSchema = createInsertSchema(resourceTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertResourceType = z.infer<typeof insertResourceTypeSchema>;
export type ResourceType = typeof resourceTypes.$inferSelect;

// RFIs (Request for Information)
export const rfis = pgTable("rfis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  rfiNumber: text("rfi_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"), // 'open' | 'answered' | 'closed'
  priority: text("priority").notNull().default("medium"), // 'low' | 'medium' | 'high'
  raisedBy: text("raised_by").notNull(),
  assignedTo: text("assigned_to"),
  dueDate: text("due_date"),
  isOverdue: boolean("is_overdue").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRFISchema = createInsertSchema(rfis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRFI = z.infer<typeof insertRFISchema>;
export type RFI = typeof rfis.$inferSelect;

// RFI Comments
export const rfiComments = pgTable("rfi_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rfiId: varchar("rfi_id").notNull().references(() => rfis.id, { onDelete: "cascade" }),
  userAccountId: varchar("user_account_id").notNull().references(() => userAccounts.id),
  content: text("content").notNull(),
  attachments: jsonb("attachments"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRFICommentSchema = createInsertSchema(rfiComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRFIComment = z.infer<typeof insertRFICommentSchema>;
export type RFIComment = typeof rfiComments.$inferSelect;

// Extended type for comments with author information
export type RFICommentWithAuthor = RFIComment & {
  authorName: string | null;
  authorFamilyName: string | null;
  authorEmail: string | null;
};

// === CORRESPONDENCE MANAGEMENT SYSTEM ===

// Project SharePoint Settings - stores SharePoint connection details per project
export const projectSharePointSettings = pgTable("project_sharepoint_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sharePointSiteUrl: text("sharepoint_site_url").notNull(),
  correspondenceFolderPath: text("correspondence_folder_path").notNull(),
  siteId: text("site_id"), // Microsoft Graph site ID
  driveId: text("drive_id"), // Microsoft Graph drive ID
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSharePointSettingsSchema = createInsertSchema(projectSharePointSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectSharePointSettings = z.infer<typeof insertProjectSharePointSettingsSchema>;
export type ProjectSharePointSettings = typeof projectSharePointSettings.$inferSelect;

// Correspondence Letters - stores uploaded letters and SharePoint documents with AI embeddings
export const correspondenceLetters = pgTable("correspondence_letters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  letterNumber: integer("letter_number").notNull(), // Sequential number per project (Letter #1, #2, #3...)
  sharePointFileId: text("sharepoint_file_id"), // Microsoft Graph file ID if from SharePoint
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"), // Object storage or SharePoint URL
  fileKey: text("file_key"), // Object storage key for deletion
  extractedText: text("extracted_text"), // PDF text extraction
  embeddingVector: text("embedding_vector"), // OpenAI embedding as JSON array string
  sender: text("sender"),
  recipient: text("recipient"),
  subject: text("subject"),
  letterDate: text("letter_date"),
  category: text("category"), // 'claim', 'variation', 'notice', 'general', etc.
  source: text("source").notNull().default("upload"), // 'upload' | 'sharepoint'
  uploadedBy: varchar("uploaded_by").references(() => userAccounts.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Unique letter number per project
  uniqueLetterNumberPerProject: unique("correspondence_letters_project_number_unique").on(table.projectId, table.letterNumber)
}));

export const insertCorrespondenceLetterSchema = createInsertSchema(correspondenceLetters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCorrespondenceLetter = z.infer<typeof insertCorrespondenceLetterSchema>;
export type CorrespondenceLetter = typeof correspondenceLetters.$inferSelect;

// Correspondence Responses - stores AI-generated responses
export const correspondenceResponses = pgTable("correspondence_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  originalLetterId: varchar("original_letter_id").notNull().references(() => correspondenceLetters.id, { onDelete: "cascade" }),
  referenceLetterIds: jsonb("reference_letter_ids"), // Array of letter IDs used as references
  customInstructions: text("custom_instructions"),
  generatedResponse: text("generated_response").notNull(),
  aiModel: text("ai_model").notNull().default("gpt-4o"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalCost: text("total_cost"), // Stored as string to preserve precision
  status: text("status").notNull().default("draft"), // 'draft' | 'reviewed' | 'sent'
  createdBy: varchar("created_by").notNull().references(() => userAccounts.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCorrespondenceResponseSchema = createInsertSchema(correspondenceResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCorrespondenceResponse = z.infer<typeof insertCorrespondenceResponseSchema>;
export type CorrespondenceResponse = typeof correspondenceResponses.$inferSelect;

// Correspondence User Layout Preferences - saves user's panel layout preferences
export const correspondenceUserLayoutPreferences = pgTable("correspondence_user_layout_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAccountId: varchar("user_account_id").notNull().references(() => userAccounts.id, { onDelete: "cascade" }),
  layoutData: jsonb("layout_data").notNull(), // Stores panel sizes as {redBox: number, yellowBox: number, etc.}
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueUserLayout: unique("correspondence_user_layout_unique").on(table.userAccountId)
}));

export const insertCorrespondenceUserLayoutPreferencesSchema = createInsertSchema(correspondenceUserLayoutPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCorrespondenceUserLayoutPreferences = z.infer<typeof insertCorrespondenceUserLayoutPreferencesSchema>;
export type CorrespondenceUserLayoutPreferences = typeof correspondenceUserLayoutPreferences.$inferSelect;

// Programs - Primavera P6 XER files with Gantt chart data
export const programs = pgTable("programs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fileKey: text("file_key").notNull(), // Object storage key
  fileSize: integer("file_size").notNull(),
  dataDate: text("data_date"), // Progress/status date from XER file (YYYY-MM-DD format)
  isContractBaseline: boolean("is_contract_baseline").notNull().default(false),
  isBaselineApproved: boolean("is_baseline_approved").notNull().default(false),
  comments: text("comments"),
  xerData: jsonb("xer_data"), // Parsed XER data (tasks, calendars, etc.)
  insights: jsonb("insights"), // AI-generated schedule quality insights
  uploadedByUserId: varchar("uploaded_by_user_id").notNull().references(() => userAccounts.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const insertProgramSchema = createInsertSchema(programs).omit({
  id: true,
  uploadedAt: true,
});

export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programs.$inferSelect;

// === RISK REGISTER ===

// Likelihood Scales - Project-level likelihood rating definitions
export const likelihoodScales = pgTable("likelihood_scales", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  level: integer("level").notNull(), // 1-5
  label: text("label").notNull(), // e.g., "Rare", "Unlikely", "Possible", "Likely", "Almost Certain"
  description: text("description"),
  probability: integer("probability"), // Optional % value for reference
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniq: unique().on(table.projectId, table.level)
}));

export const insertLikelihoodScaleSchema = createInsertSchema(likelihoodScales).omit({
  id: true,
  createdAt: true,
});

export type InsertLikelihoodScale = z.infer<typeof insertLikelihoodScaleSchema>;
export type LikelihoodScale = typeof likelihoodScales.$inferSelect;

// Consequence Scales - Project-level consequence rating definitions
export const consequenceScales = pgTable("consequence_scales", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(), // "Cost", "Time", "Reputation", "Zero-Harm"
  level: integer("level").notNull(), // 1-6
  label: text("label").notNull(), // e.g., "Insignificant", "Minor", "Moderate", "Major", "Severe", "Catastrophic"
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniq: unique().on(table.projectId, table.dimension, table.level)
}));

export const insertConsequenceScaleSchema = createInsertSchema(consequenceScales).omit({
  id: true,
  createdAt: true,
});

export type InsertConsequenceScale = z.infer<typeof insertConsequenceScaleSchema>;
export type ConsequenceScale = typeof consequenceScales.$inferSelect;

// Heat Map Matrix - Maps risk scores to bands (A/B/C/D)
export const heatmapMatrix = pgTable("heatmap_matrix", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  likelihood: integer("likelihood").notNull(), // 1-5
  impact: integer("impact").notNull(), // 1-6
  band: integer("band").notNull(), // 1-4 (Low=1, Medium=2, High=3, Critical=4)
  colorCode: varchar("color_code"), // Hex color for heat map cell
});

export const insertHeatmapMatrixSchema = createInsertSchema(heatmapMatrix).omit({
  id: true,
});

export type InsertHeatmapMatrix = z.infer<typeof insertHeatmapMatrixSchema>;
export type HeatmapMatrix = typeof heatmapMatrix.$inferSelect;

// Escalation Rules - Basic escalation triggers (legacy)
export const escalationRules = pgTable("escalation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  triggerBand: integer("trigger_band").notNull(),
  escalateToId: varchar("escalate_to_id").references(() => people.id),
  notificationEnabled: boolean("notification_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// DOA Escalation Matrix - Delegation of Authority and approval workflows
export const doaEscalationMatrix = pgTable("doa_escalation_matrix", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  band: integer("band").notNull(), // 1-4 (Low=1, Medium=2, High=3, Critical=4)
  riskOrOpportunity: text("risk_or_opportunity").notNull().default("risk"), // "risk" or "opportunity"
  // Organizational levels for escalation
  groupLevel: text("group_level"), // e.g., "ExCo"
  divisionLevel: text("division_level"), // e.g., "Div ELT"
  businessUnitLevel: text("business_unit_level"), // e.g., "BU ELT", "PM Contract Manager"
  projectLevel: text("project_level"), // e.g., "COO", "EGM", "GM", "PM"
  // Required responses
  requiredActions: text("required_actions"), // Actions to be taken
  monitoringRequirements: text("monitoring_requirements"), // Monitoring and review procedures
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniq: unique().on(table.projectId, table.band, table.riskOrOpportunity)
}));

export const insertEscalationRuleSchema = createInsertSchema(escalationRules).omit({
  id: true,
  createdAt: true,
});

export type InsertEscalationRule = z.infer<typeof insertEscalationRuleSchema>;
export type EscalationRule = typeof escalationRules.$inferSelect;

export const insertDoaEscalationMatrixSchema = createInsertSchema(doaEscalationMatrix).omit({
  id: true,
  createdAt: true,
});

export type InsertDoaEscalationMatrix = z.infer<typeof insertDoaEscalationMatrixSchema>;
export type DoaEscalationMatrix = typeof doaEscalationMatrix.$inferSelect;

// Quantitative Settings - Monte Carlo simulation settings per project
export const quantSettings = pgTable("quant_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }).unique(),
  enabled: boolean("enabled").notNull().default(false),
  iterations: integer("iterations").notNull().default(5000), // Monte Carlo iterations
  confidence: integer("confidence").notNull().default(90), // Confidence level for P10/P90
  seed: integer("seed"), // Random seed for reproducibility
  lastRun: timestamp("last_run"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertQuantSettingSchema = createInsertSchema(quantSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuantSetting = z.infer<typeof insertQuantSettingSchema>;
export type QuantSetting = typeof quantSettings.$inferSelect;

// Risk Register Revisions - Version control for risk register
export const riskRegisterRevisions = pgTable("risk_register_revisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  revisionName: text("revision_name").notNull(), // e.g., "Tender Stage", "Post-Award", "Mid-Project Review"
  notes: text("notes"),
  status: text("status").notNull().default("active"), // "active" | "superseded"
  createdById: varchar("created_by_id").notNull().references(() => people.id),
  // Monte Carlo settings
  monteCarloIterations: integer("monte_carlo_iterations").notNull().default(10000), // Number of simulation iterations
  targetPercentile: integer("target_percentile").notNull().default(80), // Target P Value for position (e.g., 80 for P80)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqRevisionNumber: unique().on(table.projectId, table.revisionNumber)
}));

export const insertRiskRegisterRevisionSchema = createInsertSchema(riskRegisterRevisions).omit({
  id: true,
  createdAt: true,
});

export type InsertRiskRegisterRevision = z.infer<typeof insertRiskRegisterRevisionSchema>;
export type RiskRegisterRevision = typeof riskRegisterRevisions.$inferSelect;

// Risks - Main risk register table
export const risks = pgTable("risks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => riskRegisterRevisions.id, { onDelete: "cascade" }),
  riskNumber: varchar("risk_number").notNull(), // e.g., "R001" or "O001"
  title: varchar("title").notNull(),
  description: text("description"),
  ownerId: varchar("owner_id").references(() => people.id),
  riskType: text("risk_type").notNull().default('threat'), // "threat" or "opportunity"
  
  // Analysis fields
  potentialCauses: text("potential_causes"),
  potentialImpacts: text("potential_impacts"),
  existingControls: text("existing_controls"),
  existingControlsStatus: text("existing_controls_status"), // "green" | "amber" | "red"
  
  // Consequence Rating
  consequenceTypeId: varchar("consequence_type_id").references(() => consequenceTypes.id),
  consequenceLevel: integer("consequence_level"), // 1-6
  
  // Quantitative fields (Three-point estimate)
  optimisticP10: integer("optimistic_p10"), // Dollars
  likelyP50: integer("likely_p50"), // Dollars
  pessimisticP90: integer("pessimistic_p90"), // Dollars
  probability: integer("probability"), // Percentage 0-100
  
  // Probability Distribution Model for Monte Carlo simulation
  distributionModel: text("distribution_model"), // "normal" | "triangular" | "pert" | "uniform" | "lognormal" | "weibull"
  isDistributionAiSelected: boolean("is_distribution_ai_selected").default(false), // Tracks if AI selected or user selected
  
  // Treatment fields
  treatmentDescription: text("treatment_description"),
  treatmentOwnerId: varchar("treatment_owner_id").references(() => people.id),
  treatmentDate: text("treatment_date"), // YYYY-MM-DD
  
  createdById: varchar("created_by_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqNumber: unique().on(table.revisionId, table.riskNumber)
}));

export const insertRiskSchema = createInsertSchema(risks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).refine(
  (data) => {
    // Validate that riskNumber starts with R or O
    if (data.riskNumber) {
      return /^[RO]\d+$/.test(data.riskNumber);
    }
    return true;
  },
  {
    message: "Risk number must start with 'R' (Risk) or 'O' (Opportunity) followed by numbers",
    path: ["riskNumber"],
  }
).refine(
  (data) => {
    // Validate that riskNumber prefix matches riskType
    if (data.riskNumber && data.riskType) {
      const prefix = data.riskNumber.charAt(0);
      if (data.riskType === 'opportunity' && prefix !== 'O') {
        return false;
      }
      if (data.riskType === 'threat' && prefix !== 'R') {
        return false;
      }
    }
    return true;
  },
  {
    message: "Risk number prefix must match type: 'R' for threats, 'O' for opportunities",
    path: ["riskNumber"],
  }
);

export type InsertRisk = z.infer<typeof insertRiskSchema>;
export type Risk = typeof risks.$inferSelect;

// Monte Carlo Simulation Snapshots - Stores simulation results for dashboard display
export const monteCarloSnapshots = pgTable("monte_carlo_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => riskRegisterRevisions.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  
  // Simulation parameters
  iterations: integer("iterations").notNull(),
  targetPercentile: integer("target_percentile").notNull(),
  
  // Summary results
  p10: integer("p10").notNull(),
  p50: integer("p50").notNull(),
  p90: integer("p90").notNull(),
  mean: integer("mean").notNull(),
  stdDev: integer("std_dev").notNull(),
  base: integer("base").notNull(),
  targetValue: integer("target_value").notNull(),
  
  // Full data for charts (stored as JSON)
  distribution: jsonb("distribution").notNull(), // Array of all iteration results for histogram
  percentileTable: jsonb("percentile_table").notNull(), // Array of {percentile, value} for probability bands
  sensitivityAnalysis: jsonb("sensitivity_analysis").notNull(), // Array of {riskId, riskNumber, title, varianceContribution} for tornado chart
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMonteCarloSnapshotSchema = createInsertSchema(monteCarloSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertMonteCarloSnapshot = z.infer<typeof insertMonteCarloSnapshotSchema>;
export type MonteCarloSnapshot = typeof monteCarloSnapshots.$inferSelect;

// Consequence Types - Defines impact categories (Financial, Time, + custom)
export const consequenceTypes = pgTable("consequence_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., "Financial", "Time", "Client/Reputation", "Zero Harm"
  isDefault: boolean("is_default").notNull().default(false), // true for Financial and Time
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqName: unique().on(table.projectId, table.name)
}));

export const insertConsequenceTypeSchema = createInsertSchema(consequenceTypes).omit({
  id: true,
  createdAt: true,
});

export type InsertConsequenceType = z.infer<typeof insertConsequenceTypeSchema>;
export type ConsequenceType = typeof consequenceTypes.$inferSelect;

// Consequence Ratings - Matrix of level (1-6) x consequence type with descriptions
export const consequenceRatings = pgTable("consequence_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  consequenceTypeId: varchar("consequence_type_id").notNull().references(() => consequenceTypes.id, { onDelete: "cascade" }),
  level: integer("level").notNull(), // 1-6
  description: text("description"), // User-defined description for this level
  numericValue: integer("numeric_value"), // For Financial/Time - calculated value
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqLevelType: unique().on(table.consequenceTypeId, table.level)
}));

export const insertConsequenceRatingSchema = createInsertSchema(consequenceRatings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConsequenceRating = z.infer<typeof insertConsequenceRatingSchema>;
export type ConsequenceRating = typeof consequenceRatings.$inferSelect;

// Risk Actions - Actions to mitigate risks
export const riskActions = pgTable("risk_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  riskId: varchar("risk_id").notNull().references(() => risks.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  ownerId: varchar("owner_id").references(() => people.id),
  dueDate: text("due_date"), // YYYY-MM-DD
  cost: integer("cost"), // Dollars
  status: text("status").notNull().default('open'), // "open", "in_progress", "completed", "cancelled"
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdById: varchar("created_by_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRiskActionSchema = createInsertSchema(riskActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRiskAction = z.infer<typeof insertRiskActionSchema>;
export type RiskAction = typeof riskActions.$inferSelect;

// Risk Reviews - Review history
export const riskReviews = pgTable("risk_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  riskId: varchar("risk_id").notNull().references(() => risks.id, { onDelete: "cascade" }),
  reviewerId: varchar("reviewer_id").notNull().references(() => people.id),
  notes: text("notes"),
  nextReviewDate: text("next_review_date"), // YYYY-MM-DD
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
});

export const insertRiskReviewSchema = createInsertSchema(riskReviews).omit({
  id: true,
  reviewedAt: true,
});

export type InsertRiskReview = z.infer<typeof insertRiskReviewSchema>;
export type RiskReview = typeof riskReviews.$inferSelect;

// Risk Attachments - File attachments
export const riskAttachments = pgTable("risk_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  riskId: varchar("risk_id").notNull().references(() => risks.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  fileKey: text("file_key").notNull(), // Object storage key
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type"),
  uploadedById: varchar("uploaded_by_id").notNull().references(() => people.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const insertRiskAttachmentSchema = createInsertSchema(riskAttachments).omit({
  id: true,
  uploadedAt: true,
});

export type InsertRiskAttachment = z.infer<typeof insertRiskAttachmentSchema>;
export type RiskAttachment = typeof riskAttachments.$inferSelect;

// Risk Correlation Groups - For Monte Carlo correlation modeling
export const riskCorrelationGroups = pgTable("risk_correlation_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., "Productivity", "Materials", "Weather"
  correlation: integer("correlation").notNull().default(70), // Rank correlation coefficient (0-100)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRiskCorrelationGroupSchema = createInsertSchema(riskCorrelationGroups).omit({
  id: true,
  createdAt: true,
});

export type InsertRiskCorrelationGroup = z.infer<typeof insertRiskCorrelationGroupSchema>;
export type RiskCorrelationGroup = typeof riskCorrelationGroups.$inferSelect;

// Risk Correlation Memberships - Assigns risks to correlation groups
export const riskCorrelationMemberships = pgTable("risk_correlation_memberships", {
  riskId: varchar("risk_id").notNull().references(() => risks.id, { onDelete: "cascade" }),
  groupId: varchar("group_id").notNull().references(() => riskCorrelationGroups.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: { name: "risk_correlation_memberships_pkey", columns: [table.riskId, table.groupId] }
}));

export const insertRiskCorrelationMembershipSchema = createInsertSchema(riskCorrelationMemberships);
export type InsertRiskCorrelationMembership = z.infer<typeof insertRiskCorrelationMembershipSchema>;
export type RiskCorrelationMembership = typeof riskCorrelationMemberships.$inferSelect;

// Monte Carlo Results - Cached simulation results
export const monteCarloResults = pgTable("monte_carlo_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  iterations: integer("iterations").notNull(),
  costP10: integer("cost_p10"),
  costP50: integer("cost_p50"),
  costP90: integer("cost_p90"),
  scheduleP10: integer("schedule_p10"), // Days
  scheduleP50: integer("schedule_p50"), // Days
  scheduleP90: integer("schedule_p90"), // Days
  tornadoData: jsonb("tornado_data"), // Top sensitivity drivers
  emvByBucket: jsonb("emv_by_bucket"), // EMV summary by contingency bucket
  runAt: timestamp("run_at").notNull().defaultNow(),
  runById: varchar("run_by_id").notNull().references(() => people.id),
});

export const insertMonteCarloResultSchema = createInsertSchema(monteCarloResults).omit({
  id: true,
  runAt: true,
});

export type InsertMonteCarloResult = z.infer<typeof insertMonteCarloResultSchema>;
export type MonteCarloResult = typeof monteCarloResults.$inferSelect;

// User Risk Column Preferences - Store column visibility, order, and widths per user
export const userRiskColumnPreferences = pgTable("user_risk_column_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  visibleColumns: jsonb("visible_columns").notNull(), // Array of column keys
  columnOrder: jsonb("column_order").notNull(), // Array of column keys in display order
  columnWidths: jsonb("column_widths"), // Object mapping column keys to widths in pixels
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqPerson: unique().on(table.personId) // One preferences record per user
}));

export const insertUserRiskColumnPreferencesSchema = createInsertSchema(userRiskColumnPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserRiskColumnPreferences = z.infer<typeof insertUserRiskColumnPreferencesSchema>;
export type UserRiskColumnPreferences = typeof userRiskColumnPreferences.$inferSelect;

// === eDiscovery (PST Email Processing) ===

// eDiscovery Uploads - Tracks PST file uploads and processing status
export const ediscoveryUploads = pgTable("ediscovery_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }), // Optional: link to project
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(), // Object storage key or local path
  sourcePath: text("source_path"), // SharePoint path where PST was discovered
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(), // SHA-256 hash for integrity
  status: text("status").notNull().default("pending"), // pending|processing|complete|failed
  error: text("error"), // Error message if failed
  emailCount: integer("email_count").default(0), // Total emails extracted
  attachmentCount: integer("attachment_count").default(0), // Total attachments found
  progressPct: integer("progress_pct").default(0), // Processing progress 0-100
  scanDetectedAt: timestamp("scan_detected_at"), // When auto-scan first found this PST
  uploadedById: varchar("uploaded_by_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  companyIdx: index("ediscovery_uploads_company_idx").on(table.companyId),
  statusIdx: index("ediscovery_uploads_status_idx").on(table.status),
  projectIdx: index("ediscovery_uploads_project_idx").on(table.projectId),
}));

export const insertEdiscoveryUploadSchema = createInsertSchema(ediscoveryUploads).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export type InsertEdiscoveryUpload = z.infer<typeof insertEdiscoveryUploadSchema>;
export type EdiscoveryUpload = typeof ediscoveryUploads.$inferSelect;

// eDiscovery Emails - Indexed emails from PST files with vector embeddings
export const ediscoveryEmails = pgTable("ediscovery_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  uploadId: varchar("upload_id").notNull().references(() => ediscoveryUploads.id, { onDelete: "cascade" }),
  sourceFilename: text("source_filename"), // Original PST filename for tracking
  messageId: text("message_id"), // Email Message-ID header
  threadId: text("thread_id"), // For threading (future)
  subject: text("subject"),
  fromAddress: text("from_address"), // Normalized (lowercase, trimmed)
  toAddresses: jsonb("to_addresses").$type<string[]>(), // Array of email addresses
  ccAddresses: jsonb("cc_addresses").$type<string[]>(),
  bccAddresses: jsonb("bcc_addresses").$type<string[]>(),
  sentAt: timestamp("sent_at"),
  hasAttachments: boolean("has_attachments").notNull().default(false),
  bodyText: text("body_text"), // Plain text body
  bodyHtml: text("body_html"), // HTML body (optional)
  snippet: text("snippet"), // First 200 chars for preview
  sha256: text("sha256").notNull(), // SHA-256 of email body
  embedding: text("embedding"), // Vector embedding as JSON array (will be converted to pgvector)
  searchVector: text("search_vector"), // tsvector for full-text search (generated column in SQL)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  companyIdx: index("ediscovery_emails_company_idx").on(table.companyId),
  uploadIdx: index("ediscovery_emails_upload_idx").on(table.uploadId),
  fromIdx: index("ediscovery_emails_from_idx").on(table.fromAddress),
  sentAtIdx: index("ediscovery_emails_sent_at_idx").on(table.sentAt),
  messageIdIdx: index("ediscovery_emails_message_id_idx").on(table.messageId),
  sourceFilenameIdx: index("ediscovery_emails_source_filename_idx").on(table.sourceFilename),
}));

export const insertEdiscoveryEmailSchema = createInsertSchema(ediscoveryEmails).omit({
  id: true,
  createdAt: true,
});

export type InsertEdiscoveryEmail = z.infer<typeof insertEdiscoveryEmailSchema>;
export type EdiscoveryEmail = typeof ediscoveryEmails.$inferSelect;

// eDiscovery Attachments - Email attachments metadata
export const ediscoveryAttachments = pgTable("ediscovery_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  emailId: varchar("email_id").notNull().references(() => ediscoveryEmails.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(), // Object storage key or local path
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  companyIdx: index("ediscovery_attachments_company_idx").on(table.companyId),
  emailIdx: index("ediscovery_attachments_email_idx").on(table.emailId),
}));

export const insertEdiscoveryAttachmentSchema = createInsertSchema(ediscoveryAttachments).omit({
  id: true,
  createdAt: true,
});

export type InsertEdiscoveryAttachment = z.infer<typeof insertEdiscoveryAttachmentSchema>;
export type EdiscoveryAttachment = typeof ediscoveryAttachments.$inferSelect;

// eDiscovery Email Tags - Tag emails with labels (e.g., variation numbers, claim references)
export const ediscoveryEmailTags = pgTable("ediscovery_email_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  emailId: varchar("email_id").notNull().references(() => ediscoveryEmails.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // Tag label (e.g., "VAR-001", "CLAIM-2024-05")
  createdById: varchar("created_by_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("ediscovery_email_tags_email_idx").on(table.emailId),
  labelIdx: index("ediscovery_email_tags_label_idx").on(table.label),
  // Prevent duplicate tags on same email
  uniqEmailLabel: unique().on(table.emailId, table.label),
}));

export const insertEdiscoveryEmailTagSchema = createInsertSchema(ediscoveryEmailTags).omit({
  id: true,
  createdAt: true,
});

export type InsertEdiscoveryEmailTag = z.infer<typeof insertEdiscoveryEmailTagSchema>;
export type EdiscoveryEmailTag = typeof ediscoveryEmailTags.$inferSelect;

// === BOQ (BILL OF QUANTITIES) SYSTEM ===

// BOQ Revisions - manages BOQ versions per project
export const boqRevisions = pgTable("boq_revisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  revisionName: text("revision_name").notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(false),
  createdById: varchar("created_by_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("boq_revisions_project_idx").on(table.projectId),
  projectActiveIdx: index("boq_revisions_project_active_idx").on(table.projectId, table.isActive),
  // Ensure unique revision number per project
  uniqProjectRevision: unique().on(table.projectId, table.revisionNumber),
}));

export const insertBoqRevisionSchema = createInsertSchema(boqRevisions).omit({
  id: true,
  createdAt: true,
});

export type InsertBoqRevision = z.infer<typeof insertBoqRevisionSchema>;
export type BoqRevision = typeof boqRevisions.$inferSelect;

// Event Tag Statuses - project-level settings for event tag status options
export const pEventTagStatuses = pgTable("p_event_tag_statuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortingIndex: integer("sorting_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("p_event_tag_statuses_project_idx").on(table.projectId),
  // Ensure unique status name per project
  uniqProjectStatus: unique().on(table.projectId, table.name),
}));

export const insertPEventTagStatusSchema = createInsertSchema(pEventTagStatuses).omit({
  id: true,
  createdAt: true,
});

export type InsertPEventTagStatus = z.infer<typeof insertPEventTagStatusSchema>;
export type PEventTagStatus = typeof pEventTagStatuses.$inferSelect;

// Pricing Basis - project-level settings for pricing basis options
export const pPricingBasis = pgTable("p_pricing_basis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortingIndex: integer("sorting_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("p_pricing_basis_project_idx").on(table.projectId),
  // Ensure unique pricing basis name per project
  uniqProjectPricingBasis: unique().on(table.projectId, table.name),
}));

export const insertPPricingBasisSchema = createInsertSchema(pPricingBasis).omit({
  id: true,
  createdAt: true,
});

export type InsertPPricingBasis = z.infer<typeof insertPPricingBasisSchema>;
export type PPricingBasis = typeof pPricingBasis.$inferSelect;

// Event Tags - tracks project events/variations with extensive metadata
export const pEventTags = pgTable("p_event_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  no: text("no").notNull(), // Event number/code
  title: text("title").notNull(),
  description: text("description"),
  instructionRef: text("instruction_ref"),
  dateNotified: timestamp("date_notified"),
  statusId: varchar("status_id").references(() => pEventTagStatuses.id),
  submitted: timestamp("submitted"),
  approved: timestamp("approved"),
  notes: text("notes"),
  clauseRef: text("clause_ref"),
  relatedRFI: text("related_rfi"),
  owner: text("owner"),
  pricingBasisId: varchar("pricing_basis_id").references(() => pPricingBasis.id),
  eotDaysClaimed: integer("eot_days_claimed"),
  eotDaysApproved: integer("eot_days_approved"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("p_event_tags_project_idx").on(table.projectId),
  statusIdx: index("p_event_tags_status_idx").on(table.statusId),
  // Ensure unique event number per project
  uniqProjectNo: unique().on(table.projectId, table.no),
}));

export const insertPEventTagSchema = createInsertSchema(pEventTags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPEventTag = z.infer<typeof insertPEventTagSchema>;
export type PEventTag = typeof pEventTags.$inferSelect;

// Final Quantities - tracks quantities with event tag associations
export const pFinalQty = pgTable("p_final_qty", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventTagId: varchar("event_tag_id").references(() => pEventTags.id, { onDelete: "set null" }),
  qty: numeric("qty", { precision: 15, scale: 4 }),
  comments: text("comments"),
  date: timestamp("date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  eventTagIdx: index("p_final_qty_event_tag_idx").on(table.eventTagId),
}));

export const insertPFinalQtySchema = createInsertSchema(pFinalQty).omit({
  id: true,
  createdAt: true,
});

export type InsertPFinalQty = z.infer<typeof insertPFinalQtySchema>;
export type PFinalQty = typeof pFinalQty.$inferSelect;

// BOQ Items - line items in the Bill of Quantities
export const boqItems = pgTable("boq_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => boqRevisions.id, { onDelete: "cascade" }),
  itemNumber: text("item_number").notNull(),
  description: text("description").notNull(),
  unit: text("unit"),
  quantity: numeric("quantity", { precision: 15, scale: 3 }),
  rate: numeric("rate", { precision: 15, scale: 2 }),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  notes: text("notes"),
  level: integer("level"), // Hierarchy level: only for headings (items without item number), typically level 2
  sortingIndex: integer("sorting_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  revisionSortingIdx: index("boq_items_revision_sorting_idx").on(table.revisionId, table.sortingIndex),
}));

export const insertBoqItemSchema = createInsertSchema(boqItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBoqItem = z.infer<typeof insertBoqItemSchema>;
export type BoqItem = typeof boqItems.$inferSelect;

// Global Variables - project-wide variables for calculations
export const globalVariables = pgTable("global_variables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  variableName: text("variable_name").notNull(),
  description: text("description"),
  value: numeric("value", { precision: 18, scale: 6 }),
  unit: text("unit"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  projectVariableNameIdx: index("global_variables_project_variable_name_idx").on(table.projectId, table.variableName),
  uniqueVariableNamePerProject: unique("global_variables_project_variable_unique").on(table.projectId, table.variableName)
}));

export const insertGlobalVariableSchema = createInsertSchema(globalVariables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGlobalVariable = z.infer<typeof insertGlobalVariableSchema>;
export type GlobalVariable = typeof globalVariables.$inferSelect;

// Resource Rates - project-specific resource rates for BOQ calculations
export const resourceRates = pgTable("resource_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  resourceTypeId: varchar("resource_type_id").notNull().references(() => resourceTypes.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  description: text("description"),
  unit: text("unit"),
  tenderRate: numeric("tender_rate", { precision: 15, scale: 2 }),
  costRate: numeric("cost_rate", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("resource_rates_project_idx").on(table.projectId),
  resourceTypeIdx: index("resource_rates_resource_type_idx").on(table.resourceTypeId),
  uniqueCodePerProject: unique("resource_rates_project_code_unique").on(table.projectId, table.code)
}));

export const insertResourceRateSchema = createInsertSchema(resourceRates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertResourceRate = z.infer<typeof insertResourceRateSchema>;
export type ResourceRate = typeof resourceRates.$inferSelect;

// === CONTRACT VIEWER SYSTEM ===

// Contract Clauses - AI-extracted clause headings per contract revision
export const contractClauses = pgTable("contract_clauses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: "cascade" }),
  ref: varchar("ref", { length: 64 }).notNull(), // e.g., "GC 1.2", "Sch 3 cl 4"
  number: varchar("number", { length: 64 }).notNull(), // clause number token as appears in text
  heading: text("heading").notNull(),
  pageIndex: integer("page_index").notNull(), // 0-based page number
  bbox: jsonb("bbox").$type<{ x: number; y: number; w: number; h: number } | null>(), // optional bounding box
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  revisionIdx: index("contract_clauses_revision_idx").on(table.revisionId),
}));

export const insertContractClauseSchema = createInsertSchema(contractClauses).omit({
  id: true,
  createdAt: true,
});

export type InsertContractClause = z.infer<typeof insertContractClauseSchema>;
export type ContractClause = typeof contractClauses.$inferSelect;

// Contract Definitions - AI-extracted defined terms per contract revision
export const contractDefinitions = pgTable("contract_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: "cascade" }),
  term: varchar("term", { length: 256 }).notNull(), // canonical capitalized term
  definition: text("definition").notNull(),
  scopeRef: varchar("scope_ref", { length: 64 }).notNull(), // "GC", "Schedule 2", etc.
  pageIndex: integer("page_index").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  revisionIdx: index("contract_definitions_revision_idx").on(table.revisionId),
}));

export const insertContractDefinitionSchema = createInsertSchema(contractDefinitions).omit({
  id: true,
  createdAt: true,
});

export type InsertContractDefinition = z.infer<typeof insertContractDefinitionSchema>;
export type ContractDefinition = typeof contractDefinitions.$inferSelect;

// Contract Notes - sticky notes on PDF pages (multi-user, username-stamped)
export const contractNotes = pgTable("contract_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  authorName: varchar("author_name", { length: 128 }).notNull(),
  pageIndex: integer("page_index").notNull(),
  x: integer("x").notNull(), // percentage * 1000 (to avoid floats)
  y: integer("y").notNull(), // percentage * 1000
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  revisionIdx: index("contract_notes_revision_idx").on(table.revisionId),
}));

export const insertContractNoteSchema = createInsertSchema(contractNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractNote = z.infer<typeof insertContractNoteSchema>;
export type ContractNote = typeof contractNotes.$inferSelect;

// AI Threads - threaded AI chat anchored to specific points in contract
export const aiThreads = pgTable("ai_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  anchor: jsonb("anchor").$type<{ pageIndex: number; selection?: string; clauseRef?: string }>().notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  createdBy: varchar("created_by").notNull().references(() => people.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  revisionIdx: index("ai_threads_revision_idx").on(table.revisionId),
}));

export const insertAiThreadSchema = createInsertSchema(aiThreads).omit({
  id: true,
  createdAt: true,
});

export type InsertAiThread = z.infer<typeof insertAiThreadSchema>;
export type AiThread = typeof aiThreads.$inferSelect;

// AI Messages - messages within AI chat threads
export const aiMessages = pgTable("ai_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull().references(() => aiThreads.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 16 }).notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  threadIdx: index("ai_messages_thread_idx").on(table.threadId),
}));

export const insertAiMessageSchema = createInsertSchema(aiMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
export type AiMessage = typeof aiMessages.$inferSelect;

// Contract Search Index - full-text search index per page (naive implementation)
export const contractSearchIndex = pgTable("contract_search_index", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: "cascade" }),
  pageIndex: integer("page_index").notNull(),
  tokens: text("tokens").notNull(), // space-separated tokens for naive full-text search
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  revisionIdx: index("contract_search_index_revision_idx").on(table.revisionId),
}));

export const insertContractSearchIndexSchema = createInsertSchema(contractSearchIndex).omit({
  id: true,
  createdAt: true,
});

export type InsertContractSearchIndex = z.infer<typeof insertContractSearchIndexSchema>;
export type ContractSearchIndex = typeof contractSearchIndex.$inferSelect;

// === PROCUREMENT: SUBCONTRACT TEMPLATES ===

// Subcontract Templates - company-wide library of subcontract templates
export const subcontractTemplates = pgTable("subcontract_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  title: text("title").notNull(), // Display title (e.g., "ACME Subcontract v3.2")
  definedName: varchar("defined_name", { length: 256 }).notNull(), // Auto-extracted from PDF, user-editable
  fileKey: text("file_key").notNull(), // Object storage path
  pageCount: integer("page_count").notNull().default(0),
  createdBy: varchar("created_by").notNull().references(() => people.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  companyIdx: index("subcontract_templates_company_idx").on(table.companyId),
}));

export const insertSubcontractTemplateSchema = createInsertSchema(subcontractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubcontractTemplate = z.infer<typeof insertSubcontractTemplateSchema>;
export type SubcontractTemplate = typeof subcontractTemplates.$inferSelect;

// Special Condition Drafts - project-specific special conditions documents
export const specialConditionDrafts = pgTable("special_condition_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").references(() => subcontractTemplates.id, { onDelete: "set null" }),
  version: integer("version").notNull().default(1),
  title: varchar("title", { length: 256 }).notNull().default("Special Conditions"),
  createdBy: varchar("created_by").notNull().references(() => people.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  locked: boolean("locked").notNull().default(false), // Lock draft to prevent edits (for final exports)
}, (table) => ({
  projectIdx: index("special_condition_drafts_project_idx").on(table.projectId),
  companyIdx: index("special_condition_drafts_company_idx").on(table.companyId),
}));

export const insertSpecialConditionDraftSchema = createInsertSchema(specialConditionDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSpecialConditionDraft = z.infer<typeof insertSpecialConditionDraftSchema>;
export type SpecialConditionDraft = typeof specialConditionDrafts.$inferSelect;

// Special Condition Blocks - individual content blocks in a draft (supports AI vs user styling)
export const specialConditionBlocks = pgTable("special_condition_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draft_id").notNull().references(() => specialConditionDrafts.id, { onDelete: "cascade" }),
  sort: integer("sort").notNull(), // Display order
  role: varchar("role", { length: 16 }).notNull(), // 'ai' | 'user'
  content: text("content").notNull(), // Markdown/plain text content
  meta: jsonb("meta").$type<{ clauseRef?: string } | null>(), // Optional metadata (clause reference, etc.)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  draftIdx: index("special_condition_blocks_draft_idx").on(table.draftId),
}));

export const insertSpecialConditionBlockSchema = createInsertSchema(specialConditionBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSpecialConditionBlock = z.infer<typeof insertSpecialConditionBlockSchema>;
export type SpecialConditionBlock = typeof specialConditionBlocks.$inferSelect;

// ===== CONTRACT PARSING & CACHING SYSTEM =====
// System for parsing large contracts once and caching structured data for reuse

// Contract Parsed Assets - Top-level parsed contract cache with deduplication via fileHash
export const contractParsedAssets = pgTable("contract_parsed_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull().references(() => contractTemplates.id, { onDelete: "cascade" }),
  sourceRevisionId: varchar("source_revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: "cascade" }), // First revision that parsed this contract
  fileKey: text("file_key").notNull(), // Object storage key
  fileHash: varchar("file_hash", { length: 64 }).notNull(), // SHA-256 hash for deduplication
  pageCount: integer("page_count").notNull(),
  rawExtractedText: text("raw_extracted_text").notNull(), // Full text with === PAGE X === markers
  selectedTemplateColumnIds: jsonb("selected_template_column_ids"), // Snapshot of column selection at parse time
  tokenUsageTotal: integer("token_usage_total").notNull().default(0), // Total tokens consumed by Claude
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Unique index on (projectId, fileHash) for copy-forward deduplication
  uniqueProjectFileHash: unique("parsed_assets_project_file_hash_unique").on(table.projectId, table.fileHash),
  projectIdx: index("parsed_assets_project_idx").on(table.projectId),
  fileHashIdx: index("parsed_assets_file_hash_idx").on(table.fileHash),
}));

export const insertContractParsedAssetSchema = createInsertSchema(contractParsedAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractParsedAsset = z.infer<typeof insertContractParsedAssetSchema>;
export type ContractParsedAsset = typeof contractParsedAssets.$inferSelect;

// Contract Logical Parts - TOC, Definitions, General Conditions, Special Conditions, Annexures
export const contractLogicalParts = pgTable("contract_logical_parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parsedAssetId: varchar("parsed_asset_id").notNull().references(() => contractParsedAssets.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(), // Display order (1 = TOC, 2 = Definitions, etc.)
  partType: varchar("part_type", { length: 32 }).notNull(), // 'toc' | 'definitions' | 'general_conditions' | 'special_conditions' | 'annexures' | 'other'
  label: text("label").notNull(), // e.g. "Part A – General Conditions"
  startPage: integer("start_page").notNull(),
  endPage: integer("end_page").notNull(),
  detectedBy: text("detected_by"), // 'regex' | 'manual' | 'ai' - for debugging
  confidence: numeric("confidence", { precision: 4, scale: 3 }), // 0.000 - 1.000 confidence score
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  parsedAssetIdx: index("logical_parts_parsed_asset_idx").on(table.parsedAssetId),
  partTypeIdx: index("logical_parts_part_type_idx").on(table.parsedAssetId, table.partType),
  uniqueAssetOrder: unique("logical_parts_asset_order_unique").on(table.parsedAssetId, table.orderIndex),
}));

export const insertContractLogicalPartSchema = createInsertSchema(contractLogicalParts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractLogicalPart = z.infer<typeof insertContractLogicalPartSchema>;
export type ContractLogicalPart = typeof contractLogicalParts.$inferSelect;

// Contract Text Chunks - Chunked text segments (20k-25k chars) with Claude analysis
export const contractTextChunks = pgTable("contract_text_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parsedAssetId: varchar("parsed_asset_id").notNull().references(() => contractParsedAssets.id, { onDelete: "cascade" }),
  logicalPartId: varchar("logical_part_id").references(() => contractLogicalParts.id, { onDelete: "set null" }), // Nullable for miscellaneous text
  chunkIndex: integer("chunk_index").notNull(), // Sequential index within parsed asset
  startPage: integer("start_page").notNull(),
  endPage: integer("end_page").notNull(),
  startChar: integer("start_char").notNull(), // Character offset in rawExtractedText
  endChar: integer("end_char").notNull(), // Character offset in rawExtractedText
  rawText: text("raw_text").notNull(), // Extracted chunk text
  summaryJson: jsonb("summary_json").$type<{
    pageRange: [number, number];
    summaries: Array<{ clauseNumber: string; heading: string; summary: string }>;
    definedTerms: Array<{ clauseNumber: string; term: string; definition: string }>;
    crossReferences: Array<{ fromClause: string; toClause: string; context: string }>;
    risks: Array<{ clauseNumber: string; severity: string; description: string }>;
  } | null>(), // Claude's structured analysis
  tokenUsage: integer("token_usage").notNull().default(0), // Tokens consumed for this chunk
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  parsedAssetIdx: index("text_chunks_parsed_asset_idx").on(table.parsedAssetId),
  logicalPartIdx: index("text_chunks_logical_part_idx").on(table.logicalPartId),
  uniqueAssetChunkIndex: unique("text_chunks_asset_chunk_index_unique").on(table.parsedAssetId, table.chunkIndex),
  // Partial index to quickly find unsummarized chunks
  unsummarizedIdx: index("text_chunks_unsummarized_idx").on(table.parsedAssetId).where(sql`summary_json IS NULL`),
}));

export const insertContractTextChunkSchema = createInsertSchema(contractTextChunks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractTextChunk = z.infer<typeof insertContractTextChunkSchema>;
export type ContractTextChunk = typeof contractTextChunks.$inferSelect;

// Contract Parsing Jobs - Job status and progress tracking
export const contractParsingJobs = pgTable("contract_parsing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revisionId: varchar("revision_id").notNull().references(() => contractReviewDocuments.id, { onDelete: "cascade" }),
  parsedAssetId: varchar("parsed_asset_id").references(() => contractParsedAssets.id, { onDelete: "set null" }), // Set after parsing completes
  status: varchar("status", { length: 16 }).notNull().default("pending"), // 'pending' | 'processing' | 'succeeded' | 'failed'
  phase: varchar("phase", { length: 32 }).notNull().default("queued"), // 'queued' | 'extracting_pdf' | 'normalising_text' | 'detecting_parts' | 'chunking' | 'summarising' | 'completed' | 'failed'
  message: text("message"), // Human-readable status message
  totalWorkUnits: integer("total_work_units").notNull().default(0), // Total work units for progress calculation
  completedWorkUnits: integer("completed_work_units").notNull().default(0), // Completed work units
  lastHeartbeat: timestamp("last_heartbeat"), // Last activity timestamp (for stale job detection)
  errorJson: jsonb("error_json").$type<{ code: string; message: string; stack?: string } | null>(), // Error details if failed
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  revisionIdx: unique("parsing_jobs_revision_unique").on(table.revisionId), // One job per revision
  statusIdx: index("parsing_jobs_status_idx").on(table.status), // For polling active jobs
}));

export const insertContractParsingJobSchema = createInsertSchema(contractParsingJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractParsingJob = z.infer<typeof insertContractParsingJobSchema>;
export type ContractParsingJob = typeof contractParsingJobs.$inferSelect;

// Contract Parsing Job Steps - Granular step tracking for detailed progress and token attribution
export const contractParsingJobSteps = pgTable("contract_parsing_job_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => contractParsingJobs.id, { onDelete: "cascade" }),
  stepType: varchar("step_type", { length: 32 }).notNull(), // 'extraction' | 'normalisation' | 'part_detection' | 'chunking' | 'claude_request' | 'claude_response' | 'storage'
  chunkId: varchar("chunk_id").references(() => contractTextChunks.id, { onDelete: "set null" }), // Link to chunk for Claude steps
  workUnits: integer("work_units").notNull().default(1), // Work units contributed by this step
  tokensConsumed: integer("tokens_consumed").notNull().default(0), // Tokens consumed (for Claude steps)
  durationMs: integer("duration_ms"), // Step duration in milliseconds
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  jobIdx: index("parsing_job_steps_job_idx").on(table.jobId),
  stepTypeIdx: index("parsing_job_steps_step_type_idx").on(table.jobId, table.stepType),
}));

export const insertContractParsingJobStepSchema = createInsertSchema(contractParsingJobSteps).omit({
  id: true,
  createdAt: true,
});

export type InsertContractParsingJobStep = z.infer<typeof insertContractParsingJobStepSchema>;
export type ContractParsingJobStep = typeof contractParsingJobSteps.$inferSelect;

// Extended TOC - Comprehensive list of all clause headings detected in the contract body
export const extendedToc = pgTable("extended_toc", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parsedAssetId: varchar("parsed_asset_id").notNull().references(() => contractParsedAssets.id, { onDelete: "cascade" }),
  clauseNumber: text("clause_number").notNull(), // e.g., "1", "1.1", "2.3.4", "25.1(b)"
  description: text("description").notNull(), // Clause heading text (without the clause number)
  pageNo: integer("page_no").notNull(), // Page number where this heading appears
  orderIndex: integer("order_index").notNull(), // Display order (0, 1, 2...) for correct hierarchical sorting
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  parsedAssetIdx: index("extended_toc_parsed_asset_idx").on(table.parsedAssetId),
  clauseNumberIdx: index("extended_toc_clause_number_idx").on(table.parsedAssetId, table.clauseNumber),
  orderIdx: index("extended_toc_order_idx").on(table.parsedAssetId, table.orderIndex),
  uniqueAssetClause: unique("extended_toc_asset_clause_unique").on(table.parsedAssetId, table.clauseNumber),
}));

export const insertExtendedTocSchema = createInsertSchema(extendedToc).omit({
  id: true,
  createdAt: true,
});

export type InsertExtendedToc = z.infer<typeof insertExtendedTocSchema>;
export type ExtendedToc = typeof extendedToc.$inferSelect;

// === DASHBOARD QUOTES SYSTEM ===

// Quote Categories - ordered categories for rotating display
export const quoteCategories = pgTable("quote_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // e.g., "Key Contract Principle"
  slug: text("slug").notNull().unique(), // e.g., "key-contract-principle"
  displayOrder: integer("display_order").notNull().default(0), // Controls category rotation order
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  displayOrderIdx: index("quote_categories_display_order_idx").on(table.displayOrder),
}));

export const insertQuoteCategorySchema = createInsertSchema(quoteCategories).omit({
  id: true,
  createdAt: true,
});

export type InsertQuoteCategory = z.infer<typeof insertQuoteCategorySchema>;
export type QuoteCategory = typeof quoteCategories.$inferSelect;

// Quotes - individual quotes within categories
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").notNull().references(() => quoteCategories.id, { onDelete: "cascade" }),
  itemIndex: integer("item_index").notNull(), // Sequential index within category (1, 2, 3...)
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  categoryItemUnique: unique("quotes_category_item_unique").on(table.categoryId, table.itemIndex),
  categoryIdx: index("quotes_category_idx").on(table.categoryId),
  categoryItemIdx: index("quotes_category_item_idx").on(table.categoryId, table.itemIndex),
}));

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
});

export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// User Quote Progress - tracks where each user left off in the rotation
export const userQuoteProgress = pgTable("user_quote_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }), // Optional company scope
  rowIndex: integer("row_index").notNull().default(0), // Current row in the quote matrix
  categoryIndex: integer("category_index").notNull().default(0), // Current category position
  lastShownAt: timestamp("last_shown_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userCompanyUnique: unique("user_quote_progress_user_company_unique").on(table.userId, table.companyId),
  userIdx: index("user_quote_progress_user_idx").on(table.userId),
}));

export const insertUserQuoteProgressSchema = createInsertSchema(userQuoteProgress).omit({
  id: true,
  lastShownAt: true,
  updatedAt: true,
});

export type InsertUserQuoteProgress = z.infer<typeof insertUserQuoteProgressSchema>;
export type UserQuoteProgress = typeof userQuoteProgress.$inferSelect;
