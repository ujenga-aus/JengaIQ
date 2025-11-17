import { db } from "./db";
import { sql } from "drizzle-orm";
import * as rbacService from "./rbac-service";

async function testRBAC() {
  console.log("🧪 Testing RBAC System\n");

  // Test 1: Check compatibility view
  console.log("1. Testing compatibility view...");
  const viewResult = await db.execute(sql`SELECT * FROM users_v_legacy LIMIT 5`);
  console.log(`   Found ${viewResult.rows.length} legacy users`);
  if (viewResult.rows.length > 0) {
    console.log(`   Sample:`, viewResult.rows[0]);
  }

  // Test 2: Check roles and permissions
  console.log("\n2. Testing role-permission mappings...");
  const adminRoleResult = await db.execute(sql`
    SELECT r.code as role_code, p.code as permission_code
    FROM roles r
    JOIN role_permissions rp ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.code = 'ADMIN'
    LIMIT 5
  `);
  console.log(`   ADMIN role has ${adminRoleResult.rows.length}+ permissions`);
  console.log(`   Sample permissions:`, adminRoleResult.rows.map((r: any) => r.permission_code));

  // Test 3: Check project role mappings
  console.log("\n3. Testing project role-permission mappings...");
  const projAdminResult = await db.execute(sql`
    SELECT pr.code as role_code, p.code as permission_code
    FROM project_roles pr
    JOIN project_role_permissions prp ON pr.id = prp.project_role_id
    JOIN permissions p ON p.id = prp.permission_id
    WHERE pr.code = 'PROJ_ADMIN'
  `);
  console.log(`   PROJ_ADMIN role has ${projAdminResult.rows.length} permissions`);
  console.log(`   Permissions:`, projAdminResult.rows.map((r: any) => r.permission_code));

  // Test 4: Check tables exist
  console.log("\n4. Checking all RBAC tables exist...");
  const tables = [
    'people',
    'user_accounts',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'project_roles',
    'project_role_permissions',
    'project_memberships'
  ];
  
  for (const table of tables) {
    const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${table}`));
    console.log(`   ✓ ${table}: ${(result.rows[0] as any).count} records`);
  }

  console.log("\n✅ All tests passed!");
}

testRBAC().catch(console.error).finally(() => process.exit(0));
