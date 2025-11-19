import { Parser } from 'expr-eval';

interface WorksheetItemForLookup {
  lq: string | null;
  result: string | null;
}

/**
 * Parses a formula string by:
 * 1. Replacing #LQ references with actual result values from other line items
 * 2. Stripping alpha characters
 * 3. Evaluating the result
 * 
 * Example inputs:
 * - "(2* days) * 2 days" -> extracts "2 * 2" -> returns 4
 * - "3.5 * width" -> extracts "3.5 *" -> returns 3.5
 * - "#LQ1 * 2" -> looks up result from LQ 1, then evaluates
 * - "100" -> returns 100
 * 
 * @param formula - The formula string with possible alpha characters and #LQ references
 * @param allItems - All worksheet items for cross-reference lookup (optional)
 * @param currentItemLq - The LQ number of the current item (for circular reference detection)
 * @returns The numeric result, or 0 if invalid
 */
export function parseFormula(
  formula: string | null | undefined,
  allItems?: WorksheetItemForLookup[],
  currentItemLq?: string | null
): number {
  if (!formula || formula.trim() === '') {
    return 0;
  }

  try {
    let processedFormula = formula;

    // Step 0: Replace #LQ references with actual result values
    if (allItems && allItems.length > 0) {
      // Match #LQ followed by digits (case-insensitive)
      const lqPattern = /#LQ(\d+)/gi;
      const visitedRefs = new Set<string>();
      
      processedFormula = processedFormula.replace(lqPattern, (match, lqNumber) => {
        // Circular reference detection
        if (currentItemLq && lqNumber === currentItemLq) {
          console.warn(`Circular reference detected: #LQ${lqNumber} references itself`);
          return '0';
        }

        // Track visited references to prevent infinite loops
        const refKey = `#LQ${lqNumber}`;
        if (visitedRefs.has(refKey)) {
          console.warn(`Duplicate reference detected: ${refKey}`);
          return '0';
        }
        visitedRefs.add(refKey);

        // Find the item with matching LQ number
        const referencedItem = allItems.find(item => 
          item.lq !== null && item.lq === lqNumber
        );

        if (!referencedItem) {
          console.warn(`#LQ${lqNumber} not found in worksheet items`);
          return '0';
        }

        // Return the result value (or 0 if null/undefined)
        const resultValue = referencedItem.result ?? '0';
        return resultValue;
      });
    }

    // Step 1: Strip all alpha characters (letters and underscores)
    // This removes variable names like "days", "width", etc.
    let sanitized = processedFormula.replace(/[A-Za-z_]+/g, ' ');

    // Step 2: Remove any remaining illegal characters (keep only numbers, operators, parentheses, dots, spaces)
    sanitized = sanitized.replace(/[^0-9+\-*/().\s]/g, '');

    // Step 3: Collapse multiple spaces and trim
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // Step 4: Validate the sanitized formula (only allowed characters)
    if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) {
      console.warn(`Invalid formula after sanitization: "${sanitized}"`);
      return 0;
    }

    // Edge case: Empty after sanitization
    if (sanitized === '') {
      return 0;
    }

    // Edge case: Only operators or parentheses left
    if (/^[+\-*/().\s]+$/.test(sanitized)) {
      return 0;
    }

    // Step 5: Safely evaluate using expr-eval
    const parser = new Parser();
    const result = parser.evaluate(sanitized);

    // Step 6: Validate result is a valid number
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      console.warn(`Formula evaluation resulted in non-finite number: ${result}`);
      return 0;
    }

    // Round to 2 decimal places to match database precision
    return Math.round(result * 100) / 100;
  } catch (error) {
    console.error(`Error parsing formula "${formula}":`, error);
    return 0;
  }
}

/**
 * Validates if a formula string can be successfully parsed.
 * 
 * @param formula - The formula string to validate
 * @returns true if valid, false otherwise
 */
export function isValidFormula(formula: string | null | undefined): boolean {
  if (!formula || formula.trim() === '') {
    return true; // Empty formulas are valid (result = 0)
  }

  try {
    const result = parseFormula(formula);
    return true;
  } catch {
    return false;
  }
}
