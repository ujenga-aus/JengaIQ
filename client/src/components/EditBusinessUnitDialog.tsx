import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Building2, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertBusinessUnitSchema, type Company, type Project } from "@shared/schema";
import { z } from "zod";
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

interface EditBusinessUnitDialogProps {
  id: string;
  name: string;
  abn: string;
  notes: string;
  companyId?: string;
}

const editBusinessUnitSchema = insertBusinessUnitSchema.pick({
  name: true,
  abn: true,
  notes: true,
});

type EditBusinessUnitFormValues = z.infer<typeof editBusinessUnitSchema>;

export function EditBusinessUnitDialog({ id, name, abn, notes, companyId }: EditBusinessUnitDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: company } = useQuery<Company>({
    queryKey: ["/api/companies", companyId],
    enabled: open && !!companyId,
  });

  // Fetch projects for this business unit to check if deletion is allowed
  const { data: buProjects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects/business-unit", id],
    queryFn: async () => {
      const response = await fetch(`/api/projects?businessUnitId=${id}`);
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    },
    enabled: open,
  });

  const form = useForm<EditBusinessUnitFormValues>({
    resolver: zodResolver(editBusinessUnitSchema),
    defaultValues: {
      name: name || "",
      abn: abn || "",
      notes: notes || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EditBusinessUnitFormValues) => {
      return await apiRequest("PATCH", `/api/business-units/${id}`, data);
    },
    onSuccess: () => {
      // Invalidate all business-units queries regardless of company filter
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && query.queryKey[0] === "/api/business-units"
      });
      toast({
        title: "Success",
        description: "Business unit updated successfully",
      });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update business unit",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/business-units/${id}`);
    },
    onSuccess: () => {
      // Invalidate all business-units queries
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && query.queryKey[0] === "/api/business-units"
      });
      toast({
        title: "Success",
        description: "Business unit deleted successfully",
      });
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete business unit",
        variant: "destructive",
      });
    },
  });

  function onSubmit(data: EditBusinessUnitFormValues) {
    updateMutation.mutate(data);
  }

  function onDelete() {
    deleteMutation.mutate();
  }

  const hasProjects = buProjects.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-edit-bu-${id}`}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Business Unit</DialogTitle>
        </DialogHeader>
        
        {company && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md border">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Parent Company</p>
              <p className="text-sm text-muted-foreground truncate" data-testid="text-parent-company-name">
                {company.name}
              </p>
            </div>
          </div>
        )}
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Unit Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid={`input-edit-bu-name-${id}`} />
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
                    <Input {...field} value={field.value || ""} data-testid={`input-edit-bu-abn-${id}`} />
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
                    <Textarea {...field} value={field.value || ""} rows={3} data-testid={`textarea-edit-bu-notes-${id}`} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-between pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    type="button" 
                    variant="destructive" 
                    disabled={hasProjects}
                    data-testid={`button-delete-bu-${id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Business Unit</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{name}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid={`button-cancel-delete-bu-${id}`}>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={onDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid={`button-confirm-delete-bu-${id}`}
                    >
                      {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid={`button-cancel-edit-bu-${id}`}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid={`button-save-bu-${id}`}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
            {hasProjects && (
              <p className="text-sm text-muted-foreground text-center pt-2">
                Cannot delete: This business unit has {buProjects.length} project{buProjects.length !== 1 ? 's' : ''} assigned.
              </p>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
