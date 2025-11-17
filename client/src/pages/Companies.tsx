import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Building2, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Company } from "@shared/schema";
import { CreateCompanyDialog } from "@/components/CreateCompanyDialog";
import { EditCompanyDialog } from "@/components/EditCompanyDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

type CompanyWithCount = Company & { businessUnitCount: number };

export default function Companies(props: { hideHeader?: boolean } = {}) {
  const { hideHeader = false } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: companies, isLoading } = useQuery<CompanyWithCount[]>({
    queryKey: ["/api/companies"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (companyId: string) => {
      return await apiRequest("DELETE", `/api/companies/${companyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: "Success",
        description: "Company deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete company",
        variant: "destructive",
      });
    },
  });

  const filteredCompanies = companies?.filter((company) => {
    const matchesSearch = 
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (company.abn && company.abn.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (company.contactEmail && company.contactEmail.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesSearch;
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {!hideHeader && (
          <div>
            <h1>Companies</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage company information</p>
          </div>
        )}
        <CreateCompanyDialog />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-companies"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading companies...</p>
        </div>
      ) : filteredCompanies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((company) => (
            <div key={company.id} className="relative">
              <Link href={`/companies/${company.id}`}>
                <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer" data-testid={`card-company-${company.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-lg font-semibold line-clamp-1">{company.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Number of Business Units: </span>
                      <span className="font-medium" data-testid={`text-bu-count-${company.id}`}>
                        {company.businessUnitCount}
                      </span>
                    </div>
                    {company.abn && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">ABN: </span>
                        <span data-testid={`text-company-abn-${company.id}`}>{company.abn}</span>
                      </div>
                    )}
                    {company.address && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Address: </span>
                        <span className="line-clamp-2" data-testid={`text-company-address-${company.id}`}>{company.address}</span>
                      </div>
                    )}
                    {company.contactEmail && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Email: </span>
                        <span data-testid={`text-company-email-${company.id}`}>{company.contactEmail}</span>
                      </div>
                    )}
                    {company.contactPhone && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Phone: </span>
                        <span data-testid={`text-company-phone-${company.id}`}>{company.contactPhone}</span>
                      </div>
                    )}
                    {company.notes && (
                      <div className="text-sm pt-2">
                        <p className="text-muted-foreground line-clamp-2" data-testid={`text-company-notes-${company.id}`}>{company.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
              <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                <EditCompanyDialog company={company} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {companies && companies.length > 0 
              ? "No companies match your search criteria." 
              : "No companies yet. Create your first company to get started."}
          </p>
        </div>
      )}
    </div>
  );
}
