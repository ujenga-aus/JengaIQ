import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ColumnSelectionDialog } from "@/components/ColumnSelectionDialog";
import { ContractParsingProgressDialog } from "@/components/ContractParsingProgressDialog";

interface ImportContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  templateId: string;
  onSuccess: (newRevisionId: string) => void;
}

export function ImportContractDialog({
  open,
  onOpenChange,
  projectId,
  templateId,
  onSuccess,
}: ImportContractDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [noContractToUpload, setNoContractToUpload] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showColumnSelection, setShowColumnSelection] = useState(false);
  const [parsingRevisionId, setParsingRevisionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast} = useToast();

  const validateFile = (selectedFile: File) => {
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(selectedFile.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF or Word document.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && validateFile(droppedFile)) {
      setFile(droppedFile);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = () => {
    if (!file && !noContractToUpload) {
      toast({
        title: "No file selected",
        description: "Please select a contract file or check 'No contract to upload'.",
        variant: "destructive",
      });
      return;
    }

    // Open column selection dialog
    setShowColumnSelection(true);
  };

  const handleCreateRevisionWithColumns = async (selectedColumnIds: string[]) => {
    setIsUploading(true);

    try {
      const formData = new FormData();
      if (file) {
        formData.append('contractFile', file);
      }
      formData.append('templateId', templateId);
      formData.append('notes', notes);
      formData.append('noContractToUpload', noContractToUpload.toString());
      formData.append('createdBy', 'Current User'); // TODO: get from auth context
      formData.append('selectedTemplateColumnIds', JSON.stringify(selectedColumnIds));

      const response = await fetch(`/api/projects/${projectId}/contract-review/revisions`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create revision');
      }

      const result = await response.json();

      toast({
        title: noContractToUpload ? "Revision created" : "Contract uploaded",
        description: `Revision ${result.revision.revisionNumber} created successfully.`,
      });

      // Reset form
      setFile(null);
      setNotes("");
      setNoContractToUpload(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Immediately update parent to show new revision in UI
      onSuccess(result.revision.id);
      
      // Close the import dialog
      onOpenChange(false);
      
      // Show parsing progress dialog (non-blocking for UI updates)
      setParsingRevisionId(result.revision.id);
    } catch (error: any) {
      console.error('Upload error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      toast({
        title: "Upload failed",
        description: error.message || "Failed to create revision. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-import-contract">
          <DialogHeader>
            <DialogTitle>Create New Revision</DialogTitle>
          </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Contract File (Optional)</Label>
            <div className="space-y-2">
              {!file && !noContractToUpload ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover-elevate active-elevate-2 transition-colors ${
                    isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                  }`}
                  data-testid="button-select-file"
                >
                  <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm text-muted-foreground">
                    {isDragging ? 'Drop file here' : 'Click or drag to select a contract file'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supported: PDF, DOC, DOCX
                  </p>
                </div>
              ) : file ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                  <FileText className="h-8 w-8 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFile}
                    data-testid="button-remove-file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    No contract file will be uploaded with this revision
                  </p>
                </div>
              )}
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file"
              />
            </div>
          </div>

          {/* No Contract Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="no-contract"
              checked={noContractToUpload}
              onCheckedChange={(checked) => {
                setNoContractToUpload(checked === true);
                if (checked) {
                  setFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }
              }}
              data-testid="checkbox-no-contract"
            />
            <Label
              htmlFor="no-contract"
              className="text-sm font-normal cursor-pointer"
            >
              No contract to upload with this revision
            </Label>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this revision..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="input-notes"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUploading}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={(!file && !noContractToUpload) || isUploading}
              data-testid="button-upload"
            >
              {isUploading ? "Creating..." : "Next: Select Columns"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <ColumnSelectionDialog
      open={showColumnSelection}
      onOpenChange={setShowColumnSelection}
      templateId={templateId}
      onConfirm={handleCreateRevisionWithColumns}
    />
    
    <ContractParsingProgressDialog
      open={parsingRevisionId !== null}
      revisionId={parsingRevisionId}
      onClose={() => setParsingRevisionId(null)}
      onComplete={() => {
        // Just close dialog - parent already refreshed when revision was created
        setParsingRevisionId(null);
      }}
    />
    </>
  );
}
