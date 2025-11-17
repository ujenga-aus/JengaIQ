import { db } from "./db";
import {
  userAccounts,
  people,
  roles,
  permissions,
  rolePermissions,
  userRoles,
  projectRoles,
  projectRolePermissions,
  projectMemberships,
  type InsertUserAccount,
  type InsertPerson,
  type InsertUserRole,
  type InsertProjectMembership,
} from "@shared/schema";
import { eq, and, sql, isNull, or, lte, gte } from "drizzle-orm";

/**
 * RBAC Service - Provides helper functions for role-based access control
 */

/**
 * Get all active global permissions for a user
 * @param userAccountId - The user account ID
 * @returns Array of permission codes
 */
export async function getCurrentGlobalPermissions(userAccountId: string): Promise<string[]> {
  const today = new Date().toISOString().split('T')[0];
  
  const result = await db
    .select({ code: permissions.code })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(userRoles.userAccountId, userAccountId),
        lte(userRoles.startDate, today),
        or(
          isNull(userRoles.endDate),
          gte(userRoles.endDate, today)
        )
      )
    );

  return result.map(r => r.code);
}

/**
 * Get all active project permissions for a user on a specific project
 * @param userAccountId - The user account ID
 * @param projectId - The project ID
 * @returns Array of permission codes
 */
export async function getCurrentProjectPermissions(
  userAccountId: string,
  projectId: string
): Promise<string[]> {
  const today = new Date().toISOString().split('T')[0];
  
  const result = await db
    .select({ code: permissions.code })
    .from(projectMemberships)
    .innerJoin(projectRolePermissions, eq(projectMemberships.projectRoleId, projectRolePermissions.projectRoleId))
    .innerJoin(permissions, eq(projectRolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(projectMemberships.userAccountId, userAccountId),
        eq(projectMemberships.projectId, projectId),
        lte(projectMemberships.startDate, today),
        or(
          isNull(projectMemberships.endDate),
          gte(projectMemberships.endDate, today)
        )
      )
    );

  return result.map(r => r.code);
}

/**
 * Check if a user has a specific global permission
 * @param userAccountId - The user account ID
 * @param permissionCode - The permission code to check
 * @returns true if user has the permission
 */
export async function hasGlobalPermission(
  userAccountId: string,
  permissionCode: string
): Promise<boolean> {
  const perms = await getCurrentGlobalPermissions(userAccountId);
  return perms.includes(permissionCode);
}

/**
 * Check if a user has a specific project permission
 * @param userAccountId - The user account ID
 * @param projectId - The project ID
 * @param permissionCode - The permission code to check
 * @returns true if user has the permission on the project
 */
export async function hasProjectPermission(
  userAccountId: string,
  projectId: string,
  permissionCode: string
): Promise<boolean> {
  const perms = await getCurrentProjectPermissions(userAccountId, projectId);
  return perms.includes(permissionCode);
}

/**
 * Assign a global role to a user
 * @param userAccountId - The user account ID
 * @param roleCode - The role code (e.g., 'ADMIN', 'BUM', 'EMPLOYEE')
 * @param startDate - Start date (defaults to today)
 * @param endDate - Optional end date
 */
export async function assignGlobalRole(
  userAccountId: string,
  roleCode: string,
  startDate?: string,
  endDate?: string | null
): Promise<void> {
  // Get role by code
  const [role] = await db.select().from(roles).where(eq(roles.code, roleCode)).limit(1);
  
  if (!role) {
    throw new Error(`Role not found: ${roleCode}`);
  }

  // End any existing active roles of the same type
  const today = new Date().toISOString().split('T')[0];
  await db
    .update(userRoles)
    .set({ endDate: today })
    .where(
      and(
        eq(userRoles.userAccountId, userAccountId),
        eq(userRoles.roleId, role.id),
        isNull(userRoles.endDate)
      )
    );

  // Create new role assignment
  await db.insert(userRoles).values({
    userAccountId,
    roleId: role.id,
    startDate: startDate || today,
    endDate: endDate || null,
  });
}

/**
 * Assign a project role to a user
 * @param projectId - The project ID
 * @param userAccountId - The user account ID
 * @param projectRoleCode - The project role code (e.g., 'PROJ_ADMIN', 'PM', 'ENGINEER')
 * @param assignedByUserId - Optional user ID of who assigned this role
 * @param notes - Optional notes
 */
