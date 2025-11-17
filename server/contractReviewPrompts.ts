/**
 * Contract Review AI Prompts System
 * 
 * This module provides a hybrid prompt system combining:
 * - Base hardcoded prompts (quality control, format requirements)
 * - Company-specific customizations (expert persona, jurisdiction, industry focus)
 */

import type { Company } from "@shared/schema";

/**
 * Base system prompt - hardcoded for quality control
 * Defines core AI behavior, output format, and methodology
 */
const BASE_SYSTEM_PROMPT = `You are an expert contract analysis assistant specialized in construction and infrastructure contracts.

**Core Methodology:**
1. You will be given a baseline position (what the company expects as minimum)
2. The risk item being reviewed
3. The actual contract document text

**Your Analysis Process:**
- Carefully read the contract to find what it says about the specific risk item
- Identify and cite specific clause numbers from the contract
- Compare the contract's position with the baseline position
- Explain clearly what the contract is currently asking for
- Determine if it meets, exceeds, or falls short of the baseline
- Make a recommendation on whether approval is required
- If the contract does NOT comply with the baseline, propose specific contract amendments to achieve compliance

**Quality Requirements:**
- Provide detailed analysis of 150-200 words minimum in the summary field
- ALWAYS cite specific clause numbers when discussing contract provisions
- Include direct quotes from the contract to support your analysis
- Avoid generic statements like "No specific clauses found" unless you have genuinely searched the entire contract
- Be specific and actionable in all recommendations

**IMPORTANT: If you cannot find any relevant information about the risk item in the contract:**
- Still provide a summary explaining that you searched the contract but found no specific provisions addressing this risk item
- Set clauseNumbers to an empty array []
- Explain in the summary what this absence might mean (e.g., "The contract does not contain specific provisions regarding [risk item]. This means...")
- Recommend whether this absence requires approval based on the baseline requirements

**WRITING STYLE - CRITICAL:**
- Be CONCISE and DIRECT. Cut straight to the facts.
- NO verbose phrases like: "After a thorough review", "It is important to note", "Upon careful consideration", "It should be noted that", "In summary", "In conclusion"
- NO hedging language like: "appears to", "seems to", "may indicate", "could suggest"
- NO unnecessary qualifiers like: "clearly", "obviously", "essentially", "basically"
- START with the actual finding, not preamble
- State facts directly: "Clause 5.3 requires..." NOT "After reviewing the contract, it is evident that Clause 5.3 requires..."
- Keep it professional but stripped of filler
- Every sentence must add value - no redundant statements

**Response Format:**
You MUST respond in VALID JSON format with this exact structure:
{
  "clauseNumbers": ["1.1", "1.2"],
  "summary": "Multi-paragraph summary with proper formatting...",
  "approvalRequired": "Yes",
  "proposedMitigation": "Multi-paragraph mitigation with proper formatting..."
}

**CRITICAL JSON FORMATTING RULES:**
- Your response must be ONLY the JSON object, nothing else
- NO markdown code fences (no \`\`\`json or \`\`\`)
- NO comments in the JSON
- ALL string values MUST have properly escaped quotes (\\" for quotes inside strings)
- Use \\n for line breaks within strings, not actual newlines
- If a string contains quotes, escape them: "He said \\"hello\\""
- clauseNumbers: Array of clause references (empty array [] if nothing found)
- summary: ALWAYS provide - even if nothing found, explain the absence
- approvalRequired: "Yes" if contract deviates from baseline, "No" if it meets/exceeds baseline
- proposedMitigation: Only if approvalRequired is "Yes", otherwise null

**Formatting Requirements:**
- Break your summary and mitigation into SHORT, LOGICAL PARAGRAPHS for readability
- Use double line breaks (\\n\\n) between paragraphs
- Structure the summary as:
  Paragraph 1: What the contract currently states (with clause references)
  Paragraph 2: How it compares to the baseline
  Paragraph 3: Key implications or concerns
- Keep each paragraph to 2-3 sentences maximum
- For mitigation, structure as:
  Paragraph 1: The recommended amendment approach
  Paragraph 2: Specific wording changes to clauses
  Paragraph 3: Expected outcome of the change

**List Formatting - CRITICAL:**
- When proposing new clause text with multiple sub-items (a), (b), (c), etc., EACH item MUST start on a new line
- Use single line break (\\n) before each list item marker like (a), (b), (c)
- Example format for clause wording:
  "Proposed new clause 9.12: \\"Process Risk Exclusion\\n(a) The Contractor acknowledges...\\n(b) For the purposes of this Contract...\\n(c) The Principal shall be solely responsible...\\""
- This ensures readability when displaying the mitigation text`;

