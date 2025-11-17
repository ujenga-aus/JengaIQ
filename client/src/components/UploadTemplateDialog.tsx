import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Lock, Unlock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from 'xlsx';
import { MissingRolesDialog } from "./MissingRolesDialog";

interface ColumnConfig {
  header: string;
  orderIndex: number;
  isEditable: boolean;
  isDoaAcronymColumn: boolean;
}

interface UploadTemplateDialogProps {
  businessUnitId: string;
  businessUnitName: string;
  onUpload: (template: {
    version: string;
    fileName: string;
    notes: string;
    isActive: boolean;
    fileUrl: string;
    columnConfigs?: ColumnConfig[];
  }) => Promise<{ id: string } | void>;
}

interface EmploymentRole {
  id: string;
  companyId: string;
  title: string;
  doaAcronym: string | null;
  description: string | null;
  isActive: boolean;
}

interface BusinessUnit {
  id: string;
  companyId: string;
  name: string;
}

export function UploadTemplateDialog({ businessUnitId, businessUnitName, onUpload }: UploadTemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'upload' | 'configure-columns'>('upload');
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [doaColumnIndex, setDoaColumnIndex] = useState<number | null>(null);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showMissingRolesDialog, setShowMissingRolesDialog] = useState(false);
  const [missingAcronyms, setMissingAcronyms] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const { toast } = useToast();

  // Fetch business unit to get company ID
  const { data: businessUnit } = useQuery<BusinessUnit>({
    queryKey: ['/api/business-units', businessUnitId],
    enabled: open && !!businessUnitId,
  });

  // Fetch employment roles for the company
  const { data: employmentRoles = [], refetch: refetchRoles } = useQuery<EmploymentRole[]>({
    queryKey: ['/api/employment-roles', businessUnit?.companyId],
    queryFn: async () => {
      if (!businessUnit?.companyId) return [];
      const res = await fetch(`/api/employment-roles?companyId=${businessUnit.companyId}`);
      if (!res.ok) throw new Error('Failed to fetch employment roles');
      return res.json();
    },
    enabled: open && !!businessUnit?.companyId,
  });

  // Update company ID when business unit loads
  useEffect(() => {
    if (businessUnit?.companyId) {
      setCompanyId(businessUnit.companyId);
    }
  }, [businessUnit]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setFile(null);
      setStep('upload');
      setColumns([]);
      setDoaColumnIndex(null);
      setVersion('');
      setNotes('');
      setMissingAcronyms([]);
    }
  }, [open]);

  const parseExcelColumns = async (file: File) => {
    return new Promise<ColumnConfig[]>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          
          if (jsonData.length > 0) {
            const headers = jsonData[0] as string[];
            const columnConfigs: ColumnConfig[] = headers.map((header, index) => ({
              header: header?.toString() || `Column ${index + 1}`,
              orderIndex: index,
              isEditable: true,
              isDoaAcronymColumn: false,
            }));
            resolve(columnConfigs);
          } else {
            reject(new Error('No data found in Excel file'));
          }
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const extractAcronymsFromColumn = async (file: File, columnIndex: number): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          
          // Extract unique acronyms from the specified column (skip header row)
          const acronyms = new Set<string>();
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[columnIndex]) {
              const value = String(row[columnIndex]).trim();
              if (value) {
                acronyms.add(value);
              }
            }
          }
          
          resolve(Array.from(acronyms));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const validateAcronyms = async () => {
    if (!file || doaColumnIndex === null) {
      // No DOA column selected, proceed with upload
      await completeUpload();
      return;
    }

    try {
      // Extract acronyms from the DOA column
      const acronyms = await extractAcronymsFromColumn(file, doaColumnIndex);
      
      // Get existing DOA acronyms from employment roles
      const existingAcronyms = new Set(
        employmentRoles
          .filter(role => role.doaAcronym)
          .map(role => role.doaAcronym!.trim())
      );

      // Find missing acronyms
      const missing = acronyms.filter(acronym => !existingAcronyms.has(acronym));

      if (missing.length > 0) {
        setMissingAcronyms(missing);
        setShowMissingRolesDialog(true);
      } else {
        // All acronyms exist, proceed with upload
        await completeUpload();
      }
    } catch (error) {
      console.error('Error validating acronyms:', error);
      toast({
        title: "Validation error",
        description: "Failed to validate DOA acronyms. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    
    // If it's an Excel file, parse columns
    const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      try {
        const parsedColumns = await parseExcelColumns(selectedFile);
        setColumns(parsedColumns);
      } catch (error) {
        toast({
          title: "Error parsing Excel file",
          description: "Could not read column headers from the file",
          variant: "destructive",
        });
      }
    } else {
      setColumns([]);
    }
  };

  const handleUploadDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    setVersion(formData.get('version') as string);
    setNotes(formData.get('notes') as string);
    
    // If Excel file with columns, go to column config step
    if (columns.length > 0) {
      setStep('configure-columns');
    } else {
      // Non-Excel file, upload directly
      await completeUpload();
    }
  };

  const toggleColumnEditable = (index: number) => {
    setColumns(prev => prev.map((col, i) => 
      i === index ? { ...col, isEditable: !col.isEditable } : col
    ));
  };

  const handleDoaColumnChange = (value: string) => {
    const index = value === 'none' ? null : parseInt(value);
    setDoaColumnIndex(index);
    
    // Update columns to reflect DOA selection
    setColumns(prev => prev.map((col, i) => ({
      ...col,
      isDoaAcronymColumn: index !== null && i === index,
    })));
  };

  const completeUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    try {
      // Upload file to object storage
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/upload-template-file', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const { objectPath } = await uploadResponse.json();

      // Await the onUpload callback to get template ID
      const newTemplate = await onUpload({
        version,
        fileName: file.name,
        notes,
        isActive: true,
        fileUrl: objectPath,
        columnConfigs: columns.length > 0 ? columns : undefined,
      });

      // If Excel file with columns, parse and save rows
      if (columns.length > 0 && newTemplate?.id) {
        await parseAndSaveTemplateRows(file, newTemplate.id);
      }

      toast({
        title: "Template uploaded",
        description: `Version ${version} uploaded successfully`,
      });
      setOpen(false);
    } catch (error) {
      console.error('Error uploading template:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload template file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const parseAndSaveTemplateRows = async (file: File, templateId: string) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          
          // Get column configs with their IDs
          const configsResponse = await fetch(`/api/templates/${templateId}/columns`);
          const columnConfigs = await configsResponse.json();
          
          // Find DOA column index
          const doaColumn = columns.find(c => c.isDoaAcronymColumn);
          const doaColumnIndex = doaColumn ? columns.indexOf(doaColumn) : null;
          
          // Fetch LATEST employment roles (critical for newly created roles)
          let latestRoles: EmploymentRole[] = [];
          if (doaColumnIndex !== null && companyId) {
            const rolesResponse = await fetch(`/api/employment-roles?companyId=${companyId}`);
            if (rolesResponse.ok) {
              latestRoles = await rolesResponse.json();
            }
          }
          
          // Parse rows (skip header row)
          const templateRows = jsonData.slice(1).map((row, index) => {
            const cells = row.map((value, colIndex) => {
              const config = columnConfigs[colIndex];
              const cell: any = { columnId: config?.id || `col-${colIndex}` };
              
              // If this is the DOA column, resolve to employment role ID
              if (doaColumnIndex !== null && colIndex === doaColumnIndex && value) {
                const roleAcronym = String(value).trim();
                // Use latestRoles instead of stale employmentRoles from closure
                const matchingRole = latestRoles.find(r => r.doaAcronym === roleAcronym);
                if (matchingRole) {
                  cell.employmentRoleId = matchingRole.id;
                } else {
                  // Fallback to text value if role not found
                  cell.value = roleAcronym;
                }
              } else {
                cell.value = value ? String(value) : '';
              }
              
              return cell;
            });
            
            return {
              templateId,
              rowIndex: index,
              cells,
            };
          });
          
          // Save rows to database
          await fetch(`/api/templates/${templateId}/rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: templateRows }),
          });
          
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleMissingRolesCreated = async () => {
    // Refetch employment roles after creating missing ones
    await refetchRoles();
    setShowMissingRolesDialog(false);
    // Now proceed with upload
    await completeUpload();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button data-testid={`button-upload-template-${businessUnitId}`}>
            <Upload className="h-4 w-4 mr-2" />
            Upload New Version
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === 'upload' ? 'Upload Contract Review Template' : 'Configure Column Access'}
            </DialogTitle>
          </DialogHeader>

          {step === 'upload' && (
            <form onSubmit={handleUploadDetailsSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`template-file-${businessUnitId}`}>Template File</Label>
                <Input
                  id={`template-file-${businessUnitId}`}
                  type="file"
                  accept=".xlsx,.xls,.docx,.doc,.pdf"
                  onChange={(e) => handleFileSelect(e.target.files?.[0]!)}
                  data-testid={`input-template-file-${businessUnitId}`}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Accepted formats: Excel (.xlsx, .xls), Word (.docx, .doc), PDF
                </p>
                {file && columns.length > 0 && (
                  <p className="text-xs text-green-600">
                    Found {columns.length} columns in Excel template
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`template-version-${businessUnitId}`}>Version Number</Label>
                <Input 
                  id={`template-version-${businessUnitId}`}
                  name="version"
                  placeholder="e.g., 3.1" 
                  data-testid={`input-template-version-${businessUnitId}`}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`template-notes-${businessUnitId}`}>Version Notes</Label>
                <Textarea
                  id={`template-notes-${businessUnitId}`}
                  name="notes"
                  placeholder="Describe what changed in this version..."
                  rows={3}
                  data-testid={`textarea-template-notes-${businessUnitId}`}
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  New templates are automatically set as Active and supersede previous versions.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setOpen(false)} 
                  disabled={isUploading}
                  data-testid={`button-cancel-upload-${businessUnitId}`}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isUploading} data-testid={`button-submit-upload-${businessUnitId}`}>
                  {isUploading ? 'Uploading...' : (columns.length > 0 ? 'Next: Configure Columns' : 'Upload Template')}
                </Button>
              </div>
            </form>
          )}

          {step === 'configure-columns' && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  Configure column access and designate which column contains Delegation of Approval (DOA) acronyms.
                </p>
              </div>

              {/* DOA Column Selection */}
              <div className="space-y-3 p-4 border rounded-md bg-accent/50">
                <Label htmlFor="doa-column-select" className="text-base font-semibold">Delegation of Approval (DOA) Acronym Column</Label>
                <p className="text-sm text-muted-foreground">
                  Select which column contains DOA acronyms. The system will validate these against your company's employment roles.
                </p>
                <Select
                  value={doaColumnIndex === null ? 'none' : String(doaColumnIndex)}
                  onValueChange={handleDoaColumnChange}
                >
                  <SelectTrigger id="doa-column-select" data-testid="select-doa-column">
                    <SelectValue placeholder="Select a column..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" data-testid="option-doa-none">
                      No DOA column
                    </SelectItem>
                    {columns.map((column, index) => (
                      <SelectItem 
                        key={index} 
                        value={String(index)} 
                        data-testid={`option-doa-${index}`}
                      >
                        {column.header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Column Editability Configuration */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Column Access Control</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Select which columns users can edit during contract reviews.
                </p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {columns.map((column, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                      data-testid={`column-config-${index}`}
                    >
                      <div className="flex items-center gap-3">
                        {column.isEditable ? (
                          <Unlock className="h-4 w-4 text-green-600" />
                        ) : (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{column.header}</span>
                        {column.isDoaAcronymColumn && (
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                            DOA Column
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`editable-${index}`} className="text-sm text-muted-foreground">
                          {column.isEditable ? 'Editable' : 'Locked'}
                        </Label>
                        <Checkbox
                          id={`editable-${index}`}
                          checked={column.isEditable}
                          onCheckedChange={() => toggleColumnEditable(index)}
                          data-testid={`checkbox-column-editable-${index}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setStep('upload')} 
                  disabled={isUploading}
                  data-testid="button-back-to-upload"
                >
                  Back
                </Button>
                <Button 
                  onClick={validateAcronyms} 
                  disabled={isUploading}
                  data-testid="button-complete-upload"
                >
                  {isUploading ? 'Uploading...' : 'Complete Upload'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {showMissingRolesDialog && (
        <MissingRolesDialog
          open={showMissingRolesDialog}
          onOpenChange={setShowMissingRolesDialog}
          missingAcronyms={missingAcronyms}
          companyId={companyId}
          onRolesCreated={handleMissingRolesCreated}
          onCancel={() => {
            setShowMissingRolesDialog(false);
            setIsUploading(false);
          }}
        />
      )}
    </>
  );
}
