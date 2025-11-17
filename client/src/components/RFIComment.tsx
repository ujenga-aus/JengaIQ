import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Reply, Paperclip } from "lucide-react";

interface RFICommentProps {
  id: string;
  author: string;
  authorInitials: string;
  timestamp: string;
  content: string;
  attachments?: { name: string; url: string }[];
  isReply?: boolean;
}

export function RFIComment({
  id,
  author,
  authorInitials,
  timestamp,
  content,
  attachments,
  isReply,
}: RFICommentProps) {
  return (
    <div className={`flex gap-3 ${isReply ? 'pl-12' : ''}`} data-testid={`comment-${id}`}>
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-primary/10 text-primary font-medium">
          {authorInitials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{author}</span>
          <span className="text-xs text-muted-foreground">{timestamp}</span>
        </div>
        <p className="text-sm">{content}</p>
        {attachments && attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map((attachment, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                <span>{attachment.name}</span>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => console.log(`Reply to comment ${id}`)}
          data-testid={`button-reply-${id}`}
        >
          <Reply className="h-3 w-3 mr-1" />
          Reply
        </Button>
      </div>
    </div>
  );
}
