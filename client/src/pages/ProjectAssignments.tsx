import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, useDraggable, useDroppable } from "@dnd-kit/core";
import { useCompany } from "@/contexts/CompanyContext";
import { useBusinessUnit } from "@/contexts/BusinessUnitContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Briefcase, Building2, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type UserAccount = {
  id: string;
  givenName: string;
  familyName: string;
  email: string;
  username: string;
  employeeNo: string | null;
  isActive: boolean;
  currentEmploymentRole: string | null;
};

type Project = {
  id: string;
  projectCode: string;
  name: string;
  businessUnitId: string;
  phase: string;
  tenderStartDate: string | null;
  tenderEndDate: string | null;
  deliveryStartDate: string | null;
  deliveryEndDate: string | null;
  defectsPeriodStartDate: string | null;
  defectsPeriodEndDate: string | null;
  closedStartDate: string | null;
  closedEndDate: string | null;
};

type ProjectRole = {
  id: string;
  name: string;
  description: string | null;
};

export default function ProjectAssignments({ companyId, hideHeader = false }: { companyId?: string; hideHeader?: boolean } = {}) {
  const { selectedCompany } = useCompany();
  const { selectedBusinessUnit } = useBusinessUnit();
  const { terminology } = useTerminology();
  const { toast } = useToast();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [draggedUserId, setDraggedUserId] = useState<string | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedProjectRole, setSelectedProjectRole] = useState<string>("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");

  const { data: users = [] } = useQuery<UserAccount[]>({
    queryKey: companyId ? ["/api/users", companyId] : ["/api/users"],
    queryFn: async () => {
      const url = companyId ? `/api/users?companyId=${companyId}` : "/api/users";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: companyId ? ["/api/projects", companyId] : ["/api/projects"],
    queryFn: async () => {
      const url = companyId ? `/api/projects?companyId=${companyId}` : "/api/projects";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch projects");
      return response.json();
    },
  });

  const { data: projectRoles = [] } = useQuery<ProjectRole[]>({
    queryKey: ["/api/project-roles"],
  });

  // Normalize phase value to canonical slug format
  const normalizePhase = (phase: string | null | undefined): string => {
    if (!phase) return "tender";
    
    // Map known variations to canonical slugs
    const phaseMap: Record<string, string> = {
      // Lowercase variants
      "tender": "tender",
      "delivery": "delivery",
      "defectsperiod": "defectsPeriod",
      "closed": "closed",
      "completed": "completed",
      // Title Case variants
      "Tender": "tender",
      "Delivery": "delivery",
      "DefectsPeriod": "defectsPeriod",
      "Defects Period": "defectsPeriod",
      "Closed": "closed",
      "Completed": "completed",
      // Camel case variants
      "defectsPeriod": "defectsPeriod",
    };
    
    return phaseMap[phase] || phase.toLowerCase();
  };

  // Calculate current phase based on dates
  const getCurrentPhase = (project: Project): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (project.tenderStartDate && project.tenderEndDate) {
      const tenderStart = new Date(project.tenderStartDate);
      const tenderEnd = new Date(project.tenderEndDate);
      tenderStart.setHours(0, 0, 0, 0);
      tenderEnd.setHours(0, 0, 0, 0);
      if (today >= tenderStart && today <= tenderEnd) return "tender";
    }
    
    if (project.deliveryStartDate && project.deliveryEndDate) {
      const deliveryStart = new Date(project.deliveryStartDate);
      const deliveryEnd = new Date(project.deliveryEndDate);
      deliveryStart.setHours(0, 0, 0, 0);
      deliveryEnd.setHours(0, 0, 0, 0);
      if (today >= deliveryStart && today <= deliveryEnd) return "delivery";
    }
    
    if (project.defectsPeriodStartDate && project.defectsPeriodEndDate) {
      const defectsStart = new Date(project.defectsPeriodStartDate);
      const defectsEnd = new Date(project.defectsPeriodEndDate);
      defectsStart.setHours(0, 0, 0, 0);
      defectsEnd.setHours(0, 0, 0, 0);
      if (today >= defectsStart && today <= defectsEnd) return "defectsPeriod";
    }
    
    if (project.closedStartDate && project.closedEndDate) {
      const closedStart = new Date(project.closedStartDate);
      const closedEnd = new Date(project.closedEndDate);
      closedStart.setHours(0, 0, 0, 0);
      closedEnd.setHours(0, 0, 0, 0);
      if (today >= closedStart && today <= closedEnd) return "closed";
    }
    
    if (project.closedEndDate) {
      const closedEnd = new Date(project.closedEndDate);
      closedEnd.setHours(0, 0, 0, 0);
      if (today > closedEnd) return "completed";
    }
    
    // Fallback to provided phase, normalized to canonical slug
    return normalizePhase(project.phase);
  };

  const filteredProjects = projects.filter(project => {
    // Filter by business unit or company
    if (selectedBusinessUnit && typeof selectedBusinessUnit !== "string") {
      if (project.businessUnitId !== selectedBusinessUnit.id) return false;
    } else if (selectedCompany && typeof selectedCompany !== "string") {
      // Would need to filter by company through business units
      // For now, skip company-only filtering if no BU selected
    }
    
    // Filter by phase
    if (phaseFilter !== "all") {
      const currentPhase = getCurrentPhase(project);
      if (currentPhase !== phaseFilter) return false;
    }
    
    return true;
  });

  const activeEmployees = users.filter(user => user.isActive);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveUserId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveUserId(null);
    
    if (over && active.id !== over.id) {
      const user = users.find(u => u.id === active.id);
      const project = filteredProjects.find(p => p.id === over.id);
      
      if (user && project) {
        setDraggedUserId(active.id as string);
        setSelectedProject(project);
        setAssignDialogOpen(true);
      }
    }
  };

  const handleAssign = async () => {
    if (!selectedProject || !draggedUserId || !selectedProjectRole) return;

    try {
      await apiRequest("POST", "/api/project-assignments", {
        userAccountId: draggedUserId,
        projectId: selectedProject.id,
        projectRoleId: selectedProjectRole,
        notes: assignmentNotes || null,
      });

      toast({
        title: "Employee assigned successfully",
        description: `Assigned to ${selectedProject.name}`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/project-assignments"] });
      
      setAssignDialogOpen(false);
      setDraggedUserId(null);
      setSelectedProject(null);
      setSelectedProjectRole("");
      setAssignmentNotes("");
    } catch (error) {
      toast({
        title: "Assignment failed",
        description: "Failed to assign employee to project",
        variant: "destructive",
      });
    }
  };

  const activeUser = activeUserId ? users.find(u => u.id === activeUserId) : null;
  const draggedUser = draggedUserId ? users.find(u => u.id === draggedUserId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {!hideHeader && (
          <div>
            <h1 className="tracking-tight">Project Assignments</h1>
            <p className="text-muted-foreground">
              Drag employees to projects to assign them
              {selectedBusinessUnit && typeof selectedBusinessUnit !== "string" && ` (Filtered by ${selectedBusinessUnit.name})`}
              {(!selectedBusinessUnit || typeof selectedBusinessUnit === "string") && selectedCompany && typeof selectedCompany !== "string" && ` (Filtered by ${selectedCompany.name})`}
            </p>
          </div>
        )}
        <div className={`flex items-center gap-2 ${hideHeader ? 'ml-auto' : ''}`}>
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-phase-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              <SelectItem value="tender">{terminology.tender}</SelectItem>
              <SelectItem value="delivery">{terminology.delivery}</SelectItem>
              <SelectItem value="defectsPeriod">{terminology.defectsPeriod}</SelectItem>
              <SelectItem value="closed">{terminology.closed}</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Active Employees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2">
                  {activeEmployees.map((user) => (
                    <DraggableEmployee key={user.id} user={user} />
                  ))}
                  {activeEmployees.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No active employees
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2">
                  {filteredProjects.map((project) => (
                    <DroppableProject key={project.id} project={project} />
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      {selectedBusinessUnit || selectedCompany
                        ? "No projects in selected context"
                        : "No projects available"}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <DragOverlay>
          {activeUser && (
            <Card className="w-full max-w-md opacity-90">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-medium">
                      {activeUser.givenName} {activeUser.familyName}
                    </p>
                    {activeUser.currentEmploymentRole && (
                      <p className="text-sm text-muted-foreground">
                        {activeUser.currentEmploymentRole}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      <Dialog open={assignDialogOpen} onOpenChange={(open) => {
        setAssignDialogOpen(open);
        if (!open) {
          setDraggedUserId(null);
          setSelectedProject(null);
          setSelectedProjectRole("");
          setAssignmentNotes("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Project</DialogTitle>
            <DialogDescription>
              Select the project role for this assignment
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedProject && draggedUser && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Employee:</span>
                  <span>{draggedUser.givenName} {draggedUser.familyName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Project:</span>
                  <span>{selectedProject.name}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="project-role">Project Role *</Label>
              <Select value={selectedProjectRole} onValueChange={setSelectedProjectRole}>
                <SelectTrigger id="project-role" data-testid="select-project-role">
                  <SelectValue placeholder="Select project role" />
                </SelectTrigger>
                <SelectContent>
                  {projectRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input
                id="notes"
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder="e.g., Lead engineer for structural works"
                data-testid="input-assignment-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleAssign}
              disabled={!selectedProjectRole}
              data-testid="button-confirm-assign"
            >
              Assign to Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DraggableEmployee({ user }: { user: UserAccount }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: user.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing"
      data-testid={`draggable-employee-${user.id}`}
    >
      <Card className="hover-elevate">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="font-medium">
                {user.givenName} {user.familyName}
              </p>
              {user.currentEmploymentRole ? (
                <div className="flex items-center gap-1 mt-1">
                  <Briefcase className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {user.currentEmploymentRole}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No role assigned</p>
              )}
            </div>
            {user.employeeNo && (
              <Badge variant="secondary">{user.employeeNo}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DroppableProject({ project }: { project: Project }) {
  const { setNodeRef, isOver } = useDroppable({
    id: project.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-colors ${isOver ? "ring-2 ring-primary" : ""}`}
      data-testid={`droppable-project-${project.id}`}
    >
      <Card className={isOver ? "bg-primary/5" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{project.name}</p>
              <p className="text-sm text-muted-foreground">{project.projectCode}</p>
            </div>
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
