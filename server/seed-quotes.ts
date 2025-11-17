import { db } from "./db";
import { quoteCategories, quotes } from "../shared/schema";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function seedQuotes() {
  console.log("Starting quote import...");

  // Read CSV file
  const csvPath = join(__dirname, "../attached_assets/Pasted-display-sequence-category-item-index-text-1-Key-Contract-Principle-1-Procedure-protects-entitlemen-1763293723967_1763293723968.txt");
  const csvContent = readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").slice(1); // Skip header

  // Parse CSV and group by category
  const categoriesMap = new Map<string, { name: string; quotes: { itemIndex: number; text: string }[] }>();
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Split by commas, handling quoted fields
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    parts.push(current); // Add last field
    
    if (parts.length < 4) continue;
    
    const [, category, itemIndexStr, text] = parts;
    const itemIndex = parseInt(itemIndexStr);
    
    if (!category || !itemIndexStr || isNaN(itemIndex)) continue;
    
    if (!categoriesMap.has(category)) {
      categoriesMap.set(category, {
        name: category,
        quotes: [],
      });
    }
    
    categoriesMap.get(category)!.quotes.push({
      itemIndex,
      text,
    });
  }

  console.log(`Found ${categoriesMap.size} categories`);

  // Insert categories in order (all categories from the CSV)
  const categoryOrder = [
    "Key Contract Principle",
    "Commercial Management",
    "Mini Challenge",
    "Red Flag",
    "Clause of the Day",
    "Productivity / Cost Fact",
    "Adjudication / Claims Insight",
    "Micro-Template",
  ];

  const categoryIds = new Map<string, string>();

  for (let i = 0; i < categoryOrder.length; i++) {
    const categoryName = categoryOrder[i];
    const categoryData = categoriesMap.get(categoryName);
    
    if (!categoryData) {
      console.log(`Warning: Category "${categoryName}" not found in CSV`);
      continue;
    }

    const slug = categoryName.toLowerCase().replace(/ /g, "-").replace(/\//g, "");
    
    // Insert category
    const [inserted] = await db.insert(quoteCategories).values({
      name: categoryName,
      slug,
      displayOrder: i,
    }).returning();

    categoryIds.set(categoryName, inserted.id);
    console.log(`Inserting category: ${categoryName} (${categoryData.quotes.length} quotes)`);

    // Batch insert quotes for this category (chunks of 50)
    const quotesToInsert = categoryData.quotes.map(q => ({
      categoryId: inserted.id,
      itemIndex: q.itemIndex,
      text: q.text.replace(/\r/g, '').trim(), // Remove carriage returns
    }));

    // Insert in batches
    const batchSize = 50;
    for (let j = 0; j < quotesToInsert.length; j += batchSize) {
      const batch = quotesToInsert.slice(j, j + batchSize);
      await db.insert(quotes).values(batch);
    }
    
    console.log(`✓ Inserted ${categoryName}`);
  }

  console.log("Quote import complete!");
  process.exit(0);
}

seedQuotes().catch(console.error);
