import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DistributionModelPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (model: string) => void;
  currentModel?: string | null;
  isAiSelected?: boolean;
}

const DISTRIBUTION_MODELS = [
  {
    name: "Triangular",
    description: "Assumes outcomes cluster around the most likely value (P50) with linear probability decline toward optimistic (P10) and pessimistic (P90) extremes.",
    useCases: "Best for initial risk assessment with limited historical data. Ideal when you have expert estimates but no statistical evidence of the true probability shape."
  },
  {
    name: "PERT",
    description: "Similar to Triangular but places greater weight on the most likely value (P50), producing a smoother, more realistic curve based on the Beta distribution.",
    useCases: "Recommended for project schedule and cost risks where expert judgment is reliable. More conservative than Triangular—reduces extreme outcome probability."
  },
  {
    name: "Normal",
    description: "Classic bell curve where outcomes are symmetrically distributed around the mean. Equal probability of deviation above or below the expected value.",
    useCases: "Use when the risk is influenced by many independent random factors (Central Limit Theorem). Common for aggregated risks, measurement uncertainties, or mature processes with historical data."
  },
  {
    name: "Uniform",
    description: "Every outcome between minimum (P10) and maximum (P90) has equal probability. No preference for any particular value within the range.",
    useCases: "Apply when you have genuine complete uncertainty with no basis to favor any value. Rare in practice—often indicates insufficient risk analysis."
  },
  {
    name: "Lognormal",
    description: "Right-skewed distribution where values cannot go below zero but can extend far to the right. Models multiplicative growth or compounding effects.",
    useCases: "Ideal for cost overruns, schedule delays, market returns, or any risk where large adverse outcomes are possible but outcomes cannot be negative. Realistic for financial and time-based risks."
  },
  {
    name: "Weibull",
    description: "Highly flexible distribution that can model increasing, decreasing, or constant failure rates over time. Shape adapts to match observed failure patterns.",
    useCases: "Best for reliability analysis, equipment life modeling, or any time-dependent failure process. Useful when risk probability changes over the project lifecycle."
  }
];

export function DistributionModelPicker({
  open,
  onOpenChange,
  onSelect,
  currentModel,
  isAiSelected = false,
}: DistributionModelPickerProps) {
  const handleSelect = (modelName: string) => {
    onSelect(modelName);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Distribution Model</DialogTitle>
          <DialogDescription className="leading-relaxed">
            The distribution model determines how probable values are spread between your Optimistic (P10), Likely (P50), and Pessimistic (P90) estimates for Monte Carlo simulation. The model choice affects the probability curve shape and influences simulation outcomes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <div className="space-y-3">
            {DISTRIBUTION_MODELS.map((model) => {
              const isSelected = currentModel === model.name;
              
              return (
                <Button
                  key={model.name}
                  variant={isSelected ? "default" : "outline"}
                  className={`w-full justify-start h-auto p-4 text-left ${
                    isSelected ? "border-2 border-primary" : ""
                  }`}
                  onClick={() => handleSelect(model.name)}
                  data-testid={`distribution-option-${model.name.toLowerCase()}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-base">{model.name}</span>
                      {isSelected && (
                        <Badge variant={isAiSelected ? "default" : "secondary"} className="text-xs">
                          {isAiSelected ? "🤖 AI Selected" : "✏️ Manual"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm opacity-90 mb-1 leading-relaxed">{model.description}</p>
                    <p className="text-xs opacity-70 leading-relaxed">
                      <span className="font-medium">Use cases:</span> {model.useCases}
                    </p>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 p-3 bg-muted rounded-md text-sm flex-shrink-0">
          <p className="font-medium mb-1">💡 AI-Powered Model Selection</p>
          <p className="text-muted-foreground leading-relaxed">
            Right-click any risk and select "🤖 Apply AI Distribution" to automatically analyse the relationship between your three-point estimates (P10/P50/P90). The AI examines the spread, skewness, and symmetry of your estimates to recommend the statistically most appropriate distribution model for accurate Monte Carlo simulation.
            {isAiSelected && " This distribution was AI-recommended based on analysis of your risk's three-point estimates."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
