import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TokenUsageDialogProps {
  open: boolean;
  onClose: () => void;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  analyzedCount?: number;
  errorCount?: number;
}

export function TokenUsageDialog({ 
  open, 
  onClose, 
  tokenUsage,
  analyzedCount,
  errorCount,
}: TokenUsageDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="dialog-token-usage">
        <DialogHeader>
          <DialogTitle>AI Analysis Complete</DialogTitle>
          <DialogDescription>
            {analyzedCount !== undefined ? (
              errorCount && errorCount > 0 ? (
                `Analyzed ${analyzedCount} rows (${errorCount} failed due to API rate limits)`
              ) : (
                `Analyzed ${analyzedCount} rows successfully`
              )
            ) : (
              "Row analyzed successfully"
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-sm text-muted-foreground">Input Tokens:</div>
            <div className="text-sm font-medium" data-testid="text-input-tokens">
              {tokenUsage.inputTokens.toLocaleString()}
            </div>
            
            <div className="text-sm text-muted-foreground">Output Tokens:</div>
            <div className="text-sm font-medium" data-testid="text-output-tokens">
              {tokenUsage.outputTokens.toLocaleString()}
            </div>
            
            <div className="text-sm text-muted-foreground">Total Tokens:</div>
            <div className="text-sm font-semibold" data-testid="text-total-tokens">
              {tokenUsage.totalTokens.toLocaleString()}
            </div>
          </div>
          
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Estimated Cost:</span>
              <span className="text-lg font-bold" data-testid="text-estimated-cost">
                ${tokenUsage.estimatedCost.toFixed(4)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on GPT-4o-mini pricing: $0.15/1M input tokens, $0.60/1M output tokens
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} data-testid="button-close-token-dialog">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
