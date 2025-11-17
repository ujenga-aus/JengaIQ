# uJenga

## Overview
uJenga is a multi-tenant construction project and RFI management system designed to streamline construction workflows. It features AI-powered contract review, robust role-based access control, and full mobile responsiveness. The system organizes data hierarchically (Company → Business Units → Projects → RFIs/Contract Reviews) to enhance collaboration, organize projects efficiently, and maintain detailed audit trails. The project's ambition is to provide an adaptable tool for construction firms, improving project management and efficiency in the construction industry.

## User Preferences
- Material Design system with Inter font for primary text, JetBrains Mono for technical elements
- Dark mode theme preferred
- Mobile app clarification: MVP is responsive web app for iPhone browsers, native SwiftUI app is Phase 2

## System Architecture

### Multi-Tenant Hierarchy
The system employs a hierarchical data structure: Company → Business Units → Projects → RFIs/Contract Reviews, ensuring data uniqueness at each level.

### UI/UX Decisions
The UI incorporates "uJenga" branding, semantic tokens for theming (light/dark modes), Inter and JetBrains Mono fonts, and Shadcn UI components. Features include a global context-based selector system, a Company Terminology (Lingo) system, tabbed navigation, a compact horizontal header, and configurable row spacing density. Company-specific branding automatically applies via CSS custom properties. Typography is minimalist, Inter-based, with a clear visual hierarchy using semantic HTML tags and specific font usage for UI text (Inter) and technical elements (JetBrains Mono). Header navigation uses a tab-based system (Dashboard, Project, Setup) with always-visible Company/Business Unit/Project selectors and a breadcrumb displaying project status.

### Technical Implementations
- **Typography & Density System**: Comprehensive app-wide system with three density modes (narrow/medium/wide). Uses Inter Variable font with CSS variable tokens that scale typography and spacing dynamically. Semantic typography classes (.text-h1, .text-h2, .text-data, etc.) ensure consistency across UI, tables, charts, and grids. Company-wide density control managed via Company Settings (stored in companies.gridRowSpacing column). All users of a company see the same density mode for consistent experience. UiDensityProvider reads from selectedCompany and applies density-{mode} class to document.documentElement. Tailwind plugin generates semantic classes from CSS variables defined in tokens.css. Charts use useRechartsTheme hook for automatic font scaling. Density modes: narrow (14px base), medium (15px base), wide (16px base).
- **AI Status Dialog System**: Professional and reusable AI status dialogue components.
- **Role-Based Access Control (RBAC)**: Granular global and project-specific permissions.
- **Employment & User Management**: CRUD for job titles, DOA acronyms, and user administration with CSV import.
- **Project Lifecycle Management**: Four-phase timeline with editable dates and automatic status updates.
- **RFI Features**: Interactive cards, detail dialogs, and a persistent commenting system.
- **Contract Review System**: Versioned templates, dual table layout, AI-powered analysis (summaries, clause references, mitigation), Excel-style features (resizing, auto-expanding rows, track changes, keyboard navigation), and real-time collaboration via WebSocket. AI uses specific parameters and provides comprehensive extraction of notice obligations, structured JSON output, and PlantUML diagrams. Clause heading tooltips are integrated for easy reference.
- **Contract Viewer (PDF Annotation System)**: Mobile-responsive PDF viewer with adaptive layouts for desktop (floating, draggable/resizable dialog) and mobile (full-screen). Features PDF display, credentialed PDF fetch, and comprehensive clause heading tooltips on desktop. Tooltips use extended TOC for ALL clause numbers (1.1, 1.2, 2.1, etc.), not just major sections.
- **AI Letter Correspondence System**: Manages sequential letter numbering, uploads, AI-recommended similar letters via semantic search, SharePoint integration, and background syncing for indexing and AI-powered generation.
- **Programs Tab with AI Schedule Insights**: Manages Primavera P6 XER files, provides Gantt chart visualization, and AI-powered schedule quality analysis.
- **Risk Register Module**: Qualitative/quantitative risk analysis with revision/snapshot architecture, configurable settings, traffic light indicators, Monte Carlo simulation, and AI-powered risk generation.
- **Contract Documentation Paths**: Project-level SharePoint path settings with validation.
- **eDiscovery Tab**: Email discovery system with auto-scanning of SharePoint PST folders, PST extraction, AI-powered semantic search, email viewer, tagging, and PDF export.
- **Resource Types Management**: Company-wide resource types management with CRUD, reordering, and WebSocket updates.
- **BOQ (Bill of Quantities) System**: Revision control, item CRUD, real-time auto-calculation, Excel import with column mapping, project-specific event tags, drag-and-drop reordering, hierarchical structure with expand/collapse and rolled-up subtotals. Includes column width persistence, floating Global Variables and Resource Rates dialogs with real-time WebSocket updates and user preference persistence. Excel import supports chunked uploads, server-side validation, and progress tracking.
- **Procurement - Subcontract Templates**: Company-wide library of subcontract templates with project-specific special conditions generation using AI. Supports DOCX export.
- **Contract Parsing System**: Parse-once-on-upload architecture extracting and storing structured contract data. Pipeline includes PDF extraction, text normalization, logical part detection, intelligent chunking, Claude Sonnet 4 summarization (clause summaries, defined terms, cross-references, risks), extended TOC extraction (all clause headings with hierarchical ordering), and robust error handling with transactional cleanup. Progress tracking and real-time status updates are provided. Background task handling uses fire-and-forget async IIFEs with explicit `.catch()` handlers to ensure Node.js event loop properly executes parsing jobs. Extended TOC derives clause headings from Claude summaries with orderIndex column for deterministic hierarchical sorting.
- **Data & State Management**: Context-based global filtering, automatic data refresh via TanStack Query, and `localStorage`-backed persistence for global selectors and UI settings.
- **Authentication**: Replit Auth (OpenID Connect) with PostgreSQL-backed sessions.
- **Document Viewer**: Enhanced preview for Excel/Word/PDF files.
- **AI Integration Enhancements**: Multi-AI provider support, AI usage logging, completion summaries, cell-level AI chat, polling-based progress tracking, and robust error/rate limit handling.

### Technology Stack
- **Frontend**: React, Vite, Wouter, TailwindCSS.
- **State Management**: React Context.
- **Backend**: Express.js.
- **Database**: PostgreSQL with Drizzle ORM.

## External Dependencies
- **Replit Object Storage**: For persistent file storage.
- **PostgreSQL**: Primary application database.
- **Express.js**: Backend framework.
- **AI Models**: Anthropic Claude Sonnet 4.
- **Embeddings**: Voyage AI (voyage-law-2, voyage-3-lite).
- **Azure AD OAuth**: Custom integration for SharePoint access via Microsoft Graph API.