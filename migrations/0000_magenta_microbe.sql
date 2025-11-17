CREATE TABLE "ai_usage_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"person_id" varchar NOT NULL,
	"form_name" text NOT NULL,
	"event_type" text NOT NULL,
	"model_used" text NOT NULL,
	"revision_id" varchar,
	"row_id" varchar,
	"letter_id" varchar,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"duration_ms" integer,
	"estimated_cost" text NOT NULL,
	"client_invoice_number" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_units" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"abn" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_units_company_name_unique" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "cell_chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cell_id" varchar NOT NULL,
	"revision_id" varchar NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cell_chat_role_check" CHECK ("cell_chat_messages"."role" IN ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"abn" text,
	"address" text,
	"contact_email" text,
	"contact_phone" text,
	"notes" text,
	"ai_expert_persona" text,
	"ai_jurisdiction" text,
	"ai_industry_focus" text,
	"ai_risk_tolerance" text,
	"ai_contract_review_model" text DEFAULT 'gpt-4o',
	"ai_letter_model" text DEFAULT 'gpt-4o',
	"table_header_bg" text DEFAULT '#f1f5f9',
	"table_header_fg" text DEFAULT '#0f172a',
	"locked_column_bg" text DEFAULT '#fef3c7',
	"locked_column_fg" text DEFAULT '#78350f',
	"form_bg" text DEFAULT '#ffffff',
	"form_border" text DEFAULT '#e2e8f0',
	"form_accent" text DEFAULT '#3b82f6',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "company_theme_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"row_density" text DEFAULT 'wide' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_theme_settings_company_id_unique" UNIQUE("company_id"),
	CONSTRAINT "row_density_check" CHECK ("company_theme_settings"."row_density" IN ('narrow', 'medium', 'wide'))
);
--> statement-breakpoint
CREATE TABLE "consequence_ratings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consequence_type_id" varchar NOT NULL,
	"level" integer NOT NULL,
	"description" text,
	"numeric_value" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consequence_ratings_consequence_type_id_level_unique" UNIQUE("consequence_type_id","level")
);
--> statement-breakpoint
CREATE TABLE "consequence_scales" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"dimension" text NOT NULL,
	"level" integer NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consequence_scales_project_id_dimension_level_unique" UNIQUE("project_id","dimension","level")
);
--> statement-breakpoint
CREATE TABLE "consequence_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consequence_types_project_id_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "contract_document_chunks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" text NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contract_chunks_revision_index_unique" UNIQUE("revision_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "contract_review_approvals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_row_id" varchar NOT NULL,
	"proposed_departure" text,
	"comments" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_comments" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approval_status_check" CHECK ("contract_review_approvals"."status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "contract_review_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"template_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"client_contract_file_name" text,
	"client_contract_file_url" text,
	"client_contract_file_key" text,
	"selected_template_column_ids" jsonb,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_review_revision_cells" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_row_id" varchar NOT NULL,
	"column_config_id" varchar,
	"column_kind" text NOT NULL,
	"column_header" text,
	"value" text,
	"original_ai_value" text,
	"last_edited_by" text,
	"last_edited_at" timestamp,
	CONSTRAINT "revision_cells_row_kind_config_header_unique" UNIQUE("revision_row_id","column_kind","column_config_id","column_header"),
	CONSTRAINT "revision_cells_column_kind_check" CHECK ("contract_review_revision_cells"."column_kind" IN ('template_editable', 'review_work', 'summary_position', 'clause_ref', 'bid_notes', 'complies'))
);
--> statement-breakpoint
CREATE TABLE "contract_review_revision_rows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"snapshot_row_id" varchar NOT NULL,
	"row_index" integer NOT NULL,
	"source_revision_id" varchar,
	CONSTRAINT "revision_rows_revision_snapshot_row_unique" UNIQUE("revision_id","snapshot_row_id"),
	CONSTRAINT "revision_rows_revision_row_index_unique" UNIQUE("revision_id","row_index")
);
--> statement-breakpoint
CREATE TABLE "contract_review_row_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_review_row_id" varchar NOT NULL,
	"revision_id" varchar NOT NULL,
	"comment_type" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_review_rows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_review_document_id" varchar NOT NULL,
	"row_index" integer NOT NULL,
	"cells" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_review_snapshot_cells" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_row_id" varchar NOT NULL,
	"template_column_config_id" varchar NOT NULL,
	"column_header" text NOT NULL,
	"value" text,
	"employment_role_id" varchar,
	"order_index" integer NOT NULL,
	CONSTRAINT "snapshot_cells_row_column_unique" UNIQUE("snapshot_row_id","template_column_config_id"),
	CONSTRAINT "snapshot_cells_row_order_unique" UNIQUE("snapshot_row_id","order_index")
);
--> statement-breakpoint
CREATE TABLE "contract_review_snapshot_rows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" varchar NOT NULL,
	"template_row_id" varchar NOT NULL,
	"row_index" integer NOT NULL,
	CONSTRAINT "snapshot_rows_snapshot_template_row_unique" UNIQUE("snapshot_id","template_row_id"),
	CONSTRAINT "snapshot_rows_snapshot_row_index_unique" UNIQUE("snapshot_id","row_index")
);
--> statement-breakpoint
CREATE TABLE "contract_review_template_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"created_revision_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "template_snapshot_unique" UNIQUE("template_id")
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" varchar NOT NULL,
	"version" text NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_date" text NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"file_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correspondence_letters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"letter_number" integer NOT NULL,
	"sharepoint_file_id" text,
	"file_name" text NOT NULL,
	"file_url" text,
	"file_key" text,
	"extracted_text" text,
	"embedding_vector" text,
	"sender" text,
	"recipient" text,
	"subject" text,
	"letter_date" text,
	"category" text,
	"source" text DEFAULT 'upload' NOT NULL,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "correspondence_letters_project_number_unique" UNIQUE("project_id","letter_number")
);
--> statement-breakpoint
CREATE TABLE "correspondence_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"original_letter_id" varchar NOT NULL,
	"reference_letter_ids" jsonb,
	"custom_instructions" text,
	"generated_response" text NOT NULL,
	"ai_model" text DEFAULT 'gpt-4o' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_cost" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correspondence_user_layout_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_account_id" varchar NOT NULL,
	"layout_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "correspondence_user_layout_unique" UNIQUE("user_account_id")
);
--> statement-breakpoint
CREATE TABLE "doa_escalation_matrix" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"band" integer NOT NULL,
	"risk_or_opportunity" text DEFAULT 'risk' NOT NULL,
	"group_level" text,
	"division_level" text,
	"business_unit_level" text,
	"project_level" text,
	"required_actions" text,
	"monitoring_requirements" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "doa_escalation_matrix_project_id_band_risk_or_opportunity_unique" UNIQUE("project_id","band","risk_or_opportunity")
);
--> statement-breakpoint
CREATE TABLE "ediscovery_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"email_id" varchar NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ediscovery_emails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"upload_id" varchar NOT NULL,
	"message_id" text,
	"thread_id" text,
	"subject" text,
	"from_address" text,
	"to_addresses" jsonb,
	"cc_addresses" jsonb,
	"bcc_addresses" jsonb,
	"sent_at" timestamp,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"body_text" text,
	"body_html" text,
	"snippet" text,
	"sha256" text NOT NULL,
	"embedding" text,
	"search_vector" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ediscovery_uploads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"project_id" varchar,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"email_count" integer DEFAULT 0,
	"attachment_count" integer DEFAULT 0,
	"uploaded_by_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employment_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"title" text NOT NULL,
	"doa_acronym" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employment_roles_company_title_unique" UNIQUE("company_id","title"),
	CONSTRAINT "employment_roles_company_doa_acronym_unique" UNIQUE("company_id","doa_acronym")
);
--> statement-breakpoint
CREATE TABLE "escalation_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"trigger_band" integer NOT NULL,
	"escalate_to_id" varchar,
	"notification_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heatmap_matrix" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"likelihood" integer NOT NULL,
	"impact" integer NOT NULL,
	"band" integer NOT NULL,
	"color_code" varchar
);
--> statement-breakpoint
CREATE TABLE "likelihood_scales" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"level" integer NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"probability" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "likelihood_scales_project_id_level_unique" UNIQUE("project_id","level")
);
--> statement-breakpoint
CREATE TABLE "monte_carlo_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"iterations" integer NOT NULL,
	"cost_p10" integer,
	"cost_p50" integer,
	"cost_p90" integer,
	"schedule_p10" integer,
	"schedule_p50" integer,
	"schedule_p90" integer,
	"tornado_data" jsonb,
	"emv_by_bucket" jsonb,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"run_by_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replit_auth_id" varchar,
	"given_name" text NOT NULL,
	"family_name" text NOT NULL,
	"email" text NOT NULL,
	"profile_image_url" text,
	"mobile" text,
	"employee_no" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "people_replit_auth_id_unique" UNIQUE("replit_auth_id")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"file_key" text NOT NULL,
	"file_size" integer NOT NULL,
	"data_date" text,
	"is_contract_baseline" boolean DEFAULT false NOT NULL,
	"is_baseline_approved" boolean DEFAULT false NOT NULL,
	"comments" text,
	"xer_data" jsonb,
	"insights" jsonb,
	"uploaded_by_user_id" varchar NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"user_account_id" varchar NOT NULL,
	"project_role_id" varchar NOT NULL,
	"start_date" text DEFAULT CURRENT_DATE::text NOT NULL,
	"end_date" text,
	"assigned_by_user_id" varchar,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "project_role_permissions" (
	"project_role_id" varchar NOT NULL,
	"permission_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "project_roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "project_sharepoint_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"sharepoint_site_url" text NOT NULL,
	"correspondence_folder_path" text NOT NULL,
	"site_id" text,
	"drive_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_code" text NOT NULL,
	"name" text NOT NULL,
	"client" text,
	"location" text,
	"business_unit_id" varchar,
	"status" text DEFAULT 'active' NOT NULL,
	"phase" text DEFAULT 'tender' NOT NULL,
	"tender_start_date" text,
	"tender_end_date" text,
	"delivery_start_date" text,
	"delivery_end_date" text,
	"defects_period_start_date" text,
	"defects_period_end_date" text,
	"closed_start_date" text,
	"closed_end_date" text,
	"sharepoint_folder_path" text,
	"contract_document_path" text,
	"contract_specification_path" text,
	"project_revenue" text,
	"project_profit" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_project_code_unique" UNIQUE("project_code"),
	CONSTRAINT "projects_business_unit_name_unique" UNIQUE("business_unit_id","name")
);
--> statement-breakpoint
CREATE TABLE "quant_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"iterations" integer DEFAULT 5000 NOT NULL,
	"confidence" integer DEFAULT 90 NOT NULL,
	"seed" integer,
	"last_run" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quant_settings_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "rfi_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfi_id" varchar NOT NULL,
	"user_account_id" varchar NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfis" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"rfi_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"raised_by" text NOT NULL,
	"assigned_to" text,
	"due_date" text,
	"is_overdue" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_actions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_id" varchar NOT NULL,
	"description" text NOT NULL,
	"owner_id" varchar,
	"due_date" text,
	"cost" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp,
	"notes" text,
	"created_by_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_id" varchar NOT NULL,
	"filename" text NOT NULL,
	"file_key" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text,
	"uploaded_by_id" varchar NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_correlation_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"correlation" integer DEFAULT 70 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_correlation_memberships" (
	"risk_id" varchar NOT NULL,
	"group_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_register_revisions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"revision_number" integer NOT NULL,
	"revision_name" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_id" varchar NOT NULL,
	"monte_carlo_iterations" integer DEFAULT 10000 NOT NULL,
	"target_percentile" integer DEFAULT 80 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risk_register_revisions_project_id_revision_number_unique" UNIQUE("project_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "risk_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_id" varchar NOT NULL,
	"reviewer_id" varchar NOT NULL,
	"notes" text,
	"next_review_date" text,
	"reviewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"risk_number" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"owner_id" varchar,
	"risk_type" text DEFAULT 'threat' NOT NULL,
	"potential_causes" text,
	"potential_impacts" text,
	"existing_controls" text,
	"existing_controls_status" text,
	"consequence_type_id" varchar,
	"consequence_level" integer,
	"optimistic_p10" integer,
	"likely_p50" integer,
	"pessimistic_p90" integer,
	"probability" integer,
	"distribution_model" text,
	"is_distribution_ai_selected" boolean DEFAULT false,
	"treatment_description" text,
	"treatment_owner_id" varchar,
	"treatment_date" text,
	"created_by_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risks_revision_id_risk_number_unique" UNIQUE("revision_id","risk_number")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" varchar NOT NULL,
	"permission_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_column_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" text NOT NULL,
	"column_header" text NOT NULL,
	"is_editable" boolean DEFAULT true NOT NULL,
	"order_index" integer NOT NULL,
	"is_doa_acronym_column" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_rows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" text NOT NULL,
	"row_index" integer NOT NULL,
	"cells" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" varchar NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "user_employment_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_account_id" varchar NOT NULL,
	"employment_role_id" varchar NOT NULL,
	"start_date" text DEFAULT CURRENT_DATE::text NOT NULL,
	"end_date" text,
	"notes" text,
	"assigned_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_risk_column_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" varchar NOT NULL,
	"visible_columns" jsonb NOT NULL,
	"column_order" jsonb NOT NULL,
	"column_widths" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_risk_column_preferences_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_account_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"start_date" text DEFAULT CURRENT_DATE::text NOT NULL,
	"end_date" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_revision_id_contract_review_documents_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_review_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_row_id_contract_review_revision_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."contract_review_revision_rows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_chat_messages" ADD CONSTRAINT "cell_chat_messages_cell_id_contract_review_revision_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."contract_review_revision_cells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_chat_messages" ADD CONSTRAINT "cell_chat_messages_revision_id_contract_review_documents_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_review_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_theme_settings" ADD CONSTRAINT "company_theme_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequence_ratings" ADD CONSTRAINT "consequence_ratings_consequence_type_id_consequence_types_id_fk" FOREIGN KEY ("consequence_type_id") REFERENCES "public"."consequence_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequence_scales" ADD CONSTRAINT "consequence_scales_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequence_types" ADD CONSTRAINT "consequence_types_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_document_chunks" ADD CONSTRAINT "contract_document_chunks_revision_id_contract_review_documents_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_review_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_approvals" ADD CONSTRAINT "contract_review_approvals_revision_row_id_contract_review_revision_rows_id_fk" FOREIGN KEY ("revision_row_id") REFERENCES "public"."contract_review_revision_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_revision_cells" ADD CONSTRAINT "contract_review_revision_cells_revision_row_id_contract_review_revision_rows_id_fk" FOREIGN KEY ("revision_row_id") REFERENCES "public"."contract_review_revision_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_revision_cells" ADD CONSTRAINT "contract_review_revision_cells_column_config_id_template_column_configs_id_fk" FOREIGN KEY ("column_config_id") REFERENCES "public"."template_column_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_revision_rows" ADD CONSTRAINT "contract_review_revision_rows_revision_id_contract_review_documents_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."contract_review_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_revision_rows" ADD CONSTRAINT "contract_review_revision_rows_snapshot_row_id_contract_review_snapshot_rows_id_fk" FOREIGN KEY ("snapshot_row_id") REFERENCES "public"."contract_review_snapshot_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_revision_rows" ADD CONSTRAINT "contract_review_revision_rows_source_revision_id_contract_review_documents_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."contract_review_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_snapshot_cells" ADD CONSTRAINT "contract_review_snapshot_cells_snapshot_row_id_contract_review_snapshot_rows_id_fk" FOREIGN KEY ("snapshot_row_id") REFERENCES "public"."contract_review_snapshot_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_snapshot_cells" ADD CONSTRAINT "contract_review_snapshot_cells_template_column_config_id_template_column_configs_id_fk" FOREIGN KEY ("template_column_config_id") REFERENCES "public"."template_column_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_snapshot_cells" ADD CONSTRAINT "contract_review_snapshot_cells_employment_role_id_employment_roles_id_fk" FOREIGN KEY ("employment_role_id") REFERENCES "public"."employment_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_snapshot_rows" ADD CONSTRAINT "contract_review_snapshot_rows_snapshot_id_contract_review_template_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."contract_review_template_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_snapshot_rows" ADD CONSTRAINT "contract_review_snapshot_rows_template_row_id_template_rows_id_fk" FOREIGN KEY ("template_row_id") REFERENCES "public"."template_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_template_snapshots" ADD CONSTRAINT "contract_review_template_snapshots_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_review_template_snapshots" ADD CONSTRAINT "contract_review_template_snapshots_created_revision_id_contract_review_documents_id_fk" FOREIGN KEY ("created_revision_id") REFERENCES "public"."contract_review_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence_letters" ADD CONSTRAINT "correspondence_letters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence_letters" ADD CONSTRAINT "correspondence_letters_uploaded_by_user_accounts_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence_responses" ADD CONSTRAINT "correspondence_responses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence_responses" ADD CONSTRAINT "correspondence_responses_original_letter_id_correspondence_letters_id_fk" FOREIGN KEY ("original_letter_id") REFERENCES "public"."correspondence_letters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence_responses" ADD CONSTRAINT "correspondence_responses_created_by_user_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence_user_layout_preferences" ADD CONSTRAINT "correspondence_user_layout_preferences_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doa_escalation_matrix" ADD CONSTRAINT "doa_escalation_matrix_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ediscovery_attachments" ADD CONSTRAINT "ediscovery_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ediscovery_attachments" ADD CONSTRAINT "ediscovery_attachments_email_id_ediscovery_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."ediscovery_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ediscovery_emails" ADD CONSTRAINT "ediscovery_emails_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ediscovery_emails" ADD CONSTRAINT "ediscovery_emails_upload_id_ediscovery_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."ediscovery_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ediscovery_uploads" ADD CONSTRAINT "ediscovery_uploads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ediscovery_uploads" ADD CONSTRAINT "ediscovery_uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ediscovery_uploads" ADD CONSTRAINT "ediscovery_uploads_uploaded_by_id_people_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_escalate_to_id_people_id_fk" FOREIGN KEY ("escalate_to_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heatmap_matrix" ADD CONSTRAINT "heatmap_matrix_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelihood_scales" ADD CONSTRAINT "likelihood_scales_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monte_carlo_results" ADD CONSTRAINT "monte_carlo_results_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monte_carlo_results" ADD CONSTRAINT "monte_carlo_results_run_by_id_people_id_fk" FOREIGN KEY ("run_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_uploaded_by_user_id_user_accounts_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_role_id_project_roles_id_fk" FOREIGN KEY ("project_role_id") REFERENCES "public"."project_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_assigned_by_user_id_user_accounts_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_role_permissions" ADD CONSTRAINT "project_role_permissions_project_role_id_project_roles_id_fk" FOREIGN KEY ("project_role_id") REFERENCES "public"."project_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_role_permissions" ADD CONSTRAINT "project_role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sharepoint_settings" ADD CONSTRAINT "project_sharepoint_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_settings" ADD CONSTRAINT "quant_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfi_comments" ADD CONSTRAINT "rfi_comments_rfi_id_rfis_id_fk" FOREIGN KEY ("rfi_id") REFERENCES "public"."rfis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfi_comments" ADD CONSTRAINT "rfi_comments_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_actions" ADD CONSTRAINT "risk_actions_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_actions" ADD CONSTRAINT "risk_actions_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_actions" ADD CONSTRAINT "risk_actions_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_attachments" ADD CONSTRAINT "risk_attachments_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_attachments" ADD CONSTRAINT "risk_attachments_uploaded_by_id_people_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_correlation_groups" ADD CONSTRAINT "risk_correlation_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_correlation_memberships" ADD CONSTRAINT "risk_correlation_memberships_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_correlation_memberships" ADD CONSTRAINT "risk_correlation_memberships_group_id_risk_correlation_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."risk_correlation_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_register_revisions" ADD CONSTRAINT "risk_register_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_register_revisions" ADD CONSTRAINT "risk_register_revisions_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_reviews" ADD CONSTRAINT "risk_reviews_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_reviews" ADD CONSTRAINT "risk_reviews_reviewer_id_people_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_revision_id_risk_register_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."risk_register_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_consequence_type_id_consequence_types_id_fk" FOREIGN KEY ("consequence_type_id") REFERENCES "public"."consequence_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_treatment_owner_id_people_id_fk" FOREIGN KEY ("treatment_owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_created_by_id_people_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_employment_history" ADD CONSTRAINT "user_employment_history_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_employment_history" ADD CONSTRAINT "user_employment_history_employment_role_id_employment_roles_id_fk" FOREIGN KEY ("employment_role_id") REFERENCES "public"."employment_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_employment_history" ADD CONSTRAINT "user_employment_history_assigned_by_user_id_user_accounts_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_risk_column_preferences" ADD CONSTRAINT "user_risk_column_preferences_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ediscovery_attachments_company_idx" ON "ediscovery_attachments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ediscovery_attachments_email_idx" ON "ediscovery_attachments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "ediscovery_emails_company_idx" ON "ediscovery_emails" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ediscovery_emails_upload_idx" ON "ediscovery_emails" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "ediscovery_emails_from_idx" ON "ediscovery_emails" USING btree ("from_address");--> statement-breakpoint
CREATE INDEX "ediscovery_emails_sent_at_idx" ON "ediscovery_emails" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "ediscovery_emails_message_id_idx" ON "ediscovery_emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ediscovery_uploads_company_idx" ON "ediscovery_uploads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ediscovery_uploads_status_idx" ON "ediscovery_uploads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");