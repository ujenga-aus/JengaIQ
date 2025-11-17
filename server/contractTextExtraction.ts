/**
 * Contract Text Extraction Service
 * 
 * Extracts text from PDF contracts page-by-page, preserving:
 * - Page boundaries with === PAGE X === markers
 * - Clause numbering (1.2.3 format)
 * - Paragraph structure
 * 
 * Used for initial contract parsing and chunking.
 */

import type { Buffer } from 'buffer';

export interface PageExtractionResult {
  pageNumber: number;
  text: string;
}

export interface ContractExtractionResult {
  fullText: string;  // Complete text with page markers
  pageCount: number;
  pages: PageExtractionResult[];
}

/**
 * Extract text from PDF contract, preserving page boundaries
 * 
 * @param pdfBuffer - PDF file buffer
 * @returns Extracted text with === PAGE X === markers
 */
export async function extractContractText(pdfBuffer: Buffer): Promise<ContractExtractionResult> {
  try {
    console.log('[ContractExtraction] Starting PDF text extraction...');
    
    // Use pdfjs-dist for page-by-page extraction
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
    });
    
    const pdfDocument = await loadingTask.promise;
    const pageCount = pdfDocument.numPages;
    
    console.log(`[ContractExtraction] PDF has ${pageCount} pages`);
    
    const pages: PageExtractionResult[] = [];
    const textParts: string[] = [];
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Build page text preserving line breaks based on layout metadata
      const pageTextLines: string[] = [];
      let currentLine = '';
      let previousY = 0;
      
      for (let i = 0; i < textContent.items.length; i++) {
        const item: any = textContent.items[i];
        
        if (!('str' in item) || !item.str.trim()) {
          continue; // Skip empty items
        }
        
        const currentY = item.transform ? item.transform[5] : 0;
        
        // Detect line breaks:
        // 1. Explicit EOL flag (hasEOL)
        // 2. Y-coordinate change (vertical movement)
        // 3. Large X-coordinate gap (new column/section)
        const hasEOL = item.hasEOL || false;
        const yChanged = previousY !== 0 && Math.abs(currentY - previousY) > 2;
        
        if (currentLine && (hasEOL || yChanged)) {
          // End current line
          pageTextLines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          // Continue current line (add space if needed)
          if (currentLine && !currentLine.endsWith(' ') && !item.str.startsWith(' ')) {
            currentLine += ' ';
          }
          currentLine += item.str;
        }
        
        previousY = currentY;
      }
      
      // Push final line
      if (currentLine.trim()) {
        pageTextLines.push(currentLine.trim());
      }
      
      const pageText = pageTextLines.join('\n');
      
      // Add page marker and text
      const pageMarker = `=== PAGE ${pageNum} ===`;
      textParts.push(pageMarker);
      textParts.push(pageText);
      textParts.push(''); // Blank line after page
      
      pages.push({
        pageNumber: pageNum,
        text: pageText
      });
      
      // Cleanup page resources
      page.cleanup();
    }
    
    // Cleanup document
    await pdfDocument.cleanup();
    await pdfDocument.destroy();
    
    const fullText = textParts.join('\n');
    
    console.log(`[ContractExtraction] Extracted ${fullText.length} characters from ${pageCount} pages`);
    
    return {
      fullText,
      pageCount,
      pages
    };
    
  } catch (error) {
    console.error('[ContractExtraction] Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Normalize extracted contract text:
 * - Remove \r characters
 * - Join lines that belong to the same paragraph
 * - Preserve clause numbers (force new paragraph for lines starting with clause pattern)
 * - Preserve === PAGE X === markers
 * 
 * @param rawText - Raw extracted text with page markers
 * @returns Normalized text
 */
export function normalizeContractText(rawText: string): string {
  console.log('[ContractExtraction] Normalizing text...');
  
  // Remove \r characters
  let text = rawText.replace(/\r/g, '');
  
  // Split into lines
  const lines = text.split('\n');
  const normalized: string[] = [];
  let currentParagraph: string[] = [];
  
  // Clause number pattern: starts with digits, dots, and optional closing punctuation
  // Examples: "1.2.3 ", "1. ", "2.3) ", "1.1", "1.1 –", "1.1:", "1.1 -"
  // Matches: digits + optional (dot + digits) + optional punctuation (. ) : - –) + optional space
  const clausePattern = /^\d+(\.\d+)*([.):–\-\s]|$)/;
  
  // Page marker pattern
  const pageMarkerPattern = /^=== PAGE \d+ ===$/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Empty line - flush current paragraph
    if (!trimmed) {
      if (currentParagraph.length > 0) {
        normalized.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
      continue;
    }
    
    // Page marker - flush paragraph and preserve marker
    if (pageMarkerPattern.test(trimmed)) {
      if (currentParagraph.length > 0) {
        normalized.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
      normalized.push(trimmed);
      continue;
    }
    
    // Clause number - flush current paragraph and start new one
    if (clausePattern.test(trimmed)) {
      if (currentParagraph.length > 0) {
        normalized.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
      currentParagraph.push(trimmed);
      continue;
    }
    
    // Regular line - add to current paragraph
    currentParagraph.push(trimmed);
  }
  
  // Flush final paragraph
  if (currentParagraph.length > 0) {
    normalized.push(currentParagraph.join(' '));
  }
  
  const result = normalized.join('\n');
  
  console.log(`[ContractExtraction] Normalized ${rawText.length} → ${result.length} characters`);
  
  return result;
}

/**
 * Get page number from text position (finds the last === PAGE X === marker before position)
 * 
 * @param text - Text with page markers
 * @param position - Character position in text
 * @returns Page number (1-indexed)
 */
export function getPageNumberAtPosition(text: string, position: number): number {
  const beforePosition = text.substring(0, position);
  const pageMarkers = beforePosition.match(/=== PAGE (\d+) ===/g);
  
  if (!pageMarkers || pageMarkers.length === 0) {
    return 1; // Default to page 1
  }
  
  // Get the last page marker
  const lastMarker = pageMarkers[pageMarkers.length - 1];
  const match = lastMarker.match(/=== PAGE (\d+) ===/);
  
  return match ? parseInt(match[1], 10) : 1;
}
