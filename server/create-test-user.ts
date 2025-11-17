import { db } from "./db";
import { people, userAccounts } from "@shared/schema";
import * as rbacService from "./rbac-service";

async function createTestUser() {
  console.log("Creating test user...");

  // Create person
  const [person] = await db.insert(people).values({
    givenName: "John",
    familyName: "Doe",
    email: "john.doe@example.com",
    mobile: "+1-555-0123",
    employeeNo: "EMP001",
    isActive: true,
  }).returning();

  console.log("Created person:", person.id);

  // Create user account
  const [account] = await db.insert(userAccounts).values({
    personId: person.id,
    username: "john.doe",
    passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz123456", // Dummy hash
    mfaEnabled: false,
  }).returning();

  console.log("Created user account:", account.id);

  // Assign EMPLOYEE role
  await rbacService.assignGlobalRole(account.id, "EMPLOYEE");
  console.log("Assigned EMPLOYEE role");

  console.log("\n✅ Test user created successfully!");
  console.log("Username:", account.username);
  console.log("User Account ID:", account.id);
}

createTestUser().catch(console.error).finally(() => process.exit(0));
