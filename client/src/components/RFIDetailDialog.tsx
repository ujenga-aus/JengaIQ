import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RFIStatusBadge } from "@/components/RFIStatusBadge";
import { RFIComment } from "@/components/RFIComment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Paperclip, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { RFI, RFICommentWithAuthor } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/dateFormat";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/api/queryKeys";
import { useCreateRFIComment } from "@/api/mutations";

interface RFIDetailDialogProps {
  rfiId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RFIDetailDialog({ rfiId, open, onOpenChange }: RFIDetailDialogProps) {
  const [newComment, setNewComment] = useState("");
  const { toast } = useToast();
  const { currentUser } = useAuth();

  // Fetch RFI data
  const { data: rfi, isLoading: rfiLoading } = useQuery<RFI>({
    queryKey: queryKeys.rfi(rfiId),
    enabled: !!rfiId && open,
  });

  // Fetch RFI comments with author data
  const { data: comments = [], isLoading: commentsLoading } = useQuery<RFICommentWithAuthor[]>({
    queryKey: queryKeys.rfiComments(rfiId),
    enabled: !!rfiId && open,
  });

  // Post new comment mutation
  const postCommentMutation = useCreateRFIComment(rfiId, rfi?.projectId);
  
  const handlePostComment = () => {
    if (!newComment.trim() || !currentUser || !rfiId) return;
    
    postCommentMutation.mutate(
      {
        userAccountId: currentUser.id,
        content: newComment,
      },
      {
        onSuccess: () => {
          setNewComment("");
          toast({
            title: "Comment posted",
            description: "Your comment has been added successfully.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to post comment. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (!rfi) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loading RFI...</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-rfi-detail">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <DialogTitle className="font-mono text-xl" data-testid="text-rfi-number">{rfi.rfiNumber}</DialogTitle>
              <p className="text-base font-semibold mt-1" data-testid="text-rfi-title">{rfi.title}</p>
            </div>
            <RFIStatusBadge status={rfi.status as any} />
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm" data-testid="text-rfi-description">
                {rfi.description || "No description provided"}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {rfi.priority === "high" && (
                  <Badge variant="destructive">High Priority</Badge>
                )}
                {rfi.priority === "medium" && (
                  <Badge variant="warning">Medium Priority</Badge>
                )}
                {rfi.priority === "low" && (
                  <Badge variant="secondary">Low Priority</Badge>
                )}
                {rfi.isOverdue && (
                  <Badge variant="destructive">Overdue</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Raised By</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium" data-testid="text-rfi-raised-by">{rfi.raisedBy}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Assigned To</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium" data-testid="text-rfi-assigned-to">
                  {rfi.assignedTo || "Unassigned"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Due Date</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium" data-testid="text-rfi-due-date">
                  {rfi.dueDate ? formatDate(rfi.dueDate) : "No due date"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Created</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium" data-testid="text-rfi-created">
                  {formatDate(rfi.createdAt)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Discussion Thread</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {commentsLoading ? (
                <p className="text-sm text-muted-foreground">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment!</p>
              ) : (
                comments.map((comment) => {
                  const fullName = comment.authorName && comment.authorFamilyName 
                    ? `${comment.authorName} ${comment.authorFamilyName}`
                    : comment.authorEmail || "Unknown User";
                  const initials = comment.authorName && comment.authorFamilyName
                    ? `${comment.authorName[0]}${comment.authorFamilyName[0]}`.toUpperCase()
                    : "U";
                  
                  return (
                    <RFIComment
                      key={comment.id}
                      id={comment.id}
                      author={fullName}
                      authorInitials={initials}
                      timestamp={formatDate(comment.createdAt)}
                      content={comment.content}
                      attachments={comment.attachments as { name: string; url: string }[] | undefined}
                    />
                  );
                })
              )}

              {/* Add Comment Form */}
              <div className="space-y-3 pt-4 border-t">
                <Textarea
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="textarea-rfi-comment"
                />
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" data-testid="button-attach-file">
                    <Paperclip className="h-4 w-4 mr-2" />
                    Attach File
                  </Button>
                  <Button 
                    onClick={handlePostComment}
                    disabled={!newComment.trim() || postCommentMutation.isPending}
                    data-testid="button-post-comment"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {postCommentMutation.isPending ? "Posting..." : "Post Comment"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
