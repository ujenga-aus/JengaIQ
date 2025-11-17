import { db } from './db';
import { 
  specialConditionDrafts, 
  specialConditionBlocks, 
  projects, 
  subcontractTemplates,
  companies,
  aiUsageLogs,
  people
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import { extractTextFromPDF } from './semanticSearch';
import { createAIProvider } from './aiProviders';
import { ObjectStorageService } from './objectStorage';

const SPECIAL_CONDITIONS_PROMPT = `
You are a senior construction contracts specialist preparing Special Conditions for a subcontract package in Australia.

Task: Analyze the provided Head Contract, Specifications, and Subcontract Template to generate comprehensive Special Conditions that:
1. Flow down relevant Head Contract obligations to the subcontractor
2. Address specification requirements specific to this work package
3. Modify standard subcontract template clauses where necessary
4. Ensure consistency between all three documents

Critical Requirements:
- Use Australian English spelling
- Reference specific clause numbers from all three documents
- Identify any conflicts or gaps between documents
- Propose clear, unambiguous special condition clauses
- Each special condition must have a clear purpose and contract basis
- Structure clauses logically by topic (Payment, Time, Quality, etc.)

Output Format:
Generate special conditions as a series of numbered clauses. For each clause:

[Clause Number] [Clause Title]

[Clause text with clear requirements and obligations]

*Basis: [Explanation of why this special condition is needed, with references to Head Contract clause X.Y, Specification section Z, and/or Template clause A.B]*

---

IMPORTANT STYLING INSTRUCTIONS:
- Each clause should be on its own line
- Use clear headings for major sections
- Number clauses sequentially (1.0, 2.0, 3.0, etc.)
- Sub-clauses use decimal notation (1.1, 1.2, 1.3, etc.)
- Keep language precise and unambiguous
- Avoid verbose preambles - get straight to the requirement

Documents provided:
1. Head Contract: The principal contract document
2. Specifications: Technical requirements for the work
3. Subcontract Template: The base subcontract agreement being modified

Generate comprehensive special conditions that cover all key areas requiring flow-down or modification.
`;

interface SpecialConditionsResult {
  blocks: Array<{
    sort: number;
    role: 'ai';
    content: string;
    meta: { clauseRef?: string } | null;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

export async function generateSpecialConditions(
  draftId: string,
  userId: string
): Promise<SpecialConditionsResult> {
  // Fetch draft and related data
  const [draft] = await db
    .select()
    .from(specialConditionDrafts)
    .where(eq(specialConditionDrafts.id, draftId))
    .limit(1);

  if (!draft) {
    throw new Error('Draft not found');
  }

  // Fetch project to get head contract and specifications
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, draft.projectId))
    .limit(1);

  if (!project) {
    throw new Error('Project not found');
  }

  // Fetch template if specified
  let template = null;
  if (draft.templateId) {
    [template] = await db
      .select()
      .from(subcontractTemplates)
      .where(eq(subcontractTemplates.id, draft.templateId))
      .limit(1);
  }

  // Fetch company for AI settings
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, draft.companyId))
    .limit(1);

  if (!company) {
    throw new Error('Company not found');
  }

  // Download and extract text from PDFs
  const objectStorage = new ObjectStorageService();
  let headContractText = '';
  let specificationsText = '';
  let templateText = '';

  try {
    // Head contract (required)
    if (project.headContractFileKey) {
      const headContractFile = await objectStorage.getObjectEntityFile(project.headContractFileKey);
      const [headContractBuffer] = await headContractFile.download();
      headContractText = await extractTextFromPDF(headContractBuffer);
    } else {
      throw new Error('Head contract PDF not uploaded');
    }

    // Specifications (required)
    if (project.specificationsFileKey) {
      const specificationsFile = await objectStorage.getObjectEntityFile(project.specificationsFileKey);
      const [specificationsBuffer] = await specificationsFile.download();
      specificationsText = await extractTextFromPDF(specificationsBuffer);
    } else {
      throw new Error('Specifications PDF not uploaded');
    }

    // Template (required)
    if (template && template.fileKey) {
      const templateFile = await objectStorage.getObjectEntityFile(template.fileKey);
      const [templateBuffer] = await templateFile.download();
      templateText = await extractTextFromPDF(templateBuffer);
    } else {
      throw new Error('Subcontract template not selected or not uploaded');
    }
  } catch (error) {
    console.error('Error downloading/extracting PDFs:', error);
    throw new Error(`Failed to process documents: ${error}`);
  }

  // Truncate texts to fit within token limits (approx 4 chars per token)
  // Claude Sonnet 4 has 200k context window, but we'll be conservative
  const maxChars = 150000; // ~37.5k tokens, leaving room for prompt and output
  const charsPerDoc = Math.floor(maxChars / 3);

  headContractText = headContractText.substring(0, charsPerDoc);
  specificationsText = specificationsText.substring(0, charsPerDoc);
  templateText = templateText.substring(0, charsPerDoc);

  // Build the full prompt
  const fullPrompt = `${SPECIAL_CONDITIONS_PROMPT}

=== HEAD CONTRACT ===
${headContractText}

=== SPECIFICATIONS ===
${specificationsText}

=== SUBCONTRACT TEMPLATE ===
${templateText}

=== YOUR TASK ===
Based on the above three documents, generate comprehensive Special Conditions for this subcontract. Output only the special conditions clauses - no preamble or commentary.`;

  // Call AI provider
  const aiProvider = createAIProvider(company.aiContractReviewModel || 'claude-sonnet-4-20250514');
  
  const startTime = Date.now();
  const response = await aiProvider.createCompletion([
    {
      role: 'user',
      content: fullPrompt,
    },
  ], {
    model: company.aiContractReviewModel || 'claude-sonnet-4-20250514',
    maxTokens: 16000,
    temperature: 0,
  });

  const durationMs = Date.now() - startTime;
  const generatedText = response.content.trim();

  // Parse generated text into blocks
  // Split by major section breaks or clause numbers
  const lines = generatedText.split('\n');
  const blocks: SpecialConditionsResult['blocks'] = [];
  let currentBlock = '';
  let blockIndex = 0;

  for (const line of lines) {
    if (line.trim() === '' && currentBlock.trim() !== '') {
      // Empty line - save current block
      blocks.push({
        sort: blockIndex++,
        role: 'ai',
        content: currentBlock.trim(),
        meta: null,
      });
      currentBlock = '';
    } else if (line.trim() !== '') {
      currentBlock += line + '\n';
    }
  }

  // Save remaining block
  if (currentBlock.trim() !== '') {
    blocks.push({
      sort: blockIndex++,
      role: 'ai',
      content: currentBlock.trim(),
      meta: null,
    });
  }

  // Calculate usage
  const estimatedCost = ((response.usage.inputTokens * 0.003) + (response.usage.outputTokens * 0.015)) / 1000;
  
  const usage = {
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    totalTokens: response.usage.inputTokens + response.usage.outputTokens,
    estimatedCost: estimatedCost,
  };

  // Log AI usage
  await db.insert(aiUsageLogs).values({
    projectId: project.id,
    personId: userId,
    formName: 'Special Conditions',
    eventType: 'AI Generation',
    modelUsed: company.aiContractReviewModel || 'claude-sonnet-4-20250514',
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCost: estimatedCost.toFixed(4),
    durationMs,
    notes: `Draft ID: ${draftId}, Template: ${template?.title || 'None'}`,
  });

  return {
    blocks,
    usage,
  };
}
