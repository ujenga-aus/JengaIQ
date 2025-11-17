import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, FileText, CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useRef, useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ContractParsingProgressDialogProps {
  open: boolean;
  revisionId: string | null;
  onClose?: () => void;
  onComplete?: () => void;
}

interface ChunkStats {
  pageCount: number;
  chunkCount: number;
  totalTokens: number;
  limitOk: boolean;
  chunks: Array<{
    chunkIndex: number;
    pageRange: string;
    tokenUsage: number;
    charCount: number;
  }>;
}

interface ParsingProgress {
  status: 'not_started' | 'processing' | 'completed' | 'failed';
  phase?: string;
  percentage?: number;
  completedWorkUnits?: number;
  totalWorkUnits?: number;
  message?: string;
  error?: string;
  chunkStats?: ChunkStats;
}

export function ContractParsingProgressDialog({ 
  open, 
  revisionId, 
  onClose,
  onComplete 
}: ContractParsingProgressDialogProps) {
  // Guard to ensure onComplete fires only once
  const hasCompletedRef = useRef(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Reset guard when dialog opens with new revision
  useEffect(() => {
    if (open && revisionId) {
      hasCompletedRef.current = false;
      setDetailsOpen(false);
    }
  }, [open, revisionId]);
  
  // Poll parsing status using TanStack Query
  const { data: progress, isLoading } = useQuery<ParsingProgress>({
    queryKey: [`/api/contract-review/revisions/${revisionId}/parsing-status`],
    enabled: open && !!revisionId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling when completed or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        // Trigger onComplete callback ONCE if status is completed
        if (data.status === 'completed' && onComplete && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          setTimeout(onComplete, 500);
        }
        return false;
      }
      // Poll every 500ms while processing
      return 500;
    },
  });

  if (!open || !revisionId) return null;

  const canClose = progress?.status === 'completed' || progress?.status === 'failed';

  // Calculate smooth percentage with CSS transitions
  const displayPercentage = progress?.percentage ?? 0;

  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        if (!isOpen && canClose && onClose) {
          onClose();
        }
      }}
    >
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (!canClose) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!canClose) e.preventDefault();
        }}
        data-testid="dialog-parsing-progress"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-parsing-title">
            {progress?.status === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : progress?.status === 'failed' ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            Contract Parsing
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Loading initial state */}
          {isLoading && !progress && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-initial" />
            </div>
          )}

          {/* Error state */}
          {progress?.status === 'failed' && (
            <div className="space-y-3">
              <div 
                className="text-sm text-destructive border border-destructive bg-destructive/10 p-3 rounded-md" 
                data-testid="text-error-message"
              >
                <div className="font-medium mb-1">Parsing Failed</div>
                <div>{progress.error || progress.message || 'An error occurred during contract parsing'}</div>
              </div>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={onClose}
                data-testid="button-close-error"
              >
                Close
              </Button>
            </div>
          )}

          {/* Completed state */}
          {progress?.status === 'completed' && (
            <div className="space-y-3">
              <div 
                className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 p-3 rounded-md text-sm space-y-2"
                data-testid="text-completed-message"
              >
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Parsing Complete
                </div>
                
                {/* High-level summary */}
                {progress.chunkStats && (
                  <div className="text-green-700 dark:text-green-300 space-y-1">
                    <div>
                      Parsed <strong>{progress.chunkStats.pageCount}</strong> pages into{' '}
                      <strong>{progress.chunkStats.chunkCount}</strong> chunks
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {progress.chunkStats.limitOk ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          <span>All chunks within Claude's token limits</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 text-amber-600" />
                          <span className="text-amber-600">Warning: Some chunks exceed token limits</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Collapsible details */}
                {progress.chunkStats && progress.chunkStats.chunks.length > 0 && (
                  <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-between text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                        data-testid="button-toggle-details"
                      >
                        <span>View Chunk Details</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 mt-2">
                      <div className="text-xs space-y-1 max-h-48 overflow-y-auto">
                        <div className="grid grid-cols-4 gap-2 font-medium text-green-800 dark:text-green-200 pb-1 border-b border-green-300 dark:border-green-700 sticky top-0 bg-green-50 dark:bg-green-950">
                          <div>Chunk</div>
                          <div>Pages</div>
                          <div className="text-right">Tokens</div>
                          <div className="text-right">Chars</div>
                        </div>
                        {progress.chunkStats.chunks.map((chunk) => (
                          <div 
                            key={chunk.chunkIndex} 
                            className="grid grid-cols-4 gap-2 text-green-700 dark:text-green-300"
                            data-testid={`chunk-detail-${chunk.chunkIndex}`}
                          >
                            <div>#{chunk.chunkIndex}</div>
                            <div>{chunk.pageRange}</div>
                            <div className="text-right font-mono">{chunk.tokenUsage.toLocaleString()}</div>
                            <div className="text-right font-mono">{chunk.charCount.toLocaleString()}</div>
                          </div>
                        ))}
                        <div className="grid grid-cols-4 gap-2 font-bold text-green-800 dark:text-green-200 pt-1 border-t border-green-300 dark:border-green-700">
                          <div className="col-span-2">Total</div>
                          <div className="text-right font-mono">{progress.chunkStats.totalTokens.toLocaleString()}</div>
                          <div></div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
              {onClose && (
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={onClose}
                  data-testid="button-close-completed"
                >
                  Close
                </Button>
              )}
            </div>
          )}

          {/* Processing state */}
          {progress && progress.status === 'processing' && (
            <>
              <div 
                className="bg-primary/10 rounded-md p-3 space-y-2 border border-primary/30" 
                data-testid="container-progress-info"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <div className="text-xs font-medium text-primary uppercase tracking-wide">
                    Processing Contract
                  </div>
                </div>
                <div className="text-sm text-foreground font-medium" data-testid="text-phase-label">
                  {progress.phase || 'Processing...'}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground" data-testid="text-work-units">
                    {progress.completedWorkUnits || 0} / {progress.totalWorkUnits || 0} work units
                  </span>
                  <span className="font-medium" data-testid="text-percentage">
                    {displayPercentage}%
                  </span>
                </div>
                <Progress 
                  value={displayPercentage} 
                  className="h-2 transition-all duration-300 ease-out" 
                  data-testid="progress-bar"
                />
              </div>
              
              {progress.message && (
                <div className="text-xs text-muted-foreground text-center" data-testid="text-status-message">
                  {progress.message}
                </div>
              )}
            </>
          )}

          {/* Not started state */}
          {progress?.status === 'not_started' && (
            <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-not-started">
              Waiting for parsing to begin...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
