import { ProjectCard } from "@/components/ProjectCard";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { useState, useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { useBusinessUnit } from "@/contexts/BusinessUnitContext";
import { useProject } from "@/contexts/ProjectContext";
import { useTerminology } from "@/contexts/TerminologyContext";

const statusMap = {
  "active": "Active" as const,
  "onhold": "On hold" as const,
  "complete": "Complete" as const,
};

export default function Projects(props: { businessUnitId?: string; hideHeader?: boolean } = {}) {
  const { businessUnitId, hideHeader = false } = props;
  const { selectedCompany } = useCompany();
  const { selectedBusinessUnit } = useBusinessUnit();
  const { selectedProject } = useProject();
  const { terminology } = useTerminology();
  const [searchQuery, setSearchQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  
  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "tender": return terminology.tender;
      case "delivery": return terminology.delivery;
      case "defectsPeriod": return terminology.defectsPeriod;
      case "closed": return terminology.closed;
      default: return phase;
    }
  };
  
  // Use provided businessUnitId or fetch all projects for company
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: businessUnitId 
      ? ["/api/projects/business-unit", businessUnitId]
      : ["/api/projects", selectedCompany?.id],
    queryFn: async () => {
      if (businessUnitId) {
        const response = await fetch(`/api/projects?businessUnitId=${businessUnitId}`);
        if (!response.ok) throw new Error('Failed to fetch projects');
        return response.json();
      }
      if (!selectedCompany?.id) return [];
      const response = await fetch(`/api/projects?companyId=${selectedCompany.id}`);
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    },
  });

  const filteredProjects = (projects?.filter((project) => {
    const matchesSearch = 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.projectCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.client && project.client.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (project.location && project.location.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesPhase = phaseFilter === "all" || project.phase === phaseFilter;
    
    // If businessUnitId prop is provided, it's already filtered by the query
    // Otherwise, filter by selected business unit from global context
    const matchesBU = businessUnitId || !selectedBusinessUnit || 
      selectedBusinessUnit === "all" || 
      (typeof selectedBusinessUnit === 'object' && selectedBusinessUnit !== null && project.businessUnitId === selectedBusinessUnit.id);
    
    return matchesSearch && matchesPhase && matchesBU;
  }) || []).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1>Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your construction projects</p>
          </div>
          <CreateProjectDialog businessUnitId={businessUnitId} />
        </div>
      )}
      {hideHeader && (
        <div className="flex justify-end">
          <CreateProjectDialog businessUnitId={businessUnitId} />
        </div>
      )}

      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-projects"
          />
        </div>
        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-phase">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            <SelectItem value="tender">{terminology.tender}</SelectItem>
            <SelectItem value="delivery">{terminology.delivery}</SelectItem>
            <SelectItem value="defectsPeriod">{terminology.defectsPeriod}</SelectItem>
            <SelectItem value="closed">{terminology.closed}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading projects...</p>
        </div>
      ) : filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard 
              key={project.id} 
              id={project.id}
              projectCode={project.projectCode}
              name={project.name}
              client={project.client || ""}
              location={project.location || ""}
              phase={project.phase as "tender" | "delivery" | "defectsPeriod" | "closed"}
              phaseLabel={getPhaseLabel(project.phase)}
              status={statusMap[project.status as keyof typeof statusMap] || "Active"}
              canonicalStatus={project.status as "active" | "onhold" | "complete"}
              openRfis={0}
              overdueRfis={0}
              phaseEndDate={project.tenderEndDate || project.deliveryEndDate || project.defectsPeriodEndDate || project.closedEndDate || ""}
              tenderStartDate={project.tenderStartDate || undefined}
              tenderEndDate={project.tenderEndDate || undefined}
              deliveryStartDate={project.deliveryStartDate || undefined}
              deliveryEndDate={project.deliveryEndDate || undefined}
              defectsPeriodStartDate={project.defectsPeriodStartDate || undefined}
              defectsPeriodEndDate={project.defectsPeriodEndDate || undefined}
              closedStartDate={project.closedStartDate || undefined}
              closedEndDate={project.closedEndDate || undefined}
              isSelected={selectedProject !== null && typeof selectedProject === 'object' && selectedProject?.id === project.id}
              businessUnitId={project.businessUnitId || undefined}
              sharepointFolderPath={project.sharepointFolderPath || undefined}
              contractDocumentPath={project.contractDocumentPath || undefined}
              contractSpecificationPath={project.contractSpecificationPath || undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {projects && projects.length > 0 
              ? "No projects match your search criteria." 
              : "No projects yet. Create your first project to get started."}
          </p>
        </div>
      )}
    </div>
  );
}
