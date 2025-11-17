/**
 * Centralized mutation helpers with comprehensive cache invalidation
 * 
 * These helpers ensure that when data changes, all related queries are invalidated
 * so the UI updates automatically everywhere
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryKeys, invalidationPatterns } from "./queryKeys";

// User Mutations
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userData: {
      givenName: string;
      familyName: string;
      email: string;
      username: string;
      password: string;
      mobile?: string;
      employeeNo?: string;
      roleCode?: string;
      employmentRoleId?: string;
      employmentStartDate?: string;
    }) => {
      // Step 1: Create person
      const personResponse = await apiRequest("POST", "/api/people", {
        givenName: userData.givenName,
        familyName: userData.familyName,
        email: userData.email,
        mobile: userData.mobile || null,
        employeeNo: userData.employeeNo || null,
        isActive: true,
      });
      const person = await personResponse.json();

      // Step 2: Create user account
      const userAccountResponse = await apiRequest("POST", "/api/user-accounts", {
        personId: person.id,
        username: userData.username,
        passwordHash: userData.password,
        mfaEnabled: false,
      });
      const userAccount = await userAccountResponse.json();

      // Step 3: Assign global role (if provided)
      if (userData.roleCode) {
        await apiRequest("POST", `/api/rbac/users/${userAccount.id}/roles`, {
          roleCode: userData.roleCode,
          startDate: new Date().toISOString().split('T')[0],
        });
      }

      // Step 4: Assign employment role (if provided)
      if (userData.employmentRoleId) {
        await apiRequest("POST", `/api/users/${userAccount.id}/employment-history`, {
          employmentRoleId: userData.employmentRoleId,
          startDate: userData.employmentStartDate || new Date().toISOString().split('T')[0],
          notes: "Initial employment role on user creation",
        });
      }

      return userAccount;
    },
    onSuccess: () => {
      // Invalidate all user-related queries
      invalidationPatterns.user().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useUpdateUser(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}`, data);
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.user(userId) });
      invalidationPatterns.user().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

// Project Mutations
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectData: any) => {
      const response = await apiRequest("POST", "/api/projects", projectData);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all project-related queries with broad matching
      qc.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/projects');
        }
      });
      
      // Invalidate metrics and dashboard stats
      invalidationPatterns.project().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useUpdateProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/projects/${projectId}`, data);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate specific project
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      
      // Invalidate all project-related queries with broad matching
      qc.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/projects');
        }
      });
      
      // Invalidate metrics and dashboard stats
      invalidationPatterns.project().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

// Business Unit Mutations
export function useCreateBusinessUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/business-units", data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.businessUnit().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useUpdateBusinessUnit(businessUnitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/business-units/${businessUnitId}`, data);
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.businessUnit(businessUnitId) });
      invalidationPatterns.businessUnit().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

// Company Mutations
export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/companies", data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.company().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useUpdateCompany(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/companies/${companyId}`, data);
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.company(companyId) });
      invalidationPatterns.company().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

// RFI Mutations
export function useCreateRFI(projectId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/rfis", data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.rfi(projectId).forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useUpdateRFI(rfiId: string, projectId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/rfis/${rfiId}`, data);
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rfi(rfiId) });
      invalidationPatterns.rfi(projectId).forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

// RFI Comment Mutations
export function useCreateRFIComment(rfiId: string, projectId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userAccountId: string; content: string; attachments?: any }) => {
      const response = await apiRequest("POST", `/api/rfis/${rfiId}/comments`, data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.rfiComment(rfiId, projectId).forEach(key => 
        qc.invalidateQueries({ queryKey: key })
      );
    },
  });
}

// Project Membership Mutations
export function useUpdateProjectMembership(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userId: string; projectRoleCode: string }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/rbac/projects/${projectId}/members/${data.userId}`,
        { projectRoleCode: data.projectRoleCode }
      );
      return response.json();
    },
    onSuccess: (_, variables) => {
      invalidationPatterns.projectMembership(projectId, variables.userId).forEach(key =>
        qc.invalidateQueries({ queryKey: key })
      );
    },
  });
}

export function useAddProjectMembers(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { memberIds: string[]; projectRoleCode: string }) => {
      const response = await apiRequest("POST", `/api/rbac/projects/${projectId}/members`, data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.projectMembership(projectId).forEach(key =>
        qc.invalidateQueries({ queryKey: key })
      );
    },
  });
}

// Employment Role Mutations
export function useCreateEmploymentRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { companyId: string; title: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/employment-roles", data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.employmentRole().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useUpdateEmploymentRole(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title?: string; description?: string; isActive?: boolean }) => {
      const response = await apiRequest("PATCH", `/api/employment-roles/${roleId}`, data);
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.employmentRole(roleId) });
      invalidationPatterns.employmentRole().forEach(key => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

// User Employment History Mutations
export function useCreateEmploymentHistory(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { employmentRoleId: string; startDate: string; notes?: string }) => {
      const response = await apiRequest(`POST`, `/api/users/${userId}/employment-history`, data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.userEmployment(userId).forEach(key => 
        qc.invalidateQueries({ queryKey: key })
      );
    },
  });
}

// Template Mutations
export function useCreateTemplate(businessUnitId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/templates", data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.template(businessUnitId).forEach(key => 
        qc.invalidateQueries({ queryKey: key })
      );
    },
  });
}

export function useUpdateTemplate(templateId: string, businessUnitId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/templates/${templateId}`, data);
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.template(templateId) });
      invalidationPatterns.template(businessUnitId).forEach(key => 
        qc.invalidateQueries({ queryKey: key })
      );
    },
  });
}

// Company Settings Mutations
export function useUpdateCompanySettings(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/companies/${companyId}/settings`, data);
      return response.json();
    },
    onSuccess: () => {
      invalidationPatterns.companySettings(companyId).forEach(key => 
        qc.invalidateQueries({ queryKey: key })
      );
    },
  });
}
