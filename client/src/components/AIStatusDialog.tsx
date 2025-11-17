import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AIStatusDialogProps {
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
}

export function AIStatusDialog({ 
  open, 
  operationId, 
  title, 
  onComplete, 
  onError, 
  onClose 
}: AIStatusDialogProps) {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);
  const MAX_404_RETRIES = 4; // Retry for ~2 seconds (4 retries * 500ms)

  useEffect(() => {
    if (!operationId || !open) {
      setProgress(null);
      setHasError(false);
      setErrorMessage("");
      setRetryCount(0);
      return;
    }

    let pollInterval: NodeJS.Timeout;
    let isActive = true;

    const fetchProgress = async () => {
      if (!isActive) return;
      
      try {
        const response = await fetch(`/api/ai-progress/${operationId}`);
        
        // Handle 404 - allow retries for delayed backend registration
        if (response.status === 404) {
          if (retryCount < MAX_404_RETRIES) {
            setRetryCount(prev => prev + 1);
            console.log(`Progress tracking not found (retry ${retryCount + 1}/${MAX_404_RETRIES})`);
            return;
          }
          
          console.error('Progress tracking not found after retries');
          isActive = false;
          if (pollInterval) clearInterval(pollInterval);
          const errMsg = 'Progress tracking not found';
          setHasError(true);
          setErrorMessage(errMsg);
          if (onError) onError(errMsg);
          return;
        }
        
        // Reset retry count on successful response
        setRetryCount(0);
        
        if (!response.ok) {
          console.error('Failed to fetch progress:', response.status);
          clearInterval(pollInterval);
          const errMsg = `Failed to track progress (HTTP ${response.status})`;
          setHasError(true);
          setErrorMessage(errMsg);
          if (onError) onError(errMsg);
          return;
        }

        const data: ProgressState = await response.json();
        setProgress(data);

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

        if (data.status === 'error') {
          isActive = false;
          if (pollInterval) clearInterval(pollInterval);
          const errMsg = data.error || 'Unknown error occurred';
          setHasError(true);
          setErrorMessage(errMsg);
          if (onError) onError(errMsg);
          return;
        }
      } catch (error) {
        console.error('Error polling progress:', error);
        isActive = false;
        if (pollInterval) clearInterval(pollInterval);
        const errMsg = 'Network error while tracking progress';
        setHasError(true);
        setErrorMessage(errMsg);
        if (onError) onError(errMsg);
      }
    };

    fetchProgress();
    pollInterval = setInterval(fetchProgress, 500);

    return () => {
      isActive = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [operationId, open, onComplete, onError]);

  if (!open || !operationId) return null;

  const canClose = hasError || progress?.status === 'error' || progress?.status === 'completed';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && canClose && onClose) {
        onClose();
      }
    }}>
      <DialogContent 
        className="sm:max-w-md border-ai/20"
        onPointerDownOutside={(e) => {
          if (!canClose) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!canClose) e.preventDefault();
        }}
        data-testid="dialog-ai-status"
      >
        <DialogHeader>
          <DialogTitle 
            className="flex items-center gap-2.5 text-base font-semibold" 
            data-testid="text-ai-status-title"
          >
            {hasError ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : progress?.status === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <div className="relative">
                <Sparkles className="h-5 w-5 text-ai animate-pulse" />
                <div className="absolute inset-0 bg-ai/20 blur-md rounded-full animate-pulse" />
              </div>
            )}
            <span className={hasError ? 'text-destructive' : progress?.status === 'completed' ? 'text-success' : 'text-ai'}>
              {title}
            </span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          {hasError && (
            <div className="space-y-3">
              <div 
                className="text-sm text-destructive border border-destructive/30 bg-destructive/5 p-3.5 rounded-md" 
                data-testid="text-error-message"
              >
                <div className="font-medium mb-1">Error</div>
                {errorMessage || 'An error occurred during processing'}
              </div>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  data-testid="button-close-error"
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          {!hasError && progress && (
            <>
              <div className="space-y-3">
                <div 
                  className="px-3.5 py-2.5 rounded-md bg-ai/5 border border-ai/20"
                  data-testid="container-progress-info"
                >
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="font-medium text-ai" data-testid="text-progress-phase">
                      {progress.currentStep}
                    </span>
                    <span className="text-ai/80 font-mono text-xs" data-testid="text-progress-percentage">
                      {progress.percentage}%
                    </span>
                  </div>
                  <div className="relative">
                    <Progress 
                      value={progress.percentage} 
                      className="h-1.5 bg-ai/10 [&>div]:bg-gradient-to-r [&>div]:from-ai [&>div]:to-ai-secondary" 
                      data-testid="progress-bar"
                    />
                  </div>
                </div>
                
                <div className="text-xs text-center text-muted-foreground font-medium" data-testid="text-time-remaining">
                  {timeRemaining}
                </div>
              </div>
            </>
          )}
          
          {!hasError && !progress && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="relative">
                <Sparkles className="h-8 w-8 text-ai animate-pulse" />
                <div className="absolute inset-0 bg-ai/20 blur-lg rounded-full animate-pulse" />
              </div>
              <p className="text-sm text-ai/80 font-medium">Initializing AI...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
