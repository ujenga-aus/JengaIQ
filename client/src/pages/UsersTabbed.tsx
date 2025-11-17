import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Users from "./Users";
import EmploymentRoles from "./EmploymentRoles";
import ProjectAssignments from "./ProjectAssignments";

export default function UsersTabbed({ defaultTab = "users" }: { defaultTab?: string } = {}) {
  return (
    <div className="space-y-6">
      <div>
        <h1>Users</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage users, employment roles, and project assignments</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="employment-roles" data-testid="tab-employment-roles">Employment Roles</TabsTrigger>
          <TabsTrigger value="project-assignments" data-testid="tab-project-assignments">Project Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          <Users hideHeader={true} />
        </TabsContent>

        <TabsContent value="employment-roles" className="space-y-6">
          <EmploymentRoles hideHeader={true} />
        </TabsContent>

        <TabsContent value="project-assignments" className="space-y-6">
          <ProjectAssignments hideHeader={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
