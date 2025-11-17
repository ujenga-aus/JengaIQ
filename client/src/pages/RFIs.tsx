import { RFITableRow } from "@/components/RFITableRow";
import { CreateRFIDialog } from "@/components/CreateRFIDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Download, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useProject } from "@/contexts/ProjectContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import type { RFI, Project } from "@shared/schema";
import { useState, useMemo } from "react";
import { formatDate } from "@/lib/dateFormat";

export default function RFIs() {
  const { terminology } = useTerminology();
  const { selectedCompany } = useCompany();
  const { selectedProject, projects } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const { data: allRFIs = [], isLoading } = useQuery<RFI[]>({
    queryKey: ["/api/rfis"],
  });

  // Filter RFIs by selected project from sidebar
  const filteredRFIs = useMemo(() => {
    let rfis = allRFIs;
    
    // First, filter RFIs to only those from the current company's projects
    const companyProjectIds = projects.map(p => p.id);
    rfis = rfis.filter(rfi => companyProjectIds.includes(rfi.projectId));
    
    // Then filter by selected project from sidebar
    if (selectedProject && selectedProject !== null && typeof selectedProject === 'object') {
      rfis = rfis.filter(rfi => rfi.projectId === selectedProject.id);
    }
    
    // Filter by search query
    if (searchQuery) {
      rfis = rfis.filter(rfi => 
        rfi.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfi.rfiNumber.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Filter by status
    if (statusFilter !== "all") {
      rfis = rfis.filter(rfi => rfi.status === statusFilter);
    }
    
    return rfis;
  }, [allRFIs, projects, selectedProject, searchQuery, statusFilter]);

  const overdueCount = filteredRFIs.filter(rfi => rfi.isOverdue).length;
  const openCount = filteredRFIs.filter(rfi => rfi.status === "open").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1>{terminology.rfi} Register</h1>
          <p className="text-sm text-muted-foreground mt-1">Request for Information management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-export-rfis">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <CreateRFIDialog />
        </div>
      </div>

      <div className="flex gap-3">
        <Badge variant="primary">
          {openCount} Open
        </Badge>
        <Badge variant="destructive">
          {overdueCount} Overdue
        </Badge>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search RFIs..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-rfis"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-rfi-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="awaiting">Awaiting Info</SelectItem>
            <SelectItem value="responded">Responded</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading RFIs...</p>
        </div>
      ) : filteredRFIs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {allRFIs.length === 0 
              ? "No RFIs found. Create your first RFI to get started."
              : "No RFIs match your filters."}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr className="border-b">
                  <th className="px-4 text-left text-sm font-medium" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>Number</th>
                  <th className="px-4 text-left text-sm font-medium" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>Title</th>
                  <th className="px-4 text-left text-sm font-medium" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>To</th>
                  <th className="px-4 text-left text-sm font-medium" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>Status</th>
                  <th className="px-4 text-left text-sm font-medium" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>Required Date</th>
                  <th className="px-4 text-left text-sm font-medium" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>Days Open</th>
                  <th className="px-4 text-left text-sm font-medium" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredRFIs.map((rfi) => {
                  // Transform database RFI to component props
                  const createdDate = new Date(rfi.createdAt);
                  const now = new Date();
                  const daysOpen = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                  const lastActivity = formatDate(rfi.updatedAt);
                  
                  const statusMap: Record<string, "Open" | "Awaiting Info" | "Responded" | "Closed"> = {
                    "open": "Open",
                    "answered": "Responded",
                    "closed": "Closed"
                  };
                  
                  return (
                    <RFITableRow 
                      key={rfi.id}
                      id={rfi.id}
                      number={rfi.rfiNumber}
                      title={rfi.title}
                      to={rfi.assignedTo || "N/A"}
                      status={statusMap[rfi.status] || "Open"}
                      requiredDate={rfi.dueDate ? formatDate(rfi.dueDate) : "N/A"}
                      daysOpen={daysOpen}
                      isOverdue={rfi.isOverdue}
                      lastActivity={lastActivity}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
