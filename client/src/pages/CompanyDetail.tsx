import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2 } from "lucide-react";
import { Link } from "wouter";
import type { Company } from "@shared/schema";
import CompanySettings from "./CompanySettings";
import BusinessUnits from "./BusinessUnits";
import Users from "./Users";
import EmploymentRoles from "./EmploymentRoles";
import ProjectAssignments from "./ProjectAssignments";
import { EditCompanyDialog } from "@/components/EditCompanyDialog";
import { useTerminology } from "@/contexts/TerminologyContext";

type CompanyWithCount = Company & { businessUnitCount: number };

export default function CompanyDetail() {
  const { id } = useParams();
  const { terminology } = useTerminology();

  const { data: company, isLoading } = useQuery<CompanyWithCount>({
    queryKey: ["/api/companies", id],
    queryFn: async () => {
      const response = await fetch(`/api/companies/${id}`);
      if (!response.ok) throw new Error("Failed to fetch company");
      return response.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading company details...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Company not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/companies">
          <Button variant="ghost" size="icon" data-testid="button-back-to-companies">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            <h1 data-testid="text-company-name">{company.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Company details and settings</p>
        </div>
        <EditCompanyDialog company={company} />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-company-overview">Overview</TabsTrigger>
          <TabsTrigger value="business-units" data-testid="tab-business-units">{terminology.businessUnit}</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="employment-roles" data-testid="tab-employment-roles">Employment Roles</TabsTrigger>
          <TabsTrigger value="project-assignments" data-testid="tab-project-assignments">Project Assignments</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-company-settings">Company Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">Company Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-muted-foreground">Business Units:</span>
                        <span className="col-span-2 font-medium" data-testid="text-bu-count">
                          {company.businessUnitCount}
                        </span>
                      </div>
                      {company.abn && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-muted-foreground">ABN:</span>
                          <span className="col-span-2" data-testid="text-company-abn">{company.abn}</span>
                        </div>
                      )}
                      {company.address && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-muted-foreground">Address:</span>
                          <span className="col-span-2" data-testid="text-company-address">{company.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {(company.contactEmail || company.contactPhone) && (
                    <div>
                      <h3 className="font-semibold mb-2">Contact Information</h3>
                      <div className="space-y-2 text-sm">
                        {company.contactEmail && (
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-muted-foreground">Email:</span>
                            <span className="col-span-2" data-testid="text-company-email">{company.contactEmail}</span>
                          </div>
                        )}
                        {company.contactPhone && (
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-muted-foreground">Phone:</span>
                            <span className="col-span-2" data-testid="text-company-phone">{company.contactPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {company.notes && (
                    <div>
                      <h3 className="font-semibold mb-2">Notes</h3>
                      <p className="text-sm text-muted-foreground" data-testid="text-company-notes">
                        {company.notes}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="business-units">
          <BusinessUnits companyId={id} hideHeader={true} />
        </TabsContent>

        <TabsContent value="users">
          <Users companyId={id} hideHeader={true} />
        </TabsContent>

        <TabsContent value="employment-roles">
          <EmploymentRoles companyId={id} hideHeader={true} />
        </TabsContent>

        <TabsContent value="project-assignments">
          <ProjectAssignments companyId={id} hideHeader={true} />
        </TabsContent>

        <TabsContent value="settings">
          <CompanySettings hideHeader={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
