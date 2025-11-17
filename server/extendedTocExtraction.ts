/**
 * Extended TOC Extraction
 * 
 * Scans through the entire parsed contract text to detect all clause headings
 * with numeric references (e.g., "1 Definitions", "1.1 Interpretation", "2.3.4 Something").
 * 
 * This builds a comprehensive table of contents from the actual contract body,
 * not relying on the front-of-document TOC which may be incomplete.
 */

export interface ExtendedTocEntry {
  clauseNumber: string;
  description: string;
  pageNo: number;
}

/**
 * Comprehensive clause number pattern from tocParser.ts
 * Matches: "1", "1.1", "2.3.4", "25.1(b)", "7.4.2(c)(ii)", etc.
 */
const CLAUSE_NUMBER_PATTERN = /(?:[IVXLCDM]+|[A-Za-z0-9]*\d+[A-Za-z0-9]*|[A-Z]{1,4}(?=[.\-]))(?:[.\-](?:[IVXLCDM]+|[A-Za-z0-9]*\d+[A-Za-z0-9]*))*(?:\([A-Za-z0-9]+\))*/;

/**
 * Check if a heading looks like a valid clause heading
 * 
 * Valid headings typically:
 * - Start with a capital letter
 * - Are 3-100 characters long
 * - Don't start with common false positive patterns
 */
function isValidClauseHeading(heading: string): boolean {
  // Too short or too long
  if (heading.length < 3 || heading.length > 100) return false;
  
  // Should start with a capital letter or [
  if (!/^[A-Z\[]/.test(heading)) return false;
  
  // Exclude common false positive patterns
  const falsePositives = [
    /^Business Day/i,
    /^Month/i,
    /^Year/i,
    /^Week/i,
    /^of the Payment/i,
    /^and\s+/i,
    /^or\s+/i,
    /^are solely/i,
    /^is required/i,
    /^was correct/i,
    /^have been/i,
  ];
  
  for (const pattern of falsePositives) {
    if (pattern.test(heading)) return false;
  }
  
  return true;
}

/**
 * Extract clause number and heading from a line
 * 
 * Pattern: clause number at start, followed by whitespace, then heading text
 * Examples:
 * - "1  Definitions and Interpretation"
 * - "1.1  Definitions"
 * - "2.3.4  Special Conditions"
 * - "25.1(b)  Performance Bond"
 */
function parseClauseHeading(line: string): { number: string; heading: string } | null {
  const trimmed = line.trim();
  
  if (!trimmed) return null;
  
  // Build pattern: ^(clauseNumber)\s+(.+)
  // Must start with clause number, followed by whitespace, then heading text
  const clausePattern = new RegExp(`^(${CLAUSE_NUMBER_PATTERN.source})\\s+(.+)`);
  const match = trimmed.match(clausePattern);
  
  if (!match) return null;
  
  const number = match[1];
  let heading = match[2];
  
  // Remove trailing page number patterns and dots
  // Matches: "............ 45", "............45", or just "45"
  heading = heading.replace(/\.+\s*\d+\s*$/, '').trim();
  heading = heading.replace(/\s+\d+$/, '').trim();
  
  // Ignore if heading is empty after cleanup
  if (!heading) return null;
  
  // Ignore if heading is just a page marker
  if (/^page\s+\d+$/i.test(heading)) return null;
  
  // Check if this looks like a valid clause heading
  if (!isValidClauseHeading(heading)) return null;
  
  // Ignore very long clause numbers (likely document IDs)
  if (number.length > 15) return null;
  
  // Ignore clause numbers that are just large numbers (likely document IDs)
  if (/^\d{4,}/.test(number)) return null;
  
  return { number, heading };
}

/**
 * Extract page number from a page marker line
 * Format: "=== PAGE 15 ===" or similar
 */
function extractPageNumber(line: string): number | null {
  const match = line.match(/===\s*PAGE\s+(\d+)\s*===/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Build extended TOC from parsed contract text
 * 
 * @param rawText - The raw extracted text with === PAGE X === markers
 * @returns Array of clause headings with page numbers
 */
export function buildExtendedToc(rawText: string): ExtendedTocEntry[] {
  const entries: ExtendedTocEntry[] = [];
  const lines = rawText.split('\n');
  
  let currentPage = 1; // Default to page 1 if no markers found
  const seenClauses = new Set<string>(); // Track duplicates within same parsed asset
  
  for (const line of lines) {
    // Check for page marker first
    const pageNo = extractPageNumber(line);
    if (pageNo !== null) {
      currentPage = pageNo;
      continue;
    }
    
    // Try to parse as clause heading
    const parsed = parseClauseHeading(line);
    if (!parsed) continue;
    
    // Deduplicate: If we've already seen this exact clause number, skip it
    // This handles cases where headings might repeat across pages
    if (seenClauses.has(parsed.number)) {
      continue;
    }
    
    seenClauses.add(parsed.number);
    
    entries.push({
      clauseNumber: parsed.number,
      description: parsed.heading,
      pageNo: currentPage,
    });
  }
  
  return entries;
}

/**
 * Sort extended TOC entries by clause number hierarchy
 * 
 * Sorts: "1" before "1.1" before "1.2" before "2" before "2.1", etc.
 * Also handles: "1.1(a)" before "1.1(b)", "1.10" after "1.9"
 */
export function sortExtendedToc(entries: ExtendedTocEntry[]): ExtendedTocEntry[] {
  return entries.sort((a, b) => {
    // Split clause numbers into parts for comparison
    // Handle: "1.2.3" → ["1", "2", "3"]
    // Handle: "1.1(a)" → ["1", "1", "(a)"]
    const partsA = a.clauseNumber.split(/(?=\.)|(?=\()/);
    const partsB = b.clauseNumber.split(/(?=\.)|(?=\()/);
    
    // Compare part by part
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || '';
      const partB = partsB[i] || '';
      
      // If both parts are numeric, compare as numbers
      const numA = parseInt(partA.replace(/[^\d]/g, ''), 10);
      const numB = parseInt(partB.replace(/[^\d]/g, ''), 10);
      
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      }
      
      // Otherwise compare as strings
      if (partA !== partB) {
        return partA.localeCompare(partB);
      }
    }
    
    return 0;
  });
}
