import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, AlertCircle } from "lucide-react";

interface MonteCarloSnapshot {
  id: string;
  revisionId: string;
  projectId: string;
  iterations: number;
  targetPercentile: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  stdDev: number;
  base: number;
  targetValue: number;
  distribution: number[];
  percentileTable: { percentile: number; value: number }[];
  sensitivityAnalysis: {
    riskId: string;
    riskNumber: string;
    title: string;
    varianceContribution: number;
    correlation: number;
  }[];
  createdAt: string;
}

interface RiskSummaryDashboardProps {
  projectId: string;
}

export function RiskSummaryDashboard({ projectId }: RiskSummaryDashboardProps) {
  const { data: snapshot, isLoading, error } = useQuery<MonteCarloSnapshot>({
    queryKey: [`/api/projects/${projectId}/monte-carlo/latest`],
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-muted-foreground">
            Loading risk analysis...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !snapshot) {
    return null; // Don't show anything if no data
  }

  const formatCurrency = (value: number) => {
    return `$${(value / 1000000).toFixed(2)}M`;
  };

  // Prepare histogram data (B - Frequency Distribution)
  const histogramData = (() => {
    const sorted = [...snapshot.distribution].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min;
    const numBins = 50;
    
    if (range === 0 || !isFinite(range)) {
      return [{
        binStart: min * 0.95,
        binEnd: min * 1.05,
        binMid: min,
        count: sorted.length,
      }];
    }
    
    const binWidth = range / numBins;
    const bins = Array(numBins).fill(0).map((_, i) => ({
      binStart: min + i * binWidth,
      binEnd: min + (i + 1) * binWidth,
      binMid: min + (i + 0.5) * binWidth,
      count: 0,
    }));
    
    sorted.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
      bins[binIndex].count++;
    });
    
    return bins;
  })();

  // Prepare tornado chart data (D - Key Drivers) - top 8 drivers
  const tornadoData = snapshot.sensitivityAnalysis
    .sort((a, b) => b.varianceContribution - a.varianceContribution)
    .slice(0, 8)
    .map(item => {
      // Use full labels - the Y-axis has plenty of space (240px width)
      const fullLabel = `${item.riskNumber} - ${item.title}`;
      
      return {
        riskId: item.riskId,
        riskLabel: fullLabel,
        fullLabel: fullLabel,
        contribution: (item.varianceContribution * 100),
      };
    });

  return (
    <div className="col-span-full space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        <h2 className="text-xs font-bold">Latest Risk Analysis (Monte Carlo Simulation)</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20%_40%_40%] gap-3">
        {/* A - Summary Results */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold">Risk Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium">Metric</TableHead>
                  <TableHead className="text-right text-xs font-medium">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-xs font-medium">P10</TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">{formatCurrency(snapshot.p10)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs font-medium">P50 (Median)</TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">{formatCurrency(snapshot.p50)}</TableCell>
                </TableRow>
                <TableRow className="bg-primary/5">
                  <TableCell className="text-xs font-medium">
                    P{snapshot.targetPercentile} (Target)
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">{formatCurrency(snapshot.targetValue)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs font-medium">P90</TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">{formatCurrency(snapshot.p90)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs font-medium text-muted-foreground">Base</TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums text-muted-foreground">{formatCurrency(snapshot.base)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* B - Frequency Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold">Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full h-[220px]">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={histogramData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="binMid" 
                  tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 500 }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 500 }}
                />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === 'count') return [value, 'Frequency'];
                    return [value, name];
                  }}
                  labelFormatter={(label: any) => `Value: ${formatCurrency(label)}`}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                />
                <Bar 
                  dataKey="count" 
                  fill="#ef4444"
                  data-testid="bar-frequency-distribution"
                />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* D - Key Drivers (Tornado Chart) */}
        <Card>
          <CardHeader className="pb-3 px-[15px]">
            <CardTitle className="text-xs font-bold">Top Risk Drivers</CardTitle>
          </CardHeader>
          <CardContent className="px-[15px]">
            {tornadoData.length > 0 ? (
              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart 
                  data={tornadoData} 
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    type="number" 
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 500 }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="riskLabel" 
                    width={240}
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
                    interval={0}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${(value as number).toFixed(2)}%`, 'Variance']}
                    labelFormatter={(label, payload) => {
                      // Show full label in tooltip
                      if (payload && payload.length > 0 && payload[0].payload) {
                        return payload[0].payload.fullLabel || label;
                      }
                      return label;
                    }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Bar 
                    dataKey="contribution" 
                    fill="#60a5fa"
                    data-testid="bar-tornado-risk"
                  />
                </BarChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-xs font-medium text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <AlertCircle className="h-6 w-6" />
                  <p>No risk drivers available</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
