import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { EmploymentRole, Role } from "@shared/schema";
import { queryKeys } from "@/api/queryKeys";
import { useCreateUser } from "@/api/mutations";

export function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [mobile, setMobile] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedEmploymentRole, setSelectedEmploymentRole] = useState("");
  const [employmentStartDate, setEmploymentStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { toast } = useToast();

  // Hardcoded company ID (will be from context in future)
  const COMPANY_ID = "ffc7b9fa-339c-4b12-97c5-39160cfc89ad";

  // Fetch global roles (ADMIN, BUM, EMPLOYEE)
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: queryKeys.roles(),
    enabled: open,
  });

  // Fetch employment roles (job titles)
  const { data: employmentRoles = [] } = useQuery<EmploymentRole[]>({
    queryKey: queryKeys.employmentRoles(),
    queryFn: async () => {
      const response = await fetch(`/api/employment-roles?companyId=${COMPANY_ID}`);
      return response.json();
    },
    enabled: open,
  });

  // Use centralized mutation with comprehensive cache invalidation
  const createUserMutation = useCreateUser();

  const handleCreateUser = () => {
    createUserMutation.mutate(
      {
        givenName,
        familyName,
        email,
        username,
        password,
        mobile: mobile || undefined,
        employeeNo: employeeNo || undefined,
        roleCode: selectedRole || undefined,
        employmentRoleId: selectedEmploymentRole || undefined,
        employmentStartDate,
      },
      {
        onSuccess: () => {
          toast({
            title: "User created successfully",
            description: `${givenName} ${familyName} has been added to the system.`,
          });
          // Reset form
          setGivenName("");
          setFamilyName("");
          setEmail("");
          setUsername("");
          setMobile("");
          setEmployeeNo("");
          setPassword("");
          setSelectedRole("");
          setSelectedEmploymentRole("");
          setEmploymentStartDate(format(new Date(), "yyyy-MM-dd"));
          setOpen(false);
        },
        onError: (error: any) => {
          toast({
            title: "Failed to create user",
            description: error.message || "An error occurred while creating the user.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!givenName || !familyName || !email || !username || !password) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    handleCreateUser();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-user">
          <UserPlus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Create a new user account with company role and employment position
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="given-name">Given Name *</Label>
                <Input
                  id="given-name"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                  placeholder="John"
                  data-testid="input-given-name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="family-name">Family Name *</Label>
                <Input
                  id="family-name"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="Smith"
                  data-testid="input-family-name"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.smith@example.com"
                  data-testid="input-email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="john.smith"
                  data-testid="input-username"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile</Label>
                <Input
                  id="mobile"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+1-555-0123"
                  data-testid="input-mobile"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-no">Employee Number</Label>
                <Input
                  id="employee-no"
                  value={employeeNo}
                  onChange={(e) => setEmployeeNo(e.target.value)}
                  placeholder="EMP001"
                  data-testid="input-employee-no"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="input-password"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="global-role">Company Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger id="global-role" data-testid="select-global-role">
                    <SelectValue placeholder="Select company role (optional)" />
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
              <div className="space-y-2">
                <Label htmlFor="employment-role">Employment Role (Job Title)</Label>
                <Select value={selectedEmploymentRole} onValueChange={setSelectedEmploymentRole}>
                  <SelectTrigger id="employment-role" data-testid="select-employment-role">
                    <SelectValue placeholder="Select job title (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {employmentRoles.filter(r => r.isActive).map((role) => (
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
            </div>

            {selectedEmploymentRole && (
              <div className="space-y-2">
                <Label htmlFor="employment-start-date">Employment Start Date</Label>
                <Input
                  id="employment-start-date"
                  type="date"
                  value={employmentStartDate}
                  onChange={(e) => setEmploymentStartDate(e.target.value)}
                  data-testid="input-employment-start-date"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)} 
              data-testid="button-cancel-user"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createUserMutation.isPending}
              data-testid="button-submit-user"
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