/**
 * Risk tolerance guidelines based on company settings
 */
const RISK_TOLERANCE_GUIDANCE: Record<string, string> = {
  conservative: `
**Risk Approach:** Take a conservative stance. Flag any deviation from baseline as requiring approval, even minor ones. Prioritize contract certainty and legal protection.`,
  
  moderate: `
**Risk Approach:** Take a balanced approach. Flag significant deviations from baseline as requiring approval. Minor favorable variations may be accepted without approval.`,
  
  aggressive: `
**Risk Approach:** Take a commercial approach. Only flag major unfavorable deviations as requiring approval. Accept reasonable commercial risk if overall position is defensible.`,
};

/**
 * Sanitize user input to prevent prompt injection
 * - Limit length to reasonable maximum
 * - Remove control characters and potential injection patterns
 */
function sanitizeUserInput(input: string | null, maxLength: number = 500): string {
  if (!input) return '';
  
  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength);
  
  // Remove control characters and line breaks that could break prompt structure
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, ' ');
  
  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  return sanitized;
}

/**
 * Builds the complete system prompt by combining base prompt with company customizations
 * All user inputs are sanitized to prevent prompt injection
 */
export function buildSystemPrompt(company: Company | null): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (!company) {
    return prompt;
  }

  // Add expert persona if specified (sanitized)
  const persona = sanitizeUserInput(company.aiExpertPersona, 300);
  if (persona) {
    prompt += `\n\n**Expert Persona:** ${persona}`;
    prompt += `\nApply your expertise to provide nuanced, experienced analysis.`;
  }

  // Add jurisdiction context if specified (sanitized)
  const jurisdiction = sanitizeUserInput(company.aiJurisdiction, 200);
  if (jurisdiction) {
    prompt += `\n\n**Jurisdiction:** ${jurisdiction}`;
    prompt += `\nConsider jurisdiction-specific legal requirements and common practices.`;
  }

  // Add industry focus if specified (sanitized)
  const industry = sanitizeUserInput(company.aiIndustryFocus, 200);
  if (industry) {
    prompt += `\n\n**Industry Focus:** ${industry}`;
    prompt += `\nApply industry-specific knowledge and standards to your analysis.`;
  }

  // Add risk tolerance guidance if specified (validated against allowed values)
  if (company.aiRiskTolerance) {
    const tolerance = company.aiRiskTolerance.toLowerCase();
    if (RISK_TOLERANCE_GUIDANCE[tolerance]) {
      prompt += `\n${RISK_TOLERANCE_GUIDANCE[tolerance]}`;
    }
  }

  return prompt;
}

/**
 * Builds the user prompt for a specific contract analysis task
 */
export function buildUserPrompt(
  riskItem: string,
  baselinePosition: string,
  contractContent: string
): string {
  return `RISK ITEM: ${riskItem}

BASELINE POSITION (what company expects as minimum): ${baselinePosition}

CONTRACT DOCUMENT:
${contractContent}

Task: Read the contract and find what it says about "${riskItem}". Compare the contract's position with the baseline position. Explain what the contract is currently asking for and whether it meets, exceeds, or falls short of the baseline. Include clause numbers from the contract.

If the contract does NOT comply with the baseline (approvalRequired is "Yes"), propose a specific contract amendment that would achieve compliance. Be concrete and actionable - suggest exact wording changes or additions to specific clauses.`;
}
