import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Search, Lightbulb, Sparkles, Loader2, Trash2, Eraser } from "lucide-react";

// Configure PDF.js worker
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface AILetterTabProps {
  projectId: string;
}

interface CorrespondenceLetter {
  id: string;
  projectId: string;
  letterNumber: number;
  fileName: string;
  fileUrl: string;
  sender?: string;
  recipient?: string;
  subject?: string;
  letterDate?: string;
  category: string;
  source?: string;
  createdAt: string;
}

export function AILetterTab({ projectId }: AILetterTabProps) {
  const { toast } = useToast();
  const [uploadedLetter, setUploadedLetter] = useState<File | null>(null);
  const [uploadedLetterId, setUploadedLetterId] = useState<string | null>(null);
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);
  const [customInstructions, setCustomInstructions] = useState("");
  const [generatedResponse, setGeneratedResponse] = useState("");
  const [searchResults, setSearchResults] = useState<CorrespondenceLetter[]>([]);
  
  // Progress tracking
  const [generationProgress, setGenerationProgress] = useState<{
    stage: string;
    progress: number;
  } | null>(null);
  
  // Viewer/Editor dialog state
  const [isViewerDialogOpen, setIsViewerDialogOpen] = useState(false);
  const [editedDraftLetter, setEditedDraftLetter] = useState("");
  const [originalAILetter, setOriginalAILetter] = useState(""); // Store original AI text
  const [showOriginalAI, setShowOriginalAI] = useState(false); // Toggle between original/edited
  const [usageInfo, setUsageInfo] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  } | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  
  // Upload metadata dialog state
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [letterSender, setLetterSender] = useState("");
  const [letterRecipient, setLetterRecipient] = useState("");
  const [letterSubject, setLetterSubject] = useState("");
  const [letterDate, setLetterDate] = useState("");
  
  // Store AI work per letter (instructions and responses)
  const [letterWork, setLetterWork] = useState<Record<string, {
    selectedOptions: string[];
    customInstructions: string;
    generatedResponse: string;
    originalAIResponse: string; // Store original AI text separately
    selectedReferences: string[];
  }>>({});
  
  // SharePoint configuration status
  const [sharePointConfigured, setSharePointConfigured] = useState<boolean>(false);
  const [sharePointDocCount, setSharePointDocCount] = useState<number>(0);
  
  // Request token for race condition protection
  const uploadTokenRef = useRef<number>(0);
  const currentUploadTokenRef = useRef<number>(0);
  
  // PDF viewer state - load from localStorage
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(() => {
    const saved = localStorage.getItem('aiLetter-currentLetterScale');
    return saved ? parseFloat(saved) : 1.0;
  });
  
  // Drag/pan state for Current Letter
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const currentLetterScrollRef = useRef<HTMLDivElement>(null);
  
  // Preview window state
  const [previewScale, setPreviewScale] = useState<number>(() => {
    const saved = localStorage.getItem('aiLetter-previewScale');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [previewPageNumber, setPreviewPageNumber] = useState<number>(1);
  const [previewNumPages, setPreviewNumPages] = useState<number>(0);
  const [selectedPreviewLetter, setSelectedPreviewLetter] = useState<CorrespondenceLetter | null>(null);
  
  // Drag/pan state for Preview Letter
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const [previewDragStart, setPreviewDragStart] = useState({ x: 0, y: 0 });
  const previewLetterScrollRef = useRef<HTMLDivElement>(null);
  const [isPreviewPdfLoading, setIsPreviewPdfLoading] = useState(false);

  // Panel size state - load from localStorage on mount
  const [mainColumnSizes, setMainColumnSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('aiLetter-mainColumnSizes');
    return saved ? JSON.parse(saved) : [55, 45];
  });
  
  const [leftColumnSizes, setLeftColumnSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('aiLetter-leftColumnSizes');
    return saved ? JSON.parse(saved) : [60, 40];
  });
  
  const [rightColumnSizes, setRightColumnSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('aiLetter-rightColumnSizes');
    return saved ? JSON.parse(saved) : [50, 50];
  });
  
  const [instructionsSizes, setInstructionsSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('aiLetter-instructionsSizes');
    return saved ? JSON.parse(saved) : [45, 55];
  });
  
  const [previewPanelSizes, setPreviewPanelSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('aiLetter-previewPanelSizes');
    return saved ? JSON.parse(saved) : [60, 40];
  });

  // Function to save current letter's work
  const saveCurrentLetterWork = () => {
    if (uploadedLetterId) {
      setLetterWork(prev => ({
        ...prev,
        [uploadedLetterId]: {
          selectedOptions,
          customInstructions,
          generatedResponse,
          originalAIResponse: originalAILetter, // Save original AI text
          selectedReferences,
        }
      }));
    }
  };

  // Function to load a letter's work
  const loadLetterWork = (letterId: string) => {
    if (letterWork[letterId]) {
      const work = letterWork[letterId];
      setSelectedOptions(work.selectedOptions);
      setCustomInstructions(work.customInstructions);
      setGeneratedResponse(work.generatedResponse);
      setOriginalAILetter(work.originalAIResponse || work.generatedResponse); // Restore original AI text
      setEditedDraftLetter(work.generatedResponse); // Load current version as edited
      setSelectedReferences(work.selectedReferences);
    } else {
      // New letter - clear the work
      setSelectedOptions([]);
      setCustomInstructions("");
      setGeneratedResponse("");
      setOriginalAILetter(""); // Clear original
      setEditedDraftLetter("");
      setSelectedReferences([]);
    }
  };

  // Save panel sizes to localStorage when they change
  useEffect(() => {
    localStorage.setItem('aiLetter-mainColumnSizes', JSON.stringify(mainColumnSizes));
  }, [mainColumnSizes]);

  useEffect(() => {
    localStorage.setItem('aiLetter-leftColumnSizes', JSON.stringify(leftColumnSizes));
  }, [leftColumnSizes]);

  useEffect(() => {
    localStorage.setItem('aiLetter-rightColumnSizes', JSON.stringify(rightColumnSizes));
  }, [rightColumnSizes]);

  useEffect(() => {
    localStorage.setItem('aiLetter-instructionsSizes', JSON.stringify(instructionsSizes));
  }, [instructionsSizes]);
  
  useEffect(() => {
    localStorage.setItem('aiLetter-previewPanelSizes', JSON.stringify(previewPanelSizes));
  }, [previewPanelSizes]);
  
  // Save zoom/scale settings to localStorage
  useEffect(() => {
    localStorage.setItem('aiLetter-currentLetterScale', scale.toString());
  }, [scale]);
  
  useEffect(() => {
    localStorage.setItem('aiLetter-previewScale', previewScale.toString());
  }, [previewScale]);

  // Fetch existing letters
  const { data: letters = [], isLoading: isLoadingLetters, refetch: refetchLetters } = useQuery<CorrespondenceLetter[]>({
    queryKey: ['/api/projects', projectId, 'correspondence', 'letters'],
    enabled: !!projectId,
  });

  // Auto-sync SharePoint mutation (runs automatically on tab load)
  const autoSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/projects/${projectId}/sharepoint-sync`);
      return response.json();
    },
    onSuccess: (data) => {
      console.log('[Auto-Sync] SharePoint sync complete:', data);
      setSharePointConfigured(true);
      // Save SharePoint document count (indexed + skipped = total SharePoint docs)
      const totalSharePointDocs = (data.indexed || 0) + (data.skipped || 0);
      setSharePointDocCount(totalSharePointDocs);
      // Silently refresh letters after sync
      refetchLetters();
    },
    onError: (error: any) => {
      // Check if it's a 404 (not configured) or other error
      if (error?.message?.includes('404') || error?.message?.includes('not configured')) {
        setSharePointConfigured(false);
      }
      // Silently fail - SharePoint might not be configured, which is fine
      console.log('[Auto-Sync] SharePoint not configured or sync failed (expected for projects without SharePoint)');
    }
  });

  // Auto-sync SharePoint on tab load (once)
  useEffect(() => {
    if (projectId) {
      // Trigger sync silently in background
      autoSyncMutation.mutate();
    }
  }, [projectId]); // Only run when projectId changes

  // Upload letter mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, token, metadata }: { file: File; token: number; metadata: { sender: string; recipient: string; subject: string; letterDate: string } }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sender', metadata.sender);
      formData.append('recipient', metadata.recipient);
      formData.append('subject', metadata.subject);
      formData.append('letterDate', metadata.letterDate);
      formData.append('category', 'correspondence');

      const response = await fetch(`/api/projects/${projectId}/correspondence/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      return { data, token };
    },
    onSuccess: ({ data, token }) => {
      // Only update state if this is the most recent upload
      if (token === uploadTokenRef.current) {
        // Save current work before switching to new letter
        saveCurrentLetterWork();
        
        setUploadedLetterId(data.id);
        
        // Load work for the new letter (will be empty/clear for new uploads)
        loadLetterWork(data.id);
        
        toast({
          title: "Letter uploaded",
          description: `Letter #${data.letterNumber} uploaded successfully`,
        });
        
        // Invalidate letters query to refresh the register
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'correspondence', 'letters'] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadedLetter(null);
    },
  });

  // Semantic search mutation using AI embeddings and SharePoint
  const searchSimilarMutation = useMutation({
    mutationFn: async (letterId: string) => {
      const response = await apiRequest('POST', `/api/projects/${projectId}/correspondence/search`, {
        letterId
      });
      const results = await response.json();
      // Return both the letterId and results to track which letter these results are for
      return { letterId, results };
    },
    onSuccess: ({ letterId, results }) => {
      // Only update UI if this is still the current letter (prevent race conditions)
      if (letterId !== uploadedLetterId) {
        console.log('Ignoring stale search results for letter:', letterId);
        return;
      }

      setSearchResults(results);
      
      // Auto-select first similar letter for preview if available
      if (results.length > 0) {
        setSelectedPreviewLetter(results[0]);
        setPreviewPageNumber(1);
      } else {
        setSelectedPreviewLetter(null);
      }
    },
    onError: (error, letterId) => {
      // Only show fallback if this is still the current letter
      if (letterId !== uploadedLetterId) {
        return;
      }

      console.error('Error searching similar letters:', error);
      // Fallback: show other letters from project
      const fallbackLetters = letters.filter(l => l.id !== uploadedLetterId);
      setSearchResults(fallbackLetters);
      if (fallbackLetters.length > 0) {
        setSelectedPreviewLetter(fallbackLetters[0]);
        setPreviewPageNumber(1);
      }
    }
  });

  // Auto-search for similar letters when a letter is selected
  useEffect(() => {
    if (!uploadedLetterId) {
      setSearchResults([]);
      setSelectedPreviewLetter(null);
      return;
    }
    
    // Reset mutation state when letter changes to cancel any pending searches
    if (searchSimilarMutation.isPending) {
      searchSimilarMutation.reset();
    }
    
    // Trigger AI semantic search with SharePoint integration
    searchSimilarMutation.mutate(uploadedLetterId);
  }, [uploadedLetterId]);

  // Delete letter mutation
  const deleteMutation = useMutation({
    mutationFn: async (letterId: string) => {
      const response = await apiRequest('DELETE', `/api/correspondence/letters/${letterId}`);
      return response.json();
    },
    onSuccess: (data, letterId) => {
      // Clear current letter if it was deleted
      if (uploadedLetterId === letterId) {
        setUploadedLetterId(null);
        setUploadedLetter(null);
        setNumPages(0);
        setPageNumber(1);
      }
      
      // Remove from letter work
      setLetterWork(prev => {
        const newWork = { ...prev };
        delete newWork[letterId];
        return newWork;
      });
      
      // Remove from references
      setSelectedReferences(prev => prev.filter(id => id !== letterId));
      
      // Update cache immediately - remove the deleted letter
      queryClient.setQueryData(
        ['/api/projects', projectId, 'correspondence', 'letters'],
        (old: CorrespondenceLetter[] | undefined) => {
          if (!old) return [];
          return old.filter(letter => letter.id !== letterId);
        }
      );
      
      toast({
        title: "Letter deleted",
        description: "The letter has been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Regenerate embeddings mutation
  const regenerateEmbeddingsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/projects/${projectId}/correspondence/regenerate-embeddings`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "correspondence"] });
      
      toast({
        title: "Embeddings Regenerated",
        description: data.message || `Processed ${data.processed} letters`,
      });
      
      // Re-run search if a letter is selected
      if (uploadedLetterId) {
        searchSimilarMutation.mutate(uploadedLetterId);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Regeneration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Export to Word mutation
  const exportWordMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/correspondence/export-word`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftContent: editedDraftLetter,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export to Word');
      }
      
      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'draft_letter.docx';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Export successful",
        description: "Word document has been downloaded",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Save draft letter mutation
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/projects/${projectId}/correspondence/save-draft`, {
        originalLetterId: uploadedLetterId,
        draftContent: editedDraftLetter,
        subject: null, // Can be enhanced later
        referenceLetterIds: selectedReferences,
        customInstructions: [...selectedOptions, customInstructions].filter(Boolean).join('\n'),
        aiModel: 'gpt-4o',
        inputTokens: usageInfo?.inputTokens,
        outputTokens: usageInfo?.outputTokens,
        totalTokens: usageInfo?.totalTokens,
        estimatedCost: usageInfo?.estimatedCost,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Draft saved",
        description: "Your draft letter has been saved successfully",
      });
      setIsViewerDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Generate AI response mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      // Generate unique sessionId for progress tracking
      const sessionId = `gen_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Start polling for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressRes = await fetch(`/api/correspondence/generation-progress/${sessionId}`);
          const progressData = await progressRes.json();
          
          if (progressData) {
            setGenerationProgress({
              stage: progressData.stage,
              progress: progressData.progress
            });
            
            // Stop polling if completed or error
            if (progressData.completed) {
              clearInterval(pollInterval);
              setGenerationProgress(null);
            }
          }
        } catch (err) {
          console.error('Error polling progress:', err);
        }
      }, 500); // Poll every 500ms
      
      try {
        // Combine selected options and custom instructions
        const combinedInstructions = [
          ...selectedOptions,
          customInstructions
        ].filter(Boolean).join('\n');
        
        const response = await apiRequest('POST', `/api/projects/${projectId}/correspondence/generate-response`, {
          originalLetterId: uploadedLetterId,
          referenceLetterIds: selectedReferences,
          customInstructions: combinedInstructions,
          sessionId, // Pass sessionId for progress tracking
        });
        
        clearInterval(pollInterval);
        setGenerationProgress(null);
        
        return response.json();
      } catch (error) {
        clearInterval(pollInterval);
        setGenerationProgress(null);
        throw error;
      }
    },
    onSuccess: (data) => {
      const generatedText = data.generatedResponse || '';
      setGeneratedResponse(generatedText);
      setEditedDraftLetter(generatedText);
      setOriginalAILetter(generatedText); // Store original AI text
      setShowOriginalAI(false); // Default to showing editable version
      setUsageInfo(data.usage || null);
      
      // Save immediately so originalAIResponse is preserved
      if (uploadedLetterId) {
        setLetterWork(prev => ({
          ...prev,
          [uploadedLetterId]: {
            ...(prev[uploadedLetterId] || {
              selectedOptions: [],
              customInstructions: '',
              selectedReferences: [],
              generatedResponse: '',
              originalAIResponse: '',
            }),
            generatedResponse: generatedText,
            originalAIResponse: generatedText,
          }
        }));
      }
      
      setIsViewerDialogOpen(true);
      
      toast({
        title: "Response generated",
        description: "AI response has been created",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      // Set pending file and show metadata dialog
      setPendingFile(file);
      setLetterSubject(file.name.replace('.pdf', ''));
      setLetterDate(new Date().toISOString().split('T')[0]); // Default to today's date in YYYY-MM-DD format
      setShowMetadataDialog(true);
    }
    // Reset the input value so the same file can be selected again
    e.target.value = '';
  };
  
  const handleMetadataSubmit = () => {
    if (!pendingFile) return;
    
    // Validate required fields
    if (!letterSender.trim() || !letterRecipient.trim() || !letterSubject.trim() || !letterDate) {
      toast({
        title: "Missing information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }
    
    // Increment token for new upload
    uploadTokenRef.current += 1;
    const token = uploadTokenRef.current;
    currentUploadTokenRef.current = token;
    
    setUploadedLetter(pendingFile);
    setUploadedLetterId(null);
    setSearchResults([]);
    setSelectedReferences([]);
    setGeneratedResponse("");
    
    // Upload to backend with token and metadata
    uploadMutation.mutate({ 
      file: pendingFile, 
      token,
      metadata: {
        sender: letterSender,
        recipient: letterRecipient,
        subject: letterSubject,
        letterDate: letterDate,
      }
    });
    
    // Close dialog and reset form
    setShowMetadataDialog(false);
    setPendingFile(null);
    setLetterSender("");
    setLetterRecipient("");
    setLetterSubject("");
    setLetterDate("");
  };

  return (
    <div className="h-[calc(100vh-240px)]">
      {/* Main 2-Column Layout */}
      <ResizablePanelGroup 
        direction="horizontal" 
        className="h-full"
        onLayout={(sizes) => setMainColumnSizes(sizes)}
      >
        {/* LEFT COLUMN */}
        <ResizablePanel defaultSize={mainColumnSizes[0]} minSize={25}>
          <ResizablePanelGroup 
            direction="vertical" 
            className="h-full"
            onLayout={(sizes) => setLeftColumnSizes(sizes)}
          >
            {/* Top: Current Letter & Letter Register (Yellow/Red) */}
            <ResizablePanel defaultSize={leftColumnSizes[0]} minSize={10}>
              <Card className="h-full border-l-4 border-l-yellow-500 flex flex-col overflow-visible">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-yellow-600" />
                    Base Letter
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {uploadedLetterId ? `Letter #${letters.find(l => l.id === uploadedLetterId)?.letterNumber || ''}` : 'Select or upload a letter'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                  <ResizablePanelGroup direction="horizontal" className="h-full">
                    {/* Left: PDF Viewer */}
                    <ResizablePanel defaultSize={60} minSize={30}>
                      <div className="h-full flex flex-col">
                        {(uploadedLetter || uploadedLetterId) ? (
                          <>
                            {/* PDF Viewer Controls */}
                            <div className="flex items-center justify-between gap-2 pb-2 border-b mb-2">
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                                  disabled={pageNumber <= 1}
                                  data-testid="button-prev-page"
                                >
                                  Prev
                                </Button>
                                <span className="text-xs">
                                  Page {pageNumber} of {numPages || '?'}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                                  disabled={pageNumber >= numPages}
                                  data-testid="button-next-page"
                                >
                                  Next
                                </Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap w-8 text-right">{Math.round(scale * 100)}%</span>
                                <Slider
                                  value={[scale]}
                                  onValueChange={(value) => setScale(value[0])}
                                  min={0.5}
                                  max={2}
                                  step={0.1}
                                  className="w-16"
                                  data-testid="slider-zoom"
                                />
                              </div>
                            </div>
                            
                            {/* PDF Display */}
                            <div 
                              ref={currentLetterScrollRef}
                              className="flex-1 overflow-x-auto overflow-y-auto bg-muted/20 rounded-lg [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-md [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50"
                              style={{ 
                                cursor: isDragging ? 'grabbing' : 'grab',
                                scrollbarWidth: 'thin',
                                scrollbarColor: 'hsl(var(--muted-foreground) / 0.3) hsl(var(--muted))'
                              }}
                              onMouseDown={(e) => {
                                setIsDragging(true);
                                setDragStart({ x: e.clientX, y: e.clientY });
                              }}
                              onMouseMove={(e) => {
                                if (!isDragging || !currentLetterScrollRef.current) return;
                                const dx = e.clientX - dragStart.x;
                                const dy = e.clientY - dragStart.y;
                                currentLetterScrollRef.current.scrollLeft -= dx;
                                currentLetterScrollRef.current.scrollTop -= dy;
                                setDragStart({ x: e.clientX, y: e.clientY });
                              }}
                              onMouseUp={() => setIsDragging(false)}
                              onMouseLeave={() => setIsDragging(false)}
                            >
                              {uploadedLetter ? (
                                <Document
                                  file={uploadedLetter}
                                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                                  loading={
                                    <div className="flex items-center justify-center p-8">
                                      <Loader2 className="h-8 w-8 animate-spin text-yellow-700" />
                                    </div>
                                  }
                                >
                                  <Page 
                                    pageNumber={pageNumber} 
                                    scale={scale}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                  />
                                </Document>
                              ) : uploadedLetterId && letters.find(l => l.id === uploadedLetterId)?.fileUrl ? (
                                <Document
                                  file={letters.find(l => l.id === uploadedLetterId)?.fileUrl}
                                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                                  loading={
                                    <div className="flex items-center justify-center p-8">
                                      <Loader2 className="h-8 w-8 animate-spin text-yellow-700" />
                                    </div>
                                  }
                                >
                                  <Page 
                                    pageNumber={pageNumber} 
                                    scale={scale}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                  />
                                </Document>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <div className="h-full bg-muted/20 rounded-lg p-4 flex items-center justify-center">
                            <p className="text-xs text-muted-foreground text-center">
                              Select a letter from the register to view
                            </p>
                          </div>
                        )}
                      </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    {/* Right: Letter Register */}
                    <ResizablePanel defaultSize={40} minSize={25}>
                      <div className="h-full flex flex-col pl-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium">Letter Register:</p>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => regenerateEmbeddingsMutation.mutate()}
                              disabled={regenerateEmbeddingsMutation.isPending}
                              title="Regenerate embeddings for all letters (needed for AI search to work on old letters)"
                              data-testid="button-regenerate-embeddings"
                            >
                              {regenerateEmbeddingsMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                            </Button>
                            <label className="cursor-pointer">
                              <Button size="sm" variant="outline" className="h-7" asChild>
                                <span>
                                  <Upload className="h-3 w-3 mr-1" />
                                  Upload
                                </span>
                              </Button>
                              <input
                                type="file"
                                accept="application/pdf"
                                onChange={handleFileUpload}
                                className="hidden"
                                data-testid="input-upload-letter"
                                disabled={uploadMutation.isPending}
                              />
                            </label>
                          </div>
                        </div>
                        <div 
                          className="flex-1 overflow-auto [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-md [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50"
                          style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'hsl(var(--muted-foreground) / 0.3) hsl(var(--muted))'
                          }}
                        >
                          {isLoadingLetters ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin text-yellow-600" />
                            </div>
                          ) : letters.length > 0 ? (
                            <div className="space-y-2">
                              {letters.map((letter) => (
                                <div
                                  key={letter.id}
                                  className={`p-2 rounded border hover-elevate transition-colors cursor-pointer ${
                                    uploadedLetterId === letter.id ? 'border-yellow-600 bg-yellow-50 dark:bg-yellow-950/20' : 
                                    selectedReferences.includes(letter.id) ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/10' : ''
                                  }`}
                                  onClick={() => {
                                    if (uploadedLetterId !== letter.id) {
                                      // Save current letter's work before switching
                                      saveCurrentLetterWork();
                                      
                                      // Load the new letter
                                      setUploadedLetterId(letter.id);
                                      setUploadedLetter(null);
                                      setNumPages(0);
                                      setPageNumber(1);
                                      
                                      // Load the selected letter's work
                                      loadLetterWork(letter.id);
                                    }
                                  }}
                                  data-testid={`letter-register-${letter.id}`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2 flex-1">
                                      <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">
                                        Letter #{letter.letterNumber}
                                      </p>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm(`Delete Letter #${letter.letterNumber}?`)) {
                                            deleteMutation.mutate(letter.id);
                                          }
                                        }}
                                        data-testid={`button-delete-${letter.id}`}
                                      >
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </Button>
                                    </div>
                                    <Checkbox
                                      checked={selectedReferences.includes(letter.id)}
                                      onCheckedChange={(checked) => {
                                        setSelectedReferences(prev =>
                                          checked
                                            ? [...prev, letter.id]
                                            : prev.filter(id => id !== letter.id)
                                        );
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`checkbox-reference-${letter.id}`}
                                    />
                                  </div>
                                  <p className="text-xs font-medium truncate">{letter.subject || letter.fileName}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {letter.sender && `From: ${letter.sender}`}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              No letters uploaded yet
                            </p>
                          )}
                        </div>
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </CardContent>
              </Card>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom: Letter Preview (Brown/Orange) - Related Letters */}
            <ResizablePanel defaultSize={leftColumnSizes[1]} minSize={10}>
              <Card className="h-full border-l-4 border-l-amber-700 flex flex-col overflow-visible">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-700" />
                    Related Letters
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {uploadedLetterId ? (
                      searchSimilarMutation.isPending ? (
                        `Searching for similar letters...`
                      ) : (
                        `Related correspondence for Letter #${letters.find(l => l.id === uploadedLetterId)?.letterNumber || ''} (Letters found: ${searchResults.length} of ${sharePointDocCount})`
                      )
                    ) : 'AI suggestions will appear here'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                  {uploadedLetterId ? (
                    <ResizablePanelGroup 
                      direction="horizontal" 
                      className="h-full"
                      onLayout={(sizes) => setPreviewPanelSizes(sizes)}
                    >
                      {/* Left: Preview of selected similar letter */}
                      <ResizablePanel defaultSize={previewPanelSizes[0]} minSize={40}>
                        <div className="h-full flex flex-col pr-3">
                          <p className="text-xs font-medium mb-2">Preview:</p>
                          {selectedPreviewLetter ? (
                            <div className="flex-1 flex flex-col gap-2">
                              {/* Preview Controls */}
                              <div className="flex items-center justify-between gap-2 pb-2 border-b" key={selectedPreviewLetter.id}>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPreviewPageNumber(Math.max(1, previewPageNumber - 1))}
                                    disabled={previewPageNumber <= 1}
                                    data-testid="button-preview-prev-page"
                                  >
                                    Prev
                                  </Button>
                                  <span className="text-xs">
                                    Page {previewPageNumber} of {previewNumPages || '?'}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPreviewPageNumber(Math.min(previewNumPages, previewPageNumber + 1))}
                                    disabled={previewPageNumber >= previewNumPages}
                                    data-testid="button-preview-next-page"
                                  >
                                    Next
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap w-8 text-right">{Math.round(previewScale * 100)}%</span>
                                  <Slider
                                    value={[previewScale]}
                                    onValueChange={(value) => setPreviewScale(value[0])}
                                    min={0.5}
                                    max={2}
                                    step={0.1}
                                    className="w-16"
                                    data-testid="slider-preview-zoom"
                                  />
                                </div>
                              </div>
                              
                              {/* PDF Display */}
                              <div 
                                ref={previewLetterScrollRef}
                                className="flex-1 overflow-x-auto overflow-y-auto bg-muted/20 rounded-lg [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-md [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50"
                                style={{ 
                                  cursor: isPreviewDragging ? 'grabbing' : 'grab',
                                  scrollbarWidth: 'thin',
                                  scrollbarColor: 'hsl(var(--muted-foreground) / 0.3) hsl(var(--muted))'
                                }}
                                onMouseDown={(e) => {
                                  setIsPreviewDragging(true);
                                  setPreviewDragStart({ x: e.clientX, y: e.clientY });
                                }}
                                onMouseMove={(e) => {
                                  if (!isPreviewDragging || !previewLetterScrollRef.current) return;
                                  const dx = e.clientX - previewDragStart.x;
                                  const dy = e.clientY - previewDragStart.y;
                                  previewLetterScrollRef.current.scrollLeft -= dx;
                                  previewLetterScrollRef.current.scrollTop -= dy;
                                  setPreviewDragStart({ x: e.clientX, y: e.clientY });
                                }}
                                onMouseUp={() => setIsPreviewDragging(false)}
                                onMouseLeave={() => setIsPreviewDragging(false)}
                              >
                                {selectedPreviewLetter ? (
                                  <Document
                                    file={`/api/correspondence/letters/${selectedPreviewLetter.id}/pdf`}
                                    onLoadSuccess={({ numPages }) => {
                                      setPreviewNumPages(numPages);
                                      setIsPreviewPdfLoading(false);
                                    }}
                                    onLoadError={(error) => {
                                      console.error('[Preview] Failed to load PDF:', error);
                                      setIsPreviewPdfLoading(false);
                                    }}
                                    loading={
                                      <div className="flex items-center justify-center p-8">
                                        <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
                                      </div>
                                    }
                                    error={
                                      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                                        Failed to load PDF file.
                                      </div>
                                    }
                                  >
                                    <Page 
                                      pageNumber={previewPageNumber} 
                                      scale={previewScale}
                                      renderTextLayer={false}
                                      renderAnnotationLayer={false}
                                    />
                                  </Document>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 bg-muted/20 rounded-lg p-4 flex items-center justify-center">
                              <p className="text-xs text-muted-foreground text-center">
                                Select a letter from AI suggestions
                              </p>
                            </div>
                          )}
                        </div>
                      </ResizablePanel>

                      <ResizableHandle withHandle />

                      {/* Right: List of AI-suggested similar letters */}
                      <ResizablePanel defaultSize={previewPanelSizes[1]} minSize={30}>
                        <div className="h-full flex flex-col pl-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium">AI Suggestions:</p>
                          </div>
                          <div 
                            className="flex-1 overflow-auto [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-md [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50"
                            style={{
                              scrollbarWidth: 'thin',
                              scrollbarColor: 'hsl(var(--muted-foreground) / 0.3) hsl(var(--muted))'
                            }}
                          >
                            {searchResults.length > 0 ? (
                              <div className="space-y-2">
                                {searchResults.map((letter) => (
                                  <div
                                    key={letter.id}
                                    className={`p-2 rounded border hover-elevate transition-colors ${
                                      selectedPreviewLetter?.id === letter.id ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/20' : ''
                                    }`}
                                    data-testid={`ai-suggested-letter-${letter.id}`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <Checkbox
                                        checked={selectedReferences.includes(letter.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setSelectedReferences([...selectedReferences, letter.id]);
                                          } else {
                                            setSelectedReferences(selectedReferences.filter(id => id !== letter.id));
                                          }
                                        }}
                                        className="mt-0.5"
                                        data-testid={`checkbox-reference-${letter.id}`}
                                      />
                                      <div 
                                        className="flex-1 cursor-pointer"
                                        onClick={() => {
                                          setIsPreviewPdfLoading(true);
                                          setSelectedPreviewLetter(letter);
                                          setPreviewPageNumber(1);
                                        }}
                                      >
                                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                          Letter #{letter.letterNumber}
                                        </p>
                                        <p className="text-xs font-medium truncate">{letter.subject || letter.fileName}</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {letter.sender && `From: ${letter.sender}`}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-center py-4 space-y-3">
                                <p className="text-muted-foreground">
                                  No similar letters found
                                </p>
                                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-left">
                                  <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                                    📊 Search Status
                                  </p>
                                  <div className="text-amber-700 dark:text-amber-300 space-y-1">
                                    <p>
                                      • Uploaded letters: {letters.filter(l => l.source === 'upload').length}
                                    </p>
                                    <p>
                                      • SharePoint letters: {letters.filter(l => l.source === 'sharepoint').length}
                                    </p>
                                    <p className="text-xs mt-2">
                                      {letters.filter(l => l.source === 'sharepoint').length === 0 ? (
                                        <>
                                          No SharePoint documents indexed. Go to <strong>Settings tab</strong> → configure SharePoint site URL & folder path → verify folder contains PDFs.
                                        </>
                                      ) : (
                                        <>
                                          AI is searching {letters.length} total letter{letters.length !== 1 ? 's' : ''} (uploaded + SharePoint).
                                        </>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  ) : (
                    <div className="h-full bg-muted/20 rounded-lg p-4 flex items-center justify-center">
                      <p className="text-xs text-muted-foreground text-center">
                        Select a letter to see AI-recommended similar correspondence
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT COLUMN */}
        <ResizablePanel defaultSize={mainColumnSizes[1]} minSize={25}>
          <ResizablePanelGroup 
            direction="vertical" 
            className="h-full"
            onLayout={(sizes) => setRightColumnSizes(sizes)}
          >
            {/* Top: AI Instructions (Purple) */}
            <ResizablePanel defaultSize={rightColumnSizes[0]} minSize={10}>
              <Card className="h-full border-l-4 border-l-purple-500 flex flex-col overflow-visible">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-purple-500" />
                    AI Instructions
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Custom response guidance
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-visible">
                  <ResizablePanelGroup 
                    direction="horizontal" 
                    className="h-full"
                    onLayout={(sizes) => setInstructionsSizes(sizes)}
                  >
                    {/* Checkboxes on the left */}
                    <ResizablePanel defaultSize={instructionsSizes[0]} minSize={25}>
                      <div className="space-y-2 h-full overflow-auto pr-3">
                        {[
                          'Respond professionally and courteously',
                          'Address all points raised in the letter',
                          'Request clarification on unclear items',
                          'Acknowledge receipt and provide timeline',
                          'Reference relevant contract/project details',
                          'Maintain formal business tone',
                        ].map((option) => (
                          <div key={option} className="flex items-center space-x-2">
                            <Checkbox
                              id={option}
                              checked={selectedOptions.includes(option)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedOptions([...selectedOptions, option]);
                                } else {
                                  setSelectedOptions(selectedOptions.filter(o => o !== option));
                                }
                              }}
                              data-testid={`checkbox-instruction-${option.substring(0, 20)}`}
                            />
                            <Label
                              htmlFor={option}
                              className="text-xs font-normal cursor-pointer"
                            >
                              {option}
                            </Label>
                          </div>
                        ))}
                        
                        {/* Tone options - mutually exclusive */}
                        <div className="pt-2 border-t space-y-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Tone:</p>
                          {[
                            'Be agreeable with the letter',
                            'Be disagreeable with the letter',
                          ].map((option) => (
                            <div key={option} className="flex items-center space-x-2">
                              <Checkbox
                                id={option}
                                checked={selectedOptions.includes(option)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    // Remove the other tone option if present
                                    const otherTone = option === 'Be agreeable with the letter' 
                                      ? 'Be disagreeable with the letter'
                                      : 'Be agreeable with the letter';
                                    setSelectedOptions([...selectedOptions.filter(o => o !== otherTone), option]);
                                  } else {
                                    setSelectedOptions(selectedOptions.filter(o => o !== option));
                                  }
                                }}
                                data-testid={`checkbox-instruction-${option.substring(0, 20)}`}
                              />
                              <Label
                                htmlFor={option}
                                className="text-xs font-normal cursor-pointer"
                              >
                                {option}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />
                    
                    {/* Text area on the right */}
                    <ResizablePanel defaultSize={instructionsSizes[1]} minSize={25}>
                      <div className="flex flex-col h-full pl-3">
                        <Label htmlFor="custom-instructions" className="text-xs mb-1 block">
                          Additional Instructions:
                        </Label>
                        <Textarea
                          id="custom-instructions"
                          placeholder="E.g., Emphasize cost implications, request meeting for item 5..."
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          className="flex-1 resize-none"
                          data-testid="textarea-ai-instructions"
                        />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </CardContent>
              </Card>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom: AI Draft Letter (Blue) */}
            <ResizablePanel defaultSize={rightColumnSizes[1]} minSize={10}>
              <Card className="h-full border-l-4 border-l-blue-500 flex flex-col overflow-visible">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    AI Draft Letter
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Generated letter
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3 overflow-auto">
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      disabled={!uploadedLetterId || generateMutation.isPending}
                      onClick={() => generateMutation.mutate()}
                      data-testid="button-generate-response"
                    >
                      {generateMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate AI Draft Letter
                        </>
                      )}
                    </Button>
                    
                    {/* Progress Indicator */}
                    {generationProgress && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{generationProgress.stage}</span>
                          <span className="font-medium">{Math.round(generationProgress.progress)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-300 ease-out"
                            style={{ width: `${generationProgress.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 bg-muted/20 rounded-lg p-4 overflow-auto">
                    {generatedResponse ? (
                      <div className="text-sm whitespace-pre-wrap">{generatedResponse}</div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center">
                        Generated response will appear here
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
      
      {/* Letter Metadata Dialog */}
      <Dialog open={showMetadataDialog} onOpenChange={setShowMetadataDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Letter Details</DialogTitle>
            <DialogDescription>
              Enter the letter metadata before uploading
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sender">Sender</Label>
              <Input
                id="sender"
                placeholder="e.g., Construction Manager"
                value={letterSender}
                onChange={(e) => setLetterSender(e.target.value)}
                data-testid="input-letter-sender"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient</Label>
              <Input
                id="recipient"
                placeholder="e.g., Project Director"
                value={letterRecipient}
                onChange={(e) => setLetterRecipient(e.target.value)}
                data-testid="input-letter-recipient"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="e.g., Signalling System - Design Clarification"
                value={letterSubject}
                onChange={(e) => setLetterSubject(e.target.value)}
                data-testid="input-letter-subject"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="letterDate">Letter Date</Label>
              <Input
                id="letterDate"
                type="date"
                value={letterDate}
                onChange={(e) => setLetterDate(e.target.value)}
                data-testid="input-letter-date"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMetadataDialog(false);
                setPendingFile(null);
                setLetterSender("");
                setLetterRecipient("");
                setLetterSubject("");
                setLetterDate("");
              }}
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMetadataSubmit}
              disabled={uploadMutation.isPending}
              data-testid="button-submit-upload"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload Letter"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Viewer/Editor Dialog for Generated Draft Letter */}
      <Dialog open={isViewerDialogOpen} onOpenChange={setIsViewerDialogOpen}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>AI Generated Draft Letter</DialogTitle>
            <DialogDescription>
              Review and edit the generated letter. You can save it or export to Word format.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* Usage Information and Toggle */}
            <div className="flex items-center justify-between gap-4">
              {usageInfo && (
                <div className="flex gap-4 text-xs text-muted-foreground bg-muted/30 p-3 rounded flex-1">
                  <span>Tokens: {usageInfo.totalTokens.toLocaleString()}</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>Input: {usageInfo.inputTokens.toLocaleString()}</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>Output: {usageInfo.outputTokens.toLocaleString()}</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>Cost: ${usageInfo.estimatedCost.toFixed(4)}</span>
                </div>
              )}
              
              {/* Toggle between original AI and edited */}
              {originalAILetter && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="show-original" className="text-xs cursor-pointer">
                    {showOriginalAI ? 'Viewing Original AI' : 'Viewing Edited'}
                  </Label>
                  <Button
                    size="sm"
                    variant={showOriginalAI ? "default" : "outline"}
                    onClick={() => setShowOriginalAI(!showOriginalAI)}
                    data-testid="button-toggle-original-ai"
                  >
                    {showOriginalAI ? 'Show Edited' : 'Show Original AI'}
                  </Button>
                </div>
              )}
            </div>
            
            {/* Letter Content - Blue text when AI-generated, black when edited */}
            <div className="flex-1 min-h-0">
              {showOriginalAI ? (
                <div className="h-full overflow-auto bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border-2 border-blue-300 dark:border-blue-800">
                  <div className="text-sm font-mono text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
                    {originalAILetter}
                  </div>
                </div>
              ) : (
                <Textarea
                  value={editedDraftLetter}
                  onChange={(e) => {
                    setEditedDraftLetter(e.target.value);
                  }}
                  className={`h-full resize-none font-mono text-sm ${
                    editedDraftLetter === originalAILetter && originalAILetter
                      ? 'text-blue-600 dark:text-blue-400'
                      : ''
                  }`}
                  placeholder="Generated letter will appear here..."
                  data-testid="textarea-draft-letter"
                />
              )}
            </div>
            
            {/* Edited Indicator */}
            {!showOriginalAI && editedDraftLetter !== originalAILetter && originalAILetter && (
              <div className="text-xs text-muted-foreground flex items-center gap-2 bg-muted/50 p-2 rounded">
                <span>✓ Content edited (original AI version available via toggle above)</span>
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsViewerDialogOpen(false)}
              data-testid="button-close-viewer"
            >
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // Remove all 88xxx88 structural markers
                const cleaned = editedDraftLetter.replace(/88\d{3}88/g, '');
                setEditedDraftLetter(cleaned);
                toast({
                  title: "Markers removed",
                  description: "Structural markers (88xxx88) have been removed",
                });
              }}
              disabled={!editedDraftLetter || !editedDraftLetter.match(/88\d{3}88/)}
              data-testid="button-remove-markers"
            >
              <Eraser className="h-4 w-4 mr-2" />
              Remove 88xxx88
            </Button>
            <Button
              variant="outline"
              onClick={() => exportWordMutation.mutate()}
              disabled={exportWordMutation.isPending || !editedDraftLetter}
              data-testid="button-export-word"
            >
              {exportWordMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Export to Word
                </>
              )}
            </Button>
            <Button
              onClick={() => saveDraftMutation.mutate()}
              disabled={saveDraftMutation.isPending || !editedDraftLetter}
              data-testid="button-save-draft"
            >
              {saveDraftMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Draft"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
