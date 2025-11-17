import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, useDraggable, useDroppable } from "@dnd-kit/core";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, GripVertical, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  givenName: string;
  familyName: string;
  email: string;
  employeeNo: string | null;
  currentEmploymentRole: string | null;
  isActive: boolean;
}

interface ProjectRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface ProjectMember {
  userAccountId: string;
  membershipId: string;
}

interface AddTeamMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function AddTeamMembersDialog({ open, onOpenChange, projectId, projectName }: AddTeamMembersDialogProps) {
  const { toast } = useToast();
  const [draggedUserId, setDraggedUserId] = useState<string | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<{ userId: string; userName: string } | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: currentMembers = [] } = useQuery<ProjectMember[]>({
    queryKey: ["/api/rbac/projects", projectId, "members"],
    enabled: !!projectId,
  });

  const { data: projectRoles = [] } = useQuery<ProjectRole[]>({
    queryKey: ["/api/project-roles"],
  });

  // Filter out users who are already project members
  const availableUsers = allUsers.filter(
    (user) => user.isActive && !currentMembers.some((member) => member.userAccountId === user.id)
  );

  const addMemberMutation = useMutation({
    mutationFn: async ({ userAccountId, projectRoleCode }: { userAccountId: string; projectRoleCode: string }) => {
      // TODO: Get assignedByUserId from auth context when auth is implemented
      // For now, use the first available user as a placeholder
      const assignedByUserId = allUsers.length > 0 ? allUsers[0].id : userAccountId;
      
      return apiRequest("POST", `/api/rbac/projects/${projectId}/members`, {
        userAccountId,
        projectRoleCode,
        assignedByUserId,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/projects", projectId, "members"] });
      toast({
        title: "Team member added",
        description: "The user has been successfully added to the project team",
      });
      setPendingAssignment(null);
      setSelectedRoleId("");
      setNotes("");
      // Close dialog after successful addition
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add team member",
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedUserId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && over.id === "project-team-drop-zone") {
      const userId = active.id as string;
      const user = availableUsers.find((u) => u.id === userId);
      if (user) {
        setPendingAssignment({
          userId: user.id,
          userName: `${user.givenName} ${user.familyName}`,
        });
      }
    }

    setDraggedUserId(null);
  };

  const handleAssign = () => {
    if (!pendingAssignment || !selectedRoleId) return;

    const selectedRole = projectRoles.find((r) => r.id === selectedRoleId);
    if (!selectedRole) return;

    addMemberMutation.mutate({
      userAccountId: pendingAssignment.userId,
      projectRoleCode: selectedRole.code,
    });
  };

  const draggedUser = availableUsers.find((u) => u.id === draggedUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]" data-testid="dialog-add-team-members">
        <DialogHeader>
          <DialogTitle>Add Team Members</DialogTitle>
          <DialogDescription>
            Drag employees from the available list and drop them into the project team area to assign them to {projectName}
          </DialogDescription>
        </DialogHeader>

        <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-3">Available Employees</h3>
                <ScrollArea className="h-[400px] border rounded-md">
                  <div className="p-4 space-y-2">
                    {availableUsers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="h-12 w-12 text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                          All active employees are already assigned to this project
                        </p>
                      </div>
                    ) : (
                      availableUsers.map((user) => <DraggableUser key={user.id} user={user} />)
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-3">Project Team Drop Zone</h3>
                <DropZone projectName={projectName} />
              </div>

              {pendingAssignment && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Assign Role</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Employee</Label>
                      <p className="text-sm">{pendingAssignment.userName}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role-select">Project Role</Label>
                      <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                        <SelectTrigger id="role-select" data-testid="select-project-role">
                          <SelectValue placeholder="Select a role" />
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
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Input
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this assignment"
                        data-testid="input-assignment-notes"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleAssign}
                        disabled={!selectedRoleId || addMemberMutation.isPending}
                        data-testid="button-confirm-assign"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        {addMemberMutation.isPending ? "Adding..." : "Add to Team"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPendingAssignment(null);
                          setSelectedRoleId("");
                          setNotes("");
                        }}
                        data-testid="button-cancel-assign"
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <DragOverlay>
            {draggedUser ? (
              <Card className="w-full opacity-90">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {draggedUser.givenName} {draggedUser.familyName}
                      </p>
                      <p className="text-xs text-muted-foreground">{draggedUser.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      </DialogContent>
    </Dialog>
  );
}

function DraggableUser({ user }: { user: User }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: user.id,
  });

  return (
    <Card
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? "opacity-50" : ""}`}
      data-testid={`draggable-user-${user.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-medium text-sm">
              {user.givenName} {user.familyName}
            </p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          {user.currentEmploymentRole && (
            <Badge variant="secondary" className="text-xs">
              {user.currentEmploymentRole}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DropZone({ projectName }: { projectName: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "project-team-drop-zone",
  });

  return (
    <div
      ref={setNodeRef}
      className={`h-[400px] border-2 border-dashed rounded-md flex items-center justify-center transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      }`}
      data-testid="drop-zone-project-team"
    >
      <div className="text-center p-8">
        <Users className={`h-16 w-16 mx-auto mb-4 ${isOver ? "text-primary" : "text-muted-foreground"}`} />
        <p className={`font-medium ${isOver ? "text-primary" : "text-muted-foreground"}`}>
          {isOver ? "Drop to add to team" : "Drag employees here"}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Drop an employee here to add them to {projectName}
        </p>
      </div>
    </div>
  );
}
