import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RefreshCw, X, Maximize2, FileSearch } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import Draggable from 'react-draggable';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { AIProgressDialog } from '@/components/AIProgressDialog';
import { Badge } from '@/components/ui/badge';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ContractViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisionId: string;
  pdfUrl: string;
  title?: string;
}

interface ContractMetadata {
  clauses: Array<{
    id: string;
    ref: string;
    number: string;
    heading: string;
    pageIndex: number;
    bbox: number[] | null;
  }>;
  definitions: Array<{
    id: string;
    term: string;
    definition: string;
    scopeRef: string | null;
    pageIndex: number;
  }>;
}

interface RegenerateResponse {
  operationId: string;
}

interface TooltipState {
  visible: boolean;
  html: string;
  x: number;
  y: number;
}

export function ContractViewerDialog({
  open,
  onOpenChange,
  revisionId,
  pdfUrl,
  title = 'Contract Viewer',
}: ContractViewerDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState(1.0);
  const [size, setSize] = useState({ width: 1000, height: 1200 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<string | null>(null);
  const [aiOperationId, setAiOperationId] = useState<string | null>(null);
  const [showAiProgress, setShowAiProgress] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, html: '', x: 0, y: 0 });
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Load saved position/size from localStorage on mount or center dialog
  useEffect(() => {
    if (open && user?.id) {
      const storageKey = `contractViewer_${user.id}`;
      const saved = localStorage.getItem(storageKey);
      
      if (saved) {
        try {
          const { position: savedPosition, size: savedSize } = JSON.parse(saved);
          // Validate saved values are within screen bounds
          if (savedPosition && savedSize) {
            const maxX = window.innerWidth - savedSize.width;
            const maxY = window.innerHeight - savedSize.height;
            setPosition({
              x: Math.max(0, Math.min(savedPosition.x, maxX)),
              y: Math.max(0, Math.min(savedPosition.y, maxY))
            });
            setSize(savedSize);
            return;
          }
        } catch (error) {
          console.warn('Failed to load saved contract viewer preferences:', error);
        }
      }
      
      // Fall back to centered if no saved preferences
      const centerX = (window.innerWidth - size.width) / 2;
      const centerY = (window.innerHeight - size.height) / 2;
      setPosition({ x: centerX, y: centerY });
    }
  }, [open, user?.id]);

  // Fetch PDF as blob with credentials
  useEffect(() => {
    if (!open || !pdfUrl) {
      setPdfBlob(null);
      return;
    }

    const fetchPdf = async () => {
      try {
        const response = await fetch(pdfUrl, {
          credentials: 'include',
        });
        if (!response.ok) {
          console.error('Failed to fetch PDF:', response.status);
          return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPdfBlob(url);
      } catch (error) {
        console.error('Error fetching PDF:', error);
      }
    };

    fetchPdf();

    return () => {
      if (pdfBlob) {
        URL.revokeObjectURL(pdfBlob);
      }
    };
  }, [open, pdfUrl]);

  // Fetch contract metadata
  const { data: metadata, isLoading: isLoadingMetadata } = useQuery<ContractMetadata>({
    queryKey: ['/api/contract-review/revisions', revisionId, 'metadata'],
    enabled: open && !!revisionId,
  });

  // Mutation to start metadata regeneration
  const regenerateMutation = useMutation<RegenerateResponse>({
    mutationFn: async () => {
      console.log('[Contract Viewer] Calling regenerate API...');
      const response = await apiRequest('POST', `/api/contract-review/revisions/${revisionId}/metadata/regenerate`);
      const result = await response.json() as RegenerateResponse;
      console.log('[Contract Viewer] Regenerate API response:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('[Contract Viewer] Extraction started with operation ID:', data.operationId);
      setAiOperationId(data.operationId);
      setShowAiProgress(true);
    },
    onError: (error: any) => {
      console.error('[Contract Viewer] Failed to start extraction:', error);
      // Show toast for initial mutation errors (failed to start extraction)
      toast({
        title: 'Failed to Start Extraction',
        description: error.message || 'Could not initiate metadata extraction',
        variant: 'destructive',
      });
    },
  });

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    
    // Poll for text layer content - wait for ALL pages to render
    let attempts = 0;
    const maxAttempts = 50;
    const checkInterval = 100;
    
    const pollForTextContent = () => {
      attempts++;
      const textLayers = document.querySelectorAll('.react-pdf__Page__textContent');
      const totalSpans = Array.from(textLayers).reduce((sum, layer) => {
        return sum + layer.querySelectorAll('span').length;
      }, 0);
      
      console.log(`[Tooltip] Polling attempt ${attempts}: found ${textLayers.length} text layers, ${totalSpans} spans`);
      
      // Only process when we have a substantial number of spans across all pages
      if (totalSpans > 100 || attempts >= maxAttempts) {
        // Text content is ready, process it
        console.log('[Tooltip] Text content ready, processing...');
        processTextLayer();
        return;
      }
      
      if (attempts < maxAttempts) {
        setTimeout(pollForTextContent, checkInterval);
      } else {
        console.log('[Tooltip] Max polling attempts reached, text layer may not be available');
      }
    };
    
    // Start polling after a short initial delay
    setTimeout(pollForTextContent, 500);
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setScale(1.0);

  const handleForceRecalc = () => {
    console.log('[Contract Viewer] Force recalc button clicked');
    regenerateMutation.mutate();
  };

  // Handle AI progress completion
  const handleAiComplete = () => {
    console.log('[Contract Viewer] AI extraction complete');
    setShowAiProgress(false);
    setAiOperationId(null);
    // Refresh metadata
    queryClient.invalidateQueries({
      queryKey: ['/api/contract-review/revisions', revisionId, 'metadata'],
    });
  };

  // Handle AI progress error
  const handleAiError = (error: string) => {
    console.error('[Contract Viewer] AI extraction error:', error);
    // Keep dialog open to show error state - don't hide it
    // User can close it manually by pressing ESC or clicking outside
  };

  // Handle AI progress close
  const handleAiClose = () => {
    setShowAiProgress(false);
    setAiOperationId(null);
  };

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
  };

  useEffect(() => {
    if (!isResizing || !resizeRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaX = e.clientX - resizeRef.current.startX;
      const deltaY = e.clientY - resizeRef.current.startY;
      setSize({
        width: Math.max(600, resizeRef.current.startWidth + deltaX),
        height: Math.max(400, resizeRef.current.startHeight + deltaY),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Save position and size to localStorage whenever they change
  useEffect(() => {
    if (open && user?.id) {
      const storageKey = `contractViewer_${user.id}`;
      const preferences = {
        position,
        size,
      };
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    }
  }, [position, size, open, user?.id]);

  // HTML escape helper
  const escapeHtml = (s: string) => {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  // ChatGPT formatter v4: Force letter markers to reset to depth 0
  const renderNestedListHTML = useCallback((raw: string): string => {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const lines = raw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    type Frame = { depth: number; openLi: boolean };
    const out: string[] = [];
    const stack: Frame[] = [];

    const hasOpenDepth = (d: number) => stack.some(fr => fr.depth === d && fr.openLi);
    const topDepth = () => (stack.length ? stack[stack.length - 1].depth : -1);

    // Only i..xx are treated as roman numerals
    const ROMAN_SAFE_RE =
      /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/i;

    const classifyDepth = (marker: string): 0 | 1 | 2 | -1 => {
      const inner = marker.slice(1, -1).trim().toLowerCase();
      if (/^\d+$/.test(inner)) return 2;
      if (/^[a-z]+$/.test(inner)) {
        // roman numerals only when we are already in a (a)-level item
        if (hasOpenDepth(0) && ROMAN_SAFE_RE.test(inner)) return 1;
        return 0;
      }
      return -1;
    };

    const openList = (depth: number) => {
      out.push(`<ol class="tlist" data-depth="${depth}">`);
      stack.push({ depth, openLi: false });
    };
    const closeLiAtTop = () => {
      const top = stack[stack.length - 1];
      if (top?.openLi) {
        out.push(`</div></li>`); // close li-body then li
        top.openLi = false;
      }
    };
    const closeToDepth = (target: number) => {
      while (stack.length && stack[stack.length - 1].depth > target) {
        closeLiAtTop();
        out.push(`</ol>`);
        stack.pop();
      }
    };

    const startItem = (depth: number, marker: string, firstText: string, isLetter: boolean) => {
      // ✅ If a LETTER item arrives, we must be back at top-level.
      if (isLetter) closeToDepth(0);

      if (!stack.length || topDepth() < depth) {
        for (let d = stack.length ? topDepth() + 1 : 0; d <= depth; d++) openList(d);
      } else if (topDepth() > depth) {
        closeToDepth(depth);
        closeLiAtTop();
      } else {
        closeLiAtTop(); // sibling
      }

      out.push(`<li><span class="m">${esc(marker)}</span><div class="li-body">`);
      if (firstText) out.push(esc(firstText));
      stack[stack.length - 1].openLi = true;
    };

    const para = (text: string) => {
      // if a list item is open, this becomes a paragraph inside the body div
      if (stack.length && stack[stack.length - 1].openLi) {
        out.push(`<p class="tpara">${esc(text)}</p>`);
      } else {
        out.push(`<p class="tpara">${esc(text)}</p>`);
      }
    };

    // Optional heading line "Term: …" that is NOT a marker line
    if (lines.length) {
      const first = lines[0];
      const isMarkerFirst = /^\(\s*[a-zivxlcdm\d]+\s*\)/i.test(first);
      if (!isMarkerFirst && /^[^()]+:/.test(first)) {
        // push real HTML; do NOT escape the <strong>
        out.push(`<p class="tpara"><strong>${esc(first)}</strong></p>`);
        lines.shift();
      }
    }

    const END_JOIN_RE = /\s*[;,]?\s*(?:and\/or|and|or)\s*$/i;

    for (const line of lines) {
      const m = line.match(/^\s*(\([a-z]+\)|\([ivxlcdm]+\)|\(\d+\))\s*(.*)$/i);
      if (m) {
        const marker = m[1];
        const bodyAfter = (m[2] || "").trim();
        const inner = marker.slice(1, -1).trim();
        const depth = classifyDepth(marker);
        if (depth >= 0) {
          const initialText = bodyAfter.replace(END_JOIN_RE, "");
          const isLetter = /^[a-z]+$/i.test(inner) && !ROMAN_SAFE_RE.test(inner);
          startItem(depth, marker, initialText, isLetter);
          continue;
        }
      }
      // continuation/paragraph line
      para(line);
    }

    // Close any remaining structures
    closeToDepth(-1);
    return out.join("");
  }, []);

  // Legacy inline parser for backward compatibility
  const renderNestedListHTMLLegacy = useCallback((raw: string): string => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const depthOf = (m: string) =>
      /^[a-z]$/i.test(m) ? 0 : /^[ivxlcdm]+$/i.test(m) ? 1 : /^\d+$/.test(m) ? 2 : -1;

    const out: string[] = [];
    const openLI: Record<number, boolean> = {};
    let deepest = -1;
    
    const push = (s: string) => out.push(s);
    const openListTo = (to: number) => { 
      for (let d = deepest + 1; d <= to; d++) { 
        push(`<ol class="tlist" data-depth="${d}">`); 
        openLI[d] = false; 
        deepest = d; 
      } 
    };
    const closeLIAt = (d: number) => { 
      if (openLI[d]) { 
        push('</li>'); 
        openLI[d] = false; 
      } 
    };
    const closeDownTo = (target: number) => { 
      for (let d = deepest; d > target; d--) { 
        closeLIAt(d); 
        push('</ol>'); 
        delete openLI[d]; 
      } 
      deepest = target; 
    };
    const startItem = (depth: number, marker: string, body: string) => {
      if (deepest < 0) openListTo(depth);
      else if (depth > deepest) openListTo(depth);
      else if (depth < deepest) { closeDownTo(depth); closeLIAt(depth); }
      else closeLIAt(depth);
      push(`<li><span class="m">${esc(marker)}</span><div class="li-body">${esc(body)}</div>`);
      openLI[depth] = true;
    };
    const finish = () => closeDownTo(-1);

    {
    let head = '';
    let body = raw;
    const termMatch = body.match(/^\s*([^:]+?):\s*([\s\S]*)$/);
    if (termMatch) {
      const [, term, rest] = termMatch;
      head = `<strong>${esc(term)}:</strong>`;
      body = rest;
    }

    // Find markers with boundary detection (like old parser)
    const re = /\(([a-z]|[ivxlcdm]+|\d+)\)/gi;
    type Hit = { idx: number; end: number; marker: string; depth: number };
    const hits: Hit[] = [];
    
    for (let m; (m = re.exec(body)); ) {
      const marker = m[0];
      const idx = m.index;
      const before = body.slice(0, idx);
      const afterChar = body[m.index + marker.length] || ' ';
      const prev = before.trimEnd();
      const prevTail = prev.slice(-30);

      const validBoundary =
        idx === 0 ||
        /[;:]\s*$/.test(before) ||
        /\r?\n\s*$/.test(before);

      const notReferenceWord = !/(clause|paragraph|item|schedule)\s*$/i.test(prevTail);
      const notNumericRef = !/\d\)\s*$/.test(prevTail) && !/\d(?:\.\d+)*\s*$/.test(prevTail);
      const followedBySpaceOrLetter = /\s/.test(afterChar);

      if (validBoundary && notReferenceWord && notNumericRef && followedBySpaceOrLetter) {
        const d = depthOf(marker.slice(1, -1));
        if (d >= 0) hits.push({ idx, end: idx + marker.length, marker, depth: d });
      }
    }

    if (!hits.length) {
      return `<p class="tpara">${[head, esc(body.trim())].filter(Boolean).join(' ')}</p>`;
    }

    const prelude = body.slice(0, hits[0].idx).trim();
    if (head || prelude) push(`<p class="tpara">${[head, esc(prelude)].filter(Boolean).join(' ')}</p>`);

    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const nextStart = i + 1 < hits.length ? hits[i + 1].idx : body.length;
      let itemText = body.slice(h.end, nextStart).trim();
      itemText = itemText.replace(/\s*;(?:\s*(?:and|or))?\s*$/i, '');
      itemText = itemText.replace(/^(?:and|or)\s+/i, '');

      startItem(h.depth, h.marker, itemText);
    }
    }
    
    finish();
    return out.join('');
  }, []);

  // Tooltip event handlers with HTML rendering
  const handleTextHover = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    if (!metadata) return;
    
    const show = (html: string) => {
      setTooltip({
        visible: true,
        html,
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 6,
      });
    };
    
    if (target.classList.contains('pdf-clause-number')) {
      const text = (target.textContent || '').trim();
      const clause = metadata.clauses.find(c => c.number === text);
      
      if (clause?.heading) {
        show(`<div class="tt-title">Clause ${clause.number}</div><div class="tt-body">${clause.heading}</div>`);
      }
    } else if (target.classList.contains('pdf-defined-term')) {
      const text = (target.textContent || '').trim();
      const normalizedText = text.toLowerCase();
      const definition = metadata.definitions.find(d => d.term.toLowerCase() === normalizedText);
      
      if (definition) {
        const html = renderNestedListHTML(`${definition.term}: ${definition.definition}`);
        show(html);
      }
    }
  }, [metadata, renderNestedListHTML]);

  const handleTextLeave = useCallback(() => {
    setTooltip({ visible: false, html: '', x: 0, y: 0 });
  }, []);

  // Process a single text layer to mark clause numbers and defined terms
  const processPageTextLayer = useCallback((layer: Element) => {
    if (!metadata) return { clauseMarks: 0, definitionMarks: 0 };
    
    // Build lookup maps for fast matching
    const definedTermsMap = new Map<string, string>();
    metadata.definitions.forEach(def => {
      const normalizedTerm = def.term.toLowerCase().trim();
      definedTermsMap.set(normalizedTerm, def.definition);
    });
    
    const clauseMap = new Map<string, string>();
    metadata.clauses.forEach(clause => {
      const normalizedNumber = clause.number.trim();
      clauseMap.set(normalizedNumber, clause.heading);
    });
    
    let clauseMarks = 0;
    let definitionMarks = 0;
    
    let textSpans = Array.from(layer.querySelectorAll('span[role="presentation"]'));
    
    if (textSpans.length === 0) {
      textSpans = Array.from(layer.querySelectorAll('span'));
    }
    
    // Process each span individually
    textSpans.forEach((span: Element) => {
      const htmlSpan = span as HTMLSpanElement;
      const text = (htmlSpan.textContent || '').trim();
      
      if (!text) return;
      
      // Check for exact clause number match
      if (clauseMap.has(text)) {
        if (!htmlSpan.classList.contains('pdf-clause-number')) {
          htmlSpan.classList.add('pdf-clause-number');
          htmlSpan.addEventListener('mouseenter', handleTextHover as EventListener);
          htmlSpan.addEventListener('mouseleave', handleTextLeave as EventListener);
          clauseMarks++;
        }
        return;
      }
      
      // Check for exact defined term match (case-insensitive)
      const normalizedText = text.toLowerCase();
      if (definedTermsMap.has(normalizedText)) {
        if (!htmlSpan.classList.contains('pdf-defined-term')) {
          htmlSpan.classList.add('pdf-defined-term');
          htmlSpan.addEventListener('mouseenter', handleTextHover as EventListener);
          htmlSpan.addEventListener('mouseleave', handleTextLeave as EventListener);
          definitionMarks++;
        }
      }
    });
    
    return { clauseMarks, definitionMarks };
  }, [metadata, handleTextHover, handleTextLeave]);

  // Process all existing text layers (for initial load and zoom changes)
  const processTextLayer = useCallback(() => {
    if (!open || !metadata) {
      console.log('[Tooltip] Skipping processTextLayer - dialog not open or no metadata');
      return;
    }

    console.log('[Tooltip] Processing text layers...', { clauseCount: metadata.clauses.length, definitionCount: metadata.definitions.length });
    
    const textLayers = Array.from(document.querySelectorAll('.react-pdf__Page__textContent'));
    console.log('[Tooltip] Found text layers:', textLayers.length);
    
    let totalClauseMarks = 0;
    let totalDefinitionMarks = 0;
    
    textLayers.forEach((layer) => {
      const { clauseMarks, definitionMarks } = processPageTextLayer(layer);
      totalClauseMarks += clauseMarks;
      totalDefinitionMarks += definitionMarks;
    });
    
    console.log('[Tooltip] Marked elements:', { clauseMarks: totalClauseMarks, definitionMarks: totalDefinitionMarks });
  }, [open, metadata, processPageTextLayer]);

  // Re-process text layers when scale or zoom changes
  useEffect(() => {
    if (!open || !metadata || numPages === 0) return;

    // Process text layer with a delay to ensure it's re-rendered after zoom
    const timer = setTimeout(processTextLayer, 1200);

    return () => {
      clearTimeout(timer);
    };
  }, [scale, processTextLayer]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={() => onOpenChange(false)}
        data-testid="viewer-backdrop"
      />

      {/* Draggable Container */}
      <Draggable
        handle=".drag-handle"
        position={position}
        onStop={(_, data) => setPosition({ x: data.x, y: data.y })}
      >
        <div
          className="fixed z-50 bg-background border rounded-lg shadow-2xl flex flex-col"
          style={{
            width: `${size.width}px`,
            height: `${size.height}px`,
            left: 0,
            top: 0,
          }}
          data-testid="contract-viewer-dialog"
        >
          {/* Header */}
          <div className="drag-handle cursor-move px-6 py-4 border-b flex items-center justify-between bg-muted/30">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="flex items-center gap-2">
              {!metadata || (metadata.clauses.length === 0 && metadata.definitions.length === 0) ? (
                <span className="text-sm text-muted-foreground mr-2">
                  Click refresh to extract metadata
                </span>
              ) : (
                <span className="text-sm text-muted-foreground mr-2">
                  {metadata.clauses.length} clauses, {metadata.definitions.length} definitions
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleForceRecalc}
                disabled={regenerateMutation.isPending}
                data-testid="button-recalc-metadata"
                title="Extract contract metadata (clauses & definitions)"
              >
                <RefreshCw className={`h-4 w-4 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="button-close-viewer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 py-2 border-b bg-muted/10">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground" data-testid="text-page-count">
                {numPages} {numPages === 1 ? 'page' : 'pages'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-mono" data-testid="text-zoom-level">
                {Math.round(scale * 100)}%
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleResetZoom}
                data-testid="button-reset-zoom"
              >
                Reset
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {isLoadingMetadata && (
                <span className="text-sm text-muted-foreground">Loading metadata...</span>
              )}
              {metadata && (
                <span className="text-sm text-muted-foreground" data-testid="text-metadata-count">
                  {metadata.clauses.length} clauses, {metadata.definitions.length} definitions
                </span>
              )}
            </div>
          </div>

          {/* PDF Viewer - Continuous Scroll */}
          <div className="flex-1 overflow-auto bg-muted/5 p-4">
            <div className="flex flex-col items-center gap-4">
              {!pdfBlob ? (
                <div className="flex items-center justify-center h-64">
                  <span className="text-muted-foreground">Loading PDF...</span>
                </div>
              ) : (
                <Document
                  file={pdfBlob}
                  onLoadSuccess={handleDocumentLoadSuccess}
                  loading={
                    <div className="flex items-center justify-center h-64">
                      <span className="text-muted-foreground">Loading PDF...</span>
                    </div>
                  }
                  error={
                    <div className="flex items-center justify-center h-64">
                      <span className="text-destructive">Failed to load PDF</span>
                    </div>
                  }
                >
                  {Array.from(new Array(numPages), (_, index) => (
                    <Page
                      key={`page_${index + 1}`}
                      pageNumber={index + 1}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="shadow-lg mb-4"
                      onRenderSuccess={() => {
                        // Process this page's text layer when it finishes rendering
                        setTimeout(() => {
                          const pageDiv = document.querySelector(`.react-pdf__Page[data-page-number="${index + 1}"]`);
                          if (pageDiv) {
                            const textLayer = pageDiv.querySelector('.react-pdf__Page__textContent');
                            if (textLayer) {
                              processPageTextLayer(textLayer);
                            }
                          }
                        }, 100); // Small delay to ensure text layer is fully mounted
                      }}
                    />
                  ))}
                </Document>
              )}
            </div>
          </div>

          {/* Resize Handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
            onMouseDown={handleResizeStart}
            data-testid="resize-handle"
          >
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </Draggable>

      {/* Tooltip for clause numbers and definitions */}
      {tooltip.visible && (
        <div
          className="contract-tooltip fixed pointer-events-none z-[9999]"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
          data-testid="tooltip-contract-metadata"
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      )}

      {/* AI Progress Dialog */}
      <AIProgressDialog
        open={showAiProgress}
        operationId={aiOperationId}
        title="Extracting Contract Metadata"
        onComplete={handleAiComplete}
        onError={handleAiError}
        onClose={handleAiClose}
      />
    </>
  );
}
