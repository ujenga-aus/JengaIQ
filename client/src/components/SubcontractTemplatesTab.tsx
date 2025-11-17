import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Plus, Trash2, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

interface SubcontractTemplatesTabProps {
  projectId: string;
  project: Project | undefined;
}

export function SubcontractTemplatesTab({ projectId, project }: SubcontractTemplatesTabProps) {
  const { toast } = useToast();
  const [uploadHeadContractOpen, setUploadHeadContractOpen] = useState(false);
  const [uploadSpecsOpen, setUploadSpecsOpen] = useState(false);
  const [createDraftOpen, setCreateDraftOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Fetch company templates
  const { data: templates = [] } = useQuery({
    queryKey: ['/api/subcontract-templates'],
    queryFn: async () => {
      const response = await fetch('/api/subcontract-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Fetch drafts for this project
  const { data: drafts = [], isLoading: draftsLoading } = useQuery({
    queryKey: ['/api/projects', projectId, 'special-conditions'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/special-conditions`);
      if (!response.ok) throw new Error('Failed to fetch drafts');
      return response.json();
    },
    enabled: !!projectId,
  });

  // Delete draft mutation
  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/special-conditions/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'special-conditions'] });
      toast({
        title: "Draft deleted",
        description: "The special conditions draft has been removed",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create draft mutation
  const createDraftMutation = useMutation({
    mutationFn: async (data: { title: string; templateId?: string }) => {
      return await apiRequest('POST', `/api/projects/${projectId}/special-conditions`, {
        title: data.title,
        templateId: data.templateId || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'special-conditions'] });
      toast({
        title: "Draft created",
        description: "Special conditions draft has been created",
      });
      setCreateDraftOpen(false);
      setDraftTitle('');
      setSelectedTemplateId('');
    },
    onError: (error) => {
      toast({
        title: "Error creating draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUploadHeadContract = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('projectId', projectId);

    try {
      const response = await fetch('/api/special-conditions/upload-head-contract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      toast({
        title: "Head contract uploaded",
        description: "The head contract PDF has been uploaded",
      });
      
      setUploadHeadContractOpen(false);
      setSelectedFile(null);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadSpecifications = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('projectId', projectId);

    try {
      const response = await fetch('/api/special-conditions/upload-specifications', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      toast({
        title: "Specifications uploaded",
        description: "The specifications PDF has been uploaded",
      });
      
      setUploadSpecsOpen(false);
      setSelectedFile(null);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateDraft = () => {
    if (!draftTitle.trim()) {
      toast({
        title: "Missing title",
        description: "Please enter a title for the draft",
        variant: "destructive",
      });
      return;
    }

    createDraftMutation.mutate({
      title: draftTitle.trim(),
      templateId: selectedTemplateId || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Project Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Project Documents</CardTitle>
          <CardDescription>
            Upload the head contract and specifications for this project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Head Contract</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUploadHeadContractOpen(true)}
                  data-testid="button-upload-head-contract"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>
              {project?.headContractFileKey ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>Uploaded</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not uploaded</p>
              )}
            </div>

            <div className="border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Specifications</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUploadSpecsOpen(true)}
                  data-testid="button-upload-specifications"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>
              {project?.specificationsFileKey ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>Uploaded</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not uploaded</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Special Conditions Drafts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Special Conditions Drafts</CardTitle>
              <CardDescription>
                Create and manage special conditions drafts with AI assistance
              </CardDescription>
            </div>
            <Button
              onClick={() => setCreateDraftOpen(true)}
              data-testid="button-create-draft"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Draft
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {draftsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading drafts...</div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No drafts yet. Click "New Draft" to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft: any) => (
                <div
                  key={draft.id}
                  className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                  data-testid={`draft-row-${draft.id}`}
                >
                  <div className="flex-1">
                    <div className="font-medium">{draft.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {draft.isLocked ? 'Locked' : 'Draft'} • {new Date(draft.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // TODO: Open editor
                        toast({
                          title: "Editor coming soon",
                          description: "The draft editor is being implemented",
                        });
                      }}
                      data-testid={`button-edit-${draft.id}`}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    {!draft.isLocked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete draft "${draft.title}"?`)) {
                            deleteDraftMutation.mutate(draft.id);
                          }
                        }}
                        data-testid={`button-delete-${draft.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Head Contract Dialog */}
      <Dialog open={uploadHeadContractOpen} onOpenChange={setUploadHeadContractOpen}>
        <DialogContent data-testid="dialog-upload-head-contract">
          <DialogHeader>
            <DialogTitle>Upload Head Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="head-contract-file">PDF File</Label>
              <Input
                id="head-contract-file"
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                data-testid="input-head-contract-file"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setUploadHeadContractOpen(false);
                setSelectedFile(null);
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadHeadContract}
              disabled={!selectedFile || isUploading}
              data-testid="button-upload"
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Specifications Dialog */}
      <Dialog open={uploadSpecsOpen} onOpenChange={setUploadSpecsOpen}>
        <DialogContent data-testid="dialog-upload-specifications">
          <DialogHeader>
            <DialogTitle>Upload Specifications</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="specs-file">PDF File</Label>
              <Input
                id="specs-file"
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                data-testid="input-specs-file"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setUploadSpecsOpen(false);
                setSelectedFile(null);
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadSpecifications}
              disabled={!selectedFile || isUploading}
              data-testid="button-upload"
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Draft Dialog */}
      <Dialog open={createDraftOpen} onOpenChange={setCreateDraftOpen}>
        <DialogContent data-testid="dialog-create-draft">
          <DialogHeader>
            <DialogTitle>Create Special Conditions Draft</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="draft-title">Draft Title</Label>
              <Input
                id="draft-title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="e.g., Special Conditions - Package A"
                data-testid="input-draft-title"
              />
            </div>
            <div>
              <Label htmlFor="template-select">Template (Optional)</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger id="template-select" data-testid="select-template">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map((template: any) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setCreateDraftOpen(false);
                setDraftTitle('');
                setSelectedTemplateId('');
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDraft}
              disabled={!draftTitle.trim() || createDraftMutation.isPending}
              data-testid="button-create"
            >
              {createDraftMutation.isPending ? "Creating..." : "Create Draft"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
