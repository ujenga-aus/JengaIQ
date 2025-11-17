import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface BOQSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

type EventTagStatus = {
  id: string;
  projectId: string;
  name: string;
  sortingIndex: number;
};

type PricingBasis = {
  id: string;
  projectId: string;
  name: string;
  sortingIndex: number;
};

export function BOQSettingsDialog({ open, onOpenChange, projectId }: BOQSettingsDialogProps) {
  const { toast } = useToast();

  // Fetch event tag statuses
  const { data: statuses, isLoading: isLoadingStatuses } = useQuery<EventTagStatus[]>({
    queryKey: ["/api/projects", projectId, "boq", "event-tag-statuses"],
    enabled: open && !!projectId,
  });

  // Fetch pricing basis
  const { data: pricingBasis, isLoading: isLoadingPricing } = useQuery<PricingBasis[]>({
    queryKey: ["/api/projects", projectId, "boq", "pricing-basis"],
    enabled: open && !!projectId,
  });

  // Seed event tag statuses mutation
  const seedStatusesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        `/api/projects/${projectId}/boq/event-tag-statuses/seed`,
        {}
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "boq", "event-tag-statuses"],
      });
      toast({
        title: "Statuses seeded",
        description: "Base event tag statuses have been added.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to seed event tag statuses.",
        variant: "destructive",
      });
    },
  });

  // Seed pricing basis mutation
  const seedPricingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        `/api/projects/${projectId}/boq/pricing-basis/seed`,
        {}
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "boq", "pricing-basis"],
      });
      toast({
        title: "Pricing basis seeded",
        description: "Base pricing basis options have been added.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to seed pricing basis.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-boq-settings">
        <DialogHeader>
          <DialogTitle>BOQ Settings</DialogTitle>
          <DialogDescription>
            Configure BOQ settings and seed base data for this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event Tag Statuses */}
          <Card>
            <CardHeader>
              <CardTitle>Event Tag Statuses</CardTitle>
              <CardDescription>
                Manage status options for project events (e.g., Identified, Submitted, Approved)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingStatuses ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : statuses && statuses.length > 0 ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Current statuses ({statuses.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {statuses.map((status) => (
                      <div
                        key={status.id}
                        className="px-3 py-1 bg-muted text-sm rounded-md"
                      >
                        {status.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    No statuses configured yet. Seed base statuses to get started.
                  </p>
                  <Button
                    onClick={() => seedStatusesMutation.mutate()}
                    disabled={seedStatusesMutation.isPending}
                    data-testid="button-seed-statuses"
                  >
                    {seedStatusesMutation.isPending ? "Seeding..." : "Seed Base Statuses"}
                  </Button>
                </div>
              )}

              {statuses && statuses.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => seedStatusesMutation.mutate()}
                  disabled={seedStatusesMutation.isPending}
                  data-testid="button-reseed-statuses"
                >
                  {seedStatusesMutation.isPending ? "Seeding..." : "Add More Base Statuses"}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Pricing Basis */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing Basis</CardTitle>
              <CardDescription>
                Manage pricing basis options for project items (e.g., Lump Sum, Rates, Cost Plus)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingPricing ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : pricingBasis && pricingBasis.length > 0 ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Current pricing basis ({pricingBasis.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pricingBasis.map((pricing) => (
                      <div
                        key={pricing.id}
                        className="px-3 py-1 bg-muted text-sm rounded-md"
                      >
                        {pricing.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    No pricing basis configured yet. Seed base options to get started.
                  </p>
                  <Button
                    onClick={() => seedPricingMutation.mutate()}
                    disabled={seedPricingMutation.isPending}
                    data-testid="button-seed-pricing"
                  >
                    {seedPricingMutation.isPending ? "Seeding..." : "Seed Base Pricing Basis"}
                  </Button>
                </div>
              )}

              {pricingBasis && pricingBasis.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => seedPricingMutation.mutate()}
                  disabled={seedPricingMutation.isPending}
                  data-testid="button-reseed-pricing"
                >
                  {seedPricingMutation.isPending ? "Seeding..." : "Add More Base Pricing Options"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-close-boq-settings"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
