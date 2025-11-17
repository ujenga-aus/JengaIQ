# Design Guidelines: Construction RFI & Project Management System

## Design Approach

**Selected Framework:** Material Design System (adapted for enterprise construction management)

**Justification:** This is a utility-focused, information-dense enterprise application where efficiency, data clarity, and cross-platform consistency are paramount. Material Design provides robust patterns for complex data tables, forms, and mobile interactions while maintaining professional credibility in the construction sector.

**Core Design Principles:**
1. **Clarity Over Decoration** - Every visual element serves a functional purpose
2. **Data Hierarchy** - Clear visual distinction between primary actions, critical data, and supporting information
3. **Responsive Efficiency** - Seamless transition between desktop workflows and mobile field operations
4. **Trust Through Consistency** - Predictable patterns build user confidence in mission-critical tasks

---

## Core Design Elements

### A. Color Palette

**Primary Colors (Brand/Actions):**
- Primary: 210 95% 45% (Deep construction blue - conveys trust and professionalism)
- Primary Hover: 210 95% 38%
- Primary Light: 210 85% 92% (backgrounds, subtle highlights)

**Functional Colors:**
- Success: 145 65% 42% (RFI closed, compliant benchmarks)
- Warning: 38 92% 50% (due soon, partial compliance)
- Error: 4 90% 58% (overdue, gaps in contract review)
- Info: 200 95% 45% (informational badges)

**Neutral Palette (Dark Mode Primary):**
- Background: 220 15% 10%
- Surface: 220 13% 15%
- Surface Elevated: 220 12% 18%
- Border: 220 10% 25%
- Text Primary: 0 0% 95%
- Text Secondary: 0 0% 70%
- Text Disabled: 0 0% 45%

**Light Mode (Desktop Optional):**
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Border: 220 15% 85%
- Text Primary: 220 20% 15%

### B. Typography

**Font Families:**
- Primary: 'Inter' (Google Fonts) - clean, highly legible for dense data
- Monospace: 'JetBrains Mono' - for RFI numbers, project IDs, technical references

**Type Scale:**
- Display (Project Headers): text-3xl font-bold (30px)
- H1 (Page Titles): text-2xl font-semibold (24px)
- H2 (Section Headers): text-xl font-semibold (20px)
- H3 (Card Titles): text-lg font-medium (18px)
- Body: text-base (16px)
- Small (Meta Info): text-sm (14px)
- Captions (Timestamps): text-xs (12px)

**Code/Technical:**
- RFI Numbers: font-mono text-sm font-medium tracking-wide

### C. Layout System

**Spacing Units:** Consistent use of Tailwind units 2, 4, 6, 8, 12, 16, 20 for vertical and horizontal rhythm

**Container Strategy:**
- Full-width layouts: max-w-screen-2xl mx-auto (dashboards, registers)
- Content sections: max-w-7xl mx-auto px-6
- Forms/Dialogs: max-w-2xl
- Reading content: max-w-3xl

**Grid Systems:**
- Dashboard Cards: grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6
- Project List: grid-cols-1 lg:grid-cols-2 gap-4
- RFI Register: Full-width data table with fixed columns

### D. Component Library

**Navigation:**
- Top Navigation Bar: Fixed header (h-16) with company switcher, global search, user menu
- Sidebar Navigation: w-64 collapsible on mobile, hierarchical tree structure (Company > BUs > Projects)
- Breadcrumbs: Always visible below header for deep navigation context

**Data Display:**
- RFI Register Table: Sticky header, alternating row backgrounds (surface/surface-elevated), hover states, sortable columns with arrow indicators
- Project Cards: Rounded corners (rounded-lg), shadow-sm, status badge top-right, metrics grid at bottom
- Timeline Component: Horizontal phase timeline with connector lines, current phase highlighted, date ranges below

**Forms:**
- Input Fields: h-10 rounded-md border-2 focus:border-primary bg-surface text-primary-text
- Text Areas: min-h-32 for descriptions
- Dropdowns: Custom styled with chevron indicator, max-h-60 overflow scrolling
- File Upload: Drag-drop zone with dashed border, preview thumbnails for images
- Rich Text Editor: Minimal toolbar (bold, italic, lists, links) with markdown preview

