import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Download, UserPlus, Shield, FolderKanban, Search, Trash2, Pencil, Plus, Briefcase } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AddUserDialog } from "@/components/AddUserDialog";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { formatDate } from "@/lib/dateFormat";
import { format } from "date-fns";
import type { EmploymentRole } from "@shared/schema";

interface UserAccount {
  id: string;
  username: string;
  mfaEnabled: boolean;
  personId: string;
  givenName: string;
  familyName: string;
  email: string;
  mobile: string | null;
  employeeNo: string | null;
  isActive: boolean;
  currentEmploymentRole: string | null;
}

interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface ProjectRole {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface UserRole {
  roleId: string;
  roleCode: string;
  roleName: string;
  roleDescription: string;
  startDate: string;
  endDate: string | null;
}

interface Project {
  id: string;
  name: string;
  businessUnitId: string;
}

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

interface EmploymentHistory {
  id: string;
  employmentRoleId: string;
  roleTitle: string;
  roleDescription: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  assignedByUserId: string | null;
  createdAt: string;
}

function AssignRoleDialog({ userAccountId, userName, onSuccess }: { userAccountId: string; userName: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState("");

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/rbac/roles"],
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ roleCode }: { roleCode: string }) => {
      const response = await fetch(`/api/rbac/users/${userAccountId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleCode }),
      });
      if (!response.ok) throw new Error("Failed to assign role");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/users"] });
      toast({
        title: "Role assigned",
        description: `Role assigned to ${userName} successfully.`,
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to assign role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAssign = () => {
    if (!selectedRole) return;
    assignRoleMutation.mutate({ roleCode: selectedRole });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid={`button-assign-role-${userAccountId}`}>
          <Shield className="h-3 w-3 mr-1" />
          Assign Role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Global Role</DialogTitle>
          <DialogDescription>
            Assign a company-wide role to {userName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="role">Select Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger id="role" data-testid="select-role">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.code}>
                    <div>
                      <p className="font-medium">{role.name}</p>
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleAssign}
            disabled={!selectedRole || assignRoleMutation.isPending}
            data-testid="button-confirm-assign-role"
          >
            {assignRoleMutation.isPending ? "Assigning..." : "Assign Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignToProjectDialog({ userAccountId, userName, onSuccess }: { userAccountId: string; userName: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedProjectRole, setSelectedProjectRole] = useState("");
  const [notes, setNotes] = useState("");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects", selectedCompany?.id],
    enabled: !!selectedCompany?.id,
  });

  const { data: projectRoles = [] } = useQuery<ProjectRole[]>({
    queryKey: ["/api/rbac/project-roles"],
  });

  const assignToProjectMutation = useMutation({
    mutationFn: async ({ projectId, projectRoleCode, notes }: { projectId: string; projectRoleCode: string; notes: string }) => {
      const response = await fetch(`/api/rbac/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAccountId, projectRoleCode, notes: notes || null }),
      });
      if (!response.ok) throw new Error("Failed to assign to project");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/projects"] });
      toast({
        title: "User assigned to project",
        description: `${userName} has been assigned to the project successfully.`,
      });
      setSelectedProject("");
      setSelectedProjectRole("");
      setNotes("");
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to assign user to project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAssign = () => {
    if (!selectedProject || !selectedProjectRole) return;
    assignToProjectMutation.mutate({
      projectId: selectedProject,
      projectRoleCode: selectedProjectRole,
      notes,
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid={`button-assign-project-${userAccountId}`}>
          <FolderKanban className="h-3 w-3 mr-1" />
          Assign to Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign to Project</DialogTitle>
          <DialogDescription>
            Assign {userName} to a project with a specific role
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project">Select Project</Label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger id="project" data-testid="select-project">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="projectRole">Select Project Role</Label>
            <Select value={selectedProjectRole} onValueChange={setSelectedProjectRole}>
              <SelectTrigger id="projectRole" data-testid="select-project-role">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {projectRoles.map((role) => (
                  <SelectItem key={role.id} value={role.code}>
                    <div>
                      <p className="font-medium">{role.name}</p>
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Assigned for Q1 2025"
              data-testid="input-assignment-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleAssign}
            disabled={!selectedProject || !selectedProjectRole || assignToProjectMutation.isPending}
            data-testid="button-confirm-assign-project"
          >
            {assignToProjectMutation.isPending ? "Assigning..." : "Assign to Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, companyId, onSuccess }: { user: UserAccount; companyId?: string; onSuccess: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const COMPANY_ID = companyId || selectedCompany?.id || "ffc7b9fa-339c-4b12-97c5-39160cfc89ad";

  // Fetch employment history
  const { data: employmentHistory = [] } = useQuery<EmploymentHistory[]>({
    queryKey: ["/api/users", user.id, "employment-history"],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user.id}/employment-history`);
      return response.json();
    },
    enabled: isOpen,
  });

  // Fetch available employment roles
  const { data: employmentRoles = [] } = useQuery<EmploymentRole[]>({
    queryKey: ["/api/employment-roles"],
    queryFn: async () => {
      const response = await fetch(`/api/employment-roles?companyId=${COMPANY_ID}`);
      return response.json();
    },
    enabled: isOpen,
  });

  const currentRole = employmentHistory.find(h => !h.endDate);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setIsOpen(true)} data-testid={`button-edit-user-${user.id}`}>
        <Pencil className="h-4 w-4 mr-2" />
        Edit
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User: {user.givenName} {user.familyName}</DialogTitle>
            <DialogDescription>
              Manage user information and employment history
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic" data-testid="tab-basic-info">Basic Info</TabsTrigger>
              <TabsTrigger value="employment" data-testid="tab-employment-history">Employment History</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Given Name</Label>
                  <Input value={user.givenName} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Family Name</Label>
                  <Input value={user.familyName} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={user.username} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Mobile</Label>
                  <Input value={user.mobile || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Employee No</Label>
                  <Input value={user.employeeNo || ""} disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Current Employment Role</Label>
                {currentRole ? (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{currentRole.roleTitle}</p>
                          {currentRole.roleDescription && (
                            <p className="text-sm text-muted-foreground">{currentRole.roleDescription}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Since: {formatDate(currentRole.startDate)}
                          </p>
                        </div>
                        <Briefcase className="h-8 w-8 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">No employment role assigned</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="employment" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h3>Employment History</h3>
                <AssignEmploymentRoleDialog
                  userAccountId={user.id}
                  userName={`${user.givenName} ${user.familyName}`}
                  employmentRoles={employmentRoles.filter(r => r.isActive)}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/users", user.id, "employment-history"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                    toast({ title: "Employment role assigned successfully" });
                  }}
                />
              </div>

              {employmentHistory.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 pb-6">
                    <div className="text-center text-muted-foreground">
                      <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No employment history yet</p>
                      <p className="text-sm">Assign an employment role to get started</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {employmentHistory.map((history) => (
                    <Card key={history.id} data-testid={`employment-history-${history.id}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{history.roleTitle}</p>
                              {!history.endDate && (
                                <Badge variant="default" className="text-xs">Current</Badge>
                              )}
                            </div>
                            {history.roleDescription && (
                              <p className="text-sm text-muted-foreground mt-1">{history.roleDescription}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span>
                                {formatDate(history.startDate)}
                                {history.endDate && ` → ${formatDate(history.endDate)}`}
                                {!history.endDate && " → Present"}
                              </span>
                            </div>
                            {history.notes && (
                              <p className="text-sm text-muted-foreground mt-2 italic">{history.notes}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssignEmploymentRoleDialog({
  userAccountId,
  userName,
  employmentRoles,
  onSuccess,
}: {
  userAccountId: string;
  userName: string;
  employmentRoles: EmploymentRole[];
  onSuccess: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const assignRoleMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/users/${userAccountId}/employment-history`, {
        employmentRoleId: selectedRoleId,
        startDate,
        notes,
      });
    },
    onSuccess: () => {
      onSuccess();
      setIsOpen(false);
      setSelectedRoleId("");
      setStartDate(format(new Date(), "yyyy-MM-dd"));
      setNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to assign employment role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <Button size="sm" onClick={() => setIsOpen(true)} data-testid="button-assign-employment-role">
        <Plus className="h-3 w-3 mr-1" />
        Assign Role
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Employment Role</DialogTitle>
            <DialogDescription>
              Assign or update the employment role for {userName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="employment-role">Employment Role *</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger id="employment-role" data-testid="select-employment-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {employmentRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      <div>
                        <p className="font-medium">{role.title}</p>
                        {role.description && (
                          <p className="text-xs text-muted-foreground">{role.description}</p>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date *</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employment-notes">Notes (Optional)</Label>
              <Textarea
                id="employment-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Promoted due to excellent performance"
                rows={3}
                data-testid="input-employment-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button
              onClick={() => assignRoleMutation.mutate()}
              disabled={!selectedRoleId || !startDate || assignRoleMutation.isPending}
              data-testid="button-confirm-assign-employment-role"
            >
              {assignRoleMutation.isPending ? "Assigning..." : "Assign Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserListTab({ companyId }: { companyId?: string } = {}) {
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch user accounts, optionally filtered by company
  const { data: users = [], isLoading } = useQuery<UserAccount[]>({
    queryKey: companyId ? ["/api/users", companyId] : ["/api/users"],
    queryFn: async () => {
      const url = companyId ? `/api/users?companyId=${companyId}` : "/api/users";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
  });

  const filteredUsers = users.filter(user =>
    user.givenName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.familyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
            data-testid="input-search-users"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "No users found matching your search" : "No users yet. Add a user to get started."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Employee No</TableHead>
                  <TableHead>Employment Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium">
                      {user.givenName} {user.familyName}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.mobile || "-"}</TableCell>
                    <TableCell>{user.employeeNo || "-"}</TableCell>
                    <TableCell data-testid={`text-employment-role-${user.id}`}>
                      {user.currentEmploymentRole ? (
                        <Badge variant="secondary">
                          <Briefcase className="h-3 w-3 mr-1" />
                          {user.currentEmploymentRole}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm" data-testid={`text-no-employment-role-${user.id}`} aria-label="No employment role assigned">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "success" : "destructive"} data-testid={`badge-status-${user.id}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <EditUserDialog
                          user={user}
                          companyId={companyId}
                          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/users"] })}
                        />
                        <AssignRoleDialog
                          userAccountId={user.id}
                          userName={`${user.givenName} ${user.familyName}`}
                          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/users"] })}
                        />
                        <AssignToProjectDialog
                          userAccountId={user.id}
                          userName={`${user.givenName} ${user.familyName}`}
                          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/users"] })}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Users({ companyId, hideHeader = false }: { companyId?: string; hideHeader?: boolean } = {}) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState({
    name: "",
    email: "",
    mobile: "",
    role: "",
    businessUnits: "",
  });

  const handleDownloadTemplate = () => {
    const headers = ["Given Name", "Family Name", "Email", "Username", "Mobile", "Employee No"];
    const exampleRow = ["John", "Doe", "john.doe@example.com", "john.doe", "+1-555-0123", "EMP001"];
    
    const csvContent = [
      headers.join(","),
      exampleRow.join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", "user_import_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCsvFile(file);

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const firstLine = text.split('\n')[0];
        const headers = firstLine.split(',').map(h => h.trim());
        setCsvHeaders(headers);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {!hideHeader && (
          <div>
            <h1>User Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage users, roles, and project assignments</p>
          </div>
        )}
        <div className={`flex gap-2 ${hideHeader ? 'ml-auto' : ''}`}>
          <Button variant="outline" onClick={handleDownloadTemplate} data-testid="button-download-template">
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
          <AddUserDialog />
        </div>
      </div>

      <Tabs defaultValue="list" className="space-y-6">
        <TabsList>
          <TabsTrigger value="list" data-testid="tab-users-list">User List</TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-import">Import Users</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <UserListTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV File</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-medium">Upload a CSV file</p>
                  <p className="text-sm text-muted-foreground">
                    CSV should contain columns for name, email, mobile, role, and business unit assignments
                  </p>
                </div>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('csv-upload')?.click()}
                  data-testid="button-upload-csv"
                >
                  Select CSV File
                </Button>
                {csvFile && (
                  <div className="mt-4">
                    <Badge variant="primary">
                      {csvFile.name}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {csvFile && (
            <Card>
              <CardHeader>
                <CardTitle>Map CSV Columns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Map your CSV columns to the required user fields
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="map-name">Name Column</Label>
                    <Select onValueChange={(val) => setColumnMapping({...columnMapping, name: val})}>
                      <SelectTrigger id="map-name" data-testid="select-map-name">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((header, index) => (
                          <SelectItem key={index} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="map-email">Email Column</Label>
                    <Select onValueChange={(val) => setColumnMapping({...columnMapping, email: val})}>
                      <SelectTrigger id="map-email" data-testid="select-map-email">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((header, index) => (
                          <SelectItem key={index} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="map-mobile">Mobile Column</Label>
                    <Select onValueChange={(val) => setColumnMapping({...columnMapping, mobile: val})}>
                      <SelectTrigger id="map-mobile" data-testid="select-map-mobile">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((header, index) => (
                          <SelectItem key={index} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="map-role">Role Column</Label>
                    <Select onValueChange={(val) => setColumnMapping({...columnMapping, role: val})}>
                      <SelectTrigger id="map-role" data-testid="select-map-role">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((header, index) => (
                          <SelectItem key={index} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Values: Admin, Business Unit Manager (BUM), or Employee
                    </p>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="map-bu">Business Unit Assignments Column</Label>
                    <Select onValueChange={(val) => setColumnMapping({...columnMapping, businessUnits: val})}>
                      <SelectTrigger id="map-bu" data-testid="select-map-bu">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((header, index) => (
                          <SelectItem key={index} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Business unit names or IDs (comma-separated for multiple)
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Preview: 25 users will be imported
                  </p>
                  <Button data-testid="button-import-users">
                    <Upload className="h-4 w-4 mr-2" />
                    Import Users
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
