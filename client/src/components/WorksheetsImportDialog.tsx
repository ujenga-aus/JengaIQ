import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, X, AlertTriangle, CheckCircle2 } from "lucide-react";

interface WorksheetsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSuccess: () => void;
}

export function WorksheetsImportDialog({ open, onOpenChange, projectId, onSuccess }: WorksheetsImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<"upload" | "selectHeader" | "mapping">("upload");
  const [isImporting, setIsImporting] = useState(false);

  const [excelColumns, setExcelColumns] = useState<Array<{ header: string; orderIndex: number }>>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [headerRowNumber, setHeaderRowNumber] = useState<number>(1);
  const [rawRows, setRawRows] = useState<any[]>([]);

  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    percentage: number;
    importedCount?: number;
    failedCount?: number;
    failedRows?: Array<{ row: number; wkshtCode: string; description: string; reason: string }>;
  } | null>(null);
  const [importReport, setImportReport] = useState<{
    importedCount: number;
    failedCount: number;
    failedRows: Array<{ row: number; wkshtCode: string; description: string; reason: string }>;
  } | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const worksheetFields = [
    { value: "wkshtCode", label: "Worksheet Code" },
    { value: "description", label: "Description" },
    { value: "unit", label: "Unit" },
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

      const response = await fetch(`/api/projects/${projectId}/worksheets/import/preview`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to preview Excel file');
      }

      const data = await response.json();
      setRawRows(data.rawRows || []);
      setHeaderRowNumber(data.headerRowNumber || 1);

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

    const dataRows = rawRows.slice(selectedRowIndex + 1, selectedRowIndex + 11);
    setPreviewRows(dataRows);

    const autoMapping: Record<string, string> = {};
    columns.forEach((col) => {
      const lowerHeader = col.header.toLowerCase();
      if (lowerHeader.includes('code') || lowerHeader.includes('wksht')) {
        autoMapping[col.header] = 'wkshtCode';
      } else if (lowerHeader.includes('descri')) {
        autoMapping[col.header] = 'description';
      } else if (lowerHeader.includes('unit')) {
        autoMapping[col.header] = 'unit';
      }
    });
    setColumnMapping(autoMapping);

    setStep("mapping");
  };

  const handleImport = async () => {
    if (!file) return;

    const requiredFields = ['wkshtCode', 'description'];
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

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: 100, percentage: 0 });
    
    try {
      const importId = `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('columnMapping', JSON.stringify(columnMapping));
      formData.append('headerRowNumber', headerRowNumber.toString());
      formData.append('importId', importId);

      const response = await fetch(`/api/projects/${projectId}/worksheets/import/commit`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to start import');
      }

      pollIntervalRef.current = setInterval(async () => {
        try {
          const progressRes = await fetch(`/api/projects/${projectId}/worksheets/import/progress/${importId}`);
          if (!progressRes.ok) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsImporting(false);
            setImportProgress(null);
            toast({
              title: "Import failed",
              description: "Failed to track import progress. Please refresh and check if worksheets were imported.",
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
          });

          if (progress.status === 'complete') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            if (progress.failedRows && progress.failedRows.length > 0) {
              setImportReport({
                importedCount: progress.importedCount || 0,
                failedCount: progress.failedCount || 0,
                failedRows: progress.failedRows,
              });
            } else {
              toast({
                title: "Import successful",
                description: `Imported ${progress.importedCount || 0} worksheet${(progress.importedCount || 0) !== 1 ? 's' : ''}`,
              });
              onSuccess();
              handleClose();
            }
            
            setIsImporting(false);
          } else if (progress.status === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsImporting(false);
            setImportProgress(null);
            toast({
              title: "Import failed",
              description: progress.error || "An error occurred during import",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error('Progress polling error:', error);
        }
      }, 1000);

    } catch (error) {
      console.error('Import error:', error);
      setIsImporting(false);
      setImportProgress(null);
      toast({
        title: "Import failed",
        description: "Failed to start import. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setFile(null);
    setStep("upload");
    setRawRows([]);
    setExcelColumns([]);
    setPreviewRows([]);
    setColumnMapping({});
    setHeaderRowNumber(1);
    setImportProgress(null);
    setImportReport(null);
    setIsImporting(false);
    onOpenChange(false);
  };

  const handleCloseReport = () => {
    setImportReport(null);
    onSuccess();
    handleClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-h3">Import Worksheets from Excel</DialogTitle>
            <DialogDescription className="text-body">
              {step === "upload" && "Upload an Excel file to import worksheets"}
              {step === "selectHeader" && "Select the row containing column headers"}
              {step === "mapping" && "Map Excel columns to worksheet fields"}
            </DialogDescription>
          </DialogHeader>

          {step === "upload" && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-md p-8 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {file ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div className="text-left">
                        <p className="text-body font-medium">{file.name}</p>
                        <p className="text-caption text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
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
                  <div className="space-y-3">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-body font-medium">Drop Excel file here or click to browse</p>
                      <p className="text-caption text-muted-foreground">Supports .xlsx and .xls files</p>
                    </div>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="input-file-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-browse-file"
                    >
                      Browse Files
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "selectHeader" && (
            <div className="space-y-4">
              <p className="text-body text-muted-foreground">
                Click on the row that contains your column headers
              </p>
              <div className="border rounded-md overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      {rawRows[0] && Object.keys(rawRows[0]).map((_, colIndex) => (
                        <TableHead key={colIndex}>Col {colIndex + 1}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rawRows.map((row, rowIndex) => (
                      <TableRow
                        key={rowIndex}
                        className={`cursor-pointer hover-elevate ${
                          rowIndex === headerRowNumber - 1 ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => handleHeaderSelection(rowIndex)}
                        data-testid={`row-header-${rowIndex}`}
                      >
                        <TableCell className="font-medium">{rowIndex + 1}</TableCell>
                        {Object.values(row).map((value: any, colIndex) => (
                          <TableCell key={colIndex}>
                            <span className="text-data block truncate max-w-[200px]">
                              {value?.toString() || ''}
                            </span>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-4">
              <div>
                <p className="text-body text-muted-foreground mb-4">
                  Map Excel columns to worksheet fields. Required fields are marked with *
                </p>
                <div className="border rounded-md overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Excel Column</TableHead>
                        <TableHead>Maps to Field</TableHead>
                        <TableHead>Sample Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {excelColumns.map((col, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{col.header}</TableCell>
                          <TableCell>
                            <Select
                              value={columnMapping[col.header] || "_ignore"}
                              onValueChange={(value) => {
                                setColumnMapping(prev => ({
                                  ...prev,
                                  [col.header]: value
                                }));
                              }}
                            >
                              <SelectTrigger data-testid={`select-mapping-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {worksheetFields.map((field) => (
                                  <SelectItem key={field.value} value={field.value}>
                                    {field.label}
                                    {field.value === 'wkshtCode' || field.value === 'description' ? ' *' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {previewRows[0] && (
                              <span className="text-data text-muted-foreground block truncate max-w-[200px]">
                                {previewRows[0][Object.keys(previewRows[0])[col.orderIndex]]?.toString() || ''}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {importProgress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-body">Importing...</span>
                    <span className="text-body">{importProgress.percentage}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${importProgress.percentage}%` }}
                    />
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {importProgress.current} of {importProgress.total} rows processed
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {step === "upload" && (
              <>
                <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handlePreview}
                  disabled={!file || isImporting}
                  data-testid="button-next-preview"
                >
                  Next
                </Button>
              </>
            )}
            {step === "selectHeader" && (
              <>
                <Button variant="outline" onClick={() => setStep("upload")} data-testid="button-back">
                  Back
                </Button>
                <Button
                  onClick={() => handleHeaderSelection(headerRowNumber - 1)}
                  disabled={!rawRows.length}
                  data-testid="button-next-mapping"
                >
                  Next
                </Button>
              </>
            )}
            {step === "mapping" && (
              <>
                <Button variant="outline" onClick={() => setStep("selectHeader")} disabled={isImporting} data-testid="button-back">
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={isImporting}
                  data-testid="button-import"
                >
                  {isImporting ? 'Importing...' : 'Import'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!importReport} onOpenChange={handleCloseReport}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-h3 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              Import Complete
            </DialogTitle>
          </DialogHeader>

          {importReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-md p-4">
                  <p className="text-caption text-muted-foreground mb-1">Imported</p>
                  <p className="text-h2 text-primary">{importReport.importedCount}</p>
                </div>
                <div className="border rounded-md p-4">
                  <p className="text-caption text-muted-foreground mb-1">Failed</p>
                  <p className="text-h2 text-destructive">{importReport.failedCount}</p>
                </div>
              </div>

              {importReport.failedRows && importReport.failedRows.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <h3 className="text-body font-semibold">Failed Rows</h3>
                  </div>
                  <div className="border rounded-md overflow-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importReport.failedRows.map((failure, index) => (
                          <TableRow key={index}>
                            <TableCell>{failure.row}</TableCell>
                            <TableCell className="text-data">{failure.wkshtCode}</TableCell>
                            <TableCell className="text-data">{failure.description}</TableCell>
                            <TableCell className="text-caption text-destructive">{failure.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={handleCloseReport} data-testid="button-close-report">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
