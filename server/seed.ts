import { db } from "./db";
import { companies, businessUnits, projects, rfis } from "@shared/schema";

async function seed() {
  console.log("🌱 Seeding database with hierarchical data...");

  try {
    // Step 1: Create 2 companies
    const mockCompanies = [
      {
        name: "Construction Co.",
        abn: "12345678901",
        address: "123 Builder Street, Sydney NSW 2000",
        contactEmail: "info@constructionco.com.au",
        contactPhone: "+61 2 9876 5432",
        notes: "Leading construction company specializing in commercial projects",
      },
      {
        name: "BuildRight Industries",
        abn: "23456789012",
        address: "456 Industry Road, Melbourne VIC 3000",
        contactEmail: "contact@buildright.com.au",
        contactPhone: "+61 3 8765 4321",
        notes: "Industrial construction and engineering firm",
      },
    ];

    const insertedCompanies = await db
      .insert(companies)
      .values(mockCompanies)
      .returning();
    
    console.log(`✅ Inserted ${insertedCompanies.length} companies`);

    // Step 2: Create 2 business units for each company (4 total)
    const mockBusinessUnits = [];
    for (const company of insertedCompanies) {
      mockBusinessUnits.push(
        {
          companyId: company.id,
          name: `${company.name} - Commercial Division`,
          abn: `${company.abn}001`,
          notes: "Commercial construction projects",
        },
        {
          companyId: company.id,
          name: `${company.name} - Residential Division`,
          abn: `${company.abn}002`,
          notes: "Residential construction projects",
        }
      );
    }

    const insertedBusinessUnits = await db
      .insert(businessUnits)
      .values(mockBusinessUnits)
      .returning();
    
    console.log(`✅ Inserted ${insertedBusinessUnits.length} business units`);

    // Step 3: Create 3 projects for each business unit (12 total)
    const mockProjects = [];
    const projectStatuses = ["active", "onhold", "complete"] as const;
    const projectPhases = ["tender", "delivery", "closed"] as const;
    
    for (let i = 0; i < insertedBusinessUnits.length; i++) {
      const bu = insertedBusinessUnits[i];
      for (let j = 0; j < 3; j++) {
        const projectNum = i * 3 + j + 1;
        mockProjects.push({
          businessUnitId: bu.id,
          projectCode: `PRJ-${String(projectNum).padStart(3, '0')}`,
          name: `Project ${projectNum} - ${bu.name.split(' - ')[1]}`,
          client: `Client ${String.fromCharCode(65 + (projectNum % 5))} Corp`,
          location: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"][projectNum % 5],
          status: projectStatuses[j % 3],
          phase: projectPhases[j % 3],
          tenderStartDate: "2024-01-15",
          tenderEndDate: "2024-03-15",
          deliveryStartDate: "2024-03-16",
          deliveryEndDate: "2024-09-15",
          defectsPeriodStartDate: "2024-09-16",
          defectsPeriodEndDate: "2024-12-15",
          closedStartDate: "2024-12-16",
          closedEndDate: "2025-03-15",
        });
      }
    }

    const insertedProjects = await db
      .insert(projects)
      .values(mockProjects)
      .returning();
    
    console.log(`✅ Inserted ${insertedProjects.length} projects`);

    // Step 4: Create 10 RFIs for each project (120 total)
    const mockRFIs = [];
    const rfiStatuses = ["open", "answered", "closed"] as const;
    const rfiPriorities = ["low", "medium", "high"] as const;
    const raisedByNames = ["John Smith", "Sarah Johnson", "Mike Chen", "Emma Wilson", "David Brown"];
    const assignedToNames = ["Lisa Anderson", "Robert Taylor", "Jessica Martinez", "Kevin White", "Michael Davis"];
    
    for (const project of insertedProjects) {
      for (let i = 0; i < 10; i++) {
        const rfiNum = i + 1;
        mockRFIs.push({
          projectId: project.id,
          rfiNumber: `${project.projectCode}-RFI-${String(rfiNum).padStart(3, '0')}`,
          title: `RFI ${rfiNum}: ${["Structural query", "Material specification", "Design clarification", "Safety compliance", "Schedule coordination", "Quality standard", "Installation detail", "System integration", "Access requirement", "Finishing detail"][i]}`,
          description: `This is a detailed description for RFI ${rfiNum} regarding ${project.name}. Further information and technical specifications are required.`,
          status: rfiStatuses[i % 3],
          priority: rfiPriorities[i % 3],
          raisedBy: raisedByNames[i % 5],
          assignedTo: assignedToNames[i % 5],
          dueDate: `2024-${String(11 + (i % 2)).padStart(2, '0')}-${String(10 + (i * 2)).padStart(2, '0')}`,
          isOverdue: i % 4 === 0,
        });
      }
    }

    const insertedRFIs = await db
      .insert(rfis)
      .values(mockRFIs)
      .returning();
    
    console.log(`✅ Inserted ${insertedRFIs.length} RFIs`);

    console.log("\n🎉 Seeding completed successfully!");
    console.log(`📊 Summary:
    - ${insertedCompanies.length} companies
    - ${insertedBusinessUnits.length} business units (${insertedBusinessUnits.length / insertedCompanies.length} per company)
    - ${insertedProjects.length} projects (${insertedProjects.length / insertedBusinessUnits.length} per business unit)
    - ${insertedRFIs.length} RFIs (${insertedRFIs.length / insertedProjects.length} per project)`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

seed();
