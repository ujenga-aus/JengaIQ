import { useState, useCallback, useRef, useEffect } from 'react';
import { isClauseNumber } from '@/lib/tocParser';

interface TooltipState {
  clauseNumber: string;
  heading: string;
  x: number;
  y: number;
}

interface UseClauseTooltipsProps {
  clauseMap: Map<string, string>;
  enabled: boolean;
}

/**
 * Hook for managing clause heading tooltips on any container element
 * 
 * Provides registerContainer() function to attach hover detection to any container.
 * Works with both PDF text layers and table cells.
 * Handles pointer events, MutationObserver for dynamic content, and cleanup.
 */
export function useClauseTooltips({ clauseMap, enabled }: UseClauseTooltipsProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const registeredContainers = useRef<Set<HTMLElement>>(new Set());
  const animationFrameRef = useRef<number | null>(null);

  // Hide tooltip on scroll or resize
  useEffect(() => {
    if (!tooltip) return;

    const handleHide = () => setTooltip(null);
    
    window.addEventListener('scroll', handleHide, true);
    window.addEventListener('resize', handleHide);

    return () => {
      window.removeEventListener('scroll', handleHide, true);
      window.removeEventListener('resize', handleHide);
    };
  }, [tooltip]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      registeredContainers.current.clear();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  /**
   * Register any container element for hover detection
   * Works with PDF text layers, table cells, or any other element
   * Call this from a ref callback or useEffect
   * 
   * Note: Always attaches listeners even if clauseMap is empty.
   * Tooltips will show later when TOC data loads.
   */
  const registerContainer = useCallback((container: HTMLElement | null) => {
    if (!container) return;

    // Skip if already registered
    if (registeredContainers.current.has(container)) return;

    // Create hover handlers with event delegation
    const handlePointerEnter = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      
      // Check for data-clause-number attribute first (for styled spans)
      const clauseNumberAttr = target.getAttribute('data-clause-number');
      if (clauseNumberAttr && clauseMap.has(clauseNumberAttr)) {
        const heading = clauseMap.get(clauseNumberAttr)!;
        const rect = target.getBoundingClientRect();
        
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        
        animationFrameRef.current = requestAnimationFrame(() => {
          setTooltip({
            clauseNumber: clauseNumberAttr,
            heading,
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
        });
        return;
      }
      
      // Fallback: check text content (for PDF text layers)
      const text = target.textContent?.trim() || '';
      if (isClauseNumber(text) && clauseMap.has(text)) {
        const heading = clauseMap.get(text)!;
        const rect = target.getBoundingClientRect();
        
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        
        animationFrameRef.current = requestAnimationFrame(() => {
          setTooltip({
            clauseNumber: text,
            heading,
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
        });
      }
    };

    const handlePointerLeave = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      
      // Cancel any pending animation frame to prevent phantom tooltips
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Check data attribute first
      const clauseNumberAttr = target.getAttribute('data-clause-number');
      if (clauseNumberAttr) {
        setTooltip(null);
        return;
      }
      
      // Fallback: check text content
      const text = target.textContent?.trim() || '';
      if (isClauseNumber(text)) {
        setTooltip(null);
      }
    };

    // Attach listeners
    container.addEventListener('pointerenter', handlePointerEnter, true);
    container.addEventListener('pointerleave', handlePointerLeave, true);
    registeredContainers.current.add(container);

    // Cleanup function
    const cleanup = () => {
      container.removeEventListener('pointerenter', handlePointerEnter, true);
      container.removeEventListener('pointerleave', handlePointerLeave, true);
      registeredContainers.current.delete(container);
    };

    return cleanup;
  }, [clauseMap]);

  /**
   * Register a PDF page container for hover detection
   * Backward compatible wrapper around registerContainer
   * Handles dynamic .textLayer creation via MutationObserver
   * 
   * Note: PDF.js creates .textLayer AFTER onRenderSuccess fires.
   * The observer waits for .textLayer to appear, then registers it.
   */
  const registerPageLayer = useCallback((pageContainer: HTMLElement | null) => {
    if (!pageContainer) return;

    // Track current text layer for this page container (mutable reference)
    let currentTextLayer = pageContainer.querySelector('.textLayer') as HTMLElement | null;
    let cleanup: (() => void) | undefined;

    // If text layer already exists, register it immediately
    if (currentTextLayer) {
      cleanup = registerContainer(currentTextLayer);
    }

    // Watch for text layer to appear (if not yet) or rerender (after zoom)
    const observer = new MutationObserver(() => {
      const newTextLayer = pageContainer.querySelector('.textLayer') as HTMLElement | null;
      
      // Text layer appeared for the first time or was replaced
      if (newTextLayer && newTextLayer !== currentTextLayer) {
        // Clean up old text layer if it existed
        cleanup?.();
        
        // Update reference to new layer
        currentTextLayer = newTextLayer;
        
        // Re-register new layer and update cleanup reference
        cleanup = registerContainer(currentTextLayer);
      }
    });

    observer.observe(pageContainer, {
      childList: true,
      subtree: true,
    });

    // Cleanup function
    return () => {
      cleanup?.();
      observer.disconnect();
    };
  }, [registerContainer]);

  return {
    tooltip,
    registerContainer,
    registerPageLayer, // Backward compatible for PDF viewer
  };
}
