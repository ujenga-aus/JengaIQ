import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MonteCarloSettingsProps {
  revisionId: string;
}

export function MonteCarloSettings({ revisionId }: MonteCarloSettingsProps) {
  const { toast } = useToast();
  const [iterations, setIterations] = useState(10000);
  const [targetPercentile, setTargetPercentile] = useState(80);

  // Fetch current revision settings
  const { data: revision } = useQuery<any>({
    queryKey: ["/api/risk-revisions", revisionId],
    enabled: !!revisionId,
  });

  // Update local state when revision data loads
  useEffect(() => {
    if (revision) {
      setIterations(revision.monteCarloIterations || 10000);
      setTargetPercentile(revision.targetPercentile || 80);
    }
  }, [revision]);

  // Mutation to update settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: { monteCarloIterations?: number; targetPercentile?: number }) => {
      return await apiRequest("PATCH", `/api/risk-revisions/${revisionId}/monte-carlo-settings`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-revisions", revisionId] });
      toast({
        title: "Settings Updated",
        description: "Monte Carlo simulation settings have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update Monte Carlo settings",
        variant: "destructive",
      });
    },
  });

  const handleIterationsChange = (value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0) {
      setIterations(numValue);
    }
  };

  const handleIterationsBlur = () => {
    if (iterations !== revision?.monteCarloIterations) {
      updateSettingsMutation.mutate({ monteCarloIterations: iterations });
    }
  };

  const handlePercentileChange = (value: string) => {
    const numValue = parseInt(value);
    setTargetPercentile(numValue);
    updateSettingsMutation.mutate({ targetPercentile: numValue });
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Monte Carlo Simulation Settings</h3>
          <p className="text-sm text-muted-foreground">
            Configure the number of iterations and target confidence level for risk quantification
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="iterations">Number of Iterations</Label>
            <Input
              id="iterations"
              type="number"
              min="1000"
              max="100000"
              step="1000"
              value={iterations}
              onChange={(e) => handleIterationsChange(e.target.value)}
              onBlur={handleIterationsBlur}
              data-testid="input-monte-carlo-iterations"
            />
            <p className="text-xs text-muted-foreground">
              Higher iterations provide more accurate results (recommended: 10,000+)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-percentile">Target Confidence Level (PXX)</Label>
            <Select
              value={targetPercentile.toString()}
              onValueChange={handlePercentileChange}
            >
              <SelectTrigger id="target-percentile" data-testid="select-target-percentile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">P50 (Median - 50% confidence)</SelectItem>
                <SelectItem value="70">P70 (70% confidence)</SelectItem>
                <SelectItem value="80">P80 (80% confidence)</SelectItem>
                <SelectItem value="85">P85 (85% confidence)</SelectItem>
                <SelectItem value="90">P90 (90% confidence)</SelectItem>
                <SelectItem value="95">P95 (95% confidence)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Position adopted for project planning and budgeting
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
