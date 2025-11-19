import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, Search, Mail, Paperclip, Clock, CheckCircle2, XCircle, 
  Loader2, FileText, RefreshCw, Download, X, Sparkles, Tag, Plus,
  AlertCircle, Calendar as CalendarIcon, GripHorizontal
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useProject } from "@/contexts/ProjectContext";
import { useThemeSettings } from "@/contexts/ThemeSettingsContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface EdiscoveryUpload {
  id: string;
  projectId: string;
  filename: string;
  sizeBytes: number;
  status: string;
  error?: string;
  emailCount: number;
  attachmentCount: number;
  progressPct?: number;
  sourcePath?: string;
  scanDetectedAt?: string;
  createdAt: string;
  processedAt?: string;
}

interface EdiscoveryEmail {
  id: string;
  subject?: string;
  fromAddress?: string;
  toAddresses?: string[];
  sentAt?: string;
  snippet?: string;
  hasAttachments: boolean;
  sourceFilename?: string;
  similarity?: number;
}

interface EmailTag {
  id: string;
  emailId: string;
  label: string;
  createdAt: string;
}

interface EmailDetails {
  email: EdiscoveryEmail & {
    bodyText?: string;
    bodyHtml?: string;
    ccAddresses?: string[];
    bccAddresses?: string[];
  };
  attachments: Array<{
    id: string;
    filename: string;
    sizeBytes: number;
    contentType?: string;
  }>;
}

interface PSTFile {
  name: string;
  size: number;
  path: string;
  lastModified: string;
  id: string;
}

