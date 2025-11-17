import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface ColumnConfig {
  id: string;
  columnHeader: string;
  isEditable: boolean;
  orderIndex: number;
  isDoaAcronymColumn: boolean;
}

interface ColumnSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  onConfirm: (selectedColumnIds: string[]) => void;
}

// Mandatory columns that must always be shown
const MANDATORY_COLUMN_HEADERS = [
  "Ref No",
  "Risk Item",
  "Baseline Position",
  "Approval Level",
  "DOA",
];

export function ColumnSelectionDialog({
  open,
  onOpenChange,
  templateId,
  onConfirm,
}: ColumnSelectionDialogProps) {
  const [selectedOptionalColumns, setSelectedOptionalColumns] = useState<Set<string>>(new Set());

  const { data: columnConfigs, isLoading } = useQuery<ColumnConfig[]>({
    queryKey: ['/api/templates', templateId, 'columns'],
    enabled: open && !!templateId,
  });

  // Separate columns into mandatory and optional
  const mandatoryColumns = columnConfigs?.filter(col =>
    MANDATORY_COLUMN_HEADERS.includes(col.columnHeader)
  ) || [];

  const optionalColumns = columnConfigs?.filter(col =>
    !MANDATORY_COLUMN_HEADERS.includes(col.columnHeader)
  ).sort((a, b) => a.orderIndex - b.orderIndex) || [];

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedOptionalColumns(new Set());
    }
  }, [open]);

  const handleToggleColumn = (columnId: string) => {
    const newSelected = new Set(selectedOptionalColumns);
    if (newSelected.has(columnId)) {
      newSelected.delete(columnId);
    } else {
      newSelected.add(columnId);
    }
    setSelectedOptionalColumns(newSelected);
  };

  const handleConfirm = () => {
    // Combine mandatory and selected optional column IDs
    const mandatoryIds = mandatoryColumns.map(col => col.id);
    const selectedIds = [...mandatoryIds, ...Array.from(selectedOptionalColumns)];
    onConfirm(selectedIds);
    onOpenChange(false);
  };

  const handleSelectAll = () => {
    setSelectedOptionalColumns(new Set(optionalColumns.map(col => col.id)));
  };

  const handleDeselectAll = () => {
    setSelectedOptionalColumns(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" data-testid="dialog-column-selection">
        <DialogHeader>
          <DialogTitle>Select Template Columns to Display</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {/* Mandatory Columns */}
            <div>
              <h3 className="font-semibold text-sm mb-3 text-foreground">
                Mandatory Columns (Always Shown)
              </h3>
              <div className="space-y-2">
                {mandatoryColumns.map((column) => (
                  <div
                    key={column.id}
                    className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
                    data-testid={`mandatory-column-${column.columnHeader}`}
                  >
                    <Checkbox
                      checked={true}
                      disabled={true}
                      className="opacity-50"
                    />
                    <Label className="flex-1 text-sm font-medium cursor-not-allowed opacity-75">
                      {column.columnHeader}
                      {column.isDoaAcronymColumn && (
                        <span className="ml-2 text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                          DOA
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional Columns */}
            {optionalColumns.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-foreground">
                    Optional Columns ({selectedOptionalColumns.size} of {optionalColumns.length} selected)
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      data-testid="button-select-all"
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeselectAll}
                      data-testid="button-deselect-all"
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {optionalColumns.map((column) => (
                    <div
                      key={column.id}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => handleToggleColumn(column.id)}
                      data-testid={`optional-column-${column.columnHeader}`}
                    >
                      <Checkbox
                        checked={selectedOptionalColumns.has(column.id)}
                        onCheckedChange={() => handleToggleColumn(column.id)}
                      />
                      <Label className="flex-1 text-sm cursor-pointer">
                        {column.columnHeader}
                        {column.isDoaAcronymColumn && (
                          <span className="ml-2 text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                            DOA
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-column-selection"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            data-testid="button-confirm-column-selection"
          >
            Continue with Selected Columns
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
