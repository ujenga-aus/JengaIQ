/**
 * Contract Logical Part Detection Service
 * 
 * Identifies major sections of a construction contract:
 * - TOC (Table of Contents)
 * - Definitions
 * - General Conditions
 * - Special Conditions
 * - Annexures/Schedules
 * 
 * Uses regex patterns and heuristics to detect section boundaries.
 */

import { getPageNumberAtPosition } from './contractTextExtraction';

export type PartType = 'TOC' | 'DEFINITIONS' | 'GENERAL_CONDITIONS' | 'SPECIAL_CONDITIONS' | 'ANNEXURES' | 'OTHER';

export interface DetectedPart {
  type: PartType;
  label: string;
  orderIndex: number;
  startPage: number;
  endPage: number;
  startPosition: number;  // Character position in full text
  endPosition: number;    // Character position in full text
  detectedBy: string;     // Regex pattern or heuristic used
  confidence: number;     // 0.0 - 1.0
}

interface SectionMatch {
  type: PartType;
  pattern: RegExp;
  label: string;
  position: number;
  confidence: number;
}

/**
 * Detect logical parts in contract text
 * 
 * @param normalizedText - Normalized contract text with page markers
 * @returns Array of detected parts in document order
 */
export function detectLogicalParts(normalizedText: string): DetectedPart[] {
  console.log('[PartDetection] Detecting logical parts...');
  
  const text = normalizedText;
  const detectedParts: DetectedPart[] = [];
  
  // Define section patterns (case-insensitive, looking for headings)
  const sectionPatterns: Array<{ type: PartType; patterns: RegExp[]; priority: number }> = [
    {
      type: 'TOC',
      patterns: [
        /^(table\s+of\s+)?contents?\s*$/im,
        /^index\s*$/im,
      ],
      priority: 1
    },
    {
      type: 'DEFINITIONS',
      patterns: [
        /^definitions?\s*$/im,
        /^interpretation\s+(and\s+)?definitions?\s*$/im,
        /^definitions?\s+and\s+interpretation\s*$/im,
        /^\d+(\.\d+)*[.)]?\s+definitions?\s*$/im,
      ],
      priority: 2
    },
    {
      type: 'GENERAL_CONDITIONS',
      patterns: [
        /^general\s+conditions?\s*$/im,
        /^general\s+conditions?\s+of\s+contract\s*$/im,
        /^\d+(\.\d+)*[.)]?\s+general\s+conditions?\s*$/im,
      ],
      priority: 3
    },
    {
      type: 'SPECIAL_CONDITIONS',
      patterns: [
        /^special\s+conditions?\s*$/im,
        /^special\s+conditions?\s+of\s+contract\s*$/im,
        /^particular\s+conditions?\s*$/im,
        /^\d+(\.\d+)*[.)]?\s+special\s+conditions?\s*$/im,
      ],
      priority: 4
    },
    {
      type: 'ANNEXURES',
      patterns: [
        /^annexures?\s*$/im,
        /^schedules?\s*$/im,
        /^appendix\s*$/im,
        /^appendices\s*$/im,
        /^\d+(\.\d+)*[.)]?\s+annexures?\s*$/im,
        /^\d+(\.\d+)*[.)]?\s+schedules?\s*$/im,
      ],
      priority: 5
    }
  ];
  
  // Find all section matches
  const matches: SectionMatch[] = [];
  
  for (const section of sectionPatterns) {
    for (const pattern of section.patterns) {
      const regex = new RegExp(pattern.source, 'gim');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[0].trim();
        const position = match.index;
        
        // Calculate confidence based on:
        // - Pattern specificity (shorter patterns = lower confidence)
        // - Position in document (TOC should be early, Annexures late)
        let confidence = 0.7;
        
        // Higher confidence for more specific patterns
        if (matchedText.length > 15) {
          confidence += 0.15;
        }
        
        // Adjust confidence based on expected position
        const textLength = text.length;
        const relativePosition = position / textLength;
        
        if (section.type === 'TOC' && relativePosition < 0.1) {
          confidence += 0.15;
        } else if (section.type === 'DEFINITIONS' && relativePosition < 0.3) {
          confidence += 0.1;
        } else if (section.type === 'ANNEXURES' && relativePosition > 0.6) {
          confidence += 0.1;
        }
        
        matches.push({
          type: section.type,
          pattern,
          label: matchedText,
          position,
          confidence: Math.min(1.0, confidence)
        });
      }
    }
  }
  
  // Sort matches by position
  matches.sort((a, b) => a.position - b.position);
  
  console.log(`[PartDetection] Found ${matches.length} potential section matches`);
  
  // Filter matches to avoid duplicates (keep highest confidence within a small range)
  const filteredMatches: SectionMatch[] = [];
  const minDistanceBetweenMatches = 500; // Characters
  
  for (const match of matches) {
    // Check if this match is too close to an existing match of the same type
    const isDuplicate = filteredMatches.some(existing => 
      existing.type === match.type && 
      Math.abs(existing.position - match.position) < minDistanceBetweenMatches
    );
    
    if (!isDuplicate) {
      filteredMatches.push(match);
    } else {
      // If duplicate, keep the one with higher confidence
      const existingIndex = filteredMatches.findIndex(existing => 
        existing.type === match.type && 
        Math.abs(existing.position - match.position) < minDistanceBetweenMatches
      );
      
      if (existingIndex >= 0 && match.confidence > filteredMatches[existingIndex].confidence) {
        filteredMatches[existingIndex] = match;
      }
    }
  }
  
  // Sort by position again
  filteredMatches.sort((a, b) => a.position - b.position);
  
  console.log(`[PartDetection] After filtering: ${filteredMatches.length} unique sections`);
  
  // Convert matches to DetectedPart objects and fill gaps with "OTHER" parts
  let currentPosition = 0;
  let orderIndex = 1;
  
  for (let i = 0; i < filteredMatches.length; i++) {
    const match = filteredMatches[i];
    
    // If there's a gap before this match, create an "OTHER" part
    if (match.position > currentPosition + 1000) { // Only for gaps > 1000 chars
      const gapStartPage = getPageNumberAtPosition(text, currentPosition);
      const gapEndPage = getPageNumberAtPosition(text, match.position);
      
      detectedParts.push({
        type: 'OTHER',
        label: 'Unclassified Section',
        orderIndex: orderIndex++,
        startPage: gapStartPage,
        endPage: gapEndPage,
        startPosition: currentPosition,
        endPosition: match.position,
        detectedBy: 'Gap filler',
        confidence: 1.0
      });
    }
    
    // Add the detected section
    const nextMatch = filteredMatches[i + 1];
    const endPosition = nextMatch ? nextMatch.position : text.length;
    
    const startPage = getPageNumberAtPosition(text, match.position);
    const endPage = getPageNumberAtPosition(text, endPosition);
    
    detectedParts.push({
      type: match.type,
      label: match.label,
      orderIndex: orderIndex++,
      startPage,
      endPage,
      startPosition: match.position,
      endPosition,
      detectedBy: `Pattern: ${match.pattern.source}`,
      confidence: match.confidence
    });
    
    currentPosition = endPosition;
  }
  
  // Handle any remaining text at the end
  if (currentPosition < text.length && filteredMatches.length > 0) {
    const endStartPage = getPageNumberAtPosition(text, currentPosition);
    const endEndPage = getPageNumberAtPosition(text, text.length);
    
    detectedParts.push({
      type: 'OTHER',
      label: 'Trailing Content',
      orderIndex: orderIndex++,
      startPage: endStartPage,
      endPage: endEndPage,
      startPosition: currentPosition,
      endPosition: text.length,
      detectedBy: 'End filler',
      confidence: 1.0
    });
  }
  
  // If no parts detected, create a single "OTHER" part for the entire document
  if (detectedParts.length === 0) {
    console.log('[PartDetection] No sections detected, creating single OTHER part');
    
    const firstPage = getPageNumberAtPosition(text, 0);
    const lastPage = getPageNumberAtPosition(text, text.length);
    
    detectedParts.push({
      type: 'OTHER',
      label: 'Complete Document',
      orderIndex: 1,
      startPage: firstPage,
      endPage: lastPage,
      startPosition: 0,
      endPosition: text.length,
      detectedBy: 'Fallback: No sections detected',
      confidence: 1.0
    });
  }
  
  console.log(`[PartDetection] Detected ${detectedParts.length} logical parts:`);
  for (const part of detectedParts) {
    console.log(`  - ${part.type}: "${part.label}" (pages ${part.startPage}-${part.endPage}, confidence: ${part.confidence.toFixed(2)})`);
  }
  
  return detectedParts;
}

/**
 * Get text content for a specific detected part
 * 
 * @param normalizedText - Full normalized text
 * @param part - Detected part
 * @returns Text content for this part
 */
export function getPartText(normalizedText: string, part: DetectedPart): string {
  return normalizedText.substring(part.startPosition, part.endPosition).trim();
}
