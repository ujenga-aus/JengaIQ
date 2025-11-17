import { type User, type InsertUser, type Person, type InsertPerson } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { people, userAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  // Replit Auth methods
  getUserByReplitAuthId(replitAuthId: string): Promise<Person | undefined>;
  upsertUserFromReplit(userData: {
    replitAuthId: string;
    email: string | null;
    givenName: string;
    familyName: string;
    profileImageUrl?: string | null;
  }): Promise<Person>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Replit Auth methods - use database directly
  async getUserByReplitAuthId(replitAuthId: string): Promise<Person | undefined> {
    const [person] = await db
      .select()
      .from(people)
      .where(eq(people.replitAuthId, replitAuthId))
      .limit(1);
    return person;
  }

  async upsertUserFromReplit(userData: {
    replitAuthId: string;
    email: string | null;
    givenName: string;
    familyName: string;
    profileImageUrl?: string | null;
  }): Promise<Person> {
    // Get the default company (first company in the system)
    const { companies } = await import('@shared/schema');
    const [defaultCompany] = await db.select().from(companies).limit(1);
    
    if (!defaultCompany) {
      throw new Error('No company found in system - cannot create user');
    }

    const [person] = await db
      .insert(people)
      .values({
        companyId: defaultCompany.id,
        replitAuthId: userData.replitAuthId,
        email: userData.email || `user${userData.replitAuthId}@replit.local`,
        givenName: userData.givenName,
        familyName: userData.familyName,
        profileImageUrl: userData.profileImageUrl,
      })
      .onConflictDoUpdate({
        target: people.replitAuthId,
        set: {
          email: userData.email || people.email,
          givenName: userData.givenName,
          familyName: userData.familyName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return person;
  }
}

export const storage = new MemStorage();
