import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import type { EmploymentRole } from "@shared/schema";
import { useCompany } from "@/contexts/CompanyContext";

export default function EmploymentRoles({ companyId, hideHeader = false }: { companyId?: string; hideHeader?: boolean } = {}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<EmploymentRole | null>(null);
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  
  // Use provided companyId or fall back to selected company
  const effectiveCompanyId = companyId || selectedCompany?.id;

  // Fetch employment roles filtered by company if companyId provided
  const { data: roles = [], isLoading } = useQuery<EmploymentRole[]>({
    queryKey: companyId ? ["/api/employment-roles", companyId] : ["/api/employment-roles"],
    queryFn: async () => {
      const url = companyId ? `/api/employment-roles?companyId=${companyId}` : "/api/employment-roles";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch employment roles");
      return response.json();
    },
  });

  // Filter roles by search query
  const filteredRoles = roles.filter(role =>
    role.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (role.doaAcronym ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (role.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          {!hideHeader && (
            <div>
              <h1 data-testid="heading-employment-roles">Employment Roles</h1>
              <p className="text-muted-foreground">Manage job titles and positions for your organization</p>
            </div>
          )}
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-role" className={hideHeader ? "ml-auto" : ""}>
            <Plus className="h-4 w-4 mr-2" />
            Add Role
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Employment Roles</CardTitle>
                <CardDescription>View and manage employment roles</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search roles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-roles"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading employment roles...</div>
            ) : filteredRoles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-roles">
                {searchQuery ? "No roles found matching your search." : "No employment roles defined yet. Create one to get started."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>DOA Acronym</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoles.map((role) => (
                    <TableRow key={role.id} data-testid={`row-role-${role.id}`}>
                      <TableCell className="font-medium">{role.title}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground" data-testid={`text-doa-${role.id}`}>
                        {role.doaAcronym || "—"}
                      </TableCell>
                      <TableCell className="max-w-md text-muted-foreground">{role.description || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={role.isActive ? "success" : "destructive"} data-testid={`badge-status-${role.id}`}>
                          {role.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(role.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRole(role);
                              setEditDialogOpen(true);
                            }}
                            data-testid={`button-edit-${role.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {role.isActive && (
                            <DeactivateRoleButton role={role} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {effectiveCompanyId && (
          <CreateRoleDialog companyId={effectiveCompanyId} open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
        )}
        {selectedRole && (
          <EditRoleDialog
            role={selectedRole}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
        )}
      </div>
    </div>
  );
}

function CreateRoleDialog({ companyId, open, onOpenChange }: { companyId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [doaAcronym, setDoaAcronym] = useState("");
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/employment-roles", {
        companyId,
        title,
        doaAcronym: doaAcronym || null,
        description,
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employment-roles"] });
      toast({ title: "Employment role created successfully" });
      setTitle("");
      setDoaAcronym("");
      setDescription("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create employment role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({
        title: "Title is required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-create-role">
        <DialogHeader>
          <DialogTitle>Create Employment Role</DialogTitle>
          <DialogDescription>
            Add a new job title or position to your organization
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Senior Project Manager"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doa-acronym">DOA Acronym</Label>
              <Input
                id="doa-acronym"
                placeholder="e.g., SPM (Delegation of Authority)"
                value={doaAcronym}
                onChange={(e) => setDoaAcronym(e.target.value.toUpperCase())}
                className="font-mono"
                data-testid="input-doa-acronym"
              />
              <p className="text-xs text-muted-foreground">
                Used for approvals and delegation workflows
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description of this role"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                data-testid="input-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
              {createMutation.isPending ? "Creating..." : "Create Role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditRoleDialog({ role, open, onOpenChange }: { role: EmploymentRole; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState(role.title);
  const [doaAcronym, setDoaAcronym] = useState(role.doaAcronym || "");
  const [description, setDescription] = useState(role.description || "");
  const [isActive, setIsActive] = useState(role.isActive);
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/employment-roles/${role.id}`, {
        title,
        doaAcronym: doaAcronym || null,
        description,
        isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employment-roles"] });
      toast({ title: "Employment role updated successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update employment role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({
        title: "Title is required",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-role">
        <DialogHeader>
          <DialogTitle>Edit Employment Role</DialogTitle>
          <DialogDescription>
            Update the job title or position details
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title *</Label>
              <Input
                id="edit-title"
                placeholder="e.g., Senior Project Manager"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-doa-acronym">DOA Acronym</Label>
              <Input
                id="edit-doa-acronym"
                placeholder="e.g., SPM (Delegation of Authority)"
                value={doaAcronym}
                onChange={(e) => setDoaAcronym(e.target.value.toUpperCase())}
                className="font-mono"
                data-testid="input-edit-doa-acronym"
              />
              <p className="text-xs text-muted-foreground">
                Used for approvals and delegation workflows
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Optional description of this role"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                data-testid="input-edit-description"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
                data-testid="checkbox-is-active"
              />
              <Label htmlFor="edit-active" className="cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
              {updateMutation.isPending ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateRoleButton({ role }: { role: EmploymentRole }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/employment-roles/${role.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employment-roles"] });
      toast({ title: "Employment role deactivated" });
      setConfirmOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to deactivate role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setConfirmOpen(true)}
        data-testid={`button-deactivate-${role.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="dialog-confirm-deactivate">
          <DialogHeader>
            <DialogTitle>Deactivate Employment Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate "{role.title}"? This will hide it from selection but preserve historical data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              data-testid="button-confirm-deactivate"
            >
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
