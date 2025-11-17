import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, X } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import Draggable from 'react-draggable';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseTOC } from '@/lib/tocParser';
import { useClauseTooltips } from '@/hooks/useClauseTooltips';
import { ClauseTooltip } from './ClauseTooltip';
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

interface ViewerState {
  position: { x: number; y: number };
  size: { width: number; height: number };
  scale: number;
}

interface TOCChunkResponse {
  tocText: string;
  pageRange: { start: number; end: number };
  parsedAssetId: string;
  chunkId: string;
}

const DEFAULT_SIZE = { width: 1000, height: 800 };
const MIN_SIZE = { width: 400, height: 300 };
const ZOOM_INCREMENT = 0.2;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;

/**
 * Hook for persisting viewer position, size, and zoom to localStorage
 * Only active on desktop (isMobile=false)
 */
function useViewerPersistence(userId: string | undefined, open: boolean, isMobile: boolean) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [scale, setScale] = useState(1.0);

  // Load saved state on mount (desktop only)
  useEffect(() => {
    if (!open || !userId || isMobile) return;

    const storageKey = `contractViewer_desktop_${userId}`;
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const state: ViewerState = JSON.parse(saved);
        
        // Validate bounds to prevent off-screen rendering
        const maxX = window.innerWidth - state.size.width;
        const maxY = window.innerHeight - state.size.height;
        
        setPosition({
          x: Math.max(0, Math.min(state.position.x, maxX)),
          y: Math.max(0, Math.min(state.position.y, maxY))
        });
        setSize({
          width: Math.max(MIN_SIZE.width, Math.min(state.size.width, window.innerWidth)),
          height: Math.max(MIN_SIZE.height, Math.min(state.size.height, window.innerHeight))
        });
        // Restore scale with bounds checking
        setScale(Math.max(MIN_ZOOM, Math.min(state.scale || 1.0, MAX_ZOOM)));
        return;
      } catch (error) {
        console.warn('Failed to load saved viewer preferences:', error);
      }
    }

    // Center dialog by default
    const centerX = (window.innerWidth - DEFAULT_SIZE.width) / 2;
    const centerY = (window.innerHeight - DEFAULT_SIZE.height) / 2;
    setPosition({ x: Math.max(0, centerX), y: Math.max(0, centerY) });
    setScale(1.0); // Default zoom
  }, [open, userId, isMobile]);

  // Save state to localStorage (desktop only)
  const saveState = (newPosition?: { x: number; y: number }, newSize?: { width: number; height: number }, newScale?: number) => {
    if (!userId || isMobile) return;

    const state: ViewerState = {
      position: newPosition || position,
      size: newSize || size,
      scale: newScale !== undefined ? newScale : scale
    };

    localStorage.setItem(`contractViewer_desktop_${userId}`, JSON.stringify(state));
  };

  return {
    position,
    size,
    scale,
    setPosition: (newPos: { x: number; y: number }) => {
      setPosition(newPos);
      saveState(newPos, undefined, undefined);
    },
    setSize: (newSize: { width: number; height: number }) => {
      setSize(newSize);
      saveState(undefined, newSize, undefined);
    },
    setScale: (newScale: number) => {
      setScale(newScale);
      saveState(undefined, undefined, newScale);
    }
  };
}

