/**
 * Centralized query keys for React Query
 * 
 * This ensures consistent query key usage across the app and makes
 * cache invalidation reliable. Always use these keys instead of hardcoding strings.
 */

export const queryKeys = {
  // Companies
  companies: () => ['/api/companies'] as const,
  company: (id: string) => ['/api/companies', id] as const,
  
  // Business Units
  businessUnits: () => ['/api/business-units'] as const,
  businessUnit: (id: string) => ['/api/business-units', id] as const,
  businessUnitTemplates: (businessUnitId: string) => ['/api/business-units', businessUnitId, 'templates'] as const,
  
  // Projects
  projects: () => ['/api/projects'] as const,
  project: (id: string) => ['/api/projects', id] as const,
  projectRFIs: (projectId: string) => ['/api/projects', projectId, 'rfis'] as const,
  projectContractReview: (projectId: string) => ['/api/projects', projectId, 'contract-review'] as const,
  projectTeam: (projectId: string) => ['/api/projects', projectId, 'team'] as const,
  
  // RFIs
  rfis: () => ['/api/rfis'] as const,
  rfi: (id: string) => ['/api/rfis', id] as const,
  rfiComments: (rfiId: string) => ['/api/rfis', rfiId, 'comments'] as const,
  
  // Users & People
  users: () => ['/api/users'] as const,
  user: (id: string) => ['/api/users', id] as const,
  people: () => ['/api/people'] as const,
  person: (id: string) => ['/api/people', id] as const,
  userAccounts: () => ['/api/user-accounts'] as const,
  userAccount: (id: string) => ['/api/user-accounts', id] as const,
  userEmploymentHistory: (userId: string) => ['/api/users', userId, 'employment-history'] as const,
  
  // Employment Roles
  employmentRoles: () => ['/api/employment-roles'] as const,
  employmentRole: (id: string) => ['/api/employment-roles', id] as const,
  
  // RBAC
  roles: () => ['/api/rbac/roles'] as const,
  userRoles: (userId: string) => ['/api/rbac/users', userId, 'roles'] as const,
  projectRoles: () => ['/api/rbac/project-roles'] as const,
  
  // Project Memberships
  projectMemberships: (projectId?: string) => 
    projectId ? ['/api/project-memberships', { projectId }] as const : ['/api/project-memberships'] as const,
  userProjectMemberships: (userId: string) => ['/api/project-memberships', { userId }] as const,
  
  // Contract Reviews
  contractReviews: () => ['/api/contract-reviews'] as const,
  contractReview: (id: string) => ['/api/contract-reviews', id] as const,
  
  // Templates
  templates: () => ['/api/templates'] as const,
  template: (id: string) => ['/api/templates', id] as const,
  
  // Company Settings & Terminology
  companySettings: (companyId: string) => ['/api/companies', companyId, 'settings'] as const,
  terminology: (companyId: string) => ['/api/companies', companyId, 'terminology'] as const,
  
  // Dashboard & Metrics
  metrics: () => ['/api/metrics'] as const,
  dashboardStats: (companyId?: string) => 
    companyId ? ['/api/dashboard/stats', { companyId }] as const : ['/api/dashboard/stats'] as const,
};

/**
 * Helper function to invalidate all queries related to a specific entity type
 * This ensures comprehensive cache updates when data changes
 */
export const invalidationPatterns = {
  // When a user is created/updated/deleted
  user: () => [
    queryKeys.users(),
    queryKeys.people(),
    queryKeys.userAccounts(),
    queryKeys.metrics(),
    queryKeys.dashboardStats(),
  ],
  
  // When a project is created/updated/deleted
  project: () => [
    queryKeys.projects(),
    queryKeys.metrics(),
    queryKeys.dashboardStats(),
  ],
  
  // When a business unit is created/updated/deleted
  businessUnit: () => [
    queryKeys.businessUnits(),
    queryKeys.projects(),
    queryKeys.metrics(),
  ],
  
  // When a company is created/updated
  company: () => [
    queryKeys.companies(),
    queryKeys.metrics(),
  ],
  
  // When an RFI is created/updated/deleted
  rfi: (projectId?: string) => [
    queryKeys.rfis(),
    ...(projectId ? [queryKeys.projectRFIs(projectId)] : []),
    queryKeys.metrics(),
    queryKeys.dashboardStats(),
  ],
  
  // When a comment is posted on an RFI
  rfiComment: (rfiId: string, projectId?: string) => [
    queryKeys.rfiComments(rfiId),
    queryKeys.rfi(rfiId),
    ...(projectId ? [queryKeys.projectRFIs(projectId)] : []),
  ],
  
  // When project team membership changes
  projectMembership: (projectId: string, userId?: string) => [
    queryKeys.projectTeam(projectId),
    queryKeys.projectMemberships(projectId),
    ...(userId ? [queryKeys.userProjectMemberships(userId)] : []),
    queryKeys.project(projectId),
  ],
  
  // When employment role is created/updated/deleted
  employmentRole: () => [
    queryKeys.employmentRoles(),
    queryKeys.users(),
  ],
  
  // When a user's employment history changes
  userEmployment: (userId: string) => [
    queryKeys.userEmploymentHistory(userId),
    queryKeys.user(userId),
    queryKeys.users(),
  ],
  
  // When contract review template is created/updated
  template: (businessUnitId?: string) => [
    queryKeys.templates(),
    ...(businessUnitId ? [queryKeys.businessUnitTemplates(businessUnitId)] : []),
  ],
  
  // When company terminology/settings change
  companySettings: (companyId: string) => [
    queryKeys.companySettings(companyId),
    queryKeys.terminology(companyId),
    queryKeys.company(companyId),
  ],
};
