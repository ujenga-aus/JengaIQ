import { db } from "./db";
import { 
  users, 
  people, 
  userAccounts, 
  roles, 
  permissions, 
  rolePermissions, 
  userRoles,
  projectRoles,
  projectRolePermissions
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Migration script to migrate from simple users table to normalized RBAC schema
 * 
 * This script:
 * 1. Seeds baseline roles, permissions, and project roles
 * 2. Migrates existing users to people + user_accounts
 * 3. Assigns default roles to all users
 * 4. Creates a compatibility view for backward compatibility
 */

async function seedRBACData() {
  console.log("📋 Seeding RBAC data...");

  // 1. Create roles
  const rolesData = [
    { code: "ADMIN", name: "Administrator", description: "Full system access" },
    { code: "BUM", name: "Business Unit Manager", description: "Manages business units and projects" },
    { code: "EMPLOYEE", name: "Employee", description: "Standard employee access" },
  ];

  const createdRoles: Record<string, string> = {};
  for (const roleData of rolesData) {
    const [existing] = await db.select().from(roles).where(eq(roles.code, roleData.code)).limit(1);
    if (existing) {
      console.log(`  ✓ Role ${roleData.code} already exists`);
      createdRoles[roleData.code] = existing.id;
    } else {
      const [newRole] = await db.insert(roles).values(roleData).returning();
      createdRoles[roleData.code] = newRole.id;
      console.log(`  ✓ Created role: ${roleData.code}`);
    }
  }

  // 2. Create permissions
  const permissionsData = [
    { code: "USER.MANAGE", description: "Manage users and accounts" },
    { code: "PROJECT.MANAGE", description: "Manage projects" },
    { code: "COMPANY.MANAGE", description: "Manage companies" },
    { code: "BU.MANAGE", description: "Manage business units" },
    { code: "DOC.UPLOAD", description: "Upload documents" },
    { code: "DOC.VIEW", description: "View documents" },
    { code: "RFI.CREATE", description: "Create RFIs" },
    { code: "RFI.APPROVE", description: "Approve RFIs" },
    { code: "COST.VIEW", description: "View cost information" },
    { code: "SETTINGS.MANAGE", description: "Manage company settings" },
  ];

  const createdPermissions: Record<string, string> = {};
  for (const permData of permissionsData) {
    const [existing] = await db.select().from(permissions).where(eq(permissions.code, permData.code)).limit(1);
    if (existing) {
      console.log(`  ✓ Permission ${permData.code} already exists`);
      createdPermissions[permData.code] = existing.id;
    } else {
      const [newPerm] = await db.insert(permissions).values(permData).returning();
      createdPermissions[permData.code] = newPerm.id;
      console.log(`  ✓ Created permission: ${permData.code}`);
    }
  }

  // 3. Map permissions to roles
  const roleMappings = {
    ADMIN: [
      "USER.MANAGE", "PROJECT.MANAGE", "COMPANY.MANAGE", "BU.MANAGE",
      "DOC.UPLOAD", "DOC.VIEW", "RFI.CREATE", "RFI.APPROVE",
      "COST.VIEW", "SETTINGS.MANAGE"
    ],
    BUM: [
      "PROJECT.MANAGE", "BU.MANAGE", "DOC.UPLOAD", "DOC.VIEW",
      "RFI.APPROVE", "COST.VIEW"
    ],
    EMPLOYEE: [
      "DOC.UPLOAD", "DOC.VIEW", "RFI.CREATE"
    ],
  };

  for (const [roleCode, permCodes] of Object.entries(roleMappings)) {
    const roleId = createdRoles[roleCode];
    for (const permCode of permCodes) {
      const permId = createdPermissions[permCode];
      
      // Check if mapping already exists
      const [existing] = await db.select()
        .from(rolePermissions)
        .where(sql`${rolePermissions.roleId} = ${roleId} AND ${rolePermissions.permissionId} = ${permId}`)
        .limit(1);

      if (!existing) {
        await db.insert(rolePermissions).values({
          roleId,
          permissionId: permId,
        });
      }
    }
    console.log(`  ✓ Mapped ${permCodes.length} permissions to ${roleCode}`);
  }

  // 4. Create project roles
  const projectRolesData = [
    { code: "PROJ_ADMIN", name: "Project Administrator", description: "Full project access" },
    { code: "PM", name: "Project Manager", description: "Manages project execution" },
    { code: "ENGINEER", name: "Engineer", description: "Technical contributor" },
    { code: "VIEWER", name: "Viewer", description: "Read-only access" },
  ];

  const createdProjectRoles: Record<string, string> = {};
  for (const projRoleData of projectRolesData) {
    const [existing] = await db.select().from(projectRoles).where(eq(projectRoles.code, projRoleData.code)).limit(1);
    if (existing) {
      console.log(`  ✓ Project role ${projRoleData.code} already exists`);
      createdProjectRoles[projRoleData.code] = existing.id;
    } else {
      const [newProjRole] = await db.insert(projectRoles).values(projRoleData).returning();
      createdProjectRoles[projRoleData.code] = newProjRole.id;
      console.log(`  ✓ Created project role: ${projRoleData.code}`);
    }
  }

  // 5. Map permissions to project roles
  const projectRoleMappings = {
    PROJ_ADMIN: ["PROJECT.MANAGE", "DOC.UPLOAD", "DOC.VIEW", "RFI.CREATE", "RFI.APPROVE", "COST.VIEW"],
    PM: ["PROJECT.MANAGE", "DOC.UPLOAD", "DOC.VIEW", "RFI.APPROVE", "COST.VIEW"],
    ENGINEER: ["DOC.UPLOAD", "DOC.VIEW", "RFI.CREATE"],
    VIEWER: ["DOC.VIEW"],
  };

  for (const [projRoleCode, permCodes] of Object.entries(projectRoleMappings)) {
    const projRoleId = createdProjectRoles[projRoleCode];
    for (const permCode of permCodes) {
      const permId = createdPermissions[permCode];
      
      const [existing] = await db.select()
        .from(projectRolePermissions)
        .where(sql`${projectRolePermissions.projectRoleId} = ${projRoleId} AND ${projectRolePermissions.permissionId} = ${permId}`)
        .limit(1);

      if (!existing) {
        await db.insert(projectRolePermissions).values({
          projectRoleId: projRoleId,
          permissionId: permId,
        });
      }
    }
    console.log(`  ✓ Mapped ${permCodes.length} permissions to project role ${projRoleCode}`);
  }

  console.log("✅ RBAC data seeded successfully\n");
  return { createdRoles, createdPermissions };
}

async function migrateUsers(createdRoles: Record<string, string>) {
  console.log("👥 Migrating existing users...");

  // Get all existing users
  const existingUsers = await db.select().from(users);
  console.log(`  Found ${existingUsers.length} users to migrate`);

  for (const user of existingUsers) {
    // Check if already migrated
    const [existingAccount] = await db.select()
      .from(userAccounts)
      .where(eq(userAccounts.username, user.username))
      .limit(1);

    if (existingAccount) {
      console.log(`  ⏭️  User ${user.username} already migrated, skipping`);
      continue;
    }

    // Create person record
    // Since current users table only has username, we'll derive name from username
    const parts = user.username.split(/[@._]/);
    const givenName = parts[0] || user.username;
    const familyName = parts[1] || "";

    const [person] = await db.insert(people).values({
      givenName,
      familyName,
      email: user.username, // Use username as email for now
      mobile: null,
      employeeNo: null,
      isActive: true,
    }).returning();

    console.log(`  ✓ Created person record for ${user.username}`);

    // Create user account
    const [account] = await db.insert(userAccounts).values({
      personId: person.id,
      username: user.username,
      passwordHash: user.password, // Copy password hash directly (no rehashing)
      mfaEnabled: false,
    }).returning();

    console.log(`  ✓ Created user account for ${user.username}`);

    // Assign default EMPLOYEE role
    await db.insert(userRoles).values({
      userAccountId: account.id,
      roleId: createdRoles.EMPLOYEE,
      startDate: new Date().toISOString().split('T')[0],
      endDate: null,
    });

    console.log(`  ✓ Assigned EMPLOYEE role to ${user.username}`);
  }

  console.log(`✅ Migrated ${existingUsers.length} users successfully\n`);
}

async function createCompatibilityView() {
  console.log("🔗 Creating compatibility view...");

  // Drop view if exists
  await db.execute(sql`DROP VIEW IF EXISTS users_v_legacy CASCADE`);

  // Create view that mimics old users table structure
  await db.execute(sql`
    CREATE OR REPLACE VIEW users_v_legacy AS
    SELECT
      ua.id,
      ua.username,
      p.email,
      CONCAT(p.given_name, ' ', p.family_name) AS name,
      p.mobile,
      COALESCE(r.code, 'EMPLOYEE') AS role,
      p.is_active
    FROM user_accounts ua
    JOIN people p ON p.id = ua.person_id
    LEFT JOIN LATERAL (
      SELECT r.code
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_account_id = ua.id AND ur.end_date IS NULL
      ORDER BY ur.start_date DESC
      LIMIT 1
    ) r ON TRUE
  `);

  console.log("✅ Compatibility view created\n");
}

async function main() {
  try {
    console.log("🚀 Starting RBAC migration...\n");

    // Step 1: Seed RBAC data
    const { createdRoles } = await seedRBACData();

    // Step 2: Migrate existing users
    await migrateUsers(createdRoles);

    // Step 3: Create compatibility view
    await createCompatibilityView();

    console.log("✅ Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Test the application to ensure backward compatibility");
    console.log("2. Update application code to use new schema");
    console.log("3. Once confirmed working, the old 'users' table can be renamed to 'users_legacy'");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run migration
main().catch(console.error);
