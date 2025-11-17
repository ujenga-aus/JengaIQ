import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

interface ProjectMember {
  userAccountId: string;
  username: string;
  givenName: string;
  familyName: string;
  email: string;
  projectRoleCode: string;
  projectRoleName: string;
  membershipId: string;
  startDate: string;
  notes: string | null;
}

interface ProjectRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface TeamMembersListProps {
  projectId: string;
}

export function TeamMembersList({ projectId }: TeamMembersListProps) {
  const { toast } = useToast();

  const { data: members = [], isLoading: membersLoading } = useQuery<ProjectMember[]>({
    queryKey: ["/api/rbac/projects", projectId, "members"],
    enabled: !!projectId,
  });

  const { data: projectRoles = [] } = useQuery<ProjectRole[]>({
    queryKey: ["/api/project-roles"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ membershipId, projectRoleId }: { membershipId: string; projectRoleId: string }) => {
      return apiRequest("PATCH", `/api/rbac/projects/${projectId}/members/${membershipId}`, {
        projectRoleId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/projects", projectId, "members"] });
      toast({
        title: "Role updated",
        description: "Team member role has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update team member role",
        variant: "destructive",
      });
    },
  });

  const handleRoleChange = (membershipId: string, projectRoleId: string) => {
    updateRoleMutation.mutate({ membershipId, projectRoleId });
  };

  if (membersLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Loading team members...</p>
        </CardContent>
      </Card>
    );
  }

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No team members assigned to this project yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-background">
              <tr>
                <th className="py-3 px-4 text-left text-sm font-medium">Name</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Email</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Project Role</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Start Date</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.membershipId} className="border-b hover-elevate" data-testid={`row-team-member-${member.userAccountId}`}>
                  <td className="py-3 px-4">
                    <p className="font-medium">{member.givenName} {member.familyName}</p>
                    <p className="text-xs text-muted-foreground">@{member.username}</p>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{member.email}</td>
                  <td className="py-3 px-4">
                    <Select
                      value={projectRoles.find(r => r.code === member.projectRoleCode)?.id || ""}
                      onValueChange={(value) => handleRoleChange(member.membershipId, value)}
                      data-testid={`select-role-${member.userAccountId}`}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {projectRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {formatDate(member.startDate)}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground max-w-xs truncate">
                    {member.notes || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
