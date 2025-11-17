/**
 * TOC Parser - Extract clause numbers and headings from Table of Contents text
 * 
 * Handles common clause numbering patterns:
 * - "1.2.3  Heading Text"
 * - "1.2.3  Heading Text ............ 45"  (with dots/page numbers)
 * - "1.    Main Heading"
 * - "  1.1   Sub Heading"  (with indentation)
 */

export interface ClauseMapping {
  number: string;
  heading: string;
}

/**
 * Parse TOC text into clause number → heading mappings
 */
export function parseTOC(tocText: string): Map<string, string> {
  const clauseMap = new Map<string, string>();
  
  if (!tocText) return clauseMap;
  
  // Split into lines and process each
  const lines = tocText.split('\n');
  
  for (const line of lines) {
    const mapping = parseClauseLine(line);
    if (mapping) {
      clauseMap.set(mapping.number, mapping.heading);
    }
  }
  
  return clauseMap;
}

/**
 * Comprehensive clause number pattern supporting ALL legal/contract clause formats
 * while rejecting non-clause headings like "SECTION", "Article", etc.
 * 
 * Pattern structure: (?:[IVXLCDM]+|[A-Za-z0-9]*\d+[A-Za-z0-9]*|[A-Z]{1,4}(?=[.\-]))(?:[.\-](?:[IVXLCDM]+|[A-Za-z0-9]*\d+[A-Za-z0-9]*))*(?:\([A-Za-z0-9]+\))*
 * 
 * CRITICAL CONSTRAINTS:
 * 1. Most segments must contain a digit OR be a Roman numeral
 * 2. Exception: Alpha prefixes (1-4 chars) are allowed ONLY when followed by a separator
 * 3. This prevents matching heading words while accepting appendix/code prefixes like "A-1", "SC-12.3"
 * 
 * First segment (one of):
 * - [IVXLCDM]+ - Roman numerals (I, II, III, IV, V, X, L, C, D, M)
 * - [A-Za-z0-9]*\d+[A-Za-z0-9]* - Contains at least one digit (1, 1A, GC1, 12AB, etc.)
 * - [A-Z]{1,4}(?=[.\-]) - Alpha codes (1-4 chars) followed by separator (A, B, SC, GC, PC, AS, etc.)
 * 
 * Additional segments (repeating):
 * - [.\-] - Dot or hyphen separator
 * - (?:[IVXLCDM]+|[A-Za-z0-9]*\d+[A-Za-z0-9]*) - Must contain digit or be roman numeral
 * 
 * Parenthetical suffixes (repeating):
 * - (?:\([A-Za-z0-9]+\))* - Any alphanumeric in parentheses
 * 
 * Supported formats:
 * 
 * Standard numeric:
 * - Basic: "1", "25"
 * - Multi-level: "1.2", "1.2.3", "1.2.3.4"
 * - With letters: "2.1A", "3.5AB", "1.2ABC"
 * - Letters between levels: "3A.1", "12B.4", "1.2A.3"
 * 
 * Roman numerals:
 * - Prefix: "I.1", "II.3", "IV.2A"
 * - In sequence: "I.1.2", "II.3.4(a)"
 * - Mixed: "II.3A.1(b)(ii)"
 * - Standalone: "V", "XII"
 * 
 * Alpha prefixes:
 * - Appendix sections: "A-1", "B-2", "C-3.4"
 * - Construction codes: "GC-1.1", "SC-12.3", "PC-2.4A"
 * - Mixed with digits: "GC1.1", "A1.2", "B3.4(a)"
 * - Combined: "GC1.2A(b)(ii)", "A-1.2(c)"
 * 
 * Hyphenated segments:
 * - Range notation: "4.1-2", "5.2-1(a)"
 * - Code separators: "SC-12.3", "GC-1.2.4"
 * - Mixed: "SC-12.3A(b)", "4.1-2(c)(iii)"
 * 
 * Parentheticals (all types):
 * - Lowercase: "25.1(b)", "3.4(b)(ii)"
 * - Uppercase: "7.4.2(C)", "5.1(A)(B)"
 * - Numeric: "25.1(1)", "3.4(2)"
 * - Roman: "7.4.2(iii)", "5.1(III)"
 * 
 * Complex real-world examples:
 * - "A-1" - appendix clause
 * - "B-2.3(a)" - appendix with subsections
 * - "3A.2B(c)(iii)" - multi-level with letters
 * - "GC1.2A(b)(ii)" - construction code
 * - "II.3.4(C)(1)" - roman numeral start
 * - "SC-12.4A(a)(iii)" - construction code with hyphen
 * - "4.1-2(b)(1)" - range notation
 * 
 * Rejected (non-clause headings):
 * - "SECTION" - too long (>4 chars), no separator
 * - "Article" - too long (>4 chars), no separator
 * - "Chapter" - too long (>4 chars), no separator
 * - "Part" - no separator following
 * - "PARTS" - too long (>4 chars)
 * 
 * Exported for use in other components that need to detect clause numbers
 */
