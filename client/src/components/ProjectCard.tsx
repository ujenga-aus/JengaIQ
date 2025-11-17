import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, Pencil } from "lucide-react";
import { EditProjectDialog } from "./EditProjectDialog";
import { TeamMembersDialog } from "./TeamMembersDialog";
import type { Project } from "@shared/schema";

interface ProjectCardProps {
  id: string;
  projectCode: string;
  name: string;
  client: string;
  location?: string;
  phase: "tender" | "delivery" | "defectsPeriod" | "closed";
  phaseLabel: string;
  status: "Active" | "On hold" | "Complete";
  canonicalStatus?: "active" | "onhold" | "complete"; // Canonical status for EditProjectDialog
  openRfis: number;
  overdueRfis: number;
  phaseEndDate: string;
  tenderStartDate?: string;
  tenderEndDate?: string;
  deliveryStartDate?: string;
  deliveryEndDate?: string;
  defectsPeriodStartDate?: string;
  defectsPeriodEndDate?: string;
  closedStartDate?: string;
  closedEndDate?: string;
  isSelected?: boolean;
  businessUnitId?: string;
  sharepointFolderPath?: string;
  contractDocumentPath?: string;
  contractSpecificationPath?: string;
}

const phaseVariants = {
  tender: "primary" as const,
  delivery: "success" as const,
  defectsPeriod: "warning" as const,
  closed: "primary" as const,
  completed: "destructive" as const,
};

export function ProjectCard({
  id,
  projectCode,
  name,
  client,
  location,
  phase,
  phaseLabel,
  status,
  canonicalStatus,
  openRfis,
  overdueRfis,
  phaseEndDate,
  tenderStartDate,
  tenderEndDate,
  deliveryStartDate,
  deliveryEndDate,
  defectsPeriodStartDate,
  defectsPeriodEndDate,
  closedStartDate,
  closedEndDate,
  isSelected = false,
  businessUnitId,
  sharepointFolderPath,
  contractDocumentPath,
  contractSpecificationPath,
}: ProjectCardProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [teamMembersDialogOpen, setTeamMembersDialogOpen] = useState(false);

  // Convert display status to canonical if canonicalStatus not provided
  const getCanonicalStatus = (): "active" | "onhold" | "complete" => {
    if (canonicalStatus) return canonicalStatus;
    // Fallback: convert display status to canonical
    switch (status) {
      case "Active": return "active";
      case "On hold": return "onhold";
      case "Complete": return "complete";
      default: return "active";
    }
  };

  // Create project object for edit dialog
  const projectData: Project = {
    id,
    projectCode,
    name,
    client: client || null,
    location: location || null,
    businessUnitId: businessUnitId || null,
    status: getCanonicalStatus(),
    phase,
    tenderStartDate: tenderStartDate || null,
    tenderEndDate: tenderEndDate || null,
    deliveryStartDate: deliveryStartDate || null,
    deliveryEndDate: deliveryEndDate || null,
    defectsPeriodStartDate: defectsPeriodStartDate || null,
    defectsPeriodEndDate: defectsPeriodEndDate || null,
    closedStartDate: closedStartDate || null,
    closedEndDate: closedEndDate || null,
    sharepointFolderPath: sharepointFolderPath || null,
    contractDocumentPath: contractDocumentPath || null,
    contractSpecificationPath: contractSpecificationPath || null,
    createdAt: new Date(), // Placeholder
  };

  // Determine actual current phase based on dates
  const getCurrentPhase = (): "tender" | "delivery" | "defectsPeriod" | "closed" | "completed" => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if project is in Tender phase
    if (tenderStartDate && tenderEndDate) {
      const tenderStart = new Date(tenderStartDate);
      const tenderEnd = new Date(tenderEndDate);
      tenderStart.setHours(0, 0, 0, 0);
      tenderEnd.setHours(0, 0, 0, 0);
      if (today >= tenderStart && today <= tenderEnd) {
        return "tender";
      }
    }
    
    // Check if project is in Delivery phase
    if (deliveryStartDate && deliveryEndDate) {
      const deliveryStart = new Date(deliveryStartDate);
      const deliveryEnd = new Date(deliveryEndDate);
      deliveryStart.setHours(0, 0, 0, 0);
      deliveryEnd.setHours(0, 0, 0, 0);
      if (today >= deliveryStart && today <= deliveryEnd) {
        return "delivery";
      }
    }
    
    // Check if project is in Defects Period
    if (defectsPeriodStartDate && defectsPeriodEndDate) {
      const defectsStart = new Date(defectsPeriodStartDate);
      const defectsEnd = new Date(defectsPeriodEndDate);
      defectsStart.setHours(0, 0, 0, 0);
      defectsEnd.setHours(0, 0, 0, 0);
      if (today >= defectsStart && today <= defectsEnd) {
        return "defectsPeriod";
      }
    }
    
    // Check if project is in Liability Period
    if (closedStartDate && closedEndDate) {
      const closedStart = new Date(closedStartDate);
      const closedEnd = new Date(closedEndDate);
      closedStart.setHours(0, 0, 0, 0);
      closedEnd.setHours(0, 0, 0, 0);
      if (today >= closedStart && today <= closedEnd) {
        return "closed";
      }
    }
    
    // Check if project is completed (beyond all end dates)
    if (closedEndDate) {
      const closedEnd = new Date(closedEndDate);
      closedEnd.setHours(0, 0, 0, 0);
      if (today > closedEnd) {
        return "completed";
      }
    }
    
    // Fallback to provided phase
    return phase;
  };
  
  const displayPhase = getCurrentPhase();
  const displayPhaseLabel = displayPhase === "completed" ? "Completed" : phaseLabel;
  
  return (
    <Card data-testid={`card-project-${id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="space-y-1 flex-1 min-w-0">
          <p className="font-mono text-sm text-muted-foreground">{projectCode}</p>
          <h3 className="font-semibold text-base leading-tight">{name}</h3>
          <p className="text-sm text-muted-foreground">{client}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={(e) => {
              e.stopPropagation();
              setTeamMembersDialogOpen(true);
            }}
            data-testid={`button-team-members-${id}`}
          >
            <Users className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={(e) => {
              e.stopPropagation();
              setEditDialogOpen(true);
            }}
            data-testid={`button-edit-project-${id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {isSelected && (
            <Badge variant="success" className="shrink-0" data-testid={`badge-filter-${id}`}>
              Filter
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm">
          {location && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="truncate">{location}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
          <Badge variant={phaseVariants[displayPhase as keyof typeof phaseVariants]} data-testid={`badge-phase-${displayPhase}`}>
            {displayPhaseLabel}
          </Badge>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>Due {phaseEndDate}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Open RFIs</p>
            <p className="text-base font-semibold" data-testid={`text-open-rfis-${id}`}>{openRfis}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className={`text-lg font-semibold ${overdueRfis > 0 ? 'text-destructive' : ''}`} data-testid={`text-overdue-rfis-${id}`}>
              {overdueRfis}
            </p>
          </div>
        </div>
      </CardContent>
      <EditProjectDialog
        project={projectData}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
      <TeamMembersDialog
        projectId={id}
        projectName={name}
        open={teamMembersDialogOpen}
        onOpenChange={setTeamMembersDialogOpen}
      />
    </Card>
  );
}
