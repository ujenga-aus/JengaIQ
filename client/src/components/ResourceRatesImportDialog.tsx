import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import * as XLSX from 'xlsx';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onImportComplete: () => void;
}

interface ColumnMapping {
  resType: string;
  code: string;
  description: string;
  unit: string;
  tenderRate: string;
  costRate: string;
}

interface ImportRow {
  resType: string;
  code: string;
  description: string | null;
  unit: string | null;
  tenderRate: string | null;
  costRate: string | null;
}

export function ResourceRatesImportDialog({
  open,
  onOpenChange,
  projectId,
  onImportComplete,
}: ImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'sheet' | 'mapping' | 'importing' | 'confirmNewTypes' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    resType: '',
    code: '',
    description: '',
    unit: '',
    tenderRate: '',
    costRate: '',
  });
  const [progress, setProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    total: number;
    imported: number;
    skippedNumeric: number;
    skippedDuplicate: number;
    errors: string[];
  }>({
    total: 0,
    imported: 0,
    skippedNumeric: 0,
    skippedDuplicate: 0,
    errors: [],
  });

  // Smart import: cache parsed rows and unknown types for two-phase import
  const [cachedParsedRows, setCachedParsedRows] = useState<ImportRow[]>([]);
  const [cachedSkippedNumeric, setCachedSkippedNumeric] = useState(0);
  const [unknownResourceTypes, setUnknownResourceTypes] = useState<string[]>([]);
  const [selectedTypesToCreate, setSelectedTypesToCreate] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  
  // Progress tracking
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const resetDialog = () => {
    setStep('upload');
    setFile(null);
    setWorkbook(null);
    setSelectedSheet('');
    setHeaders([]);
    setColumnMapping({
      resType: '',
      code: '',
      description: '',
      unit: '',
      tenderRate: '',
      costRate: '',
    });
    setProgress(0);
    setImportResults({
      total: 0,
      imported: 0,
      skippedNumeric: 0,
      skippedDuplicate: 0,
      errors: [],
    });
    setCachedParsedRows([]);
    setCachedSkippedNumeric(0);
    setUnknownResourceTypes([]);
    setSelectedTypesToCreate(new Set());
    setShowConfirmDialog(false);
    setCompanyId(null);
    setCurrentChunk(0);
    setTotalChunks(0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      toast({
        title: 'Invalid file',
        description: 'Please select an Excel file (.xlsx or .xls)',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        setWorkbook(wb);
        setStep('sheet');
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to read Excel file',
          variant: 'destructive',
        });
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleSheetSelect = (sheetName: string) => {
    if (!workbook) return;
    
    setSelectedSheet(sheetName);
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
    
    // Find the header row (first non-empty row)
    const headerRow = jsonData.find((row: any[]) => row && row.length > 0 && row.some(cell => cell)) as string[];
    if (headerRow) {
      setHeaders(headerRow.map(h => String(h || '')));
      setStep('mapping');
    }
  };

  const hasAlphaCharacter = (str: string): boolean => {
    return /[a-zA-Z]/.test(str);
  };

  // Create unknown resource types in company table
  const handleCreateUnknownTypes = async () => {
    if (!companyId || selectedTypesToCreate.size === 0) return;

    try {
      const res = await apiRequest(
        'POST',
        `/api/companies/${companyId}/resource-types/bulk-create`,
        { resTypes: Array.from(selectedTypesToCreate) }
      );

      const result = await res.json() as {
        created: any[];
        createdCount: number;
        skipped: string[];
        skippedCount: number;
      };

      toast({
        title: 'Resource types created',
        description: `Created ${result.createdCount} new resource type${result.createdCount !== 1 ? 's' : ''}`,
      });

      // Invalidate resource types cache to refresh UI
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/resource-types`] });

      // Close confirmation dialog
      setShowConfirmDialog(false);

      // Retry import with cached rows (now all types exist)
      handleImport(true);
    } catch (error: any) {
      toast({
        title: 'Failed to create resource types',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  // User cancelled - skip unknown types
  const handleCancelCreateTypes = () => {
    setShowConfirmDialog(false);
    setStep('mapping');
    toast({
      title: 'Import cancelled',
      description: 'Unknown resource types were not created',
      variant: 'destructive',
    });
  };

  // Toggle selection of a specific type
  const toggleTypeSelection = (type: string) => {
    const newSelection = new Set(selectedTypesToCreate);
    if (newSelection.has(type)) {
      newSelection.delete(type);
    } else {
      newSelection.add(type);
    }
    setSelectedTypesToCreate(newSelection);
  };

  // Select/deselect all types
  const toggleSelectAll = () => {
    if (selectedTypesToCreate.size === unknownResourceTypes.length) {
      // All selected - deselect all
      setSelectedTypesToCreate(new Set());
    } else {
      // Some or none selected - select all
      setSelectedTypesToCreate(new Set(unknownResourceTypes));
    }
  };

  const handleImport = async (useCachedRows = false) => {
    if (!workbook || !selectedSheet) return;

    // Validate required mappings
    if (!columnMapping.resType || !columnMapping.code) {
      toast({
        title: 'Validation error',
        description: 'RES_TYPE and CODE columns are required',
        variant: 'destructive',
      });
      return;
    }

    setStep('importing');
    setProgress(0);

    try {
      let rows: ImportRow[] = [];
      let skippedNumeric = 0;
      let jsonDataLength = 0;

      // Use cached rows if retrying after creating new resource types
      if (useCachedRows && cachedParsedRows.length > 0) {
        rows = cachedParsedRows;
        skippedNumeric = cachedSkippedNumeric;
        jsonDataLength = rows.length + skippedNumeric;
      } else {
        // Parse Excel data
        const worksheet = workbook.Sheets[selectedSheet];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);
        jsonDataLength = jsonData.length;

        for (const row of jsonData) {
          const resType = String(row[columnMapping.resType] || '').trim();
          const code = String(row[columnMapping.code] || '').trim();

          // Debug logging for first few rows
          if (rows.length < 3) {
            console.log('[Import Debug] Row data:', { 
              rawRow: row,
              columnMapping,
              extractedResType: resType, 
              extractedCode: code 
            });
          }

          // Skip rows without required fields
          if (!resType || !code) continue;

          // Skip rows where RES_TYPE is all numeric (no alpha characters)
          if (!hasAlphaCharacter(resType)) {
            skippedNumeric++;
            continue;
          }

          rows.push({
            resType,
            code,
            description: columnMapping.description ? String(row[columnMapping.description] || '').trim() || null : null,
            unit: columnMapping.unit ? String(row[columnMapping.unit] || '').trim() || null : null,
            tenderRate: columnMapping.tenderRate ? String(row[columnMapping.tenderRate] || '').trim() || null : null,
            costRate: columnMapping.costRate ? String(row[columnMapping.costRate] || '').trim() || null : null,
          });
        }

        // Cache parsed rows for potential retry
        setCachedParsedRows(rows);
        setCachedSkippedNumeric(skippedNumeric);
      }

      // Split into chunks for progressive upload (50 rows per chunk)
      const CHUNK_SIZE = 50;
      const chunks: ImportRow[][] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + CHUNK_SIZE));
      }

      // Set total chunks for progress tracking
      setTotalChunks(chunks.length);

      // Process chunks sequentially with progress updates
      let totalImported = 0;
      let totalSkippedDuplicate = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setCurrentChunk(i + 1); // Update current chunk (1-indexed for display)
        
        const res = await apiRequest(
          'POST',
          `/api/projects/${projectId}/resource-rates/bulk-import`,
          { rows: chunk }
        );

        const response = await res.json() as {
          total: number;
          imported: number;
          skippedDuplicate: number;
          errors: string[];
          unknownResourceTypes?: string[];
          requiresConfirmation?: boolean;
        };

        // Check if backend detected unknown resource types (can happen in any chunk)
        if (response.requiresConfirmation && response.unknownResourceTypes && response.unknownResourceTypes.length > 0) {
          console.log('[DEBUG] Unknown types detected:', response.unknownResourceTypes);
          console.log('[DEBUG] Setting showConfirmDialog to true');
          setUnknownResourceTypes(response.unknownResourceTypes);
          // Select all types by default
          setSelectedTypesToCreate(new Set(response.unknownResourceTypes));
          setShowConfirmDialog(true);
          setStep('confirmNewTypes');
          setProgress(0); // Reset progress since we're halting mid-import
          console.log('[DEBUG] State updated - should show confirmation dialog');
          
          // Get company ID from project (needed for bulk-create endpoint)
          const projectRes = await apiRequest('GET', `/api/projects/${projectId}`);
          const project = await projectRes.json();
          if (project.businessUnit?.companyId) {
            setCompanyId(project.businessUnit.companyId);
          }
          
          return; // Stop import until user confirms
        }

        totalImported += response.imported || 0;
        totalSkippedDuplicate += response.skippedDuplicate || 0;
        
        // Safely handle errors array (may be undefined)
        if (response.errors && Array.isArray(response.errors)) {
          allErrors.push(...response.errors);
        }

        // Update progress based on chunks processed
        const progressPercent = Math.round(((i + 1) / chunks.length) * 100);
        setProgress(progressPercent);
      }

      setImportResults({
        total: jsonDataLength,
        imported: totalImported,
        skippedNumeric,
        skippedDuplicate: totalSkippedDuplicate,
        errors: allErrors,
      });

      setStep('complete');

      toast({
        title: 'Import complete',
        description: `Imported ${totalImported} resource rate${totalImported !== 1 ? 's' : ''}`,
      });

      onImportComplete();
    } catch (error: any) {
      toast({
        title: 'Import failed',
        description: error.message || 'Failed to import resource rates',
        variant: 'destructive',
      });
      setStep('mapping');
    }
  };

  const renderUploadStep = () => (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <FileSpreadsheet className="h-16 w-16 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">Select Excel File</h3>
      <p className="text-sm text-muted-foreground text-center mb-6">
        Choose an Excel file (.xlsx or .xls) containing your resource rates
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file-upload"
      />
      <Button onClick={() => fileInputRef.current?.click()} data-testid="button-browse-file">
        <Upload className="h-4 w-4 mr-2" />
        Browse Files
      </Button>
    </div>
  );

  const renderSheetStep = () => (
    <div className="py-6 px-6">
      <h3 className="text-lg font-semibold mb-4">Select Worksheet</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Choose the worksheet containing your resource rates data
      </p>
      <Select value={selectedSheet} onValueChange={handleSheetSelect}>
        <SelectTrigger data-testid="select-sheet">
          <SelectValue placeholder="Select a worksheet" />
        </SelectTrigger>
        <SelectContent>
          {workbook?.SheetNames.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="mt-6 flex justify-end">
        <Button variant="outline" onClick={() => setStep('upload')}>
          Back
        </Button>
      </div>
    </div>
  );

  const renderMappingStep = () => (
    <div className="py-6 px-6 space-y-4">
      <h3 className="text-lg font-semibold mb-2">Map Columns</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Map the Excel columns to resource rate fields. RES_TYPE and CODE are required.
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            RES_TYPE <span className="text-destructive">*</span>
          </label>
          <Select 
            value={columnMapping.resType} 
            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, resType: value }))}
          >
            <SelectTrigger data-testid="select-map-restype">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">
            CODE <span className="text-destructive">*</span>
          </label>
          <Select 
            value={columnMapping.code} 
            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, code: value }))}
          >
            <SelectTrigger data-testid="select-map-code">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">DESCRIPTION</label>
          <Select 
            value={columnMapping.description} 
            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, description: value }))}
          >
            <SelectTrigger data-testid="select-map-description">
              <SelectValue placeholder="Select column (optional)" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">UNIT</label>
          <Select 
            value={columnMapping.unit} 
            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, unit: value }))}
          >
            <SelectTrigger data-testid="select-map-unit">
              <SelectValue placeholder="Select column (optional)" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">TENDER_RATE</label>
          <Select 
            value={columnMapping.tenderRate} 
            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, tenderRate: value }))}
          >
            <SelectTrigger data-testid="select-map-tender-rate">
              <SelectValue placeholder="Select column (optional)" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">COST_RATE</label>
          <Select 
            value={columnMapping.costRate} 
            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, costRate: value }))}
          >
            <SelectTrigger data-testid="select-map-cost-rate">
              <SelectValue placeholder="Select column (optional)" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={() => setStep('sheet')}>
          Back
        </Button>
        <Button 
          onClick={() => handleImport()} 
          disabled={!columnMapping.resType || !columnMapping.code}
          data-testid="button-start-import"
        >
          Import
        </Button>
      </div>
    </div>
  );

  const renderImportingStep = () => (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
      <h3 className="text-lg font-semibold mb-2">Importing...</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Please wait while we import your resource rates
      </p>
      <div className="w-full max-w-md space-y-2">
        <Progress value={progress} className="w-full" data-testid="progress-import" />
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground" data-testid="text-chunk-progress">
            {totalChunks > 0 ? `Chunk ${currentChunk} of ${totalChunks}` : 'Processing...'}
          </span>
          <span className="font-semibold text-primary" data-testid="text-progress-percent">
            {progress}%
          </span>
        </div>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="py-6 px-6">
      <div className="flex flex-col items-center mb-6">
        <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Import Complete</h3>
      </div>

      <div className="space-y-3 bg-muted/30 rounded-lg p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total rows processed:</span>
          <span className="font-semibold">{importResults.total}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-green-600 dark:text-green-400">Successfully imported:</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{importResults.imported}</span>
        </div>
        {importResults.skippedNumeric > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-amber-600 dark:text-amber-400">Skipped (numeric RES_TYPE):</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">{importResults.skippedNumeric}</span>
          </div>
        )}
        {importResults.skippedDuplicate > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-amber-600 dark:text-amber-400">Skipped (duplicate CODE):</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">{importResults.skippedDuplicate}</span>
          </div>
        )}
        {importResults.errors.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Errors:</span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {importResults.errors.map((error, idx) => (
                <div key={idx} className="text-xs text-destructive pl-6">
                  {error}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button 
          onClick={() => {
            resetDialog();
            onOpenChange(false);
          }}
          data-testid="button-close-import"
        >
          Close
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) {
          resetDialog();
        }
        onOpenChange(isOpen);
      }}>
        <DialogContent className="max-w-3xl h-[95vh] flex flex-col" data-testid="dialog-import-resource-rates">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Import Resource Rates from Excel</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                data-testid="button-close-import-dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {step === 'upload' && renderUploadStep()}
            {step === 'sheet' && renderSheetStep()}
            {step === 'mapping' && renderMappingStep()}
            {step === 'importing' && renderImportingStep()}
            {step === 'confirmNewTypes' && (
              <div className="space-y-4 py-8">
                <div className="flex justify-center">
                  <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Please respond to the confirmation dialog...
                </p>
              </div>
            )}
            {step === 'complete' && renderCompleteStep()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for unknown resource types - rendered as sibling to avoid modal stacking issues */}
      {console.log('[DEBUG] AlertDialog render - open:', showConfirmDialog, 'types:', unknownResourceTypes.length)}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent data-testid="dialog-confirm-new-types">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              New Resource Types Found
            </AlertDialogTitle>
            <AlertDialogDescription>
              The following resource types are not in your company's list. Select which ones to add:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3">
            <div className="bg-muted rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
              {/* Select All option */}
              <div className="flex items-center space-x-2 pb-2 border-b border-border">
                <Checkbox
                  id="select-all"
                  checked={selectedTypesToCreate.size === unknownResourceTypes.length && unknownResourceTypes.length > 0}
                  onCheckedChange={toggleSelectAll}
                  data-testid="checkbox-select-all"
                />
                <label
                  htmlFor="select-all"
                  className="text-sm font-semibold cursor-pointer"
                >
                  Select All ({unknownResourceTypes.length})
                </label>
              </div>
              
              {/* Individual type checkboxes */}
              <div className="space-y-2">
                {unknownResourceTypes.map((type, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      id={`type-${idx}`}
                      checked={selectedTypesToCreate.has(type)}
                      onCheckedChange={() => toggleTypeSelection(type)}
                      data-testid={`checkbox-type-${idx}`}
                    />
                    <label
                      htmlFor={`type-${idx}`}
                      className="text-sm font-mono cursor-pointer flex-1"
                      data-testid={`text-unknown-type-${idx}`}
                    >
                      {type}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Selected types will be added to your company's resource types list and the import will continue automatically.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={handleCancelCreateTypes}
              data-testid="button-cancel-create-types"
            >
              Cancel Import
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCreateUnknownTypes}
              disabled={selectedTypesToCreate.size === 0}
              data-testid="button-confirm-create-types"
            >
              Add & Continue ({selectedTypesToCreate.size})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
