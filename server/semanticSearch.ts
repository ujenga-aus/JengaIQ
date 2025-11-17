import { VoyageAIClient } from 'voyageai';

// Initialize Voyage AI client
const getVoyageClient = () => {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY environment variable is not set. Please add your Voyage AI API key.');
  }
  return new VoyageAIClient({ apiKey });
};

// Generate Voyage AI embedding for text
// Uses voyage-3-lite for cost-effectiveness (6.5x cheaper than OpenAI, better accuracy)
// For legal documents, can switch to voyage-law-2
export async function generateEmbedding(text: string, useLegal = false): Promise<{
  embedding: number[];
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}> {
  try {
    const voyage = getVoyageClient();
    
    // Use voyage-3-lite for general use (cheaper, better than OpenAI)
    // Use voyage-law-2 for legal/contract documents
    const model = useLegal ? "voyage-law-2" : "voyage-3-lite";
    
    const response = await voyage.embed({
      input: [text.substring(0, 32000)], // Voyage supports 32K context vs OpenAI's 8K
      model: model,
      inputType: "document" // "document" for indexing, "query" for search queries
    });
    
    return {
      embedding: response.data?.[0]?.embedding || [],
      usage: {
        prompt_tokens: response.usage?.totalTokens || 0,
        total_tokens: response.usage?.totalTokens || 0
      }
    };
  } catch (error) {
    console.error('Error generating Voyage AI embedding:', error);
    throw error;
  }
}

// Extract text from PDF buffer using dynamic import
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    // pdf-parse v2.2.16 (mehmet-kozan fork) uses v2 API with PDFParse class
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    await parser.destroy(); // Always cleanup
    return result.text || '';
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return '';
  }
}

// Calculate cosine similarity between two vectors
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Find similar letters based on embedding similarity
export function findSimilarLetters(
  queryEmbedding: number[],
  letters: Array<{ id: string; embeddingVector: string | null; [key: string]: any }>,
  topK: number = 5
): Array<{ id: string; similarity: number; [key: string]: any }> {
  const results: Array<{ id: string; similarity: number; [key: string]: any }> = [];
  
  for (const letter of letters) {
    if (!letter.embeddingVector) continue;
    
    try {
      const letterEmbedding = JSON.parse(letter.embeddingVector) as number[];
      const similarity = cosineSimilarity(queryEmbedding, letterEmbedding);
      
      results.push({
        ...letter,
        similarity
      });
    } catch (error) {
      console.error('Error parsing embedding for letter:', letter.id, error);
    }
  }
  
  // Sort by similarity (descending) and return top K
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// Prepare text for embedding (extract key information)
export function prepareTextForEmbedding(
  extractedText: string,
  sender?: string,
  recipient?: string,
  subject?: string
): string {
  const parts: string[] = [];
  
  if (sender) parts.push(`Sender: ${sender}`);
  if (recipient) parts.push(`Recipient: ${recipient}`);
  if (subject) parts.push(`Subject: ${subject}`);
  if (extractedText) parts.push(`Content: ${extractedText.substring(0, 5000)}`);
  
  return parts.join('\n\n');
}
