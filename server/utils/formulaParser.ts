import { Parser } from 'expr-eval';

/**
 * Parses a formula string by stripping alpha characters and evaluating the result.
 * 
 * Example inputs:
 * - "(2* days) * 2 days" -> extracts "2 * 2" -> returns 4
 * - "3.5 * width" -> extracts "3.5 *" -> returns 3.5
 * - "100" -> returns 100
 * 
 * @param formula - The formula string with possible alpha characters
 * @returns The numeric result, or 0 if invalid
 */
export function parseFormula(formula: string | null | undefined): number {
  if (!formula || formula.trim() === '') {
    return 0;
  }

  try {
    // Step 1: Strip all alpha characters (letters and underscores)
    // This removes variable names like "days", "width", etc.
    let sanitized = formula.replace(/[A-Za-z_]+/g, ' ');

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
