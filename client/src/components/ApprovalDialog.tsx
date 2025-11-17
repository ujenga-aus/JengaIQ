import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, CheckCircle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisionRowId: string;
  rowIndex: number;
  employmentRoles: any[];
}

export function ApprovalDialog({
  open,
  onOpenChange,
  revisionRowId,
  rowIndex,
  employmentRoles,
}: ApprovalDialogProps) {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [showNewApprovalForm, setShowNewApprovalForm] = useState(false);
  const [newApproval, setNewApproval] = useState({
    comments: "",
    proposedDeparture: "",
  });

  // Fetch approvals for this row
  const { data: approvals = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/contract-review/rows', revisionRowId, 'approvals'],
    enabled: !!revisionRowId && open,
  });

  // Create approval mutation
  const createApprovalMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', `/api/contract-review/rows/${revisionRowId}/approvals`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/contract-review/rows', revisionRowId, 'approvals'] 
      });
      setShowNewApprovalForm(false);
      setNewApproval({
        comments: "",
        proposedDeparture: "",
      });
      toast({
        title: "Proposal created",
        description: "Your proposal has been submitted for DOA review.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create approval entry.",
        variant: "destructive",
      });
    },
  });

  // Update approval mutation
  const updateApprovalMutation = useMutation({
    mutationFn: async ({ approvalId, data }: { approvalId: string; data: any }) => {
      return apiRequest('PATCH', `/api/contract-review/approvals/${approvalId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/contract-review/rows', revisionRowId, 'approvals'] 
      });
      toast({
        title: "Approval updated",
        description: "The approval status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update approval.",
        variant: "destructive",
      });
    },
  });

  // Delete approval mutation
  const deleteApprovalMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      return apiRequest('DELETE', `/api/contract-review/approvals/${approvalId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/contract-review/rows', revisionRowId, 'approvals'] 
      });
      toast({
        title: "Approval deleted",
        description: "The approval entry has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete approval.",
        variant: "destructive",
      });
    },
  });

  const handleCreateApproval = () => {
    createApprovalMutation.mutate({
      ...newApproval,
      createdBy: currentUser?.id || "system",
    });
  };

  const handleApprovalDecision = (approvalId: string, status: string, reviewComments: string) => {
    updateApprovalMutation.mutate({
      approvalId,
      data: {
        status,
        reviewComments,
        reviewedBy: currentUser?.id || "system",
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge variant="success" className="gap-1" data-testid={`badge-approval-approved`}>
            <CheckCircle className="h-3 w-3" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1" data-testid={`badge-approval-rejected`}>
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1" data-testid={`badge-approval-pending`}>
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]" data-testid="dialog-approvals">
        <DialogHeader>
          <DialogTitle>Approvals - Row {rowIndex + 1}</DialogTitle>
          <DialogDescription>
            Manage approval workflow and DOA reviews for this contract row
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {/* Existing Approvals */}
            {approvals.length > 0 && (
              <div className="space-y-3">
                {approvals.map((approval) => (
                  <Card key={approval.id} data-testid={`card-approval-${approval.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(approval.status)}
                            <span className="text-xs text-muted-foreground">
                              {new Date(approval.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          
                          {approval.proposedDeparture && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Proposed Departure</Label>
                              <p className="text-sm" data-testid={`text-approval-departure-${approval.id}`}>
                                {approval.proposedDeparture}
                              </p>
                            </div>
                          )}

                          {approval.comments && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Comments</Label>
                              <p className="text-sm" data-testid={`text-approval-comments-${approval.id}`}>
                                {approval.comments}
                              </p>
                            </div>
                          )}

                          {approval.reviewComments && (
                            <div>
                              <Label className="text-xs text-muted-foreground">DOA Review Comments</Label>
                              <p className="text-sm" data-testid={`text-approval-review-comments-${approval.id}`}>
                                {approval.reviewComments}
                              </p>
                            </div>
                          )}

                          {approval.reviewedBy && approval.reviewedAt && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Reviewed By</Label>
                              <p className="text-xs text-muted-foreground" data-testid={`text-approval-reviewed-by-${approval.id}`}>
                                {approval.reviewedBy} on {new Date(approval.reviewedAt).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>

                        {approval.status === "pending" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const comments = prompt("Enter approval comments:");
                                handleApprovalDecision(approval.id, "approved", comments || "");
                              }}
                              data-testid={`button-approve-${approval.id}`}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                const comments = prompt("Enter rejection reason:");
                                handleApprovalDecision(approval.id, "rejected", comments || "");
                              }}
                              data-testid={`button-reject-${approval.id}`}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(approval.createdAt).toLocaleDateString()} by {approval.createdBy}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteApprovalMutation.mutate(approval.id)}
                          data-testid={`button-delete-approval-${approval.id}`}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {approvals.length === 0 && !showNewApprovalForm && (
              <div className="text-center py-8 text-muted-foreground">
                No approvals for this row yet
              </div>
            )}

            <Separator />

            {/* New Approval Form */}
            {!showNewApprovalForm ? (
              <Button
                onClick={() => setShowNewApprovalForm(true)}
                className="w-full"
                variant="outline"
                data-testid="button-add-approval"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Approval Entry
              </Button>
            ) : (
              <Card data-testid="card-new-approval-form">
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="approval-departure">Proposed Departure</Label>
                    <Textarea
                      id="approval-departure"
                      placeholder="Describe your proposed departure from the contract..."
                      value={newApproval.proposedDeparture}
                      onChange={(e) => setNewApproval({ ...newApproval, proposedDeparture: e.target.value })}
                      data-testid="input-approval-departure"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="approval-comments">Comments</Label>
                    <Textarea
                      id="approval-comments"
                      placeholder="Add any additional comments..."
                      value={newApproval.comments}
                      onChange={(e) => setNewApproval({ ...newApproval, comments: e.target.value })}
                      data-testid="input-approval-comments"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateApproval}
                      disabled={!newApproval.proposedDeparture && !newApproval.comments}
                      data-testid="button-create-approval"
                    >
                      Create Approval
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowNewApprovalForm(false);
                        setNewApproval({
                          comments: "",
                          proposedDeparture: "",
                        });
                      }}
                      data-testid="button-cancel-approval"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
