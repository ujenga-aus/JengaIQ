import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2 } from "lucide-react";
import type { BusinessUnit } from "@shared/schema";
import { useTerminology } from "@/contexts/TerminologyContext";
import ContractTemplates from "./ContractTemplates";
import Projects from "./Projects";

type BusinessUnitWithCompany = BusinessUnit & { companyName: string };

export default function BusinessUnitDetail() {
  const { id } = useParams();
  const { terminology } = useTerminology();

  const { data: businessUnit, isLoading } = useQuery<BusinessUnitWithCompany>({
    queryKey: ["/api/business-units", id],
    queryFn: async () => {
      const response = await fetch(`/api/business-units/${id}`);
      if (!response.ok) throw new Error("Failed to fetch business unit");
      return response.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading business unit details...</p>
        </div>
      </div>
    );
  }

  if (!businessUnit) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Business unit not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/companies/${businessUnit.companyId}`}>
          <Button variant="ghost" size="icon" data-testid="button-back-to-company">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            <h1 data-testid="text-bu-name">{businessUnit.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {businessUnit.companyName} • {terminology.businessUnit} details
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-bu-overview">Overview</TabsTrigger>
          <TabsTrigger value="projects" data-testid="tab-bu-projects">Projects</TabsTrigger>
          <TabsTrigger value="contract-templates" data-testid="tab-contract-templates">Contract Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">{terminology.businessUnit} Information</h3>
                    <div className="space-y-2 text-sm">
                      {businessUnit.abn && (
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-muted-foreground">ABN:</span>
                          <span className="col-span-2" data-testid="text-bu-abn">{businessUnit.abn}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-muted-foreground">Company:</span>
                        <span className="col-span-2" data-testid="text-bu-company">{businessUnit.companyName}</span>
                      </div>
                    </div>
                  </div>

                  {businessUnit.notes && (
                    <div>
                      <h3 className="font-semibold mb-2">Notes</h3>
                      <p className="text-sm text-muted-foreground" data-testid="text-bu-notes">
                        {businessUnit.notes}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projects">
          <Projects businessUnitId={id} hideHeader={true} />
        </TabsContent>

        <TabsContent value="contract-templates">
          <ContractTemplates businessUnitId={id} hideHeader={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