export const CLAUSE_NUMBER_PATTERN = /(?:[IVXLCDM]+|[A-Za-z0-9]*\d+[A-Za-z0-9]*|[A-Z]{1,4}(?=[.\-]))(?:[.\-](?:[IVXLCDM]+|[A-Za-z0-9]*\d+[A-Za-z0-9]*))*(?:\([A-Za-z0-9]+\))*/.source;

/**
 * Parse a single TOC line to extract clause number and heading
 * 
 * Pattern: Optional whitespace, clause number, whitespace, heading text, optional dots/page numbers
 * Examples:
 * - "1.2.3  General Conditions ............ 45"
 * - "  1.1   Definitions"
 * - "5    Special Conditions"
 * - "2.1A  Subsection with letter"
 * - "25.1(b)  Subsection with parenthetical"
 * - "7.4.2(c)(ii)  Complex nested clause"
 */
function parseClauseLine(line: string): ClauseMapping | null {
  // Trim leading/trailing whitespace
  const trimmed = line.trim();
  
  if (!trimmed) return null;
  
  // Build pattern from shared constant
  const clausePattern = new RegExp(`^(${CLAUSE_NUMBER_PATTERN})\\s+(.+)`);
  
  const match = trimmed.match(clausePattern);
  
  if (!match) return null;
  
  const number = match[1];
  let heading = match[2];
  
  // Remove trailing dots/page numbers
  // Matches patterns like "............ 45" or "............45" or just "45"
  heading = heading.replace(/\.+\s*\d+\s*$/, '').trim();
  
  // Remove just trailing page numbers without dots
  heading = heading.replace(/\s+\d+$/, '').trim();
  
  if (!heading) return null;
  
  return { number, heading };
}

/**
 * Find clause numbers in text (for detecting hover targets)
 * Returns array of clause numbers that appear in the text
 */
export function findClauseReferences(text: string, clauseMap: Map<string, string>): string[] {
  const found: string[] = [];
  
  // Use lookahead/lookbehind instead of word boundaries to support parenthetical suffixes
  // (?<![A-Za-z0-9]) - not preceded by alphanumeric (prevents matching middle of words)
  // (?![A-Za-z0-9]) - not followed by alphanumeric (allows punctuation/space after parentheses)
  const referencePattern = new RegExp(`(?<![A-Za-z0-9])(${CLAUSE_NUMBER_PATTERN})(?![A-Za-z0-9])`, 'g');
  
  let match;
  while ((match = referencePattern.exec(text)) !== null) {
    const number = match[1];
    // Only include if it's a known clause from TOC
    if (clauseMap.has(number) && !found.includes(number)) {
      found.push(number);
    }
  }
  
  return found;
}

/**
 * Check if a text string looks like a clause number
 * Used for hover detection
 */
export function isClauseNumber(text: string): boolean {
  // Use centralized pattern for consistency
  const pattern = new RegExp(`^${CLAUSE_NUMBER_PATTERN}$`);
  return pattern.test(text.trim());
}

/**
 * Find the best matching clause from the TOC map
 * If exact match exists, return it
 * Otherwise, try parent clauses (e.g., for "2.1(a)" try "2.1", then "2")
 * 
 * @param clauseNumber - The clause number to look up (e.g., "2.1(a)")
 * @param clauseMap - Map of clause numbers to headings from TOC
 * @returns Object with the matched clause number and heading, or null if no match
 */
export function findBestClauseMatch(
  clauseNumber: string,
  clauseMap: Map<string, string>
): { number: string; heading: string } | null {
  // Try exact match first
  if (clauseMap.has(clauseNumber)) {
    return {
      number: clauseNumber,
      heading: clauseMap.get(clauseNumber)!
    };
  }
  
  // Try removing parenthetical suffixes progressively
  // E.g., "2.1(a)(ii)" → "2.1(a)" → "2.1"
  let testClause = clauseNumber;
  while (testClause.includes('(')) {
    // Remove the last parenthetical
    testClause = testClause.replace(/\([^)]*\)$/, '');
    if (clauseMap.has(testClause)) {
      return {
        number: testClause,
        heading: clauseMap.get(testClause)!
      };
    }
  }
  
  // Try removing segments from the end
  // E.g., "2.1.3" → "2.1" → "2"
  const segments = testClause.split(/[.\-]/);
  while (segments.length > 1) {
    segments.pop();
    const parentClause = segments.join('.');
    if (clauseMap.has(parentClause)) {
      return {
        number: parentClause,
        heading: clauseMap.get(parentClause)!
      };
    }
  }
  
  // Also try with hyphens for cases like "GC-1.2" → "GC-1"
  const hyphenSegments = testClause.split('-');
  if (hyphenSegments.length > 1) {
    const lastSegment = hyphenSegments[hyphenSegments.length - 1];
    const dotSegments = lastSegment.split('.');
    while (dotSegments.length > 1) {
      dotSegments.pop();
      const testNum = [...hyphenSegments.slice(0, -1), dotSegments.join('.')].join('-');
      if (clauseMap.has(testNum)) {
        return {
          number: testNum,
          heading: clauseMap.get(testNum)!
        };
      }
    }
  }
  
  return null;
}
