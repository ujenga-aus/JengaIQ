import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/dateFormat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Filter } from "lucide-react";

interface AIUsageLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface AIUsageLog {
  id: string;
  personId: string;
  personName: string;
  personEmail: string;
  projectId: string;
  formName: string;
  eventType: string;
  modelUsed: string;
  revisionId: string | null;
  revisionNumber: number | null;
  rowId: string | null;
  letterId: string | null;
  rowIndex: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number | null;
  estimatedCost: string;
  clientInvoiceNumber: string | null;
  notes: string | null;
  createdAt: Date;
}

export function AIUsageLogDialog({ open, onOpenChange, projectId }: AIUsageLogDialogProps) {
  const [formNameFilter, setFormNameFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Build query params based on filters
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (formNameFilter !== "all") params.append("formName", formNameFilter);
    if (eventTypeFilter !== "all") params.append("eventType", eventTypeFilter);
    if (userFilter !== "all") params.append("personId", userFilter);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    return params.toString();
  }, [formNameFilter, eventTypeFilter, userFilter, startDate, endDate]);

  const { data: logs = [], isLoading } = useQuery<AIUsageLog[]>({
    queryKey: ["/api/projects", projectId, "ai-usage-logs", queryParams],
    queryFn: async () => {
      const url = queryParams 
        ? `/api/projects/${projectId}/ai-usage-logs?${queryParams}`
        : `/api/projects/${projectId}/ai-usage-logs`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch AI usage logs');
      return response.json();
    },
    enabled: open && !!projectId,
  });

  // Get unique values for filter options
  const uniqueForms = useMemo(() => {
    const formsSet = new Set<string>();
    logs.forEach(log => formsSet.add(log.formName));
    return Array.from(formsSet).sort();
  }, [logs]);

  const uniqueEventTypes = useMemo(() => {
    const typesSet = new Set<string>();
    logs.forEach(log => typesSet.add(log.eventType));
    return Array.from(typesSet).sort();
  }, [logs]);

  const uniqueUsers = useMemo(() => {
    const usersMap = new Map<string, { id: string; name: string }>();
    logs.forEach(log => {
      if (!usersMap.has(log.personId)) {
        usersMap.set(log.personId, { id: log.personId, name: log.personName });
      }
    });
    return Array.from(usersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  const clearFilters = () => {
    setFormNameFilter("all");
    setEventTypeFilter("all");
    setUserFilter("all");
    setStartDate("");
    setEndDate("");
  };

  // Calculate total cost
  const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.estimatedCost || "0"), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-ai-usage-log">
        <DialogHeader className="flex flex-row items-center justify-between py-3">
          <DialogTitle>AI Usage Log</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* Filter Controls */}
        <div className="border rounded-md p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Filter className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Filters</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2">
            <div className="space-y-1">
              <Label htmlFor="form-filter" className="text-xs">Feature</Label>
              <Select value={formNameFilter} onValueChange={setFormNameFilter}>
                <SelectTrigger id="form-filter" className="h-8" data-testid="select-form-filter">
                  <SelectValue placeholder="All features" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All features</SelectItem>
                  {uniqueForms.map((form) => (
                    <SelectItem key={form} value={form}>{form}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="event-filter" className="text-xs">Event Type</Label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger id="event-filter" className="h-8" data-testid="select-event-filter">
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {uniqueEventTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="user-filter" className="text-xs">User</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger id="user-filter" className="h-8" data-testid="select-user-filter">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {uniqueUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="start-date" className="text-xs">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                className="h-8"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="end-date" className="text-xs">End Date</Label>
              <Input
                id="end-date"
                type="date"
                className="h-8"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearFilters}
              data-testid="button-clear-filters"
            >
              Clear Filters
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading usage logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No AI usage logs found for this project.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="py-2 text-xs">User</TableHead>
                  <TableHead className="py-2 text-xs">Date</TableHead>
                  <TableHead className="py-2 text-xs">Time</TableHead>
                  <TableHead className="py-2 text-xs">Feature</TableHead>
                  <TableHead className="py-2 text-xs">Event</TableHead>
                  <TableHead className="py-2 text-xs">Model</TableHead>
                  <TableHead className="py-2 text-xs text-right">Duration</TableHead>
                  <TableHead className="py-2 text-xs text-right">Input Tokens</TableHead>
                  <TableHead className="py-2 text-xs text-right">Output Tokens</TableHead>
                  <TableHead className="py-2 text-xs text-right">Total Tokens</TableHead>
                  <TableHead className="py-2 text-xs text-right">Est. Cost (USD)</TableHead>
                  <TableHead className="py-2 text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="hover-elevate" data-testid={`row-ai-log-${log.id}`}>
                    <TableCell className="py-1.5 px-2">
                      <div>
                        <div className="text-sm font-medium" data-testid={`text-user-name-${log.id}`}>{log.personName}</div>
                        <div className="text-xs text-muted-foreground" data-testid={`text-user-email-${log.id}`}>{log.personEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm whitespace-nowrap" data-testid={`text-date-${log.id}`}>
                      {formatDate(new Date(log.createdAt))}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm whitespace-nowrap" data-testid={`text-time-${log.id}`}>
                      {new Date(log.createdAt).toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: true 
                      })}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm whitespace-nowrap" data-testid={`text-form-${log.id}`}>
                      {log.formName}
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <Badge variant="secondary" className="text-xs py-0 h-5" data-testid={`badge-event-type-${log.id}`}>
                        {log.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm whitespace-nowrap" data-testid={`text-model-${log.id}`}>
                      {log.modelUsed}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm text-right whitespace-nowrap" data-testid={`text-duration-${log.id}`}>
                      {log.durationMs 
                        ? `${(log.durationMs / 1000).toFixed(1)}s` 
                        : '-'}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm text-right whitespace-nowrap" data-testid={`text-input-tokens-${log.id}`}>
                      {log.inputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm text-right whitespace-nowrap" data-testid={`text-output-tokens-${log.id}`}>
                      {log.outputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm text-right whitespace-nowrap" data-testid={`text-total-tokens-${log.id}`}>
                      {log.totalTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-sm text-right font-medium whitespace-nowrap" data-testid={`text-cost-${log.id}`}>
                      ${parseFloat(log.estimatedCost || "0").toFixed(4)}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-xs text-muted-foreground max-w-xs truncate" data-testid={`text-notes-${log.id}`}>
                      {log.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {logs.length > 0 && (
          <div className="border-t pt-3 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Total Entries: <span className="font-medium text-foreground" data-testid="text-total-entries">{logs.length}</span>
            </div>
            <div className="text-base font-semibold">
              Total Cost: <span className="text-primary" data-testid="text-total-cost">${totalCost.toFixed(2)}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
