import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles } from "lucide-react";

// Format elapsed time in milliseconds to human-readable string
function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
}

interface AIProgressDialogProps {
  open: boolean;
  operationId: string | null;
  title: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

interface ProgressState {
  operationId: string;
  phase: string;
  percentage: number;
  startTime: number;
  estimatedTimeRemaining: number | null;
  currentStep: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
  // Real-time telemetry for streaming operations
  chunkCount?: number;
  charCount?: number;
  elapsedMs?: number;
  // Contract statistics (FYI for user)
  contractStats?: {
    pageCount?: number;
    wordCount?: number;
    lineCount?: number;
    characterCount?: number;
  };
}

export function AIProgressDialog({ open, operationId, title, onComplete, onError, onClose }: AIProgressDialogProps) {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!operationId || !open) {
      setProgress(null);
      setHasError(false);
      setErrorMessage("");
      return;
    }

    let pollInterval: NodeJS.Timeout;
    let isActive = true;

    // Fetch progress function
    const fetchProgress = async () => {
      if (!isActive) return;
      
      try {
        const response = await fetch(`/api/ai-progress/${operationId}`);
        
        // Handle 404 - operation not found (invalid ID or premature cleanup)
        if (response.status === 404) {
          console.error('Progress tracking not found - operation ID invalid or already cleaned up');
          isActive = false;
          if (pollInterval) clearInterval(pollInterval);
          const errMsg = 'Progress tracking not found - operation may have completed or failed';
          setHasError(true);
          setErrorMessage(errMsg);
          if (onError) {
            onError(errMsg);
          }
          return;
        }
        
        if (!response.ok) {
          console.error('Failed to fetch progress:', response.status);
          clearInterval(pollInterval);
          const errMsg = `Failed to track progress (HTTP ${response.status})`;
          setHasError(true);
          setErrorMessage(errMsg);
          if (onError) {
            onError(errMsg);
          }
          return;
        }

        const data: ProgressState = await response.json();
        setProgress(data);

        // Format time remaining
        if (data.estimatedTimeRemaining !== null) {
          const seconds = Math.ceil(data.estimatedTimeRemaining / 1000);
          if (seconds < 60) {
            setTimeRemaining(`${seconds}s remaining`);
          } else {
            const minutes = Math.ceil(seconds / 60);
            setTimeRemaining(`${minutes}m remaining`);
          }
        } else {
          setTimeRemaining("Estimating...");
        }

        // Handle completion
        if (data.status === 'completed') {
          isActive = false;
          if (pollInterval) clearInterval(pollInterval);
          if (onComplete) {
            setTimeout(() => {
              onComplete();
            }, 500);
          }
          return;
        }

        // Handle error
        if (data.status === 'error') {
          isActive = false;
          if (pollInterval) clearInterval(pollInterval);
          const errMsg = data.error || 'Unknown error occurred';
          setHasError(true);
          setErrorMessage(errMsg);
          if (onError) {
            onError(errMsg);
          }
          return;
        }
      } catch (error) {
        console.error('Error polling progress:', error);
        isActive = false;
        if (pollInterval) clearInterval(pollInterval);
        const errMsg = 'Network error while tracking progress';
        setHasError(true);
        setErrorMessage(errMsg);
        if (onError) {
          onError(errMsg);
        }
      }
    };

    // Immediately fetch progress on mount
    fetchProgress();

    // Then poll every 500ms
    pollInterval = setInterval(fetchProgress, 500);

    return () => {
      isActive = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [operationId, open, onComplete, onError]);

  if (!open || !operationId) return null;

  const canClose = hasError || progress?.status === 'error';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && canClose && onClose) {
        onClose();
      }
    }}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (!canClose) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!canClose) e.preventDefault();
        }}
        data-testid="dialog-ai-progress"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-ai-progress-title">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Error state - always show if hasError is true */}
          {hasError && (
            <div className="space-y-3">
              <div className="text-sm text-destructive border border-destructive bg-destructive/10 p-3 rounded-md" data-testid="text-error-message">
                Error: {errorMessage || 'An error occurred during processing'}
              </div>
              <div className="text-sm text-muted-foreground text-center">
                Press ESC or click outside to close
              </div>
            </div>
          )}

          {/* Progress state - only show if not in error state */}
          {!hasError && progress && (
            <>
              {/* Contract Statistics - Show as FYI info */}
              {progress.contractStats && (
                <div className="bg-[var(--ai-primary)]/10 rounded-md p-3 space-y-2 border border-[var(--ai-primary)]/30" data-testid="contract-stats">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--ai-primary)]" />
                    <div className="text-xs font-medium text-[var(--ai-primary)] uppercase tracking-wide">Contract Information</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {progress.contractStats.pageCount !== undefined && progress.contractStats.pageCount > 0 && (
                      <div data-testid="text-page-count">
                        <span className="text-muted-foreground">Pages: </span>
                        <span className="font-medium text-foreground">{progress.contractStats.pageCount.toLocaleString()}</span>
                      </div>
                    )}
                    {progress.contractStats.wordCount !== undefined && (
                      <div data-testid="text-word-count">
                        <span className="text-muted-foreground">Words: </span>
                        <span className="font-medium text-foreground">{progress.contractStats.wordCount.toLocaleString()}</span>
                      </div>
                    )}
                    {progress.contractStats.lineCount !== undefined && (
                      <div data-testid="text-line-count">
                        <span className="text-muted-foreground">Lines: </span>
                        <span className="font-medium text-foreground">{progress.contractStats.lineCount.toLocaleString()}</span>
                      </div>
                    )}
                    {progress.contractStats.characterCount !== undefined && (
                      <div data-testid="text-char-count">
                        <span className="text-muted-foreground">Characters: </span>
                        <span className="font-medium text-foreground">{progress.contractStats.characterCount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium" data-testid="text-progress-phase">{progress.currentStep}</span>
                  <span className="text-muted-foreground" data-testid="text-progress-percentage">{progress.percentage}%</span>
                </div>
                <Progress value={progress.percentage} className="h-2" data-testid="progress-bar" />
              </div>
              
              {/* Real-time telemetry for streaming operations */}
              {progress.chunkCount !== undefined && progress.chunkCount > 0 && (
                <div className="text-xs text-muted-foreground text-center font-mono" data-testid="text-telemetry">
                  {progress.chunkCount.toLocaleString()} chunks • {(progress.charCount || 0).toLocaleString()} chars
                  {progress.elapsedMs !== undefined && (
                    <> • {formatElapsedTime(progress.elapsedMs)}</>
                  )}
                </div>
              )}
              
              <div className="text-sm text-muted-foreground text-center" data-testid="text-time-remaining">
                {timeRemaining}
              </div>
            </>
          )}
          
          {/* Loading spinner - show when no progress yet and no error */}
          {!hasError && !progress && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
