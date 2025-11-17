import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamMembersList } from "./TeamMembersList";

interface TeamMembersDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamMembersDialog({ projectId, projectName, open, onOpenChange }: TeamMembersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-team-members">
        <DialogHeader>
          <DialogTitle>Team Members - {projectName}</DialogTitle>
        </DialogHeader>
        <TeamMembersList projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
