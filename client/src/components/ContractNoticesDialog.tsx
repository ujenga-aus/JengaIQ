import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Bell, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlantUMLDiagram } from "./PlantUMLDiagram";

interface ContractNoticesDialogProps {
  projectId: string;
  revisionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContractNoticesDialog({ projectId, revisionId, open, onOpenChange }: ContractNoticesDialogProps) {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedNoticeIndex, setSelectedNoticeIndex] = useState<number | null>(null);
  const [selectedParentClause, setSelectedParentClause] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{
    cached: boolean;
    model: string;
    promptVersion: string;
    etag: string;
    updatedAt: Date;
    data: {
      notices: any[];
      plantuml: string;
      summary: string[];
      confidence: number;
      assumptions: string[];
    };
  }>({
    queryKey: [`/api/projects/${projectId}/contract-notices?revisionId=${revisionId}`],
    enabled: open && !!revisionId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Fetch with force=true parameter directly
      const response = await fetch(
        `/api/projects/${projectId}/contract-notices?revisionId=${revisionId}&force=true`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to refresh analysis');
      }
      
      // Invalidate the cache and refetch to show new data
      await refetch();
      
      toast({
        title: "Analysis refreshed",
        description: "Contract notices have been regenerated",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh analysis",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const notices = data?.data?.notices || [];
  const summary = data?.data?.summary || [];
  const confidence = data?.data?.confidence || 0;
  const plantuml = data?.data?.plantuml || '';
  const parentClauseFlowcharts = data?.data?.parentClauseFlowcharts || {};

  // Group notices by parent clause
  const groupNoticesByClause = () => {
    const groups = new Map<string, any[]>();
    
    notices.forEach((notice: any) => {
      const clauseRef = notice.clause_ref || '';
      let parentClause = clauseRef; // Default to full clause ref
      
      // Remove any "Cl", "Cl.", "cl" prefix and whitespace
      let cleaned = clauseRef.replace(/^(?:Cl|cl)\.?\s*/i, '').trim();
      
      // Now extract the first number before a dot or parenthesis
      // Examples: "21.1" -> "21", "13.3(a)" -> "13", "2.24" -> "2"
      const match = cleaned.match(/^(\d+)(?:[.\(]|$)/);
      if (match) {
        parentClause = match[1];
      }
      
      if (!groups.has(parentClause)) {
        groups.set(parentClause, []);
      }
      groups.get(parentClause)!.push(notice);
    });
    
    return groups;
  };

  const clauseGroups = groupNoticesByClause();

  // Create hierarchical table data with parent clauses
  const createTableData = () => {
    const tableData: any[] = [];
    let parentCount = 0;
    let childCount = 0;
    
    clauseGroups.forEach((childNotices, parentClause) => {
      // Always create parent row (even for single notice) so users know to click it for flowchart
      parentCount++;
      // Add parent clause row
      tableData.push({
        isParent: true,
        parentClause,
        children: childNotices,
        title: childNotices.length > 1 
          ? `Clause ${parentClause} - All Notices` 
          : `Clause ${parentClause}`,
        clause_ref: parentClause,
      });
      
      // Add child notice rows
      childNotices.forEach((notice: any) => {
        childCount++;
        tableData.push({
          isParent: false,
          isChild: true,
          parentClause: parentClause,
          notice,
          ...notice,
        });
      });
    });
    
    console.log('[Contract Notices] Table structure:', {
      parentRows: parentCount,
      childRows: childCount,
      totalRows: tableData.length,
      sampleParents: tableData.filter((r: any) => r.isParent).slice(0, 3).map((r: any) => ({
        title: r.title,
        childrenCount: r.children?.length
      }))
    });
    
    return tableData;
  };

  const tableData = createTableData();

  // Debug logging
  if (data && !isLoading) {
    console.log('[Contract Notices] Data received:', {
      hasNotices: notices.length > 0,
      hasSummary: summary.length > 0,
      hasPlantUML: !!plantuml,
      plantumlLength: plantuml?.length,
      plantumlPreview: plantuml?.substring(0, 100),
      clauseGroups: clauseGroups.size,
      groupDetails: Array.from(clauseGroups.entries()).map(([parent, children]) => ({
        parent,
        count: children.length,
        childClauses: children.map((n: any) => n.clause_ref)
      })),
      tableDataLength: tableData.length,
    });
  }

  // Sanitize text for PlantUML - remove/replace special characters
  const sanitizeForPlantUML = (text: string, maxLength: number = 200): string => {
    if (!text) return 'N/A';
    return text
      .substring(0, maxLength)
      .replace(/"/g, "'")  // Replace double quotes with single quotes
      .replace(/\|/g, "-")  // Replace pipes with dashes
      .replace(/\n/g, "\\n")  // Replace newlines with PlantUML line breaks
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();
  };

  // Generate individual notice flowchart with detailed timing, clause references, and party swimlanes
  const generateNoticeFlowchart = (notice: any) => {
    const lines: string[] = ['@startuml'];
    
    // Add title
    lines.push(`title ${notice.title || 'Notice Flow'}`);
    lines.push('');
    
    // Remove white backgrounds and configure for transparent rendering
    lines.push('skinparam BackgroundColor transparent');
    lines.push('skinparam Shadowing false');
    
    // Add spacing parameters to prevent text overlap
    lines.push('skinparam Nodesep 80');
    lines.push('skinparam Ranksep 80');
    lines.push('skinparam Padding 12');
    
    // Arrow styling
    lines.push('skinparam ArrowColor #666666');
    lines.push('skinparam ArrowThickness 2');
    
    // Activity box styling
    lines.push('skinparam ActivityBackgroundColor transparent');
    lines.push('skinparam ActivityBorderColor #666666');
    lines.push('skinparam ActivityBorderThickness 2');
    lines.push('skinparam ActivityFontSize 12');
    lines.push('skinparam ActivityFontStyle bold');
    
    // Decision diamond styling
    lines.push('skinparam ActivityDiamondBackgroundColor transparent');
    lines.push('skinparam ActivityDiamondBorderColor #666666');
    
    lines.push('');
    
    // Track cumulative days for timeline
    let currentDay = 0;
    
    // Start with sender party partition
    const senderParty = notice.sender_party || 'Contractor';
    lines.push(`|${senderParty}|`);
    lines.push('start');
    
    // Trigger event
    const triggerText = sanitizeForPlantUML(notice.trigger_condition || 'Trigger Event Occurs', 100);
    const triggerClause = notice.trigger_clause ? `\\n(${notice.trigger_clause})` : '';
    lines.push(`:${triggerText}${triggerClause};`);
    lines.push(`note right: Day ${currentDay}`);
    lines.push('');
    
    // Lead time to issue notice
    const leadTimeDays = notice.lead_time_days || 0;
    currentDay += leadTimeDays;
    
    // Issue the notice
    const noticeAction = sanitizeForPlantUML(notice.required_action || `Issue ${notice.title}`, 100);
    const noticeClause = notice.clause_ref ? `\\n(${notice.clause_ref})` : '';
    lines.push(`:${noticeAction}${noticeClause};`);
    
    // Add timing note for notice
    if (leadTimeDays > 0) {
      const leadTimeUnit = notice.lead_time?.unit || 'days';
      const isBD = notice.lead_time?.business_days;
      lines.push('note right');
      lines.push(`  Day ${currentDay}`);
      lines.push(`  (within ${leadTimeDays} ${leadTimeUnit}${isBD ? ' BD' : ''})`);
      lines.push(`  Duration: ${leadTimeDays} days`);
      lines.push('end note');
    } else if (leadTimeDays === 0) {
      lines.push(`note right: Day ${currentDay} (immediately)\\nDuration: 0 days`);
    }
    lines.push('');
    
    // Time bar note if present
    if (notice.time_bar_days) {
      const timeBarClause = notice.consequences_if_not_given_clause || notice.clause_ref || '';
      lines.push('floating note left');
      lines.push(`  TIME BAR: ${notice.time_bar_days} ${notice.time_calculation_rules?.includes('business') ? 'Business Days' : 'Days'}`);
      if (timeBarClause) {
        lines.push(`  (${timeBarClause})`);
      }
      lines.push('end note');
      lines.push('');
    }
    
    // Response handling
    if (notice.response_required) {
      const recipientParty = notice.recipient_party || 'Principal';
      const responseDays = notice.response_timeframe_days || 0;
      const responseEndDay = currentDay + responseDays;
      
      // Switch to recipient party
      lines.push(`|${recipientParty}|`);
      lines.push(`:Receive Notice;`);
      lines.push(`note right: Day ${currentDay}`);
      lines.push('');
      
      // Decision point
      const responseClause = notice.response_clause ? ` - ${notice.response_clause}` : '';
      lines.push(`if (${recipientParty} Response?) then (Yes${responseClause})`);
      
      if (responseDays > 0) {
        const respUnit = notice.response_timeframe?.unit || 'days';
        const respBD = notice.response_timeframe?.business_days;
        lines.push('  note right');
        lines.push(`    Within ${responseDays} ${respUnit}${respBD ? ' BD' : ''} (Day ${responseEndDay})`);
        lines.push('  end note');
      }
      
      // Approved outcome
      const approvedText = sanitizeForPlantUML(notice.consequences_if_compliant || 'Approved - Proceed', 80);
      const approvedClause = notice.consequences_if_compliant_clause ? `\\n(${notice.consequences_if_compliant_clause})` : '';
      lines.push(`  :${approvedText}${approvedClause};`);
      lines.push('  stop');
      lines.push('');
      
      // No response / deemed outcome
      if (notice.no_response_consequence) {
        const noRespText = sanitizeForPlantUML(notice.no_response_consequence, 80);
        const noRespClause = notice.no_response_clause ? `\\n(${notice.no_response_clause})` : '';
        lines.push(`else (No Response${responseClause})`);
        lines.push('  note right');
        lines.push(`    After ${responseDays} days (Day ${responseEndDay})`);
        lines.push(`    ${notice.no_response_consequence.includes('deemed') ? 'Deemed Response' : 'Default Action'}`);
        lines.push('  end note');
        lines.push(`  :${noRespText}${noRespClause};`);
        lines.push('  stop');
      } else {
        lines.push('else');
        lines.push('  stop');
      }
      
      lines.push('endif');
      
    } else {
      // No response required - show subsequent actions or consequences
      if (notice.subsequent_actions && notice.subsequent_actions.length > 0) {
        const actionText = sanitizeForPlantUML(notice.subsequent_actions[0], 100);
        lines.push(`:${actionText};`);
        lines.push('stop');
      } else if (notice.consequences_if_compliant) {
        const outcomeText = sanitizeForPlantUML(notice.consequences_if_compliant, 100);
        const outcomeClause = notice.consequences_if_compliant_clause ? `\\n(${notice.consequences_if_compliant_clause})` : '';
        lines.push(`:${outcomeText}${outcomeClause};`);
        lines.push('stop');
      } else {
        lines.push('stop');
      }
    }
    
    lines.push('@enduml');
    return lines.join('\n');
  };

  // Generate combined flowchart for parent clause (all child notices)
  const generateParentClauseFlowchart = (parentClause: string) => {
    const childNotices = clauseGroups.get(parentClause) || [];
    if (childNotices.length === 0) return '';
    
    const lines: string[] = ['@startuml'];
    
    // Same styling as individual notices
    lines.push('skinparam BackgroundColor transparent');
    lines.push('skinparam Shadowing false');
    lines.push('skinparam Nodesep 80');
    lines.push('skinparam Ranksep 80');
    lines.push('skinparam Padding 12');
    lines.push('skinparam ArrowColor #666666');
    lines.push('skinparam ArrowThickness 2');
    lines.push('skinparam ActivityBackgroundColor transparent');
    lines.push('skinparam ActivityBorderColor #666666');
    lines.push('skinparam ActivityBorderThickness 2');
    lines.push('skinparam ActivityFontSize 12');
    lines.push('skinparam ActivityFontStyle bold');
    lines.push('skinparam ActivityDiamondBackgroundColor transparent');
    lines.push('skinparam ActivityDiamondBorderColor #666666');
    lines.push('');
    lines.push('start');
    lines.push(`#1976d2:Clause ${parentClause} - Multiple Notices;`);
    lines.push('');
    
    // Add each child notice as a partition
    childNotices.forEach((notice: any, index: number) => {
      lines.push(`partition "${sanitizeForPlantUML(notice.title, 50)}" {`);
      
      // Trigger
      const triggerText = sanitizeForPlantUML(notice.trigger_condition || 'Event Occurs', 100);
      lines.push(`  #1976d2:${triggerText};`);
      
      // Lead time
      const leadTime = notice.lead_time?.value 
        ? `${notice.lead_time.value} ${notice.lead_time.unit}${notice.lead_time.business_days ? ' (BD)' : ''}`
        : '';
      if (leadTime) {
        lines.push(`  -[#0288d1]-> [${leadTime}];`);
      } else {
        lines.push(`  -[#0288d1]->;`);
      }
      
      // Notice action
      const noticeText = sanitizeForPlantUML(`${notice.sender_party} gives ${notice.title}`, 100);
      const clauseRef = notice.clause_ref ? ` (${notice.clause_ref})` : '';
      lines.push(`  #f57c00:${noticeText}${clauseRef};`);
      
      // Outcome
      if (notice.response_required) {
        lines.push(`  #388e3c:Response Required;`);
      } else if (notice.consequences_if_compliant) {
        const outcomeText = sanitizeForPlantUML(notice.consequences_if_compliant, 100);
        lines.push(`  #388e3c:${outcomeText};`);
      }
      
      lines.push('}');
      
      // Add arrow between partitions except after the last one
      if (index < childNotices.length - 1) {
        lines.push('-[#666666]->;');
      }
    });
    
    lines.push('');
    lines.push('stop');
    lines.push('@enduml');
    return lines.join('\n');
  };

  // Determine which flowchart to show
  // Priority: Individual notice > Parent clause > Overview
  const selectedNotice = selectedNoticeIndex !== null ? notices[selectedNoticeIndex] : null;
  const hasIndividualDiagram = selectedNotice && selectedNotice.plantuml;
  
  let displayedFlowchart: string | null = null;
  if (selectedNotice) {
    // Individual notice selected - use AI-generated PlantUML if available
    displayedFlowchart = selectedNotice.plantuml || null;
  } else if (selectedParentClause) {
    // Parent clause selected - use stored flowchart from database (generated during AI analysis)
    displayedFlowchart = parentClauseFlowcharts[selectedParentClause] || generateParentClauseFlowchart(selectedParentClause);
  } else {
    // No selection - show overview flowchart
    displayedFlowchart = plantuml;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Contract Notices Analysis
              </DialogTitle>
              <DialogDescription>
                AI-powered extraction of all notice obligations and flowchart visualization
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {data?.cached && (
                <Badge variant="secondary">
                  Cached
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleForceRefresh}
                disabled={isLoading || isRefreshing}
                data-testid="button-refresh-notices"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading || isRefreshing ? (
          <div className="flex items-center justify-center p-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground">
                Analyzing contract for notice obligations...
              </p>
              <p className="text-sm text-muted-foreground">
                This may take 30-60 seconds
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center p-12">
            <div className="text-center space-y-4">
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <div>
                <p className="font-semibold text-destructive">Analysis Failed</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {(error as any)?.message || 'Failed to analyze contract for notice obligations'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleForceRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Section - Full Width */}
            {summary.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Summary</CardTitle>
                  <CardDescription>
                    Analysis confidence: {(confidence * 100).toFixed(0)}%
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1">
                    {summary.map((item: string, idx: number) => (
                      <li key={idx} className="text-sm">{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Table and Flowchart - Side by Side (50/50) - Increased max width */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column: Notices Table */}
              {notices.length > 0 && (
                <Card className="min-h-[650px] flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-base">Notice Obligations ({notices.length})</CardTitle>
                    <CardDescription>
                      All contractual notice requirements extracted from the contract. Click parent clauses to see combined flowcharts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-auto">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-border">
                        <thead>
                          <tr className="bg-muted">
                            <th className="border border-border p-2 text-left text-sm font-semibold min-w-[200px]">Title</th>
                            <th className="border border-border p-2 text-left text-sm font-semibold min-w-[80px]">Clause</th>
                            <th className="border border-border p-2 text-left text-sm font-semibold min-w-[150px]">Trigger</th>
                            <th className="border border-border p-2 text-left text-sm font-semibold min-w-[120px]">From</th>
                            <th className="border border-border p-2 text-left text-sm font-semibold min-w-[120px]">To</th>
                            <th className="border border-border p-2 text-left text-sm font-semibold min-w-[100px]">Lead Time</th>
                            <th className="border border-border p-2 text-left text-sm font-semibold min-w-[120px]">Method</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableData.map((row: any, idx: number) => {
                            if (row.isParent) {
                              // Parent clause row
                              const isSelected = selectedParentClause === row.parentClause;
                              return (
                                <tr 
                                  key={`parent-${row.parentClause}`} 
                                  className={`cursor-pointer transition-colors font-semibold ${
                                    isSelected
                                      ? 'bg-primary/10 hover:bg-primary/20' 
                                      : 'hover:bg-muted/50'
                                  }`}
                                  onClick={() => {
                                    setSelectedParentClause(row.parentClause);
                                    setSelectedNoticeIndex(null);
                                  }}
                                  data-testid={`row-parent-clause-${row.parentClause}`}
                                >
                                  <td className="border border-border p-2 text-sm" colSpan={2}>
                                    <div className="flex items-center gap-2">
                                      <span>📋 {row.title}</span>
                                      <Badge variant="secondary" className="text-xs">
                                        {row.children.length} notices
                                      </Badge>
                                    </div>
                                  </td>
                                  <td className="border border-border p-2 text-sm text-muted-foreground" colSpan={5}>
                                    Click to view combined flowchart for all notices in Clause {row.parentClause}
                                  </td>
                                </tr>
                              );
                            } else {
                              // Child notice row
                              const noticeIdx = notices.indexOf(row.notice);
                              const isSelected = selectedNoticeIndex === noticeIdx;
                              return (
                                <tr 
                                  key={`notice-${idx}`} 
                                  className={`cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'bg-primary/10 hover:bg-primary/20' 
                                      : 'hover:bg-muted/50'
                                  }`}
                                  onClick={() => {
                                    setSelectedNoticeIndex(noticeIdx);
                                    setSelectedParentClause(null);
                                  }}
                                  data-testid={`row-notice-${noticeIdx}`}
                                >
                                  <td className="border border-border p-2 text-sm">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {row.isChild && <span className="text-muted-foreground ml-4">└─</span>}
                                      <span>{row.title}</span>
                                      {row.recurring && (
                                        <Badge variant="secondary" className="text-xs">
                                          Recurring{row.recurrence_frequency ? ` (${row.recurrence_frequency})` : ''}
                                        </Badge>
                                      )}
                                      {row.response_required && (
                                        <Badge variant="outline" className="text-xs">
                                          Response Required
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="border border-border p-2 text-sm font-mono">{row.clause_ref}</td>
                                  <td className="border border-border p-2 text-sm">{row.trigger_condition}</td>
                                  <td className="border border-border p-2 text-sm">{row.sender_party}</td>
                                  <td className="border border-border p-2 text-sm">{row.recipient_party}</td>
                                  <td className="border border-border p-2 text-sm">
                                    {row.lead_time?.value ? 
                                      `${row.lead_time.value} ${row.lead_time.unit}${row.lead_time.business_days ? ' (BD)' : ''}` 
                                      : '-'}
                                  </td>
                                  <td className="border border-border p-2 text-sm">
                                    {row.delivery_methods?.join(', ') || '-'}
                                  </td>
                                </tr>
                              );
                            }
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {notices.length === 0 && !isLoading && (
                <div className="text-center p-12">
                  <p className="text-muted-foreground">
                    No notice obligations found in this contract.
                  </p>
                </div>
              )}

              {/* Right Column: PlantUML Flowchart */}
              <Card className="min-h-[650px] flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {selectedParentClause
                          ? `Clause ${selectedParentClause} - All Notices`
                          : selectedNoticeIndex !== null 
                          ? `Notice Detail: ${notices[selectedNoticeIndex]?.title || 'Unknown'}` 
                          : 'Notice Flow Diagram'}
                      </CardTitle>
                      <CardDescription>
                        {selectedParentClause
                          ? `Combined workflow for all notices in Clause ${selectedParentClause}`
                          : selectedNoticeIndex !== null
                          ? 'Detailed workflow for this specific notice'
                          : 'Click a notice row to view its detailed flowchart'}
                      </CardDescription>
                    </div>
                    {(selectedNoticeIndex !== null || selectedParentClause) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedNoticeIndex(null);
                          setSelectedParentClause(null);
                        }}
                        data-testid="button-clear-selection"
                      >
                        Show Overview
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto">
                  {displayedFlowchart ? (
                    <div className="h-full flex items-start justify-center pt-4">
                      <PlantUMLDiagram chart={displayedFlowchart} key={selectedNoticeIndex ?? 'overview'} />
                    </div>
                  ) : selectedNotice && !hasIndividualDiagram ? (
                    <div className="flex flex-col items-center justify-center p-8 space-y-4">
                      <div className="text-center space-y-2">
                        <p className="font-semibold text-foreground">Individual Flowcharts Not Generated</p>
                        <p className="text-sm text-muted-foreground max-w-md">
                          This analysis was performed before individual flowcharts were implemented. Click <strong>Refresh</strong> to re-analyze and generate detailed flowcharts for each notice.
                        </p>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleForceRefresh}
                        disabled={isRefreshing}
                        data-testid="button-refresh-for-individual"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh to Generate
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-8 border rounded-md bg-muted/50">
                      <p className="text-sm text-muted-foreground">
                        Click a notice row to view its detailed flowchart
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
