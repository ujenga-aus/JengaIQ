import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, RefreshCw, Printer } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRechartsTheme } from "@/hooks/useRechartsTheme";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  ScatterChart,
  Scatter,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface MonteCarloReportDashboardProps {
  projectId: string;
  revisionId: string;
  onRiskClick?: (riskId: string) => void;
  autoRunTrigger?: number; // When this changes, auto-run the simulation
}

interface MonteCarloResults {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  stdDev: number;
  base: number;
  targetValue: number;
  targetPercentile: number;
  distribution: number[];
  sensitivityAnalysis: Array<{
    riskId: string;
    riskNumber: string;
    title: string;
    varianceContribution: number;
    correlation: number;
  }>;
  percentileTable: Array<{
    percentile: number;
    value: number;
    varianceFromBase: number;
  }>;
  settings: {
    iterations: number;
    targetPercentile: number;
  };
  risksAnalyzed: number;
  totalRisks: number;
}

export function MonteCarloReportDashboard({ projectId, revisionId, onRiskClick, autoRunTrigger }: MonteCarloReportDashboardProps) {
  const { toast } = useToast();
  const chartTheme = useRechartsTheme();
  const [results, setResults] = useState<MonteCarloResults | null>(null);
  const [simulationProgress, setSimulationProgress] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [iterations, setIterations] = useState(10000);
  const [targetPercentile, setTargetPercentile] = useState(80);
  
  // Track if a rerun was requested while a simulation was running
  const pendingRerunRef = useRef(false);

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
    updateSettingsMutation.mutate(
      { targetPercentile: numValue },
      {
        onSuccess: () => {
          // Automatically rerun simulation when percentile changes
          runSimulationMutation.mutate();
        }
      }
    );
  };

  const runSimulationMutation = useMutation<MonteCarloResults, Error, void>({
    mutationFn: async (): Promise<MonteCarloResults> => {
      setIsRunning(true);
      setSimulationProgress("Initializing Monte Carlo simulation...");
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setSimulationProgress("Loading risk data and validating inputs...");
      
      await new Promise(resolve => setTimeout(resolve, 300));
      setSimulationProgress("Running probabilistic simulations (this may take a moment)...");
      
      // Include current settings from UI state to avoid race condition with PATCH request
      const response = await apiRequest("POST", `/api/projects/${projectId}/monte-carlo`, { 
        revisionId,
        monteCarloIterations: iterations,
        targetPercentile: targetPercentile
      });
      const result = await response.json() as MonteCarloResults;
      
      setSimulationProgress("Calculating percentiles and statistics...");
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setSimulationProgress("Performing sensitivity analysis...");
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setSimulationProgress("Generating report visualizations...");
      await new Promise(resolve => setTimeout(resolve, 200));
      
      return result;
    },
    onSuccess: (data: MonteCarloResults) => {
      setSimulationProgress("Complete!");
      setTimeout(() => {
        setResults(data);
        setIsRunning(false);
        setSimulationProgress("");
        
        // Invalidate dashboard cache to refresh with latest snapshot
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/monte-carlo/latest`] });
        
        // Check if there was a pending rerun request
        if (pendingRerunRef.current) {
          pendingRerunRef.current = false;
          runSimulationMutation.mutate();
        }
      }, 800);
      toast({
        title: "Simulation Complete",
        description: `Monte Carlo simulation completed with ${data.settings.iterations.toLocaleString()} iterations analyzing ${data.risksAnalyzed} risks.`,
      });
    },
    onError: (error: any) => {
      setIsRunning(false);
      setSimulationProgress("");
      toast({
        title: "Simulation Failed",
        description: error.message || "Failed to run Monte Carlo simulation",
        variant: "destructive",
      });
    },
  });

  // Auto-run simulation when trigger changes (e.g., after editing a risk)
  useEffect(() => {
    if (autoRunTrigger && autoRunTrigger > 0) {
      if (!isRunning) {
        // Run immediately if not currently running
        runSimulationMutation.mutate();
      } else {
        // Queue the rerun to execute after the current simulation completes
        pendingRerunRef.current = true;
      }
    }
  }, [autoRunTrigger]);

  // Prepare S-Curve data (Exceedance/Cumulative Distribution)
  const sCurveData = results ? results.distribution
    .map((value, index) => ({
      cost: Math.round(value),
      probability: 1 - (index / results.distribution.length), // Exceedance probability
    }))
    // Sample every Nth point to keep chart responsive
    .filter((_, i) => i % Math.ceil(results.distribution.length / 200) === 0)
    : [];

  // Prepare Tornado Chart data (Top 10 contributors)
  const tornadoData = results 
    ? results.sensitivityAnalysis
        .slice(0, 10)
        .map(item => {
          // Use full labels - the Y-axis has plenty of space (350px width)
          const fullLabel = `${item.riskNumber} - ${item.title}`;
          
          return {
            risk: `${item.riskNumber}`,
            riskLabel: fullLabel,
            fullLabel: fullLabel,
            contribution: item.varianceContribution * 100, // Convert to percentage
            title: item.title,
            riskId: item.riskId,
          };
        })
        .filter(item => item.contribution > 0) // Filter out zero contributions
    : [];

  // Calculate dynamic Y-axis width for tornado chart based on longest label
  const longestTornadoLabel = tornadoData.reduce((longest, item) => {
    return item.riskLabel.length > longest.length ? item.riskLabel : longest;
  }, '');
  const tornadoYAxisWidth = Math.max(260, (longestTornadoLabel.length + 1) * 6 + 10);

  // Prepare Histogram data (Frequency Distribution)
  const histogramData = results ? (() => {
    const sorted = [...results.distribution].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min;
    const numBins = 50; // Number of bins for the histogram
    
    // Handle edge case: all values are identical (zero range)
    if (range === 0 || !isFinite(range)) {
      return [{
        binStart: min * 0.95,
        binEnd: min * 1.05,
        binMid: min,
        count: sorted.length,
      }];
    }
    
    const binWidth = range / numBins;
    
    // Create bins
    const bins = Array(numBins).fill(0).map((_, i) => ({
      binStart: min + i * binWidth,
      binEnd: min + (i + 1) * binWidth,
      binMid: min + (i + 0.5) * binWidth,
      count: 0,
    }));
    
    // Count values in each bin
    sorted.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
      bins[binIndex].count++;
    });
    
    return bins;
  })() : [];

  const formatCurrency = (value: number) => {
    return `$${(value / 1000000).toFixed(2)}M`;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(0)}%`;
  };

  return (
    <div className="space-y-3">
      {/* Header with Settings and Run Button */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
          <div className="flex-shrink-0">
            <h2 className="text-xl sm:text-2xl font-bold">Monte Carlo Simulation Report</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Probabilistic Risk & Opportunity Quantification
            </p>
          </div>
          
          {/* Simulation Settings */}
          <div className="flex items-end gap-2 sm:gap-4 flex-wrap sm:flex-1">
            <div className="flex-1 min-w-[120px] max-w-[200px]">
              <Label htmlFor="iterations" className="text-xs">Iterations</Label>
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
                className="h-9"
              />
            </div>

            <div className="flex-1 min-w-[120px] max-w-[200px]">
              <Label htmlFor="target-percentile" className="text-xs">Target P Value</Label>
              <Select
                value={targetPercentile.toString()}
                onValueChange={handlePercentileChange}
              >
                <SelectTrigger id="target-percentile" data-testid="select-target-percentile" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">P50</SelectItem>
                  <SelectItem value="70">P70</SelectItem>
                  <SelectItem value="80">P80</SelectItem>
                  <SelectItem value="85">P85</SelectItem>
                  <SelectItem value="90">P90</SelectItem>
                  <SelectItem value="95">P95</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap sm:flex-shrink-0">
            {results && (
              <Button
                onClick={() => window.print()}
                variant="outline"
                size="lg"
                data-testid="button-print-report"
                className="flex-1 sm:flex-initial"
              >
                <Printer className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Print Report</span>
                <span className="sm:hidden">Print</span>
              </Button>
            )}
            <Button
              onClick={() => runSimulationMutation.mutate()}
              disabled={runSimulationMutation.isPending || isRunning}
              size="default"
              variant="default"
              data-testid="button-run-simulation"
              className="flex-1 sm:flex-initial"
            >
              {runSimulationMutation.isPending || isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Simulation
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Progress Display during simulation */}
      {isRunning ? (
        <Card className="p-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <RefreshCw className="h-12 w-12 animate-spin text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Running Monte Carlo Simulation</h3>
            <p className="text-sm text-muted-foreground">{simulationProgress}</p>
            <div className="flex justify-center gap-1 mt-6">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </Card>
      ) : results ? (
        <>
          {/* Summary, Probability Bands, and Histogram in 3-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[24%_24%_50%] gap-2 max-w-full">
            {/* Summary Statistics */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 text-sm">A. Summary Results</h3>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="py-2">Item</TableHead>
                    <TableHead className="text-right py-2">Value</TableHead>
                    <TableHead className="text-right py-2">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  <TableRow>
                    <TableCell className="font-medium py-1.5">P10</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5">{formatCurrency(results.p10)}</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5">{formatCurrency(results.p10 - results.base)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium py-1.5">P50</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5">{formatCurrency(results.p50)}</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5">{formatCurrency(results.p50 - results.base)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-primary/5">
                    <TableCell className="font-bold py-1.5">
                      P{results.targetPercentile}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold py-1.5">{formatCurrency(results.targetValue)}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold py-1.5">{formatCurrency(results.targetValue - results.base)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium py-1.5">P90</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5">{formatCurrency(results.p90)}</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5">{formatCurrency(results.p90 - results.base)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="mt-4 space-y-1 text-xs">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <span className="text-muted-foreground">Base:</span>
                  <span className="font-medium tabular-nums">{formatCurrency(results.base)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <span className="text-muted-foreground">Mean:</span>
                  <span className="font-medium tabular-nums">{formatCurrency(results.mean)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <span className="text-muted-foreground">Spread:</span>
                  <span className="font-medium tabular-nums">{formatCurrency(results.p90 - results.p10)}</span>
                  <span></span>
                </div>
              </div>
            </Card>

            {/* Probability Bands */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 text-sm">Probability Bands</h3>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="py-2">P</TableHead>
                    <TableHead className="text-right py-2">Value</TableHead>
                    <TableHead className="text-right py-2">Var</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {results.percentileTable.map((row) => {
                    const isTargetPercentile = row.percentile === results.targetPercentile;
                    return (
                      <TableRow 
                        key={row.percentile}
                        className={isTargetPercentile ? "bg-purple-500/20 dark:bg-purple-500/30" : ""}
                      >
                        <TableCell className={`py-1 ${isTargetPercentile ? "font-bold" : "font-medium"}`}>
                          {row.percentile}
                        </TableCell>
                        <TableCell className="text-right py-1">{formatCurrency(row.value)}</TableCell>
                        <TableCell className="text-right py-1">{formatCurrency(row.varianceFromBase)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {/* Frequency Distribution Histogram */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 text-sm">B. Frequency Distribution</h3>
              <div className="w-full h-[300px] relative overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogramData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="binMid"
                    label={{ value: 'Total Cost ($M)', position: 'insideBottom', offset: -5 }}
                    tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 500 }}
                  />
                  <YAxis
                    label={{ value: 'Number of Occurrences', angle: -90, position: 'insideLeft' }}
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 500 }}
                  />
                  <Tooltip
                    formatter={(value: any) => [value, 'Occurrences']}
                    labelFormatter={(label) => `${formatCurrency(label)}`}
                  />
                  <Bar dataKey="count" fill="#ef4444" data-testid="bar-histogram" />
                  
                  {/* Reference lines for key percentiles with visible labels */}
                  <ReferenceLine 
                    x={results.p10} 
                    stroke="#8b5cf6" 
                    strokeWidth={2} 
                    label={{ 
                      value: 'P10', 
                      position: 'insideTopLeft',
                      fill: '#8b5cf6',
                      offset: 5,
                      ...chartTheme.labelStyle
                    }} 
                  />
                  <ReferenceLine 
                    x={results.p50} 
                    stroke="#6366f1" 
                    strokeWidth={2} 
                    strokeDasharray="5 5" 
                    label={{ 
                      value: 'P50', 
                      position: 'insideTopLeft',
                      fill: '#6366f1',
                      offset: 5,
                      ...chartTheme.labelStyle
                    }} 
                  />
                  <ReferenceLine 
                    x={results.p90} 
                    stroke="#f59e0b" 
                    strokeWidth={2} 
                    label={{ 
                      value: 'P90', 
                      position: 'insideTopLeft',
                      fill: '#f59e0b',
                      offset: 5,
                      ...chartTheme.labelStyle
                    }} 
                  />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Tornado Chart (D) and S-Curve (C) - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 max-w-full">
            {/* Tornado Chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Top Risk Drivers</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Click a risk to view details
                </p>
              </CardHeader>
              <CardContent className="pl-0 pr-4">
              <div className="w-full h-[300px] relative overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                  data={tornadoData} 
                  layout="vertical"
                  margin={{ left: 0, right: 20, top: 5, bottom: 15 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    label={{ value: 'Proportion of Variance (%)', position: 'insideBottom', offset: -5 }}
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 500 }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="riskLabel"
                    width={tornadoYAxisWidth}
                    interval={0}
                    tick={(props: any) => {
                      const { x, y, payload } = props;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={-5}
                            y={0}
                            dy={4}
                            textAnchor="end"
                            fill="hsl(var(--foreground))"
                            fontSize={10}
                            fontWeight={500}
                          >
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${(value as number).toFixed(2)}%`, 'Variance Contribution']}
                    labelFormatter={(label, payload) => {
                      // Show full label in tooltip
                      if (payload && payload.length > 0 && payload[0].payload) {
                        return payload[0].payload.fullLabel || label;
                      }
                      return label;
                    }}
                  />
                  <Bar 
                    dataKey="contribution" 
                    fill="#60a5fa"
                    onClick={(data: any) => {
                      if (onRiskClick && data?.payload?.riskId) {
                        onRiskClick(data.payload.riskId);
                      }
                    }}
                    style={{ cursor: onRiskClick ? 'pointer' : 'default' }}
                    data-testid="bar-tornado-risk"
                  />
                </BarChart>
              </ResponsiveContainer>
              </div>
              </CardContent>
            </Card>

            {/* S-Curve (Exceedance Curve) */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 text-sm">C. Exceedance Curve</h3>
              <div className="w-full h-[300px] relative overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sCurveData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="cost"
                    label={{ value: 'Total Cost ($M)', position: 'insideBottom', offset: -5 }}
                    tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 500 }}
                  />
                  <YAxis
                    label={{ value: 'Pr(Cost ≥ x)', angle: -90, position: 'insideLeft' }}
                    domain={[0, 1]}
                    tickFormatter={formatPercent}
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 500 }}
                  />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === 'probability') return [formatPercent(value), 'Exceedance Prob'];
                      return [formatCurrency(value), 'Cost'];
                    }}
                    labelFormatter={(label) => `Cost: ${formatCurrency(label)}`}
                  />
                  <ReferenceLine
                    x={results.p10}
                    stroke="#666"
                    strokeDasharray="3 3"
                    label={{ value: 'P10', position: 'top', ...chartTheme.labelStyle }}
                  />
                  <ReferenceLine
                    x={results.p50}
                    stroke="#666"
                    strokeDasharray="3 3"
                    label={{ value: 'P50', position: 'top', ...chartTheme.labelStyle }}
                  />
                  <ReferenceLine
                    x={results.p90}
                    stroke="#666"
                    strokeDasharray="3 3"
                    label={{ value: 'P90', position: 'top', ...chartTheme.labelStyle }}
                  />
                  <Line type="monotone" dataKey="probability" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Simulation Info */}
          <Card className="p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 text-xs text-muted-foreground">
              <span>
                Iterations: <strong className="text-foreground">{results.settings.iterations.toLocaleString()}</strong>
              </span>
              <span>
                Risks Analyzed: <strong className="text-foreground">{results.risksAnalyzed} / {results.totalRisks}</strong>
              </span>
              <span>
                Target Confidence: <strong className="text-foreground">P{results.settings.targetPercentile}</strong>
              </span>
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-12">
          <div className="text-center">
            <Play className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">Ready to Run Simulation</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Click "Run Simulation" to perform Monte Carlo analysis on your risks
            </p>
            <p className="text-xs text-muted-foreground">
              Ensure all risks have P10/P50/P90 values, probabilities, and distribution models assigned
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
