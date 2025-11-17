import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Building2, Users, FileText, CheckCircle2, ArrowLeft, Eye, Download, XCircle, Calendar, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EditBusinessUnitDialog } from "@/components/EditBusinessUnitDialog";
import { UploadTemplateDialog } from "@/components/UploadTemplateDialog";
import { DocumentViewer } from "@/components/DocumentViewer";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertBusinessUnitSchema, type InsertBusinessUnit, type BusinessUnit, type Company, type ContractTemplate, type Project } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dateFormat";

function CreateBusinessUnitForm({ companyId, companyName, onSuccess, onCancel }: { 
  companyId: string;
  companyName: string;
  onSuccess: () => void; 
  onCancel: () => void;
}) {
  const { toast } = useToast();

  const form = useForm<InsertBusinessUnit>({
    resolver: zodResolver(insertBusinessUnitSchema),
    defaultValues: {
      companyId,
      name: "",
      abn: "",
      notes: "",
    },
  });

  const createBusinessUnitMutation = useMutation({
    mutationFn: async (data: InsertBusinessUnit) => {
      const response = await fetch("/api/business-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to create business unit");
      }
      return await response.json();
    },
    onSuccess: () => {
      // Invalidate all business-units queries regardless of company filter
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && query.queryKey[0] === "/api/business-units"
      });
      toast({
        title: "Business unit created",
        description: "The business unit has been created successfully.",
      });
      form.reset();
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create business unit. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: InsertBusinessUnit) => {
    createBusinessUnitMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md border">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Adding to Company</p>
            <p className="text-sm text-muted-foreground truncate" data-testid="text-selected-company-name">
              {companyName}
            </p>
          </div>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Business Unit Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., Construction Division" data-testid="input-bu-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="abn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ABN or Unique Number</FormLabel>
              <FormControl>
                <Input {...field} value={field.value || ""} placeholder="e.g., 12 345 678 901" data-testid="input-bu-abn" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea 
                  {...field}
                  value={field.value || ""}
                  placeholder="Description or notes about this business unit..." 
                  rows={3}
                  data-testid="textarea-bu-notes"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-bu">
            Cancel
          </Button>
          <Button type="submit" disabled={createBusinessUnitMutation.isPending} data-testid="button-submit-bu">
            {createBusinessUnitMutation.isPending ? "Creating..." : "Create Business Unit"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function CreateBusinessUnitDialog({ companyId, companyName }: { companyId: string | null; companyName: string | null }) {
  const [open, setOpen] = useState(false);

  if (!companyId || !companyName) {
    return (
      <Button disabled data-testid="button-create-business-unit">
        <Plus className="h-4 w-4 mr-2" />
        New Business Unit
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-business-unit">
          <Plus className="h-4 w-4 mr-2" />
          New Business Unit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Business Unit</DialogTitle>
        </DialogHeader>
        <CreateBusinessUnitForm 
          companyId={companyId}
          companyName={companyName}
          onSuccess={() => setOpen(false)} 
          onCancel={() => setOpen(false)} 
        />
      </DialogContent>
    </Dialog>
  );
}

export default function BusinessUnits({ companyId, hideHeader = false }: { companyId?: string; hideHeader?: boolean } = {}) {
  const { terminology } = useTerminology();
  const { selectedCompany } = useCompany();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Use provided companyId prop or fall back to selectedCompany from context
  const effectiveCompanyId = companyId || selectedCompany?.id;
  
  // Fetch company data if companyId is provided as prop (for use in tabs)
  const { data: propCompany } = useQuery<Company>({
    queryKey: ["/api/companies", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const response = await fetch(`/api/companies/${companyId}`);
      if (!response.ok) throw new Error('Failed to fetch company');
      return response.json();
    },
    enabled: !!companyId,
  });
  
  // Use prop company if available, otherwise use selected company from context
  const displayCompany = propCompany || selectedCompany;
  
  const { data: businessUnits, isLoading: isLoadingBusinessUnits } = useQuery<BusinessUnit[]>({
    queryKey: ["/api/business-units", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const response = await fetch(`/api/business-units?companyId=${effectiveCompanyId}`);
      if (!response.ok) throw new Error('Failed to fetch business units');
      return response.json();
    },
  });

  // Fetch all templates to check active status for each BU
  const { data: allTemplates } = useQuery<ContractTemplate[]>({
    queryKey: ['/api/templates/all'],
    queryFn: async () => {
      if (!businessUnits) return [];
      const templatePromises = businessUnits.map(bu =>
        fetch(`/api/business-units/${bu.id}/templates`).then(res => res.json())
      );
      const templatesArrays = await Promise.all(templatePromises);
      return templatesArrays.flat();
    },
    enabled: !!businessUnits && businessUnits.length > 0,
  });

  const hasActiveTemplate = (buId: string) => {
    return allTemplates?.some(t => t.businessUnitId === buId && t.isActive) || false;
  };

  
  const { toast } = useToast();
  
  const filteredBusinessUnits = businessUnits?.filter((bu) => {
    const matchesCompany = !displayCompany || bu.companyId === displayCompany.id;
    const matchesSearch = bu.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bu.abn && bu.abn.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (bu.notes && bu.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCompany && matchesSearch;
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {!hideHeader && (
          <div>
            <h1>{terminology.businessUnit}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {displayCompany ? `${terminology.businessUnit} for ${displayCompany.name}` : `Select a company to view ${terminology.businessUnit.toLowerCase()}`}
            </p>
          </div>
        )}
        <div className={hideHeader ? "ml-auto" : ""}>
          <CreateBusinessUnitDialog 
            companyId={displayCompany?.id || null}
            companyName={displayCompany?.name || null}
          />
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search business units..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="input-search-business-units"
        />
      </div>

      {isLoadingBusinessUnits ? (
        <div className="text-center py-12 text-muted-foreground">Loading business units...</div>
      ) : filteredBusinessUnits.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBusinessUnits.map((bu) => (
            <Card 
              key={bu.id} 
              className="hover-elevate active-elevate-2" 
              data-testid={`card-bu-${bu.id}`}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                <div 
                  className="flex items-start gap-3 flex-1 cursor-pointer"
                  onClick={() => navigate(`/business-units/${bu.id}`)}
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-base leading-tight">{bu.name}</h3>
                    <p className="text-sm text-muted-foreground font-mono">{bu.abn || "N/A"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className={`h-3 w-3 rounded-full ${
                      hasActiveTemplate(bu.id) 
                        ? 'bg-green-500' 
                        : 'bg-red-500'
                    }`}
                    data-testid={`indicator-template-${bu.id}`}
                    title={hasActiveTemplate(bu.id) ? 'Active template' : 'No active template'}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p 
                  className="text-sm text-muted-foreground cursor-pointer"
                  onClick={() => navigate(`/business-units/${bu.id}`)}
                >
                  {bu.notes || "No notes"}
                </p>
                <div className="flex items-center justify-end gap-4 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                  <EditBusinessUnitDialog
                    id={bu.id}
                    name={bu.name}
                    abn={bu.abn || ""}
                    notes={bu.notes || ""}
                    companyId={bu.companyId}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No business units found. {searchQuery ? "Try a different search." : "Click 'New Business Unit' to create one."}
        </div>
      )}
    </div>
  );
}
