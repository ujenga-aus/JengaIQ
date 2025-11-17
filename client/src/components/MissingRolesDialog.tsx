import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface MissingRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingAcronyms: string[];
  companyId: string;
  onRolesCreated: () => void;
  onCancel: () => void;
}

interface RoleFormData {
  acronym: string;
  title: string;
  description: string;
}

export function MissingRolesDialog({
  open,
  onOpenChange,
  missingAcronyms,
  companyId,
  onRolesCreated,
  onCancel,
}: MissingRolesDialogProps) {
  const [roleData, setRoleData] = useState<Record<string, RoleFormData>>(() => {
    const initial: Record<string, RoleFormData> = {};
    missingAcronyms.forEach(acronym => {
      initial[acronym] = {
        acronym,
        title: '',
        description: '',
      };
    });
    return initial;
  });
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const updateRoleField = (acronym: string, field: keyof RoleFormData, value: string) => {
    setRoleData(prev => ({
      ...prev,
      [acronym]: {
        ...prev[acronym],
        [field]: value,
      },
    }));
  };

  const handleCreateRoles = async () => {
    // Validate all roles have titles
    const missingTitles = missingAcronyms.filter(acronym => !roleData[acronym].title.trim());
    if (missingTitles.length > 0) {
      toast({
        title: "Validation error",
        description: "Please provide job titles for all employment roles",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      // Create all roles in parallel
      const createPromises = missingAcronyms.map(acronym => 
        fetch('/api/employment-roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            title: roleData[acronym].title.trim(),
            doaAcronym: acronym,
            description: roleData[acronym].description.trim() || null,
            isActive: true,
          }),
        }).then(res => {
          if (!res.ok) throw new Error('Failed to create employment role');
          return res.json();
        })
      );

      await Promise.all(createPromises);

      // Invalidate employment roles cache
      await queryClient.invalidateQueries({ 
        queryKey: ['/api/employment-roles', companyId] 
      });

      toast({
        title: "Employment roles created",
        description: `Successfully created ${missingAcronyms.length} employment role${missingAcronyms.length > 1 ? 's' : ''}`,
      });

      onRolesCreated();
    } catch (error: any) {
      console.error('Error creating employment roles:', error);
      toast({
        title: "Failed to create roles",
        description: error.message || "An error occurred while creating employment roles",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            Missing Employment Roles
          </DialogTitle>
          <DialogDescription>
            The template contains DOA acronyms that don't exist in your company's employment roles.
            Please create these roles to continue with the import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-warning/10 border border-warning/20 rounded-md">
            <p className="text-sm font-medium">Found {missingAcronyms.length} missing acronym{missingAcronyms.length > 1 ? 's' : ''}:</p>
            <p className="text-sm text-muted-foreground mt-1">
              {missingAcronyms.join(', ')}
            </p>
          </div>

          <div className="space-y-4">
            <Label className="text-base font-semibold">Create Employment Roles</Label>
            
            {missingAcronyms.map((acronym, index) => (
              <div 
                key={acronym} 
                className="p-4 border rounded-md space-y-3"
                data-testid={`missing-role-${index}`}
              >
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-md font-mono font-medium">
                    {acronym}
                  </span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`title-${acronym}`}>
                    Job Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`title-${acronym}`}
                    placeholder="e.g., Project Manager, Senior Engineer"
                    value={roleData[acronym].title}
                    onChange={(e) => updateRoleField(acronym, 'title', e.target.value)}
                    data-testid={`input-title-${index}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`description-${acronym}`}>Description (Optional)</Label>
                  <Textarea
                    id={`description-${acronym}`}
                    placeholder="Describe this role's responsibilities..."
                    value={roleData[acronym].description}
                    onChange={(e) => updateRoleField(acronym, 'description', e.target.value)}
                    rows={2}
                    data-testid={`textarea-description-${index}`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isCreating}
              data-testid="button-cancel-create-roles"
            >
              Cancel Upload
            </Button>
            <Button
              onClick={handleCreateRoles}
              disabled={isCreating}
              data-testid="button-create-roles"
            >
              {isCreating ? 'Creating Roles...' : `Create ${missingAcronyms.length} Role${missingAcronyms.length > 1 ? 's' : ''} & Continue`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
