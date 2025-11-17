import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, RefreshCw, MessageSquare } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CellChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisionId: string;
  cellId: string;
  rowIndex: number;
  columnName: string;
  currentValue: string;
  onValueUpdate?: (newValue: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export function CellChatDialog({
  open,
  onOpenChange,
  revisionId,
  cellId,
  rowIndex,
  columnName,
  currentValue,
  onValueUpdate,
}: CellChatDialogProps) {
  const [inputMessage, setInputMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Fetch chat messages for this cell
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ['/api/contract-review/cells', cellId, 'chat-messages'],
    enabled: open && !!cellId,
    refetchOnWindowFocus: false,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest('POST', `/api/contract-review/cells/${cellId}/chat-messages`, { content });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/contract-review/cells', cellId, 'chat-messages'] 
      });
      setInputMessage("");
      // Restore focus to textarea after message is sent
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update cell value based on chat
  const updateCellMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/contract-review/cells/${cellId}/update-from-chat`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (onValueUpdate && data.updatedValue) {
        onValueUpdate(data.updatedValue);
      }
      toast({
        title: "Analysis updated",
        description: "The cell value has been updated based on the conversation.",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update analysis",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    const trimmed = inputMessage.trim();
    if (!trimmed || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(trimmed);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Row {rowIndex + 1} - {columnName}
          </DialogTitle>
          <DialogDescription>
            Ask questions about the AI analysis for this cell
          </DialogDescription>
        </DialogHeader>

        {/* Current cell value */}
        <div className="border rounded-md p-3 bg-muted/50">
          <p className="text-xs text-muted-foreground mb-1">Current Analysis:</p>
          <p className="text-sm whitespace-pre-wrap">{currentValue || '(Empty)'}</p>
        </div>

        {/* Chat messages */}
        <div className="flex-1 min-h-0 border rounded-md">
          <ScrollArea className="h-full p-4" ref={scrollRef}>
            {isLoadingMessages ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No messages yet. Ask a question to refine the AI analysis.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={message.role === 'user' ? 'outline' : 'secondary'} className="text-xs">
                          {message.role === 'user' ? 'You' : 'AI Assistant'}
                        </Badge>
                        <span className="text-xs opacity-70">
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
                {sendMessageMutation.isPending && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Input area */}
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Ask a question about this analysis..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            rows={2}
            disabled={sendMessageMutation.isPending}
            className="resize-none"
            data-testid="input-chat-message"
          />
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || sendMessageMutation.isPending}
              size="icon"
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => updateCellMutation.mutate()}
              disabled={updateCellMutation.isPending || messages.length === 0}
              variant="outline"
              size="icon"
              title="Update analysis based on conversation"
              data-testid="button-update-analysis"
            >
              {updateCellMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line. Click <RefreshCw className="inline h-3 w-3" /> to update the cell value based on this conversation.
        </p>
      </DialogContent>
    </Dialog>
  );
}
