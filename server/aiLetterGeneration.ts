import { db } from './db';
import { correspondenceLetters, projects, aiUsageLogs, people, companies, businessUnits, projectSharePointSettings } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { extractTextFromPDF } from './semanticSearch';
import { createAIProvider } from './aiProviders';
import { SharePointService } from './sharepoint';

// Master drafting prompt based on user's template
const MASTER_DRAFTING_PROMPT = `
Role: You are a senior commercial manager writing on behalf of a construction consultancy in Australia. Write in a formal Australian business tone. Use Australian English spelling. Do not use em dashes.

Authoring rules:

Use only the Contract provided for clause citations. When you rely on a clause, place a bracketed reference marker in the body like [Ref 1], [Ref 2], etc. Then create a "Reference Notes" footer listing each marker with clause number, clause title, and a short paraphrase plus the exact clause excerpt in quotation marks.

Quote clauses precisely. If a clause is not present or is ambiguous, write "no express clause located" and explain the reasoning without fabricating text.

Apply the AI Instruction Options as hard constraints. Where they set values or policy choices, prefer them over general boilerplate. Use the Additional Instructions to shape tone, scope, and any special requests.

Keep the letter concise and outcome focused. Open with purpose, state the facts, identify the contractual position with citations, set out the request or required action with a clear deadline and consequence pathway that is supported by the contract, and close with next steps.

Use numbered lists or short paragraphs for readability. Avoid jargon. No em dashes.

Dates must be absolute in DD Month YYYY format. Amounts in AUD with thousands separators and no trailing zeros unless cents are material.

If the contract is Design and Construct or contains design obligations, call that out where relevant to risk allocation and notices.

If notice provisions prescribe method, address, or time limits, include them in the action section with a citation.

Do not include any content from documents not provided in inputs.

Output structure:

Letterhead block

Our reference: {OUR_REF}
Their reference: {THEIR_REF}
Date: {DATE_TODAY}
To: {RECIPIENT_NAME}, {RECIPIENT_ORG}
Project: {PROJECT_NAME}
Subject: {SUBJECT_LINE}

Opening purpose

One or two sentences that state why we are writing and what we require.

Background facts

Brief timeline and key facts. Keep it factual and neutral.

Contractual position

Set out the relevant obligations, rights, conditions precedent, time bars, valuation rules, and any notice mechanics.

Insert reference markers in the text at each reliance point, for example: "under the notice provision, the Principal must respond within ten Business Days [Ref 2]."

Request and next steps

State the action required, any documents to be provided, and a clear deadline that aligns with the contract.

Include delivery method if prescribed by the contract.

If appropriate, outline the consequence pathway supported by the contract (for example valuation by the Superintendent, deemed assessment, dispute process) with citations.

Closing

Polite professional close with contact details.

Signature block

Name, role, company, email, phone.

Reference Notes (footer)

"Reference Notes"

[Ref 1] Clause X.Y Title — short paraphrase. "Exact quotation that is relied upon."
[Ref 2] Clause A.B Title — short paraphrase. "Exact quotation that is relied upon."

If no express clause exists, list the marker with "no express clause located; position based on general principles stated in clauses …" and explain briefly.

Validation checks before finalising:

Confirm every reference marker in the body is defined in Reference Notes and vice versa.
Confirm all deadlines and delivery methods match the cited clause text.
Remove any placeholder text and unused sections.
Ensure no em dashes appear in the output.

Styling notes:

Use clear headings and numbered lists where helpful.
Keep sentences tight. Vary length for flow, but stay formal.
Avoid adjectives that add no meaning.

WRITING STYLE - CRITICAL:
Be CONCISE and DIRECT. Cut straight to the facts. No wishy-washy language.
NO verbose phrases: "After a thorough review", "It is important to note", "Upon careful consideration", "It should be noted that", "In summary"
NO hedging language: "appears to", "seems to", "may indicate", "could suggest"
NO unnecessary qualifiers: "clearly", "obviously", "essentially", "basically"
START with the actual point, not preamble.
State facts directly: "Clause 5.3 requires..." NOT "After reviewing the contract, it is evident that Clause 5.3 requires..."
Every sentence must add value - no redundant statements.
`;

