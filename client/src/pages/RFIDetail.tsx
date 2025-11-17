import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RFIStatusBadge } from "@/components/RFIStatusBadge";
import { RFIComment } from "@/components/RFIComment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Paperclip, Send } from "lucide-react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { RFI, RFICommentWithAuthor } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/dateFormat";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/api/queryKeys";
import { useCreateRFIComment } from "@/api/mutations";

export default function RFIDetail() {
  const { id: rfiId } = useParams<{ id: string }>();
  const [newComment, setNewComment] = useState("");
  const { toast } = useToast();
  const { currentUser } = useAuth();

  // Fetch RFI data
  const { data: rfi, isLoading: rfiLoading } = useQuery<RFI>({
    queryKey: queryKeys.rfi(rfiId || ''),
    enabled: !!rfiId,
  });

  // Fetch RFI comments with author data
  const { data: comments = [], isLoading: commentsLoading } = useQuery<RFICommentWithAuthor[]>({
    queryKey: queryKeys.rfiComments(rfiId || ''),
    enabled: !!rfiId,
  });

  // Post new comment mutation with comprehensive invalidation
  const postCommentMutation = useCreateRFIComment(rfiId || '', rfi?.projectId);
  
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

  if (rfiLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!rfi) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div>
          <Link href="/rfis">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-to-rfis">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to RFIs
            </Button>
          </Link>
          <p className="text-muted-foreground">RFI not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/rfis">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-to-rfis">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to RFIs
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-2xl font-bold" data-testid="text-rfi-number">{rfi.rfiNumber}</p>
            <h1 className="mt-2" data-testid="text-rfi-title">{rfi.title}</h1>
          </div>
          <RFIStatusBadge status={rfi.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm" data-testid="text-rfi-description">
                {rfi.description || "No description provided"}
              </p>
              <div className="flex flex-wrap gap-2">
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Discussion Thread</CardTitle>
              <span className="text-sm text-muted-foreground" data-testid="text-comment-count">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </span>
            </CardHeader>
            <CardContent className="space-y-6">
              {commentsLoading ? (
                <div className="space-y-4">
                  <div className="h-20 bg-muted animate-pulse rounded" />
                  <div className="h-20 bg-muted animate-pulse rounded" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-comments">
                  No comments yet. Be the first to comment!
                </p>
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

              <div className="space-y-3 pt-4 border-t">
                <Textarea 
                  placeholder="Add a comment..." 
                  rows={3}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  data-testid="textarea-add-comment"
                />
                <div className="flex justify-between items-center gap-2">
                  <Button variant="ghost" size="sm" data-testid="button-attach-file">
                    <Paperclip className="h-4 w-4 mr-2" />
                    Attach file
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handlePostComment}
                    disabled={!newComment.trim() || postCommentMutation.isPending}
                    data-testid="button-post-comment"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {postCommentMutation.isPending ? 'Posting...' : 'Post Comment'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">To</p>
                <p className="font-medium" data-testid="text-assigned-to">{rfi.assignedTo || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Raised By</p>
                <p className="font-medium" data-testid="text-raised-by">{rfi.raisedBy}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium" data-testid="text-created-date">{formatDate(rfi.createdAt)}</p>
              </div>
              {rfi.dueDate && (
                <div>
                  <p className="text-muted-foreground">Required Response</p>
                  <p className="font-medium" data-testid="text-due-date">{formatDate(rfi.dueDate)}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Priority</p>
                <p className="font-medium capitalize" data-testid="text-priority">{rfi.priority}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full" data-testid="button-mark-responded">
                Mark as Responded
              </Button>
              <Button variant="outline" className="w-full" data-testid="button-close-rfi">
                Close RFI
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
