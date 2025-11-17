import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContractReviewCardProps {
  id: string;
  fileName: string;
  uploadedDate: string;
  uploadedBy: string;
  riskLevel: "low" | "medium" | "high";
  compliantClauses: number;
  partialClauses: number;
  gapClauses: number;
}

const riskColors = {
  low: "bg-chart-2/20 text-chart-2 border-chart-2/40",
  medium: "bg-chart-3/20 text-chart-3 border-chart-3/40",
  high: "bg-destructive/20 text-destructive border-destructive/40",
};

export function ContractReviewCard({
  id,
  fileName,
  uploadedDate,
  uploadedBy,
  riskLevel,
  compliantClauses,
  partialClauses,
  gapClauses,
}: ContractReviewCardProps) {
  return (
    <Card className="hover-elevate" data-testid={`card-contract-review-${id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="font-semibold leading-tight truncate">{fileName}</h3>
            <p className="text-xs text-muted-foreground">
              Uploaded {uploadedDate} by {uploadedBy}
            </p>
          </div>
        </div>
        <Badge className={`${riskColors[riskLevel]} px-2.5 py-0.5 text-xs border shrink-0`}>
          {riskLevel === 'high' && <AlertTriangle className="h-3 w-3 mr-1" />}
          {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="space-y-1">
            <p className="text-2xl font-bold text-chart-2">{compliantClauses}</p>
            <p className="text-xs text-muted-foreground">Compliant</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-chart-3">{partialClauses}</p>
            <p className="text-xs text-muted-foreground">Partial</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-destructive">{gapClauses}</p>
            <p className="text-xs text-muted-foreground">Gaps</p>
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="flex-1" data-testid={`button-view-report-${id}`}>
            View Report
          </Button>
          <Button variant="ghost" size="sm" data-testid={`button-download-${id}`}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