**Buttons:**
- Primary: bg-primary text-white h-10 px-6 rounded-md font-medium shadow-sm hover:shadow
- Secondary: border-2 border-primary text-primary bg-transparent hover:bg-primary/10
- Destructive: bg-error text-white
- Icon Buttons: w-10 h-10 rounded-full hover:bg-surface-elevated

**Status & Badges:**
- RFI Status Pills: px-3 py-1 rounded-full text-xs font-medium
  - Open: bg-info/20 text-info border border-info/40
  - Awaiting Info: bg-warning/20 text-warning
  - Responded: bg-success/20 text-success
  - Closed: bg-neutral/20 text-neutral
- Overdue Badge: Pulsing red dot with "X days overdue" text
- Due Soon: Amber warning triangle icon

**Modals & Overlays:**
- Dialogs: max-w-2xl rounded-xl shadow-2xl with backdrop blur
- Quick Create RFI (Mobile): Slide-up panel, full-height, smooth transition
- Image Lightbox: Dark overlay with zoom controls, swipe navigation

**Comments/Threading:**
- Facebook-style nested comments with avatar (left), user name, timestamp, indent levels (pl-12 for replies)
- @mention autocomplete dropdown
- Attachment thumbnails inline with preview on click
- Edit indicator and version history link

### E. Animations & Interactions

**Minimal, Purposeful Motion:**
- Page Transitions: Smooth fade-in (150ms) for route changes
- Dropdown Menus: Slide-down with 200ms ease-out
- Toast Notifications: Slide-in from top-right (300ms)
- Loading States: Skeleton screens (pulsing shimmer) for tables, spinner for actions
- No hero animations, parallax, or decorative motion

---

## Page-Specific Layouts

### Dashboard/Home
- **Top Metrics Bar:** 4-column grid showing total projects, open RFIs, overdue count, avg response time (large numbers, icons, trend indicators)
- **Recent Activity Feed:** Chronological list of RFI updates, contract reviews, status changes (avatar + timestamp + action)
- **Quick Actions Panel:** "Create RFI", "New Project", "Upload Contract" prominent buttons
- **Projects by Phase:** Grouped cards (Tender/Delivery/Close-out) with count badges

### Project Detail
- **Tab Navigation:** Horizontal tabs (Overview, Contract Review, RFIs, Documents, Settings) with active indicator
- **Overview Tab:** Phase timeline at top, key contacts cards (3-column), recent RFI activity table
- **Contract Review Tab:** Upload zone, AI reports list with risk heatmap visualization, clause variance table
- **RFI Tab:** Filter bar (status, date range, assignee), table register with inline quick actions

### RFI Detail/Thread
- **Header:** RFI number (large, monospace), status badge, metadata grid (To, Required Date, Impact Areas)
- **Main Content:** Description card, attachments gallery, proposed resolution section
- **Threading Section:** Comment input at top (logged-in user), threaded comments below with reply UI inline
- **Sidebar:** Distribution list, related documents, audit trail timestamps

### Mobile App (iPhone)
- **Bottom Tab Bar:** Projects, RFIs, Create (center, elevated), Notifications, Profile
- **Quick Create RFI:** Camera-first UI, voice-to-text button for description, minimal form with smart defaults
- **RFI List:** Card-based with swipe actions (respond, close), status color-coded left border
- **Offline Indicator:** Persistent banner when disconnected, sync status icon

---

## Images

**Hero/Marketing Pages:** This is an enterprise tool with no marketing landing pages. Focus on functional UI with occasional contextual illustrations.

**In-App Imagery:**
- **Empty States:** Custom illustrations for "No RFIs yet", "No projects", simple line art style in primary color
- **RFI Photo Attachments:** Grid display with rounded corners, 3-column on desktop, 2-column mobile, lightbox on click
- **User Avatars:** Circular (w-10 h-10), initials fallback with color hash, uploaded photos supported
- **Contract Document Previews:** PDF thumbnail with file type icon overlay

**No large hero images** - this is a data-first application where screen real estate is precious for functional content.