export function ContractViewerDialog({
  open,
  onOpenChange,
  revisionId,
  pdfUrl,
  title = 'Contract Viewer',
}: ContractViewerDialogProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfBlob, setPdfBlob] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { position, size, scale, setPosition, setSize, setScale } = useViewerPersistence(user?.id, open, isMobile);

  // Fetch TOC data for clause tooltips (desktop only - tooltips don't work on mobile)
  const { data: tocData } = useQuery<TOCChunkResponse>({
    queryKey: ['/api/contract-review/revisions', revisionId, 'toc-chunk'],
    enabled: open && !!revisionId && !isMobile,
    retry: false, // Don't retry on access errors
  });

  // Parse TOC into clause number → heading map
  const clauseMap = useMemo(() => {
    return parseTOC(tocData?.tocText || '');
  }, [tocData]);

  // Initialize clause tooltip system (desktop only)
  const { tooltip, registerPageLayer } = useClauseTooltips({
    clauseMap,
    enabled: open && clauseMap.size > 0 && !isMobile,
  });

  // Fetch PDF as blob with credentials
  useEffect(() => {
    if (!open || !pdfUrl) {
      // Revoke previous blob URL if exists
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setPdfBlob(null);
      return;
    }

    const abortController = new AbortController();
    let isCancelled = false;

    const fetchPdf = async () => {
      try {
        const response = await fetch(pdfUrl, { 
          credentials: 'include',
          signal: abortController.signal 
        });
        
        if (!response.ok) {
          console.error('Failed to fetch PDF:', response.status);
          return;
        }
        
        const blob = await response.blob();
        
        // Only proceed if not cancelled
        if (!isCancelled) {
          // Revoke previous blob URL before creating new one
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          
          blobUrlRef.current = URL.createObjectURL(blob);
          setPdfBlob(blobUrlRef.current);
        } else {
          // Fetch completed after cleanup - revoke immediately
          URL.revokeObjectURL(URL.createObjectURL(blob));
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Expected abort, don't log
          return;
        }
        console.error('Error fetching PDF:', error);
      }
    };

    fetchPdf();

    // Cleanup: abort fetch and revoke blob URL
    return () => {
      isCancelled = true;
      abortController.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [open, pdfUrl]);

  // Zoom controls
  const handleZoomIn = () => {
    setScale(Math.min(scale + ZOOM_INCREMENT, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setScale(Math.max(scale - ZOOM_INCREMENT, MIN_ZOOM));
  };

  // Resize handling (desktop only, uses pointer events for touch compatibility)
  const handleResizeStart = (e: React.PointerEvent) => {
    if (isMobile) return; // Disable resize on mobile
    
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.width,
      startHeight: size.height
    };
  };

  useEffect(() => {
    if (!isResizing || isMobile) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!resizeRef.current) return;

      const deltaX = e.clientX - resizeRef.current.startX;
      const deltaY = e.clientY - resizeRef.current.startY;

      const newWidth = Math.max(MIN_SIZE.width, Math.min(resizeRef.current.startWidth + deltaX, window.innerWidth));
      const newHeight = Math.max(MIN_SIZE.height, Math.min(resizeRef.current.startHeight + deltaY, window.innerHeight));

      setSize({ width: newWidth, height: newHeight });
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isResizing, isMobile, setSize]);

  if (!open) return null;

  console.log('[ContractViewerDialog] Rendering - isMobile:', isMobile, 'pdfBlob:', !!pdfBlob);

  // Mobile: Full-screen dialog
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50"
        data-testid="dialog-contract-viewer-overlay"
      >
        <div
          className="fixed inset-0 bg-background flex flex-col"
          data-testid="dialog-contract-viewer"
        >
          {/* Header - Fixed (no drag on mobile) */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
            <h2 className="text-base font-semibold truncate" data-testid="text-viewer-title">{title}</h2>
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <Button
                size="icon"
                variant="ghost"
                onClick={handleZoomOut}
                disabled={scale <= MIN_ZOOM}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[50px] text-center" data-testid="text-zoom-level">
                {Math.round(scale * 100)}%
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleZoomIn}
                disabled={scale >= MAX_ZOOM}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>

              {/* Close Button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="button-close-viewer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* PDF Viewer Content */}
          <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
            {pdfBlob ? (
              <Document
                file={pdfBlob}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                className="flex flex-col items-center py-4 gap-4"
              >
                {Array.from(new Array(numPages), (_, index) => (
                  <div 
                    key={`page_${index + 1}`} 
                    className="shadow-lg"
                  >
                    <Page
                      pageNumber={index + 1}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      width={Math.min(window.innerWidth - 32, 595)} // A4 width or viewport
                    />
                  </div>
                ))}
              </Document>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading PDF...</p>
              </div>
            )}
          </div>
        </div>

        {/* Clause Tooltip - Mobile compatible */}
        {tooltip && (
          <ClauseTooltip
            visible={true}
            clauseNumber={tooltip.clauseNumber}
            heading={tooltip.heading}
            x={tooltip.x}
            y={tooltip.y}
          />
        )}
      </div>
    );
  }

  // Desktop: Draggable, resizable dialog
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onOpenChange(false);
        }
      }}
      data-testid="dialog-contract-viewer-overlay"
    >
      <Draggable
        handle=".drag-handle"
        position={position}
        onStop={(_, data) => {
          // Bound position within viewport to prevent off-screen rendering
          const boundedX = Math.max(0, Math.min(data.x, window.innerWidth - size.width));
          const boundedY = Math.max(0, Math.min(data.y, window.innerHeight - size.height));
          setPosition({ x: boundedX, y: boundedY });
        }}
      >
        <div
          className="absolute bg-background border border-border rounded-lg shadow-xl flex flex-col overflow-hidden"
          style={{
            width: `${size.width}px`,
            height: `${size.height}px`,
          }}
          data-testid="dialog-contract-viewer"
        >
          {/* Header - Draggable */}
          <div className="drag-handle flex items-center justify-between px-4 py-3 border-b border-border bg-muted cursor-move">
            <h2 className="text-lg font-semibold" data-testid="text-viewer-title">{title}</h2>
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <Button
                size="icon"
                variant="ghost"
                onClick={handleZoomOut}
                disabled={scale <= MIN_ZOOM}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[60px] text-center" data-testid="text-zoom-level">
                {Math.round(scale * 100)}%
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleZoomIn}
                disabled={scale >= MAX_ZOOM}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>

              {/* Close Button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="button-close-viewer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* PDF Viewer Content */}
          <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
            {pdfBlob ? (
              <Document
                file={pdfBlob}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                className="flex flex-col items-center py-4 gap-4"
              >
                {Array.from(new Array(numPages), (_, index) => (
                  <div 
                    key={`page_${index + 1}`} 
                    className="shadow-lg"
                  >
                    <Page
                      pageNumber={index + 1}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      onRenderSuccess={() => {
                        // Register text layer after page renders (desktop only)
                        try {
                          const pages = document.querySelectorAll('.react-pdf__Page');
                          const pageElement = pages[index] as HTMLElement;
                          if (pageElement) {
                            registerPageLayer(pageElement);
                          }
                        } catch (error) {
                          console.error('Failed to register tooltip layer:', error);
                        }
                      }}
                    />
                  </div>
                ))}
              </Document>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading PDF...</p>
              </div>
            )}
          </div>

          {/* Resize Handle (pointer events for touch support) */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onPointerDown={handleResizeStart}
            data-testid="handle-resize-viewer"
          >
            <svg
              className="w-full h-full text-muted-foreground"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M14 10l-4 4M14 6l-8 8M14 2l-12 12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
      </Draggable>

      {/* Clause Tooltip - Rendered outside draggable for proper positioning */}
      {tooltip && (
        <ClauseTooltip
          visible={true}
          clauseNumber={tooltip.clauseNumber}
          heading={tooltip.heading}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}
    </div>
  );
}