interface LetterGenerationResult {
  generatedLetter: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

// Extract text from a letter PDF
async function extractLetterText(letter: any): Promise<string> {
  try {
    if (letter.source === 'upload' && letter.fileUrl) {
      // Download from file URL - properly encode the URL
      const encodedUrl = new URL(letter.fileUrl, process.env.REPLIT_DEPLOYMENT_URL || 'http://localhost:5000');
      const response = await fetch(encodedUrl.toString());
      const buffer = await response.arrayBuffer();
      return await extractTextFromPDF(Buffer.from(buffer));
    } else if (letter.source === 'sharepoint' && letter.extractedText) {
      // Use pre-extracted text content
      return letter.extractedText;
    }
    return '';
  } catch (error) {
    console.error('Error extracting letter text:', error);
    return '';
  }
}

// Helper to truncate text to approximate token limit
function truncateToTokens(text: string, maxTokens: number): string {
  // Rough estimate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  
  return text.substring(0, maxChars) + '\n\n[... Document truncated due to size limits ...]';
}

// Download and extract contract documents from SharePoint
async function getContractDocuments(projectId: string, project: any): Promise<string> {
  try {
    // Get SharePoint settings for the project
    const [spSettings] = await db
      .select()
      .from(projectSharePointSettings)
      .where(eq(projectSharePointSettings.projectId, projectId))
      .limit(1);
    
    if (!spSettings || !spSettings.sharePointSiteUrl) {
      console.log('[AI Letter] No SharePoint settings found for project');
      return '';
    }
    
    let contractText = '';
    const sharepointService = new SharePointService();
    
    // Maximum tokens for contract documents (leave room for rest of prompt)
    const MAX_CONTRACT_TOKENS = 80000; // ~80K tokens for contracts, ~120K for rest
    
    // Download contract document if path exists
    if (project.contractDocumentPath) {
      try {
        console.log(`[AI Letter] Downloading contract document from: ${project.contractDocumentPath}`);
        const contractBuffer = await sharepointService.downloadFileByPath(
          spSettings.sharePointSiteUrl,
          project.contractDocumentPath
        );
        const contractContent = await extractTextFromPDF(contractBuffer);
        const truncated = truncateToTokens(contractContent, MAX_CONTRACT_TOKENS / 2);
        contractText += `\n\n=== CONTRACT DOCUMENT ===\n${truncated}`;
        
        if (truncated.includes('truncated')) {
          console.log(`[AI Letter] Contract document truncated (original: ${contractContent.length} chars, truncated: ${truncated.length} chars)`);
        }
      } catch (error) {
        console.error('[AI Letter] Error downloading contract document:', error);
        contractText += `\n\n=== CONTRACT DOCUMENT ===\n[Error: Could not download contract document from SharePoint]`;
      }
    }
    
    // Download contract specifications if path exists
    if (project.contractSpecificationPath) {
      try {
        console.log(`[AI Letter] Downloading contract specifications from: ${project.contractSpecificationPath}`);
        const specsBuffer = await sharepointService.downloadFileByPath(
          spSettings.sharePointSiteUrl,
          project.contractSpecificationPath
        );
        const specsContent = await extractTextFromPDF(specsBuffer);
        const truncated = truncateToTokens(specsContent, MAX_CONTRACT_TOKENS / 2);
        contractText += `\n\n=== CONTRACT SPECIFICATIONS ===\n${truncated}`;
        
        if (truncated.includes('truncated')) {
          console.log(`[AI Letter] Contract specifications truncated (original: ${specsContent.length} chars, truncated: ${truncated.length} chars)`);
        }
      } catch (error) {
        console.error('[AI Letter] Error downloading contract specifications:', error);
        contractText += `\n\n=== CONTRACT SPECIFICATIONS ===\n[Error: Could not download contract specifications from SharePoint]`;
      }
    }
    
    return contractText;
  } catch (error) {
    console.error('[AI Letter] Error fetching contract documents:', error);
    return '';
  }
}

// Calculate cost based on GPT-4o pricing
function calculateCost(inputTokens: number, outputTokens: number): number {
  const INPUT_COST_PER_1M = 2.50; // $2.50 per 1M input tokens for GPT-4o
  const OUTPUT_COST_PER_1M = 10.00; // $10.00 per 1M output tokens for GPT-4o
  
  const inputCost = (inputTokens / 1000000) * INPUT_COST_PER_1M;
  const outputCost = (outputTokens / 1000000) * OUTPUT_COST_PER_1M;
  
  return inputCost + outputCost;
}

// Generate AI draft letter
export async function generateAIDraftLetter(
  projectId: string,
  originalLetterId: string,
  referenceLetterIds: string[],
  customInstructions: string,
  userPersonId: string,
  sessionId?: string
): Promise<LetterGenerationResult> {
  const { updateProgress, completeProgress, errorProgress } = await import('./letterGenerationProgress');
  
  try {
    // Stage 1: Loading letter (0-20%)
    if (sessionId) updateProgress(sessionId, 'Loading letter data...', 10);
    
    // Get the original letter
    const [originalLetter] = await db
      .select()
      .from(correspondenceLetters)
      .where(eq(correspondenceLetters.id, originalLetterId));
    
    if (!originalLetter) {
      throw new Error('Original letter not found');
    }
    
    // Get project details
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    
    if (!project) {
      throw new Error('Project not found');
    }
    
    if (sessionId) updateProgress(sessionId, 'Loading letter data...', 20);
  
  // Get company details to determine AI provider
  const [buResult] = await db
    .select({
      companyId: businessUnits.companyId,
      aiLetterModel: companies.aiLetterModel
    })
    .from(businessUnits)
    .innerJoin(companies, eq(businessUnits.companyId, companies.id))
    .where(eq(businessUnits.id, project.businessUnitId!));
  
  if (!buResult) {
    throw new Error('Company not found');
  }
  
  const aiModel = buResult.aiLetterModel || 'gpt-4o';
  const aiProvider = createAIProvider(aiModel);
  
  // Map friendly model names to actual API model strings
  const { getModelString } = await import('./aiProviders');
  const actualModelString = getModelString(aiModel);
  
  // Stage 2: Extract text from original letter (20-30%)
  if (sessionId) updateProgress(sessionId, 'Extracting letter text...', 25);
  const originalText = await extractLetterText(originalLetter);
  
  // Stage 3: Get contract documents from SharePoint (30-50%)
  if (sessionId) updateProgress(sessionId, 'Fetching contract documents...', 35);
  console.log('[AI Letter] Fetching contract documents...');
  const contractText = await getContractDocuments(projectId, project);
  
  // Stage 4: Get reference letters and extract their text (50-65%)
  if (sessionId) updateProgress(sessionId, 'Processing reference letters...', 55);
  let referencesText = '';
  if (referenceLetterIds.length > 0) {
    const referenceLetters = await db
      .select()
      .from(correspondenceLetters)
      .where(inArray(correspondenceLetters.id, referenceLetterIds));
    
    for (const refLetter of referenceLetters) {
      const refText = await extractLetterText(refLetter);
      referencesText += `\n\n--- Reference Letter #${refLetter.letterNumber} ---\n${refText}`;
    }
  }
  
  if (sessionId) updateProgress(sessionId, 'Processing reference letters...', 65);
  
  // Build the prompt
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  
  const prompt = `${MASTER_DRAFTING_PROMPT}

PROJECT CONTEXT:
Project Name: ${project.name}
Client: ${project.client || 'Not specified'}
Location: ${project.location || 'Not specified'}

${contractText ? `CONTRACT DOCUMENTS:\n${contractText}\n` : ''}

ORIGINAL LETTER (received from client):
${originalText}

${referencesText ? `REFERENCE LETTERS FOR CONTEXT:\n${referencesText}\n` : ''}

AI INSTRUCTIONS:
${customInstructions}

METADATA:
Date: ${today}
Project: ${project.name}
Our Reference: [To be filled in]
Their Reference: ${originalLetter.subject || 'Not specified'}
Subject: Response to ${originalLetter.subject || 'Correspondence'}

Please generate a professional response letter following the master drafting prompt structure and all authoring rules.`;

  // Stage 5: Call AI provider (65-90%)
  if (sessionId) updateProgress(sessionId, 'Generating AI response...', 70);
  
  const result = await aiProvider.createCompletion([
    {
      role: 'system',
      content: 'You are a senior commercial manager in the Australian construction industry, expert in contract administration and formal business correspondence.'
    },
    {
      role: 'user',
      content: prompt
    }
  ], {
    model: actualModelString,
    temperature: 0.3,
    maxTokens: 3000
  });
  
  const generatedLetter = result.content;
  
  // Stage 6: Logging (90-100%)
  if (sessionId) updateProgress(sessionId, 'Finalizing...', 95);
  
  // Extract usage information
  const inputTokens = result.usage.inputTokens;
  const outputTokens = result.usage.outputTokens;
  const totalTokens = result.usage.totalTokens;
  const estimatedCost = calculateCost(inputTokens, outputTokens);
  
  // Log AI usage
  await db.insert(aiUsageLogs).values({
    personId: userPersonId,
    projectId,
    formName: 'AI Letter',
    eventType: 'Draft Letter Generation',
    modelUsed: aiModel,
    letterId: originalLetterId,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCost: estimatedCost.toFixed(4), // Store as string for decimal precision
    notes: `Generated draft response to Letter #${originalLetter.letterNumber}`,
  });
  
  // Mark as complete
  if (sessionId) completeProgress(sessionId);
  
  return {
    generatedLetter,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
    },
  };
  } catch (error: any) {
    // Report error if sessionId provided
    if (sessionId) errorProgress(sessionId, error.message || 'Generation failed');
    throw error;
  }
}