export async function assignProjectRole(
  projectId: string,
  userAccountId: string,
  projectRoleCode: string,
  assignedByUserId?: string,
  notes?: string
): Promise<void> {
  // Get project role by code
  const [projRole] = await db
    .select()
    .from(projectRoles)
    .where(eq(projectRoles.code, projectRoleCode))
    .limit(1);
  
  if (!projRole) {
    throw new Error(`Project role not found: ${projectRoleCode}`);
  }

  const today = new Date().toISOString().split('T')[0];

  // Check if membership already exists
  const [existing] = await db
    .select()
    .from(projectMemberships)
    .where(
      and(
        eq(projectMemberships.projectId, projectId),
        eq(projectMemberships.userAccountId, userAccountId),
        isNull(projectMemberships.endDate)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing membership
    await db
      .update(projectMemberships)
      .set({
        projectRoleId: projRole.id,
        assignedByUserId,
        notes,
      })
      .where(eq(projectMemberships.id, existing.id));
  } else {
    // Create new membership
    await db.insert(projectMemberships).values({
      projectId,
      userAccountId,
      projectRoleId: projRole.id,
      startDate: today,
      endDate: null,
      assignedByUserId,
      notes,
    });
  }
}

/**
 * Remove a user from a project (end their membership)
 * @param projectId - The project ID
 * @param userAccountId - The user account ID
 */
export async function removeFromProject(
  projectId: string,
  userAccountId: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  await db
    .update(projectMemberships)
    .set({ endDate: today })
    .where(
      and(
        eq(projectMemberships.projectId, projectId),
        eq(projectMemberships.userAccountId, userAccountId),
        isNull(projectMemberships.endDate)
      )
    );
}

/**
 * Get all active project memberships for a user
 * @param userAccountId - The user account ID
 * @returns Array of project memberships with project and role details
 */
export async function getUserProjects(userAccountId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  return await db
    .select({
      membershipId: projectMemberships.id,
      projectId: projectMemberships.projectId,
      projectRoleCode: projectRoles.code,
      projectRoleName: projectRoles.name,
      startDate: projectMemberships.startDate,
      endDate: projectMemberships.endDate,
      notes: projectMemberships.notes,
    })
    .from(projectMemberships)
    .innerJoin(projectRoles, eq(projectMemberships.projectRoleId, projectRoles.id))
    .where(
      and(
        eq(projectMemberships.userAccountId, userAccountId),
        lte(projectMemberships.startDate, today),
        or(
          isNull(projectMemberships.endDate),
          gte(projectMemberships.endDate, today)
        )
      )
    );
}

/**
 * Get all users assigned to a project
 * @param projectId - The project ID
 * @returns Array of user accounts with their project roles
 */
export async function getProjectMembers(projectId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  return await db
    .select({
      userAccountId: userAccounts.id,
      username: userAccounts.username,
      givenName: people.givenName,
      familyName: people.familyName,
      email: people.email,
      projectRoleCode: projectRoles.code,
      projectRoleName: projectRoles.name,
      membershipId: projectMemberships.id,
      startDate: projectMemberships.startDate,
      notes: projectMemberships.notes,
    })
    .from(projectMemberships)
    .innerJoin(userAccounts, eq(projectMemberships.userAccountId, userAccounts.id))
    .innerJoin(people, eq(userAccounts.personId, people.id))
    .innerJoin(projectRoles, eq(projectMemberships.projectRoleId, projectRoles.id))
    .where(
      and(
        eq(projectMemberships.projectId, projectId),
        lte(projectMemberships.startDate, today),
        or(
          isNull(projectMemberships.endDate),
          gte(projectMemberships.endDate, today)
        )
      )
    );
}

/**
 * Get user account details with person info
 * @param userAccountId - The user account ID
 */
export async function getUserAccountDetails(userAccountId: string) {
  const [result] = await db
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
    .innerJoin(people, eq(userAccounts.personId, people.id))
    .where(eq(userAccounts.id, userAccountId))
    .limit(1);

  return result;
}

/**
 * Get all active roles for a user
 * @param userAccountId - The user account ID
 */
export async function getUserRoles(userAccountId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  return await db
    .select({
      roleId: roles.id,
      roleCode: roles.code,
      roleName: roles.name,
      roleDescription: roles.description,
      startDate: userRoles.startDate,
      endDate: userRoles.endDate,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userAccountId, userAccountId),
        lte(userRoles.startDate, today),
        or(
          isNull(userRoles.endDate),
          gte(userRoles.endDate, today)
        )
      )
    );
}
