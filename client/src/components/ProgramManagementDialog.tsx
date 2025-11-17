import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings2, Trash2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Program {
  id: string;
  projectId: string;
  name: string;
  fileKey: string;
  fileSize: number;
  dataDate: string | null;
  isContractBaseline: boolean;
  isBaselineApproved: boolean;
  comments: string | null;
  xerData: any;
  uploadedByUserId: string;
  uploadedAt: string;
}

interface ProgramManagementDialogProps {
  projectId: string;
  programs: Program[];
}

export function ProgramManagementDialog({ projectId, programs }: ProgramManagementDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editComments, setEditComments] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);

  // Update program mutation
  const updateProgramMutation = useMutation({
    mutationFn: async ({ programId, data }: { programId: string; data: any }) => {
      return apiRequest('PATCH', `/api/programs/${programId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'programs'] });
      toast({ title: 'Success', description: 'Program updated successfully' });
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Delete program mutation
  const deleteProgramMutation = useMutation({
    mutationFn: async (programId: string) => {
      return apiRequest('DELETE', `/api/programs/${programId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'programs'] });
      toast({ title: 'Success', description: 'Program deleted successfully' });
      setDeleteDialogOpen(false);
      setProgramToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const handleToggleContractBaseline = (program: Program) => {
    updateProgramMutation.mutate({
      programId: program.id,
      data: { isContractBaseline: !program.isContractBaseline }
    });
  };

  const handleToggleBaselineApproved = (program: Program) => {
    updateProgramMutation.mutate({
      programId: program.id,
      data: { isBaselineApproved: !program.isBaselineApproved }
    });
  };

  const handleSaveComments = (programId: string) => {
    updateProgramMutation.mutate({
      programId,
      data: { comments: editComments }
    });
  };

  const handleDeleteClick = (program: Program) => {
    setProgramToDelete(program);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (programToDelete) {
      deleteProgramMutation.mutate(programToDelete.id);
    }
  };

  // Sort programs by data date (newest first)
  const sortedPrograms = [...programs].sort((a, b) => {
    if (!a.dataDate && !b.dataDate) return 0;
    if (!a.dataDate) return 1;
    if (!b.dataDate) return -1;
    return new Date(b.dataDate).getTime() - new Date(a.dataDate).getTime();
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" data-testid="button-manage-programs">
            <Settings2 className="h-4 w-4 mr-2" />
            Manage Programs
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Programs</DialogTitle>
            <DialogDescription>
              View and manage all programs for this project, sorted by data date
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {sortedPrograms.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No programs uploaded yet
              </p>
            ) : (
              sortedPrograms.map((program) => (
                <div key={program.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{program.name}</h4>
                        {program.isContractBaseline && (
                          <Badge variant="default">Contract Baseline</Badge>
                        )}
                        {program.isBaselineApproved && !program.isContractBaseline && (
                          <Badge variant="secondary">Baseline Approved</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>Data Date: {program.dataDate || 'Not available'}</div>
                        <div>Uploaded: {new Date(program.uploadedAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(program)}
                      data-testid={`button-delete-program-${program.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={program.isContractBaseline ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleToggleContractBaseline(program)}
                      disabled={updateProgramMutation.isPending}
                      data-testid={`button-toggle-contract-baseline-${program.id}`}
                    >
                      {program.isContractBaseline ? 'Contract Baseline' : 'Set as Contract Baseline'}
                    </Button>
                    <Button
                      variant={program.isBaselineApproved ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => handleToggleBaselineApproved(program)}
                      disabled={updateProgramMutation.isPending}
                      data-testid={`button-toggle-baseline-approved-${program.id}`}
                    >
                      {program.isBaselineApproved ? 'Baseline Approved' : 'Approve as Baseline'}
                    </Button>
                  </div>

                  <div>
                    <Label>Comments</Label>
                    {editingId === program.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editComments}
                          onChange={(e) => setEditComments(e.target.value)}
                          placeholder="Add notes about this program"
                          data-testid={`textarea-edit-comments-${program.id}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveComments(program.id)}
                            disabled={updateProgramMutation.isPending}
                            data-testid={`button-save-comments-${program.id}`}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                            data-testid={`button-cancel-comments-${program.id}`}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="text-sm p-2 bg-muted rounded cursor-pointer hover-elevate"
                        onClick={() => {
                          setEditingId(program.id);
                          setEditComments(program.comments || '');
                        }}
                        data-testid={`div-comments-${program.id}`}
                      >
                        {program.comments || 'Click to add comments...'}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Program</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{programToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