// Resizable Table Header Component
function ResizableTableHead({
  columnId,
  currentWidth,
  minWidth,
  onResize,
  className,
  children,
}: {
  columnId: string;
  currentWidth: number;
  minWidth: number;
  onResize: (columnId: string, width: number) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = currentWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(minWidth, startWidth + delta);
      onResize(columnId, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <TableHead
      ref={thRef}
      className={`${className || ''} relative select-none font-normal`}
    >
      <div className="pr-2">
        {children}
      </div>
      <div
        className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 ${
          isResizing ? 'bg-blue-500' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="h-full w-full flex items-center justify-center opacity-0 hover:opacity-100">
          <GripHorizontal className="h-3 w-3 text-blue-500" />
        </div>
      </div>
    </TableHead>
  );
}

// Storage key for column widths
const STORAGE_KEY_EDISCOVERY_COLUMN_WIDTHS = 'ediscovery-column-widths';

// Default column widths
const DEFAULT_COLUMN_WIDTHS = {
  date: 120,
  from: 250,
  subject: 400,
  indicators: 120,
};

export default function EDiscovery() {
  const { toast } = useToast();
  const { selectedProject } = useProject();
  
  // Search state
  const [aiQuery, setAiQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [senderFilter, setSenderFilter] = useState("all");
  const [hasAttachmentsFilter, setHasAttachmentsFilter] = useState<boolean | undefined>(undefined);
  const [sourceFilenameFilter, setSourceFilenameFilter] = useState("");
  
  // Selection state
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [newTagLabel, setNewTagLabel] = useState("");

  // Column widths state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);

  // Load column widths from localStorage on mount
  useEffect(() => {
    const storedWidths = localStorage.getItem(STORAGE_KEY_EDISCOVERY_COLUMN_WIDTHS);
    if (storedWidths) {
      try {
        const parsed = JSON.parse(storedWidths);
        setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...parsed });
      } catch (e) {
        console.error('Failed to parse stored eDiscovery column widths:', e);
      }
    }
  }, []);

  // Save column width function
  const saveColumnWidth = (columnId: string, width: number) => {
    const newWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(newWidths);
    localStorage.setItem(STORAGE_KEY_EDISCOVERY_COLUMN_WIDTHS, JSON.stringify(newWidths));
  };

  // Fetch uploads for current project (with auto-refresh for processing uploads)
  const { data: allUploads } = useQuery<EdiscoveryUpload[]>({
    queryKey: ["/api/ediscovery/uploads"],
    enabled: !!selectedProject,
    refetchInterval: (query) => {
      // Auto-refresh every 2 seconds if any uploads are processing
      const hasProcessing = query?.state.data?.some((u: EdiscoveryUpload) => u.status === "processing");
      return hasProcessing ? 2000 : false;
    },
  });

  // Filter uploads for current project
  const uploads = allUploads?.filter(u => u.projectId === selectedProject?.id);
  
  // Fetch unique senders for filter dropdown
  const { data: sendersList = [] } = useQuery<string[]>({
    queryKey: ["/api/ediscovery/senders", selectedProject?.id],
    enabled: !!selectedProject?.id,
  });
  
  // Fetch all emails for the project (sorted by date ascending)
  const { data: allEmails, isLoading: isLoadingAllEmails } = useQuery<{
    items: EdiscoveryEmail[];
    total: number;
  }>({
    queryKey: ["/api/ediscovery/emails", selectedProject?.id, dateFrom, dateTo, senderFilter, hasAttachmentsFilter],
    queryFn: async () => {
      if (!selectedProject?.id) return { items: [], total: 0 };
      
      const params = new URLSearchParams({
        projectId: selectedProject.id,
        limit: '1000',
      });
      
      if (dateFrom) {
        params.append('dateFrom', format(dateFrom, "yyyy-MM-dd"));
      }
      if (dateTo) {
        params.append('dateTo', format(dateTo, "yyyy-MM-dd"));
      }
      if (senderFilter && senderFilter !== "all") {
        params.append('from', senderFilter);
      }
      if (hasAttachmentsFilter === true) {
        params.append('hasAttachments', 'true');
      }
      
      const response = await fetch(`/api/ediscovery/emails?${params.toString()}`, {
        credentials: "include",
      });
      return response.json();
    },
    enabled: !!selectedProject?.id,
  });
  
  const refetchUploads = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/ediscovery/uploads"] });
  };

  // Scan SharePoint for new PST files
  const { data: scanResults, refetch: refetchScan, isLoading: isScanning } = useQuery<{
    newPstFiles: PSTFile[];
    existingCount: number;
    error?: string;
  }>({
    queryKey: ["/api/ediscovery/scan-pst-folder", selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject?.id) return { newPstFiles: [], existingCount: 0 };
      const response = await apiRequest(
        "POST",
        `/api/ediscovery/scan-pst-folder/${selectedProject.id}`,
        {}
      );
      return response.json();
    },
    enabled: false,
  });

  // Auto-scan on mount
  useEffect(() => {
    if (selectedProject?.id) {
      refetchScan();
    }
  }, [selectedProject?.id]);

  // AI semantic search results
  const { data: aiSearchResults, isLoading: isAiSearching, refetch: refetchAiSearch } = useQuery<{
    items: EdiscoveryEmail[];
    total: number;
  }>({
    queryKey: ["/api/ediscovery/semantic-search", aiQuery, selectedProject?.id, sourceFilenameFilter, dateFrom, dateTo, senderFilter, hasAttachmentsFilter],
    queryFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/ediscovery/semantic-search",
        {
          query: aiQuery,
          projectId: selectedProject?.id,
          sourceFilename: sourceFilenameFilter || undefined,
          dateFrom: dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined,
          dateTo: dateTo ? format(dateTo, "yyyy-MM-dd") : undefined,
          sender: senderFilter && senderFilter !== "all" ? senderFilter : undefined,
          hasAttachments: hasAttachmentsFilter,
          limit: 100,
        }
      );
      return response.json();
    },
    enabled: false,
  });

  // Fetch email details
  const { data: emailDetails } = useQuery<EmailDetails>({
    queryKey: ["/api/ediscovery/emails", selectedEmail],
    enabled: !!selectedEmail,
  });

  // Fetch tags for selected email
  const { data: emailTags = [] } = useQuery<EmailTag[]>({
    queryKey: ["/api/ediscovery/emails", selectedEmail, "tags"],
    enabled: !!selectedEmail,
  });

  // Ingest PST from SharePoint
  const ingestFromSharePointMutation = useMutation({
    mutationFn: async (file: PSTFile) => {
      return apiRequest(
        "POST",
        `/api/ediscovery/ingest-from-sharepoint/${selectedProject?.id}`,
        {
          fileId: file.id,
          fileName: file.name,
          filePath: file.path,
          fileSize: file.size,
        }
      );
    },
    onSuccess: () => {
      toast({
        title: "Ingestion Started",
        description: "PST file download and ingestion has begun. This may take several minutes.",
      });
      refetchUploads();
      refetchScan();
    },
    onError: () => {
      toast({
        title: "Ingestion Failed",
        description: "Failed to start PST ingestion from SharePoint.",
        variant: "destructive",
      });
    },
  });

  // Add tag mutation
  const addTagMutation = useMutation({
    mutationFn: async (label: string) => {
      return apiRequest(
        "POST",
        `/api/ediscovery/emails/${selectedEmail}/tags`,
        { label }
      );
    },
    onSuccess: () => {
      setNewTagLabel("");
      queryClient.invalidateQueries({ queryKey: ["/api/ediscovery/emails", selectedEmail, "tags"] });
      toast({
        title: "Tag Added",
        description: "Email tag has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to Add Tag",
        description: "Could not add tag to email.",
        variant: "destructive",
      });
    },
  });

  // Remove tag mutation
  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest(
        "DELETE",
        `/api/ediscovery/emails/${selectedEmail}/tags/${tagId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ediscovery/emails", selectedEmail, "tags"] });
      toast({
        title: "Tag Removed",
        description: "Email tag has been removed successfully.",
      });
    },
  });

  // Export to PDF mutation
  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/ediscovery/emails/${selectedEmail}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId: selectedProject?.id }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `email_export_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "PDF Exported",
        description: "Email has been exported to PDF successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "Could not export email to PDF.",
        variant: "destructive",
      });
    },
  });

  const handleAiSearch = () => {
    if (!aiQuery.trim()) {
      toast({
        title: "Search Query Required",
        description: "Please enter a search query.",
        variant: "destructive",
      });
      return;
    }
    refetchAiSearch();
  };

  const handleAddTag = () => {
    if (!newTagLabel.trim()) return;
    addTagMutation.mutate(newTagLabel.trim());
  };

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-96">
          <CardHeader>
            <CardTitle data-testid="text-no-project-title">No Project Selected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Please select a project to access eDiscovery features.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPstFiles = (scanResults?.newPstFiles.length || 0) + (scanResults?.existingCount || 0);
  const processedCount = uploads?.filter(u => u.status === "complete").length || 0;

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      {/* PST File Status Overview - Compact Single Line */}
      <Card>
        <CardContent className="p-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium">PST File Status</span>
              <div className="flex items-center gap-1">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Total Files:</span>
                <span className="font-semibold">{totalPstFiles}</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-success" />
                <span className="text-muted-foreground">Processed:</span>
                <span className="font-semibold">{processedCount}</span>
              </div>
              {scanResults && scanResults.newPstFiles.length > 0 && (
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-warning" />
                  <span className="text-muted-foreground">Pending:</span>
                  <span className="font-semibold">{scanResults.newPstFiles.length}</span>
                </div>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetchScan()}
                  disabled={isScanning}
                  className={cn(
                    "h-7 text-xs relative overflow-hidden bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20",
                    isScanning && "bg-gradient-to-r from-primary via-purple-600 to-primary bg-[length:200%_100%] animate-gradient"
                  )}
                  data-testid="button-scan-sharepoint"
                >
                  {isScanning ? (
                    <>
                      <Sparkles className="h-3 w-3 mr-1 animate-pulse" />
                      <span className="relative">AI Scanning...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Scan Folder
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Scan SharePoint folder for new PST email files</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {scanResults?.error && (
            <div className="mt-3 text-sm text-destructive bg-destructive/10 p-2 rounded">
              {scanResults.error}
            </div>
          )}

          {/* New PST files that need processing */}
          {scanResults && scanResults.newPstFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium">Files Pending Processing:</p>
              <div className="flex flex-wrap gap-2">
                {scanResults.newPstFiles.map((file) => (
                  <Badge key={file.id} variant="outline" className="gap-2">
                    {file.name}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0"
                          onClick={() => ingestFromSharePointMutation.mutate(file)}
                          disabled={ingestFromSharePointMutation.isPending}
                          data-testid={`button-ingest-${file.name}`}
                        >
                          {ingestFromSharePointMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Download and process this PST file</p>
                      </TooltipContent>
                    </Tooltip>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Files stuck in pending/failed status - allow retry */}
          {uploads && uploads.some(u => u.status === "pending" || u.status === "failed") && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-warning flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Files Requiring Attention:
              </p>
              <div className="space-y-2">
                {uploads
                  .filter(u => u.status === "pending" || u.status === "failed")
                  .map((upload) => (
                    <div key={upload.id} className="space-y-2 p-2 bg-warning/10 rounded text-sm" data-testid={`pending-file-${upload.filename}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="h-4 w-4 text-warning flex-shrink-0" />
                          <span className="truncate">{upload.filename}</span>
                          <Badge variant="outline" className="text-xs">
                            {(upload.sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                          </Badge>
                          <Badge variant={upload.status === "failed" ? "destructive" : "outline"} className="text-xs">
                            {upload.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Added {new Date(upload.createdAt).toLocaleString()}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await apiRequest('POST', `/api/ediscovery/retry-upload/${upload.id}`, {});
                                    toast({
                                      title: "Processing Restarted",
                                      description: "File processing has been restarted.",
                                    });
                                    refetchUploads();
                                  } catch (error) {
                                    toast({
                                      title: "Retry Failed",
                                      description: "Could not restart processing.",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                data-testid={`button-retry-${upload.filename}`}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Retry
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Retry processing this failed file</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      {upload.error && (
                        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                          <span className="font-medium">Error:</span> {upload.error}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Processing PST files with progress */}
          {uploads && uploads.some(u => u.status === "processing") && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                AI Processing Emails:
              </p>
              {uploads
                .filter(u => u.status === "processing")
                .map((upload) => (
                  <div key={upload.id} className="space-y-2 p-3 bg-accent/50 rounded-lg" data-testid={`progress-${upload.filename}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate flex-1">{upload.filename}</span>
                      <span className="text-muted-foreground text-xs">
                        {upload.progressPct || 0}%
                      </span>
                    </div>
                    <Progress value={upload.progressPct || 0} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {upload.emailCount > 0 ? `${Math.floor((upload.progressPct || 0) * upload.emailCount / 100)} / ${upload.emailCount} emails` : 'Counting emails...'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Processing
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content: Search/Results on Left, Preview on Right */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 rounded-lg border">
        {/* Left Panel: Search + Results */}
        <ResizablePanel defaultSize={50} minSize={40}>
          <div className="h-full flex flex-col border-l-4 border-l-purple-500">
            {/* Search Section */}
            <div className="p-2 border-b space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Describe what you're looking for... (e.g., weekend work approval, EOT claims, variation notices)"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAiSearch()}
                    data-testid="input-ai-search"
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleAiSearch}
                      disabled={isAiSearching || !aiQuery.trim()}
                      variant="outline"
                      className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20 font-semibold"
                      data-testid="button-search"
                    >
                      {isAiSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-2" /> Search</>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>AI-powered semantic search using keywords and context</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Advanced Filters - Single Row */}
              <div className="flex items-end gap-2">
                <div className="w-[140px]">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Popover>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "h-8 w-full justify-start text-left font-normal text-xs px-2",
                              !dateFrom && "text-muted-foreground"
                            )}
                            data-testid="button-date-from"
                          >
                            <CalendarIcon className="mr-1 h-3 w-3" />
                            {dateFrom ? format(dateFrom, "dd MMM yy") : "Date"}
                          </Button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Filter emails from this date onwards</p>
                      </TooltipContent>
                    </Tooltip>
                    <PopoverContent className="w-auto p-0 z-50" align="start">
                      <div className="bg-popover">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                          fromDate={new Date(2020, 0, 1)}
                          toDate={new Date()}
                          formatters={{
                            formatCaption: (date) => format(date, 'MMM yyyy')
                          }}
                        />
                      </div>
                      {dateFrom && (
                        <div className="p-2 border-t bg-popover">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setDateFrom(undefined)}
                            data-testid="button-clear-date-from"
                          >
                            Clear
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-[140px]">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Popover>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "h-8 w-full justify-start text-left font-normal text-xs px-2",
                              !dateTo && "text-muted-foreground"
                            )}
                            data-testid="button-date-to"
                          >
                            <CalendarIcon className="mr-1 h-3 w-3" />
                            {dateTo ? format(dateTo, "dd MMM yy") : "Date"}
                          </Button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Filter emails up to this date</p>
                      </TooltipContent>
                    </Tooltip>
                    <PopoverContent className="w-auto p-0 z-50" align="start">
                      <div className="bg-popover">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          initialFocus
                          fromDate={new Date(2020, 0, 1)}
                          toDate={new Date()}
                          formatters={{
                            formatCaption: (date) => format(date, 'MMM yyyy')
                          }}
                        />
                      </div>
                      {dateTo && (
                        <div className="p-2 border-t bg-popover">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setDateTo(undefined)}
                            data-testid="button-clear-date-to"
                          >
                            Clear
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-[180px]">
                  <Label className="text-xs text-muted-foreground">Sender Email</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Select value={senderFilter} onValueChange={setSenderFilter}>
                          <SelectTrigger className="h-8 text-sm" data-testid="select-sender">
                            <SelectValue placeholder="All senders" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All senders</SelectItem>
                            {sendersList.map((sender) => (
                              <SelectItem key={sender} value={sender}>
                                {sender}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Filter emails by sender address</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 h-8">
                      <Checkbox
                        id="has-attachments"
                        checked={hasAttachmentsFilter === true}
                        onCheckedChange={(checked) => setHasAttachmentsFilter(checked === true ? true : undefined)}
                        data-testid="checkbox-attachments"
                      />
                      <Label htmlFor="has-attachments" className="text-xs text-muted-foreground cursor-pointer">
                        <Paperclip className="h-3 w-3" />
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Show only emails with attachments</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Email count display */}
              {aiSearchResults ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span>AI Search: Found {aiSearchResults.total} matching emails</span>
                </div>
              ) : allEmails ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Showing {allEmails.total} emails (sorted by date)</span>
                </div>
              ) : null}
            </div>

            {/* Results List */}
            <ScrollArea className="flex-1">
              {isLoadingAllEmails && (
                <div className="text-center py-12">
                  <Loader2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3 animate-spin" />
                  <p className="text-muted-foreground">Loading emails...</p>
                </div>
              )}

              {!isLoadingAllEmails && !aiSearchResults && allEmails && allEmails.items.length === 0 && (
                <div className="text-center py-12">
                  <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No emails found. Upload PST files to get started.</p>
                </div>
              )}

              {!isLoadingAllEmails && aiSearchResults && aiSearchResults.items.length === 0 && (
                <div className="text-center py-12">
                  <XCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No emails found matching your AI search</p>
                </div>
              )}

              {(aiSearchResults?.items || allEmails?.items || []).length > 0 && (
                <Table className="text-xs">
                  <colgroup>
                    <col style={{ width: `${columnWidths.date}px` }} />
                    <col style={{ width: `${columnWidths.from}px` }} />
                    <col style={{ width: `${columnWidths.subject}px` }} />
                    <col style={{ width: `${columnWidths.indicators}px` }} />
                  </colgroup>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <ResizableTableHead
                        columnId="date"
                        currentWidth={columnWidths.date}
                        minWidth={80}
                        onResize={saveColumnWidth}
                        className="text-xs text-muted-foreground !font-normal"
                      >
                        Date
                      </ResizableTableHead>
                      <ResizableTableHead
                        columnId="from"
                        currentWidth={columnWidths.from}
                        minWidth={150}
                        onResize={saveColumnWidth}
                        className="text-xs text-muted-foreground !font-normal"
                      >
                        From
                      </ResizableTableHead>
                      <ResizableTableHead
                        columnId="subject"
                        currentWidth={columnWidths.subject}
                        minWidth={200}
                        onResize={saveColumnWidth}
                        className="text-xs text-muted-foreground !font-normal"
                      >
                        Subject
                      </ResizableTableHead>
                      <ResizableTableHead
                        columnId="indicators"
                        currentWidth={columnWidths.indicators}
                        minWidth={80}
                        onResize={saveColumnWidth}
                        className="text-xs text-muted-foreground !font-normal"
                      >
                        Info
                      </ResizableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(aiSearchResults?.items || allEmails?.items || []).map((email) => (
                      <TableRow
                        key={email.id}
                        className={cn(
                          "cursor-pointer text-xs transition-colors",
                          selectedEmail === email.id ? "bg-accent" : "hover-elevate"
                        )}
                        onClick={() => setSelectedEmail(email.id)}
                        data-testid={`email-result-${email.id}`}
                      >
                        <TableCell className="text-muted-foreground">
                          {email.sentAt ? format(new Date(email.sentAt), "dd MMM yyyy") : "No date"}
                        </TableCell>
                        <TableCell className="text-muted-foreground truncate">
                          {email.fromAddress || "Unknown"}
                        </TableCell>
                        <TableCell className="truncate">
                          {email.subject || "(No Subject)"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {email.hasAttachments && (
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                            )}
                            {email.similarity && (
                              <Badge variant="secondary" className="text-xs">
                                {Math.round(email.similarity * 100)}%
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel: Email Preview */}
        <ResizablePanel defaultSize={50} minSize={40}>
          <div className="h-full flex flex-col border-l-4 border-l-[#F0C84B]">
            {!selectedEmail ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Mail className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Select an email to view details</p>
                </div>
              </div>
            ) : (
              <>
                {/* Email Header */}
                <div className="p-4 border-b space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-lg">
                      {emailDetails?.email.subject || "(No Subject)"}
                    </h2>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportPdfMutation.mutate()}
                      disabled={exportPdfMutation.isPending}
                      data-testid="button-export-pdf"
                    >
                      {exportPdfMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <><Download className="h-3 w-3 mr-2" /> Export PDF</>
                      )}
                    </Button>
                  </div>

                  <div className="flex gap-4">
                    {/* Left side: Email metadata */}
                    {emailDetails && (
                      <div className="flex-1 space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">From: </span>
                          <span className="font-medium">{emailDetails.email.fromAddress}</span>
                        </div>
                        {emailDetails.email.sentAt && (
                          <div>
                            <span className="text-muted-foreground">Date: </span>
                            <span>{format(new Date(emailDetails.email.sentAt), "PPpp")}</span>
                          </div>
                        )}
                        {emailDetails.email.toAddresses && emailDetails.email.toAddresses.length > 0 && (
                          <div>
                            <span className="text-muted-foreground">To: </span>
                            <span>{emailDetails.email.toAddresses.join(", ")}</span>
                          </div>
                        )}
                        {emailDetails.email.ccAddresses && emailDetails.email.ccAddresses.length > 0 && (
                          <div>
                            <span className="text-muted-foreground">Cc: </span>
                            <span>{emailDetails.email.ccAddresses.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Right side: Variation Tags */}
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs text-muted-foreground">Variation Tags</Label>
                      <div className="flex flex-wrap gap-2">
                        {emailTags.map((tag) => (
                          <Badge key={tag.id} variant="secondary" className="gap-1">
                            <Tag className="h-3 w-3" />
                            {tag.label}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-4 w-4 p-0 ml-1"
                              onClick={() => removeTagMutation.mutate(tag.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                        <div className="flex gap-1">
                          <Input
                            placeholder="VAR-001"
                            value={newTagLabel}
                            onChange={(e) => setNewTagLabel(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                            className="h-7 w-24 text-xs"
                            data-testid="input-new-tag"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={handleAddTag}
                            disabled={!newTagLabel.trim() || addTagMutation.isPending}
                            data-testid="button-add-tag"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Attachments */}
                  {emailDetails && emailDetails.attachments.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Attachments ({emailDetails.attachments.length})</Label>
                      <div className="flex flex-wrap gap-2">
                        {emailDetails.attachments.map((att) => (
                          <Badge key={att.id} variant="outline" className="gap-1">
                            <Paperclip className="h-3 w-3" />
                            <span className="text-xs">{att.filename}</span>
                            <span className="text-xs text-muted-foreground">
                              ({(att.sizeBytes / 1024).toFixed(1)} KB)
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Email Body */}
                <ScrollArea className="flex-1 p-4 bg-white dark:bg-gray-950">
                  {emailDetails ? (
                    <div>
                      {emailDetails.email.bodyText ? (
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-normal text-gray-900 dark:text-gray-100">
                          {emailDetails.email.bodyText
                            .replace(/[ \t]+$/gm, '') // Remove trailing spaces from each line
                            .replace(/\n{2,}/g, '\n') // Collapse 2+ newlines to single line break
                            .trim()
                          }
                        </pre>
                      ) : emailDetails.email.bodyHtml ? (
                        <div className="text-gray-900 dark:text-gray-100" dangerouslySetInnerHTML={{ __html: emailDetails.email.bodyHtml }} />
                      ) : (
                        <p className="text-muted-foreground italic">No email body available</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
