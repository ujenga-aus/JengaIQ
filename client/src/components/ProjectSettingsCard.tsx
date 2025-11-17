import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertProjectSchema } from "@shared/schema";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { useUpdateProject } from "@/api/mutations";
import { useToast } from "@/hooks/use-toast";

interface ProjectSettingsCardProps {
  project: Project;
}

const editProjectSchema = insertProjectSchema.partial().extend({
  projectCode: z.string().min(1, "Project code is required"),
  name: z.string().min(1, "Project name is required"),
  businessUnitId: z.string().min(1, "Business unit is required"),
});

type EditProjectFormData = z.infer<typeof editProjectSchema>;

export function ProjectSettingsCard({ project }: ProjectSettingsCardProps) {
  const { toast } = useToast();
  const updateProjectMutation = useUpdateProject(project.id);

  const { data: businessUnits } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/business-units'],
  });

  const form = useForm<EditProjectFormData>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      projectCode: project?.projectCode ?? "",
      name: project?.name ?? "",
      client: project?.client ?? "",
      location: project?.location ?? "",
      businessUnitId: project?.businessUnitId ?? "",
      status: project?.status ?? "active",
      phase: project?.phase ?? "tender",
      tenderStartDate: project?.tenderStartDate ?? "",
      tenderEndDate: project?.tenderEndDate ?? "",
      deliveryStartDate: project?.deliveryStartDate ?? "",
      deliveryEndDate: project?.deliveryEndDate ?? "",
      defectsPeriodStartDate: project?.defectsPeriodStartDate ?? "",
      defectsPeriodEndDate: project?.defectsPeriodEndDate ?? "",
      closedStartDate: project?.closedStartDate ?? "",
      closedEndDate: project?.closedEndDate ?? "",
    },
  });

  // Reset form when project changes
  useEffect(() => {
    if (project) {
      form.reset({
        projectCode: project.projectCode ?? "",
        name: project.name ?? "",
        client: project.client ?? "",
        location: project.location ?? "",
        businessUnitId: project.businessUnitId ?? "",
        status: project.status ?? "active",
        phase: project.phase ?? "tender",
        tenderStartDate: project.tenderStartDate ?? "",
        tenderEndDate: project.tenderEndDate ?? "",
        deliveryStartDate: project.deliveryStartDate ?? "",
        deliveryEndDate: project.deliveryEndDate ?? "",
        defectsPeriodStartDate: project.defectsPeriodStartDate ?? "",
        defectsPeriodEndDate: project.defectsPeriodEndDate ?? "",
        closedStartDate: project.closedStartDate ?? "",
        closedEndDate: project.closedEndDate ?? "",
      });
    }
  }, [project, form]);

  const onSubmit = async (data: EditProjectFormData) => {
    try {
      await updateProjectMutation.mutateAsync(data);
      toast({
        title: "Success",
        description: "Project updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update project",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Update project information, timeline, and status
        </p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField
                control={form.control}
                name="projectCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Code *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-project-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-project-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="input-edit-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="client"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="input-edit-client" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="businessUnitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Unit *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-business-unit">
                          <SelectValue placeholder="Select business unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {businessUnits?.map((bu) => (
                          <SelectItem key={bu.id} value={bu.id}>
                            {bu.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="onhold">On Hold</SelectItem>
                        <SelectItem value="complete">Complete</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 pt-2">
              <h3 className="font-semibold text-base">Project Timeline</h3>
              
              <div className="grid grid-cols-[200px_1fr_1fr] gap-x-4 gap-y-3 items-end">
                <div></div>
                <div className="font-medium text-sm">Start Date</div>
                <div className="font-medium text-sm">End Date</div>

                <div className="text-sm text-muted-foreground self-center">Tender Phase</div>
                <FormField
                  control={form.control}
                  name="tenderStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-edit-tender-start" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tenderEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-edit-tender-end" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="text-sm text-muted-foreground self-center">Delivery Phase</div>
                <FormField
                  control={form.control}
                  name="deliveryStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-edit-delivery-start" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deliveryEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-edit-delivery-end" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="text-sm text-muted-foreground self-center">Defects Period Phase</div>
                <FormField
                  control={form.control}
                  name="defectsPeriodStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-edit-defects-period-start" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defectsPeriodEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-edit-defects-period-end" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="text-sm text-muted-foreground self-center">Liability Period</div>
                <FormField
                  control={form.control}
                  name="closedStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-edit-closed-start" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="closedEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-edit-closed-end" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button 
                type="submit" 
                disabled={updateProjectMutation.isPending}
                data-testid="button-save-project"
              >
                {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
