import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, X, AlertTriangle } from "lucide-react";

interface BOQImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  revisionId: string;
  onSuccess: () => void;
}

export function BOQImportDialog({ open, onOpenChange, projectId, revisionId, onSuccess }: BOQImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<"upload" | "selectHeader" | "mapping">("upload");
  const [isImporting, setIsImporting] = useState(false);

  // Preview data from Excel
  const [excelColumns, setExcelColumns] = useState<Array<{ header: string; orderIndex: number }>>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [headerRowNumber, setHeaderRowNumber] = useState<number>(1);
  const [rawRows, setRawRows] = useState<any[]>([]);

  // Column mapping - maps Excel column name to BOQ field name
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  
  // Import options
  const [deleteExisting, setDeleteExisting] = useState<boolean>(false);
  
  // Import progress tracking
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    percentage: number;
    importedCount?: number;
    failedCount?: number;
    failedRows?: Array<{ row: number; itemNumber: string; description: string; reason: string }>;
    validationIssues?: Array<{ field: string; missingCount: number }>;
  } | null>(null);
  const [importReport, setImportReport] = useState<{
    importedCount: number;
    failedCount: number;
    failedRows: Array<{ row: number; itemNumber: string; description: string; reason: string }>;
    validationIssues?: Array<{ field: string; missingCount: number }>;
  } | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on unmount or dialog close
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const boqFields = [
    { value: "itemNumber", label: "Item Number" },
    { value: "description", label: "Description" },
    { value: "unit", label: "Unit" },
    { value: "quantity", label: "Quantity" },
    { value: "rate", label: "Rate" },
    { value: "amount", label: "Amount" },
    { value: "notes", label: "Notes" },
    { value: "_ignore", label: "(Ignore this column)" },
  ];

  const validateFile = (selectedFile: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
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

  const handlePreview = async () => {
    if (!file) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/projects/${projectId}/boq/import/preview`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to preview Excel file');
      }

      const data = await response.json();
      setRawRows(data.rawRows || []);
      setHeaderRowNumber(data.headerRowNumber || 1);

      // Go to header selection step
      setStep("selectHeader");
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: "Preview failed",
        description: "Failed to read Excel file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleHeaderSelection = (selectedRowIndex: number) => {
    if (!rawRows || rawRows.length === 0) return;

    const selectedRow = rawRows[selectedRowIndex];
    if (!selectedRow) return;

    // Build columns from selected header row
    const columns: Array<{ header: string; orderIndex: number }> = [];
    Object.keys(selectedRow).forEach((key, index) => {
      const header = selectedRow[key]?.toString() || `Column ${index + 1}`;
      columns.push({
        header,
        orderIndex: index,
      });
    });

    setExcelColumns(columns);
    setHeaderRowNumber(selectedRowIndex + 1);

    // Build preview rows (rows after the selected header)
    const dataRows = rawRows.slice(selectedRowIndex + 1, selectedRowIndex + 11);
    setPreviewRows(dataRows);

    // Auto-map columns based on header names (case-insensitive)
      const autoMapping: Record<string, string> = {};
      columns.forEach((col) => {
        const lowerHeader = col.header.toLowerCase();
        if (lowerHeader.includes('item') && lowerHeader.includes('num')) {
          autoMapping[col.header] = 'itemNumber';
        } else if (lowerHeader.includes('descri')) {
          autoMapping[col.header] = 'description';
        } else if (lowerHeader.includes('unit')) {
          autoMapping[col.header] = 'unit';
        } else if (lowerHeader.includes('qty') || lowerHeader.includes('quantity')) {
          autoMapping[col.header] = 'quantity';
        } else if (lowerHeader.includes('rate') || lowerHeader.includes('price')) {
          autoMapping[col.header] = 'rate';
        } else if (lowerHeader.includes('amount') || lowerHeader.includes('total')) {
          autoMapping[col.header] = 'amount';
        } else if (lowerHeader.includes('note')) {
          autoMapping[col.header] = 'notes';
        }
      });
      setColumnMapping(autoMapping);

    setStep("mapping");
  };

  const handleImport = async () => {
    if (!file) return;

    // Validate required fields are mapped
    const requiredFields = ['itemNumber', 'description'];
    const mappedFields = Object.values(columnMapping).filter(v => v !== '_ignore');
    const missingFields = requiredFields.filter(f => !mappedFields.includes(f));
    
    if (missingFields.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please map the following fields: ${missingFields.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    // Clear any existing polling interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: 100, percentage: 0 });
    
    try {
      // Generate unique import ID
      const importId = `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('revisionId', revisionId);
      formData.append('columnMapping', JSON.stringify(columnMapping));
      formData.append('headerRowNumber', headerRowNumber.toString());
      formData.append('importId', importId);
      formData.append('deleteExisting', deleteExisting.toString());

      const response = await fetch(`/api/projects/${projectId}/boq/import/commit`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to start import');
      }

      // Poll for progress
      pollIntervalRef.current = setInterval(async () => {
        try {
          const progressRes = await fetch(`/api/projects/${projectId}/boq/import/progress/${importId}`);
          if (!progressRes.ok) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsImporting(false);
            setImportProgress(null);
            toast({
              title: "Import failed",
              description: "Failed to track import progress. Please refresh and check if items were imported.",
              variant: "destructive",
            });
            return;
          }

          const progress = await progressRes.json();
          const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
          
          setImportProgress({
            current: progress.current,
            total: progress.total,
            percentage,
            importedCount: progress.importedCount,
            failedCount: progress.failedCount,
            failedRows: progress.failedRows,
            validationIssues: progress.validationIssues,
          });

          if (progress.status === 'complete') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            // Show import report if there were failures OR validation issues
            if ((progress.failedRows && progress.failedRows.length > 0) || 
                (progress.validationIssues && progress.validationIssues.length > 0)) {
              setImportReport({
                importedCount: progress.importedCount || 0,
                failedCount: progress.failedCount || 0,
                failedRows: progress.failedRows || [],
                validationIssues: progress.validationIssues,
              });
            } else {
              toast({
                title: "Import successful",
                description: progress.message || `Imported ${progress.current} items`,
              });
              resetDialog();
              onSuccess();
            }
            
            setIsImporting(false);
            setImportProgress(null);
          } else if (progress.status === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsImporting(false);
            setImportProgress(null);
            toast({
              title: "Import failed",
              description: progress.message || 'Import failed',
              variant: "destructive",
            });
          }
        } catch (pollError) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          console.error('Progress polling error:', pollError);
          setIsImporting(false);
          setImportProgress(null);
          toast({
            title: "Import failed",
            description: "An error occurred during import. Please try again.",
            variant: "destructive",
          });
        }
      }, 500); // Poll every 500ms

    } catch (error) {
      console.error('Import error:', error);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      toast({
        title: "Import failed",
        description: "Failed to import Excel file. Please try again.",
        variant: "destructive",
      });
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const resetDialog = () => {
    // Clear polling interval if active
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    setFile(null);
    setStep("upload");
    setExcelColumns([]);
    setPreviewRows([]);
    setColumnMapping({});
    setHeaderRowNumber(1);
    setRawRows([]);
    setIsImporting(false);
    setImportProgress(null);
    setImportReport(null);
    setDeleteExisting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetDialog();
      else onOpenChange(open);
    }}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-boq-import">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Import BOQ from Excel"}
            {step === "selectHeader" && "Select Header Row"}
            {step === "mapping" && "Map Excel Columns"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload an Excel file to import BOQ items into the active revision."}
            {step === "selectHeader" && "Click on the row that contains your column headers (Item, Description, Unit, etc.)"}
            {step === "mapping" && "Map Excel columns to BOQ fields. Required fields: Item Number, Description."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Excel File</Label>
              <div className="space-y-2">
                {!file ? (
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
                      {isDragging ? 'Drop file here' : 'Click or drag to select an Excel file'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supported: .xlsx, .xls
                    </p>
                  </div>
                ) : (
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
                )}
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file"
                />
              </div>
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={resetDialog}
                disabled={isImporting}
                data-testid="button-cancel-import"
              >
                Cancel
              </Button>
              <Button 
                onClick={handlePreview}
                disabled={!file || isImporting}
                data-testid="button-preview-import"
              >
                {isImporting ? "Loading..." : "Next: Map Columns"}
              </Button>
            </DialogFooter>
          </div>
        ) : step === "selectHeader" ? (
          <div className="space-y-4">
            {/* Suggested header info */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                💡 Suggested header row: <strong>Row {headerRowNumber}</strong> (click a different row if this is incorrect)
              </p>
            </div>

            {/* Raw rows preview */}
            <div className="space-y-2">
              <Label>Click on the row containing your column headers:</Label>
              <div className="border rounded-lg overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>Preview</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rawRows && rawRows.map((row, rowIndex) => (
                      <TableRow 
                        key={rowIndex}
                        onClick={() => handleHeaderSelection(rowIndex)}
                        className={`cursor-pointer hover-elevate ${rowIndex === headerRowNumber - 1 ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500' : ''}`}
                        data-testid={`row-select-${rowIndex}`}
                      >
                        <TableCell className="font-medium text-center">
                          {rowIndex + 1}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {Object.values(row).slice(0, 6).map((val, idx) => (
                            <span key={idx} className="mr-4">
                              {val?.toString().substring(0, 20) || '-'}
                            </span>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setStep("upload")}
                data-testid="button-back-upload"
              >
                Back
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header Detection Info */}
            {headerRowNumber > 1 && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  ✓ Auto-detected header row at line <strong>{headerRowNumber}</strong> (skipped {headerRowNumber - 1} rows of metadata)
                </p>
              </div>
            )}

            {/* Column Mapping */}
            <div className="space-y-3">
              <Label>Column Mapping</Label>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Excel Column</TableHead>
                      <TableHead>Sample Data</TableHead>
                      <TableHead className="w-[200px]">Maps To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {excelColumns.map((col) => (
                      <TableRow key={col.orderIndex}>
                        <TableCell className="font-medium">{col.header}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(previewRows && previewRows.length > 0 && previewRows[0] && previewRows[0][col.header]) 
                            ? previewRows[0][col.header].toString() 
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={columnMapping[col.header] || "_ignore"}
                            onValueChange={(value) => {
                              setColumnMapping((prev) => ({
                                ...prev,
                                [col.header]: value,
                              }));
                            }}
                          >
                            <SelectTrigger data-testid={`select-mapping-${col.orderIndex}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {boqFields.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Preview */}
            {previewRows && previewRows.length > 0 && (
              <div className="space-y-2">
                <Label>Preview (First 10 rows)</Label>
                <div className="border rounded-lg overflow-auto max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {excelColumns.map((col) => (
                          <TableHead key={col.orderIndex}>{col.header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, idx) => (
                        <TableRow key={idx}>
                          {excelColumns.map((col) => (
                            <TableCell key={col.orderIndex} className="text-sm">
                              {row[col.header]?.toString() || "-"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Import Options */}
            {!importProgress && (
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                <Label className="text-sm font-semibold">Import Options</Label>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="delete-existing"
                    checked={deleteExisting}
                    onCheckedChange={(checked) => setDeleteExisting(checked as boolean)}
                    data-testid="checkbox-delete-existing"
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor="delete-existing"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Delete existing items before import
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {deleteExisting 
                        ? "⚠️ All current items will be deleted and replaced with imported data" 
                        : "New items will be appended to existing data"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {importProgress && (
              <div className="space-y-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex justify-between text-sm font-medium">
                  <span>Importing BOQ Items...</span>
                  <span>{importProgress.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress.percentage}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  {importProgress.current} of {importProgress.total} items
                  {importProgress.importedCount !== undefined && importProgress.failedCount !== undefined && (
                    <span className="ml-2">
                      ({importProgress.importedCount} successful, {importProgress.failedCount} failed)
                    </span>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setStep("upload")}
                disabled={isImporting}
                data-testid="button-back-import"
              >
                Back
              </Button>
              <Button 
                onClick={handleImport}
                disabled={isImporting}
                data-testid="button-confirm-import"
              >
                {isImporting ? "Importing..." : "Import BOQ Items"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>

      {/* Import Report Dialog */}
      {importReport && (
        <Dialog open={!!importReport} onOpenChange={(open) => {
          if (!open) {
            setImportReport(null);
            resetDialog();
            onSuccess();
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-import-report">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Import Completed {importReport.failedCount > 0 ? 'with Errors' : 'with Warnings'}
              </DialogTitle>
              <DialogDescription>
                {importReport.importedCount} items imported successfully
                {importReport.failedCount > 0 && `, ${importReport.failedCount} items failed`}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {importReport.importedCount}
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300">Successful</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {importReport.failedCount}
                  </div>
                  <div className="text-sm text-red-700 dark:text-red-300">Failed</div>
                </div>
              </div>

              {/* Validation Issues Warning */}
              {importReport.validationIssues && importReport.validationIssues.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                        ⚠️ Column Mapping Issues Detected
                      </h4>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Some fields are missing values in the imported data. This usually means the Excel columns were not mapped correctly during import:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
                        {importReport.validationIssues.map((issue, idx) => (
                          <li key={idx}>
                            <strong>{issue.field}</strong>: {issue.missingCount} items have no value
                          </li>
                        ))}
                      </ul>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                        💡 <strong>Solution:</strong> Re-import the file and carefully map each Excel column to the correct BOQ field in step 3 (Mapping).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Failed Items Table */}
              {importReport.failedRows && importReport.failedRows.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Failed Items Details</Label>
                  <div className="border rounded-lg overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">Row #</TableHead>
                          <TableHead className="w-[120px]">Item #</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importReport.failedRows.map((failed, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{failed.row}</TableCell>
                            <TableCell className="font-mono text-sm">{failed.itemNumber}</TableCell>
                            <TableCell className="text-sm">{failed.description}</TableCell>
                            <TableCell className="text-sm text-red-600 dark:text-red-400">
                              {failed.reason}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  setImportReport(null);
                  resetDialog();
                  onSuccess();
                }}
                data-testid="button-close-report"
              >
                Close and Refresh
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
