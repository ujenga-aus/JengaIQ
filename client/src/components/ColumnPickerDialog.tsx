import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface Column {
  id: string;
  label: string;
  width: number;
}

interface ColumnPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allColumns: Column[];
  visibleColumns: string[];
  onColumnsChange: (columns: string[]) => void;
}

export function ColumnPickerDialog({
  open,
  onOpenChange,
  allColumns,
  visibleColumns,
  onColumnsChange
}: ColumnPickerDialogProps) {
  const handleToggleColumn = (columnId: string) => {
    if (visibleColumns.includes(columnId)) {
      onColumnsChange(visibleColumns.filter(id => id !== columnId));
    } else {
      onColumnsChange([...visibleColumns, columnId]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Columns</DialogTitle>
          <DialogDescription>
            Choose which columns to display in the Gantt chart
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {allColumns.map((column) => (
            <div key={column.id} className="flex items-center space-x-2">
              <Checkbox
                id={column.id}
                checked={visibleColumns.includes(column.id)}
                onCheckedChange={() => handleToggleColumn(column.id)}
                data-testid={`checkbox-column-${column.id}`}
              />
              <Label htmlFor={column.id} className="cursor-pointer">
                {column.label}
              </Label>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
