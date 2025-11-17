import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, XCircle, Eye, Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UploadTemplateDialog } from "@/components/UploadTemplateDialog";
import { DocumentViewer } from "@/components/DocumentViewer";
import { TemplateDataViewer } from "@/components/TemplateDataViewer";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

export default function ContractTemplates({ 
  businessUnitId, 
  hideHeader = false 
}: { 
  businessUnitId?: string; 
  hideHeader?: boolean 
}) {
  const { toast } = useToast();
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  
  // Load saved fullscreen preference from localStorage, default to false
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(() => {
    const saved = localStorage.getItem('templateViewerFullscreen');
    return saved === 'true';
  });

  // Save fullscreen preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('templateViewerFullscreen', isPreviewFullscreen.toString());
  }, [isPreviewFullscreen]);

  // Fetch templates for this business unit
  const { data: templates, isLoading: isLoadingTemplates } = useQuery({
    queryKey: businessUnitId ? ["/api/business-units", businessUnitId, "templates"] : [],
    enabled: !!businessUnitId,
  });

  // Fetch business unit details for the name
  const { data: businessUnit } = useQuery<{ id: string; name: string; abn: string; notes: string; companyId: string }>({
    queryKey: businessUnitId ? ["/api/business-units", businessUnitId] : [],
    enabled: !!businessUnitId,
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete template");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/business-units", businessUnitId, "templates"] 
      });
      toast({
        title: "Template deleted",
        description: "The template has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleTemplateUpload = async (template: {
    version: string;
    fileName: string;
    notes: string;
    isActive: boolean;
    fileUrl: string;
    columnConfigs?: any[];
  }) => {
    console.log('[CT] handleTemplateUpload called with:', { 
      version: template.version, 
      fileName: template.fileName,
      fileUrl: template.fileUrl
    });
    
    try {
      console.log('[CT] Creating template via POST to /api/business-units/', businessUnitId, '/templates');
      const response = await fetch(`/api/business-units/${businessUnitId}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessUnitId,
          version: template.version,
          fileName: template.fileName,
          fileUrl: template.fileUrl,
          uploadedBy: 'Current User',
          uploadedDate: new Date().toISOString(),
          notes: template.notes,
          isActive: template.isActive,
        }),
      });

      console.log('[CT] Template creation response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CT] Template creation failed:', errorText);
        throw new Error('Failed to create template');
      }

      const newTemplate = await response.json();
      console.log('[CT] Template created successfully:', newTemplate.id);

      if (template.columnConfigs && template.columnConfigs.length > 0) {
        console.log('[CT] Saving column configs...');
        await fetch(`/api/templates/${newTemplate.id}/columns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columns: template.columnConfigs }),
        });
        console.log('[CT] Column configs saved');
      }

      console.log('[CT] Invalidating queries...');
      queryClient.invalidateQueries({ 
        queryKey: ["/api/business-units", businessUnitId, "templates"] 
      });
      console.log('[CT] Upload complete!');
      
      return newTemplate;
    } catch (error) {
      console.error('[CT] Failed to upload template:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload template. Please try again.",
        variant: "destructive",
      });
      throw error; // Re-throw so the dialog knows it failed
    }
  };

  if (!businessUnitId) {
    return (
      <div className="space-y-6">
        {!hideHeader && (
          <div>
            <h1>Contract Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage contract review templates for this business unit</p>
          </div>
        )}
        
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Please select a business unit to view templates</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div>
          <h1>Contract Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage contract review templates for this business unit</p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2>Contract Review Templates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage template versions for this business unit. Projects will use the active template.
          </p>
        </div>
        {businessUnit && (
          <UploadTemplateDialog 
            businessUnitId={businessUnitId} 
            businessUnitName={businessUnit.name}
            onUpload={handleTemplateUpload}
          />
        )}
      </div>

      <div className="space-y-3">
        {isLoadingTemplates ? (
          <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
        ) : (templates as any[])?.length > 0 ? (
          (templates as any[])?.map((template: any) => (
            <Card key={template.id} className={template.isActive ? 'border-primary' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Version {template.version}</h3>
                      {template.isActive ? (
                        <Badge variant="success" className="gap-1" data-testid={`badge-active-${template.id}`}>
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground" data-testid={`badge-superseded-${template.id}`}>
                          <XCircle className="h-3 w-3" />
                          Superseded
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{template.fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      Uploaded by {template.uploadedBy} on {template.uploadedDate}
                    </p>
                    {template.notes && (
                      <p className="text-sm mt-2">{template.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setPreviewTemplate(template)}
                      data-testid={`button-preview-${template.id}`}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View File
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = template.fileUrl;
                        link.download = template.fileName;
                        link.click();
                      }}
                      data-testid={`button-download-${template.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          data-testid={`button-delete-template-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete version {template.version}? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid={`button-cancel-delete-${template.id}`}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTemplateMutation.mutate(template.id)}
                            data-testid={`button-confirm-delete-${template.id}`}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No templates uploaded yet</p>
              <p className="text-sm text-muted-foreground mt-2">Click "Upload New Version" to add a template</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className={isPreviewFullscreen ? "w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto" : "max-w-6xl max-h-[90vh] overflow-y-auto"}>
            <DialogHeader>
              <DialogTitle>Template Preview: Version {previewTemplate.version}</DialogTitle>
            </DialogHeader>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Template Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-muted-foreground">Version</p>
                    <p className="font-medium">{previewTemplate.version}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">File Name</p>
                    <p className="font-medium font-mono text-xs">{previewTemplate.fileName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Uploaded By</p>
                    <p className="font-medium">{previewTemplate.uploadedBy}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Upload Date</p>
                    <p className="font-medium">{previewTemplate.uploadedDate}</p>
                  </div>
                </div>
                {previewTemplate.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-sm mt-1">{previewTemplate.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {previewTemplate.fileUrl && !previewTemplate.fileUrl.startsWith('blob:') ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/30 p-3 border-b flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {(() => {
                      const ext = previewTemplate.fileName.split('.').pop()?.toLowerCase();
                      return (ext === 'xlsx' || ext === 'xls') ? 'Template Data (Live from Database)' : 'File Preview (Read-Only)';
                    })()}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {previewTemplate.fileName.split('.').pop()?.toUpperCase()} Document
                  </Badge>
                </div>
                {(() => {
                  const ext = previewTemplate.fileName.split('.').pop()?.toLowerCase();
                  if (ext === 'xlsx' || ext === 'xls') {
                    return (
                      <TemplateDataViewer 
                        templateId={previewTemplate.id}
                        isFullscreen={isPreviewFullscreen}
                        onToggleFullscreen={() => setIsPreviewFullscreen(!isPreviewFullscreen)}
                      />
                    );
                  }
                  return (
                    <DocumentViewer 
                      fileUrl={previewTemplate.fileUrl} 
                      fileName={previewTemplate.fileName}
                      isFullscreen={isPreviewFullscreen}
                      onToggleFullscreen={() => setIsPreviewFullscreen(!isPreviewFullscreen)}
                    />
                  );
                })()}
              </div>
            ) : previewTemplate.fileUrl?.startsWith('blob:') ? (
              <div className="border rounded-lg p-8 bg-destructive/10 text-center space-y-3">
                <FileText className="h-12 w-12 mx-auto text-destructive/70" />
                <div>
                  <p className="font-medium text-destructive">File No Longer Available</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This file was uploaded with a temporary link and needs to be re-uploaded
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Please delete this template and upload a new version
                  </p>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-8 bg-muted/30 text-center space-y-3">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-medium">No Preview Available</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This template was created before file preview was implemented
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
