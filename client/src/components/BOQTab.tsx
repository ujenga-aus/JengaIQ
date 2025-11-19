import { useState, useEffect, useRef as useReactRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useProject } from "@/contexts/ProjectContext";
import { useBusinessUnit } from "@/contexts/BusinessUnitContext";
import { useThemeSettings } from "@/contexts/ThemeSettingsContext";
import { BoqViewProvider, useBoqView } from "@/contexts/BoqViewContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBoqRollups } from "@/hooks/useBoqRollups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Clock, Upload, Settings, Trash2, Edit, GripVertical, GripHorizontal, ChevronUp, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Layers } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { BOQImportDialog } from "@/components/BOQImportDialog";
import { BOQSettingsDialog } from "@/components/BOQSettingsDialog";
import { GlobalVariablesDialog } from "@/components/GlobalVariablesDialog";
import { ResourceRatesDialog } from "@/components/ResourceRatesDialog";
import { WorksheetsDialog } from "@/components/WorksheetsDialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type BOQRevision = {
  id: string;
  projectId: string;
  revisionNumber: number;
  revisionName: string;
  notes: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

type BOQItem = {
  id: string;
  revisionId: string;
  itemNumber: string;
  description: string;
  unit: string;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
  notes: string | null;
  level: number | null;
  sortingIndex: number;
  createdAt: string;
  updatedAt: string;
};

// Resizable Table Header Component
function ResizableTableHead({
  columnId,
  currentWidth,
  minWidth,
  onResize,
  className,
  children,
}: {
  columnId: string;
  currentWidth: number;
  minWidth: number;
  onResize: (columnId: string, width: number) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = currentWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(minWidth, startWidth + delta);
      onResize(columnId, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <TableHead
      ref={thRef}
      className={`${className || ''} relative select-none`}
    >
      <div className="pr-2">
        {children}
      </div>
      <div
        className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 ${
          isResizing ? 'bg-blue-500' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="h-full w-full flex items-center justify-center opacity-0 hover:opacity-100">
          <GripHorizontal className="h-3 w-3 text-blue-500" />
        </div>
      </div>
    </TableHead>
  );
}

// Editable Cell Component with focus support
function EditableCell({
  value,
  type = 'text',
  className,
  onSave,
  isEditable,
  placeholder = '-',
  align = 'left',
  isInEditMode,
  onCellClick,
  onCellKeyDown,
  cellId,
  min,
  max,
  decimalPlaces = 2,
}: {
  value: string | number | null;
  type?: 'text' | 'number';
  className?: string;
  onSave: (newValue: string) => void;
  isEditable: boolean;
  placeholder?: string;
  align?: 'left' | 'right';
  isInEditMode?: boolean;
  onCellClick?: () => void;
  onCellKeyDown?: (e: KeyboardEvent<HTMLTableCellElement>) => void;
  cellId?: string;
  min?: number;
  max?: number;
  decimalPlaces?: number;
}) {
  const [editValue, setEditValue] = useState(value?.toString() || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isInEditMode && inputRef.current) {
      setEditValue(value?.toString() || '');
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.select();
    }
  }, [isInEditMode, value]);

  const handleSave = () => {
    // Always save, even if value hasn't changed (to ensure edit mode exits)
    onSave(editValue);
    
    // Double requestAnimationFrame ensures DOM is fully updated before refocusing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cellElement = document.querySelector(`[data-cell-id="${cellId}"]`) as HTMLElement;
        if (cellElement) {
          cellElement.focus({ preventScroll: true });
        }
      });
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(value?.toString() || '');
      // Exit edit mode on Escape and refocus the cell
      if (onCellClick) {
        onCellClick();
        // Focus the cell DOM element using requestAnimationFrame for smooth transitions
        requestAnimationFrame(() => {
          const cellElement = document.querySelector(`[data-cell-id="${cellId}"]`) as HTMLElement;
          if (cellElement) {
            cellElement.focus({ preventScroll: true });
          }
        });
      }
    }
  };

  if (!isInEditMode) {
    let displayValue: string | number;
    if (type === 'number' && value !== null && value !== '') {
      // Parse value as number if it's a string
      const numValue = typeof value === 'number' ? value : parseFloat(value as string);
      if (!isNaN(numValue)) {
        displayValue = numValue.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces });
      } else {
        displayValue = value;
      }
    } else {
      displayValue = value || placeholder;
    }

    return (
      <TableCell
        className={`${className || ''} ${align === 'right' ? 'text-right' : ''} ${
          isEditable ? 'cursor-pointer boq-editable-cell' : ''
        }`}
        onClick={onCellClick}
        onKeyDown={onCellKeyDown}
        tabIndex={0}
        data-cell-id={cellId}
        style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
      >
        {displayValue}
      </TableCell>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Validate number inputs with min/max constraints
    if (type === 'number' && newValue !== '') {
      const numValue = parseInt(newValue, 10);
      if (!isNaN(numValue)) {
        if (min !== undefined && numValue < min) return;
        if (max !== undefined && numValue > max) return;
      }
    }
    
    setEditValue(newValue);
  };

  return (
    <TableCell className={`${className || ''} ${align === 'right' ? 'text-right' : ''} p-0`}>
      <Input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={handleChange}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        className={`border-0 focus-visible:ring-1 h-auto py-0 ${align === 'right' ? 'text-right' : ''}`}
        style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
      />
    </TableCell>
  );
}

// Sortable row component for drag-and-drop with inline editing
function SortableRow({
  item,
  itemIndex,
  isActive,
  onInsertAbove,
  onInsertBelow,
  onDelete,
  onUpdateField,
  editingCell,
  setEditingCell,
  isSelected,
  onToggleSelect,
  hasChildren,
  isCollapsed,
  onToggleCollapse,
  virtualRow,
  measureElement,
  items,
  rowVirtualizer,
  rollups,
}: {
  item: BOQItem;
  itemIndex: number;
  isActive: boolean;
  onInsertAbove: (item: BOQItem) => void;
  onInsertBelow: (item: BOQItem) => void;
  onDelete: (itemId: string) => void;
  onUpdateField: (item: BOQItem, field: string, value: string) => void;
  editingCell: { itemId: string; field: string } | null;
  setEditingCell: (cell: { itemId: string; field: string } | null) => void;
  isSelected: boolean;
  onToggleSelect: (itemId: string) => void;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  virtualRow?: { index: number; start: number; size: number; key: string | number | bigint };
  measureElement?: (node: Element | null) => void;
  items?: BOQItem[];
  rowVirtualizer?: any;
  rollups: Map<string, import('@/hooks/useBoqRollups').RollupData>;
}) {
  const [levelEditValue, setLevelEditValue] = useState(item.level?.toString() || '');
  
  // Sync levelEditValue when entering edit mode
  useEffect(() => {
    if (editingCell?.itemId === item.id && editingCell?.field === 'level') {
      setLevelEditValue(item.level?.toString() || '');
    }
  }, [editingCell, item.id, item.level]);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isActive });

  // Merge virtual positioning with DnD transform
  const dndTransform = CSS.Transform.toString(transform);
  
  // Build transform array to avoid 'none' concatenation issues
  const transforms: string[] = [];
  if (virtualRow) {
    transforms.push(`translate3d(0, ${virtualRow.start}px, 0)`);
  }
  if (dndTransform && dndTransform !== 'none') {
    transforms.push(dndTransform);
  }
  
  const style: React.CSSProperties = virtualRow ? {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: `${virtualRow.size}px`,
    transform: transforms.join(' ') || undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  } : {
    transform: dndTransform,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Merge setNodeRef and measureElement callbacks with useCallback for stability
  const mergedRef = useCallback((node: HTMLTableRowElement | null) => {
    setNodeRef(node);
    if (measureElement && node) {
      measureElement(node);
    }
  }, [setNodeRef, measureElement]);

  const isSectionHeader = (item.itemNumber || '').trim() === '';

  const handleCellClick = (field: string) => {
    if (!isActive) return;
    setEditingCell({ itemId: item.id, field });
  };

  const handleCellKeyDown = (e: KeyboardEvent<HTMLTableCellElement>, field: string) => {
    if (!isActive) return;

    const currentCellId = `${item.id}-${field}`;
    
    // Enter or F2: Enter edit mode
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      setEditingCell({ itemId: item.id, field });
      return;
    }

    // Tab/Shift+Tab: Horizontal navigation
    if (e.key === 'Tab') {
      e.preventDefault();
      const fields = ['level', 'itemNumber', 'description', 'unit', 'quantity', 'rate', 'notes'];
      const currentIndex = fields.indexOf(field);
      const nextIndex = e.shiftKey 
        ? (currentIndex - 1 + fields.length) % fields.length
        : (currentIndex + 1) % fields.length;
      const nextField = fields[nextIndex];
      
      requestAnimationFrame(() => {
        const nextCell = document.querySelector(`[data-cell-id="${item.id}-${nextField}"]`) as HTMLElement;
        if (nextCell) nextCell.focus({ preventScroll: true });
      });
      return;
    }

    // Arrow keys: Navigate between cells
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      
      const fields = ['level', 'itemNumber', 'description', 'unit', 'quantity', 'rate', 'notes'];
      const currentFieldIndex = fields.indexOf(field);
      
      // Use items array instead of DOM queries for virtualizer compatibility
      const currentRowIndex = items ? items.findIndex(i => i.id === item.id) : (virtualRow?.index ?? -1);
      
      let targetField = field;
      let targetRowIndex = currentRowIndex;
      
      if (e.key === 'ArrowLeft' && currentFieldIndex > 0) {
        targetField = fields[currentFieldIndex - 1];
      } else if (e.key === 'ArrowRight' && currentFieldIndex < fields.length - 1) {
        targetField = fields[currentFieldIndex + 1];
      } else if (e.key === 'ArrowUp' && currentRowIndex > 0) {
        targetRowIndex = currentRowIndex - 1;
      } else if (e.key === 'ArrowDown' && items && currentRowIndex < items.length - 1) {
        targetRowIndex = currentRowIndex + 1;
      }
      
      // Navigate to target cell
      if (targetRowIndex !== currentRowIndex && items) {
        const targetItem = items[targetRowIndex];
        if (targetItem) {
          // Scroll virtualizer to target row before focusing
          if (rowVirtualizer) {
            rowVirtualizer.scrollToIndex(targetRowIndex, { align: 'auto' });
          }
          
          // Focus target cell after virtualizer renders
          requestAnimationFrame(() => {
            const targetCell = document.querySelector(`[data-cell-id="${targetItem.id}-${field}"]`) as HTMLElement;
            if (targetCell) targetCell.focus({ preventScroll: true });
          });
        }
      } else if (targetField !== field) {
        requestAnimationFrame(() => {
          const targetCell = document.querySelector(`[data-cell-id="${item.id}-${targetField}"]`) as HTMLElement;
          if (targetCell) targetCell.focus({ preventScroll: true });
        });
      }
    }
  };

  const handleSave = (field: string, value: string) => {
    // Apply optimistic update and force synchronous render
    flushSync(() => {
      onUpdateField(item, field, value);
    });
    
    // Exit edit mode after optimistic update has rendered
    setEditingCell(null);
    
    // Note: EditableCell component handles refocusing after save
  };

  // Bold styling for items with a level (1-9)
  const hasLevel = item.level !== null;
  const fontWeight = hasLevel ? 'font-bold' : '';
  // Blue text only for items without an item number (headers/groupings)
  const isHeading = !item.itemNumber || item.itemNumber.trim() === '';
  const textColor = isHeading ? 'text-blue-600 dark:text-blue-400' : '';
  
  // All items align on the same vertical line (no hierarchical indentation)
  const indentPx = 12;
  
  const tableRow = (
    <TableRow 
      ref={mergedRef} 
      style={style} 
      data-testid={`row-boq-item-${item.id}`} 
      data-index={virtualRow?.index}
      className={isSelected ? 'bg-muted/50' : ''}
    >
      {/* Always render drag handle cell, hide when inactive */}
      <TableCell 
        className="w-8" 
        style={{ opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none' }}
        aria-hidden={!isActive}
      >
        <div className="cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      
      {/* Always render checkbox cell, hide when inactive */}
      <TableCell 
        className="w-8" 
        style={{ opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none' }}
        aria-hidden={!isActive}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(item.id)}
          data-testid={`checkbox-boq-item-${item.id}`}
        />
      </TableCell>
      
      {/* Level column with collapse/expand icon */}
      <TableCell 
        className={`w-20 cursor-pointer boq-editable-cell ${textColor}`}
        onClick={() => handleCellClick('level')}
        onKeyDown={(e) => handleCellKeyDown(e, 'level')}
        tabIndex={0}
        data-cell-id={`${item.id}-level`}
        style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
      >
        {editingCell?.itemId === item.id && editingCell?.field === 'level' ? (
          <Input
            type="number"
            value={levelEditValue}
            onChange={(e) => {
              const newValue = e.target.value;
              // Validate number inputs with min/max constraints
              if (newValue !== '') {
                const numValue = parseInt(newValue, 10);
                if (!isNaN(numValue)) {
                  if (numValue < 1 || numValue > 9) return;
                }
              }
              setLevelEditValue(newValue);
            }}
            onBlur={() => {
              handleSave('level', levelEditValue);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave('level', levelEditValue);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setLevelEditValue(item.level?.toString() || '');
                setEditingCell(null);
              }
            }}
            min={1}
            max={9}
            className="border-0 focus-visible:ring-1 h-auto py-0 px-0 w-8 text-center"
            style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
            autoFocus
          />
        ) : (
          <div className="flex items-center justify-between">
            <span className="w-8 text-center">{item.level ?? '-'}</span>
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse();
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCollapse();
                  }
                }}
                className="ml-1 hover-elevate active-elevate-2 p-0.5 rounded"
                data-testid={`button-collapse-${item.id}`}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        )}
      </TableCell>
      
      <EditableCell
        value={item.itemNumber}
        className={`${fontWeight} ${textColor} font-mono`}
        onSave={(val) => handleSave('itemNumber', val)}
        isEditable={isActive}
        placeholder=""
        isInEditMode={editingCell?.itemId === item.id && editingCell?.field === 'itemNumber'}
        onCellClick={() => handleCellClick('itemNumber')}
        onCellKeyDown={(e) => handleCellKeyDown(e, 'itemNumber')}
        cellId={`${item.id}-itemNumber`}
      />
      
      <TableCell
        className={`cursor-pointer boq-editable-cell ${fontWeight} ${textColor}`}
        onClick={() => handleCellClick('description')}
        onKeyDown={(e) => handleCellKeyDown(e, 'description')}
        tabIndex={0}
        data-cell-id={`${item.id}-description`}
        style={{ 
          paddingLeft: `${indentPx}px`,
          paddingTop: 'var(--row-py)', 
          paddingBottom: 'var(--row-py)'
        }}
      >
        {editingCell?.itemId === item.id && editingCell?.field === 'description' ? (
          <Input
            value={item.description}
            onChange={(e) => handleSave('description', e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave('description', (e.target as HTMLInputElement).value);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditingCell(null);
              }
            }}
            className="border-0 focus-visible:ring-1 h-auto py-0 px-0"
            style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
            autoFocus
          />
        ) : (
          item.description
        )}
      </TableCell>
      
      <EditableCell
        value={hasLevel ? '' : item.unit}
        className={`${fontWeight} ${textColor}`}
        onSave={(val) => handleSave('unit', val)}
        isEditable={isActive && !hasLevel}
        isInEditMode={editingCell?.itemId === item.id && editingCell?.field === 'unit'}
        onCellClick={() => !hasLevel && handleCellClick('unit')}
        onCellKeyDown={(e) => !hasLevel && handleCellKeyDown(e, 'unit')}
        cellId={`${item.id}-unit`}
      />
      
      <EditableCell
        value={hasLevel ? '' : item.quantity}
        type="number"
        align="right"
        className={`${fontWeight} ${textColor}`}
        onSave={(val) => handleSave('quantity', val)}
        isEditable={isActive && !hasLevel}
        isInEditMode={editingCell?.itemId === item.id && editingCell?.field === 'quantity'}
        onCellClick={() => !hasLevel && handleCellClick('quantity')}
        onCellKeyDown={(e) => !hasLevel && handleCellKeyDown(e, 'quantity')}
        cellId={`${item.id}-quantity`}
        decimalPlaces={3}
      />
      
      <EditableCell
        value={hasLevel ? '' : item.rate}
        type="number"
        align="right"
        className={`${fontWeight} ${textColor}`}
        onSave={(val) => handleSave('rate', val)}
        isEditable={isActive && !hasLevel}
        isInEditMode={editingCell?.itemId === item.id && editingCell?.field === 'rate'}
        onCellClick={() => !hasLevel && handleCellClick('rate')}
        onCellKeyDown={(e) => !hasLevel && handleCellKeyDown(e, 'rate')}
        cellId={`${item.id}-rate`}
        decimalPlaces={2}
      />
      
      <TableCell 
        className={`text-right ${fontWeight} ${textColor}`}
        style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
      >
        {(() => {
          // Helper to format amount with thousand separators
          const formatAmount = (amount: number | string | null): string => {
            if (amount === null || amount === '') return '-';
            const numValue = typeof amount === 'number' ? amount : parseFloat(amount as string);
            if (isNaN(numValue)) return '-';
            return `$${numValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          };

          // If row has a level, show subtotal from rollups
          if (item.level !== null) {
            const rollupData = rollups.get(item.id);
            if (rollupData && rollupData.hasHiddenChildren && rollupData.subtotalAmount > 0) {
              // Show rolled-up subtotal with visual indicator
              return (
                <span className="flex items-center justify-end gap-1" title={`Subtotal of hidden descendant items`}>
                  <span className="text-purple-500 dark:text-purple-400">Σ</span>
                  {formatAmount(rollupData.subtotalAmount)}
                </span>
              );
            } else if (rollupData) {
              // Show subtotal without indicator
              return formatAmount(rollupData.subtotalAmount);
            } else {
              // Fallback to item's own amount if no rollup data
              return formatAmount(item.amount);
            }
          }
          // Otherwise show the item's amount
          return formatAmount(item.amount);
        })()}
      </TableCell>
      
      <EditableCell
        value={item.notes}
        className={`text-sm ${textColor || 'text-muted-foreground'} ${fontWeight}`}
        onSave={(val) => handleSave('notes', val)}
        isEditable={isActive}
        isInEditMode={editingCell?.itemId === item.id && editingCell?.field === 'notes'}
        onCellClick={() => handleCellClick('notes')}
        onCellKeyDown={(e) => handleCellKeyDown(e, 'notes')}
        cellId={`${item.id}-notes`}
      />
    </TableRow>
  );
  
  // No context menu for non-active revisions
  if (!isActive) {
    return tableRow;
  }
  
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {tableRow}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem 
          onClick={() => onInsertAbove(item)}
          data-testid={`menu-insert-above-${item.id}`}
        >
          <ArrowUp className="h-4 w-4 mr-2" />
          Insert Row Above
        </ContextMenuItem>
        <ContextMenuItem 
          onClick={() => onInsertBelow(item)}
          data-testid={`menu-insert-below-${item.id}`}
        >
          <ArrowDown className="h-4 w-4 mr-2" />
          Insert Row Below
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem 
          onClick={() => onDelete(item.id)}
          className="text-destructive focus:text-destructive"
          data-testid={`menu-delete-${item.id}`}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Row
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

const STORAGE_KEY_BOQ_COLUMN_WIDTHS = 'boq-column-widths';

// Default column widths
const DEFAULT_COLUMN_WIDTHS = {
  itemNumber: 120,
  description: 400,
  unit: 80,
  quantity: 100,
  rate: 100,
  amount: 120,
  notes: 200,
};

// Row height constants based on density settings
// Calculated as: base content (36px) + padding-top + padding-bottom
const ROW_HEIGHT_MAP = {
  narrow: 36,   // 36px base + 0px padding (--row-py: 0px)
  medium: 48,   // 36px base + 12px padding (--row-py: 0.375rem * 2)
  wide: 56,     // 36px base + 20px padding (--row-py: 0.625rem * 2)
};

function BOQTabInner() {
  const { selectedProject } = useProject();
  const { selectedBusinessUnit } = useBusinessUnit();
  const { themeSettings } = useThemeSettings();
  const { toast } = useToast();
  const { mode, setAll, setClosed, setDepth, visibleRows } = useBoqView();
  
  // Get row height based on current density setting
  const density = themeSettings?.rowDensity || 'wide';
  const rowHeight = ROW_HEIGHT_MAP[density as keyof typeof ROW_HEIGHT_MAP];

  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [showCreateRevisionDialog, setShowCreateRevisionDialog] = useState(false);
  const [showCreateItemDialog, setShowCreateItemDialog] = useState(false);
  const [showEditItemDialog, setShowEditItemDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showGlobalVariablesDialog, setShowGlobalVariablesDialog] = useState(false);
  const [showResourceRatesDialog, setShowResourceRatesDialog] = useState(false);
  const [showWorksheetsDialog, setShowWorksheetsDialog] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());

  const [newRevisionName, setNewRevisionName] = useState("");
  const [newRevisionNotes, setNewRevisionNotes] = useState("");

  const [newItem, setNewItem] = useState({
    itemNumber: "",
    description: "",
    unit: "",
    quantity: "",
    rate: "",
    amount: "",
    notes: "",
    level: "",
  });

  const [editItem, setEditItem] = useState<BOQItem | null>(null);

  // Load column widths from localStorage on mount
  useEffect(() => {
    const storedWidths = localStorage.getItem(STORAGE_KEY_BOQ_COLUMN_WIDTHS);
    if (storedWidths) {
      try {
        const parsed = JSON.parse(storedWidths);
        setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...parsed });
      } catch (e) {
        console.error('Failed to parse stored BOQ column widths:', e);
      }
    }
  }, []);

  // Clear selection when revision changes
  useEffect(() => {
    setSelectedItems(new Set());
  }, [selectedRevisionId]);

  // Cleanup pending save timers on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimerRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Save column widths to localStorage
  const saveColumnWidth = (columnId: string, width: number) => {
    const newWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(newWidths);
    localStorage.setItem(STORAGE_KEY_BOQ_COLUMN_WIDTHS, JSON.stringify(newWidths));
  };

  // Auto-calculate amount when quantity or rate changes (Create dialog)
  useEffect(() => {
    const qty = parseFloat(newItem.quantity);
    const rt = parseFloat(newItem.rate);
    if (!isNaN(qty) && !isNaN(rt) && qty > 0 && rt > 0) {
      const calculatedAmount = (qty * rt).toFixed(2);
      if (newItem.amount !== calculatedAmount) {
        setNewItem(prev => ({ ...prev, amount: calculatedAmount }));
      }
    } else if (newItem.amount) {
      setNewItem(prev => ({ ...prev, amount: "" }));
    }
  }, [newItem.quantity, newItem.rate]);

  // Auto-calculate amount when quantity or rate changes (Edit dialog)
  useEffect(() => {
    if (!editItem) return;
    const qty = parseFloat(editItem.quantity as any);
    const rt = parseFloat(editItem.rate as any);
    if (!isNaN(qty) && !isNaN(rt) && qty > 0 && rt > 0) {
      const calculatedAmount = parseFloat((qty * rt).toFixed(2));
      if (editItem.amount !== calculatedAmount) {
        setEditItem(prev => prev ? ({ ...prev, amount: calculatedAmount }) : null);
      }
    }
  }, [editItem?.quantity, editItem?.rate]);

  // Ref for virtualization scroll container
  const parentRef = useRef<HTMLDivElement>(null);

  // Fetch all revisions for the project
  const { data: revisions, isLoading: isLoadingRevisions } = useQuery<BOQRevision[]>({
    queryKey: ["/api/projects", selectedProject?.id, "boq", "revisions"],
    enabled: !!selectedProject?.id,
  });

  // Get the active revision
  const activeRevision = revisions?.find(r => r.isActive);

  // Use selected revision or default to active revision
  const currentRevision = selectedRevisionId 
    ? revisions?.find(r => r.id === selectedRevisionId)
    : activeRevision;

  // Fetch BOQ items for the current revision
  const { data: allItems, isLoading: isLoadingItems } = useQuery<BOQItem[]>({
    queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
    queryFn: currentRevision 
      ? async () => {
          const response = await fetch(
            `/api/projects/${selectedProject?.id}/boq/items?revisionId=${currentRevision.id}`
          );
          if (!response.ok) throw new Error("Failed to fetch BOQ items");
          return response.json();
        }
      : undefined,
    enabled: !!selectedProject?.id && !!currentRevision,
  });

  // Helper: Determine if an item has children
  const hasChildren = (itemIndex: number): boolean => {
    if (!allItems || itemIndex >= allItems.length - 1) return false;
    const currentItem = allItems[itemIndex];
    const nextItem = allItems[itemIndex + 1];
    
    // Only heading rows (with levels) can have children
    if (currentItem.level === null) return false;
    
    // Has children if next item is either:
    // 1. A sub-heading with higher level number, OR
    // 2. A detail row (level = null)
    if (nextItem.level === null) {
      // Detail row is a child
      return true;
    }
    
    // Sub-heading is a child if it has higher level
    return nextItem.level > currentItem.level;
  };

  // Helper: Toggle collapse state
  const toggleCollapse = (itemId: string) => {
    setCollapsedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Pre-compute row metadata with parent/ancestor relationships
  const rowsMeta = useMemo(() => {
    if (!allItems) return [];
    
    // Stack to track current heading hierarchy: [{ level, id, ancestorIds }]
    const stack: Array<{ level: number; id: string; ancestorIds: string[] }> = [];
    
    return allItems.map((item, index) => {
      let parentId: string | null = null;
      let ancestorIds: string[] = [];
      
      if (item.level === null) {
        // Detail row: parent is most recent heading on stack (top of stack)
        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          parentId = parent.id;
          ancestorIds = [...parent.ancestorIds, parent.id];
        }
      } else {
        // Heading row: pop any stack entries at same or deeper level
        while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
          stack.pop();
        }
        
        // Parent is now top of stack (if any)
        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          parentId = parent.id;
          ancestorIds = [...parent.ancestorIds, parent.id];
        }
        
        // Push current heading onto stack
        stack.push({ level: item.level, id: item.id, ancestorIds });
      }
      
      return {
        id: item.id,
        level: item.level,
        parentId,
        ancestorIds,
        hasChildren: hasChildren(index),
      };
    });
  }, [allItems]);

  // First apply view mode filtering (all/closed/depth N)
  const viewFilteredIds = useMemo(() => {
    const visibleMeta = visibleRows(rowsMeta);
    return new Set(visibleMeta.map(m => m.id));
  }, [rowsMeta, visibleRows]);

  const viewFilteredItems = useMemo(() => {
    if (!allItems) return [];
    return allItems.filter(item => viewFilteredIds.has(item.id));
  }, [allItems, viewFilteredIds]);

  // Build metadata lookup map for efficient ancestor checks
  const metaMap = useMemo(() => {
    return new Map(rowsMeta.map(meta => [meta.id, meta]));
  }, [rowsMeta]);

  // Pre-compute set of all hidden descendant IDs for faster filtering
  const hiddenItemIds = useMemo(() => {
    const hidden = new Set<string>();
    
    // For each collapsed item, mark all its descendants as hidden
    Array.from(collapsedItems).forEach(collapsedId => {
      // Find all items that have this collapsedId in their ancestorIds
      rowsMeta.forEach(meta => {
        if (meta.ancestorIds.includes(collapsedId)) {
          hidden.add(meta.id);
        }
      });
    });
    
    return hidden;
  }, [rowsMeta, collapsedItems]);

  // Filter visible items based on collapse state (optimized with pre-computed hidden set)
  const items = useMemo(() => {
    if (!viewFilteredItems) return [];
    return viewFilteredItems.filter(item => !hiddenItemIds.has(item.id));
  }, [viewFilteredItems, hiddenItemIds]);

  // Create visibility set for items after collapse filtering
  const visibleItemIds = useMemo(() => {
    return new Set(items?.map(item => item.id) ?? []);
  }, [items]);

  // Compute rolled-up totals from all items
  // viewFilteredIds = items in current view (already defined above)
  // visibleItemIds = items actually shown (after collapse)
  // Σ icon only shows when items are collapsed (in view but not visible)
  const rollups = useBoqRollups(allItems, viewFilteredIds, visibleItemIds);

  // No hierarchical indentation - all items align on the same vertical line

  // Setup row virtualization for performance with large lists
  const rowVirtualizer = useVirtualizer({
    count: items?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    getItemKey: (index) => items?.[index]?.id ?? String(index),
  });

  // Update row measurements when density changes
  useEffect(() => {
    // Update CSS custom property for row padding
    document.documentElement.style.setProperty('--boq-row-height', `${rowHeight}px`);
    
    // Trigger re-measurement of all virtualized rows when density changes
    rowVirtualizer.measure();
  }, [themeSettings?.rowDensity, rowHeight]);

  // Create new revision mutation
  const createRevisionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        `/api/projects/${selectedProject?.id}/boq/revisions`,
        {
          revisionName: newRevisionName,
          notes: newRevisionNotes,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "revisions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "items"],
        exact: false,
      });
      toast({
        title: "Revision created",
        description: "New BOQ revision created successfully.",
      });
      setShowCreateRevisionDialog(false);
      setNewRevisionName("");
      setNewRevisionNotes("");
      setSelectedRevisionId(null); // Switch to new active revision
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create BOQ revision.",
        variant: "destructive",
      });
    },
  });

  // Create new BOQ item mutation
  const createItemMutation = useMutation({
    mutationFn: async () => {
      // Convert level from string to number or null
      const level = newItem.level && newItem.level.trim() !== '' && newItem.level !== '-'
        ? parseInt(newItem.level, 10)
        : null;
      
      return await apiRequest(
        "POST",
        `/api/projects/${selectedProject?.id}/boq/items`,
        {
          revisionId: currentRevision?.id,
          itemNumber: newItem.itemNumber,
          description: newItem.description,
          unit: newItem.unit || null,
          quantity: newItem.quantity || null,
          rate: newItem.rate || null,
          amount: newItem.amount || null,
          notes: newItem.notes || null,
          level: level,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
      });
      toast({
        title: "Item added",
        description: "BOQ item created successfully.",
      });
      setShowCreateItemDialog(false);
      setNewItem({
        itemNumber: "",
        description: "",
        unit: "",
        quantity: "",
        rate: "",
        amount: "",
        notes: "",
        level: "4",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create BOQ item.",
        variant: "destructive",
      });
    },
  });

  // Insert row mutation
  const insertItemMutation = useMutation({
    mutationFn: async ({ targetItem, position }: { targetItem: BOQItem; position: 'above' | 'below' }) => {
      // Find the target item's sorting index
      const targetIndex = allItems?.findIndex(i => i.id === targetItem.id) ?? 0;
      
      // Calculate the new item's sorting index
      let newSortingIndex: number;
      if (position === 'above') {
        // Insert above: use target's sorting index, others will shift up
        newSortingIndex = targetItem.sortingIndex;
      } else {
        // Insert below: use target's sorting index + 1
        newSortingIndex = targetItem.sortingIndex + 1;
      }
      
      return await apiRequest(
        "POST",
        `/api/projects/${selectedProject?.id}/boq/items`,
        {
          revisionId: currentRevision?.id,
          itemNumber: "",
          description: "",
          unit: null,
          quantity: null,
          rate: null,
          amount: null,
          notes: null,
          level: null,
          sortingIndex: newSortingIndex,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
      });
    },
  });

  // Debounce timer for batch saves
  const saveTimerRef = useReactRef<Record<string, NodeJS.Timeout>>({});

  // Update BOQ item mutation with optimistic updates
  const updateItemMutation = useMutation({
    mutationFn: async ({ item, showToast = false }: { item: BOQItem, showToast?: boolean }) => {
      const response = await apiRequest(
        "PUT",
        `/api/projects/${selectedProject?.id}/boq/items/${item.id}`,
        {
          itemNumber: item.itemNumber,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
          notes: item.notes,
          level: item.level,
        }
      );
      return { response, showToast };
    },
    onMutate: async ({ item }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
      });

      // Snapshot the previous value
      const previousItems = queryClient.getQueryData<BOQItem[]>([
        "/api/projects",
        selectedProject?.id,
        "boq",
        "items",
        currentRevision?.id,
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<BOQItem[]>(
        ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
        (old) => {
          if (!old) return old;
          return old.map((i) => (i.id === item.id ? item : i));
        }
      );

      // Return context with the snapshot
      return { previousItems };
    },
    onSuccess: ({ showToast }) => {
      // Only show toast for dialog edits, not inline edits
      if (showToast) {
        toast({
          title: "Item updated",
          description: "BOQ item updated successfully.",
        });
        setShowEditItemDialog(false);
        setEditItem(null);
      }
    },
    onError: (err, { item }, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData(
          ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
          context.previousItems
        );
      }
      toast({
        title: "Error",
        description: "Failed to update BOQ item.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Refetch after a successful save or error to sync with server
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
      });
    },
  });

  // Delete BOQ item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest(
        "DELETE",
        `/api/projects/${selectedProject?.id}/boq/items/${itemId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
      });
      toast({
        title: "Item deleted",
        description: "BOQ item deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete BOQ item.",
        variant: "destructive",
      });
    },
  });

  // Reorder BOQ items mutation with optimistic updates
  const reorderItemsMutation = useMutation({
    mutationFn: async (data: { reorderedItems: { id: string; sortingIndex: number }[], optimisticItems: BOQItem[] }) => {
      return await apiRequest(
        "POST",
        `/api/projects/${selectedProject?.id}/boq/items/reorder`,
        { items: data.reorderedItems }
      );
    },
    onMutate: async ({ optimisticItems }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
      });

      // Snapshot the previous value
      const previousItems = queryClient.getQueryData<BOQItem[]>([
        "/api/projects",
        selectedProject?.id,
        "boq",
        "items",
        currentRevision?.id,
      ]);

      // Optimistically update to the new order
      queryClient.setQueryData<BOQItem[]>(
        ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
        optimisticItems
      );

      return { previousItems };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData(
          ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
          context.previousItems
        );
      }
      console.error('Reorder error:', err);
      toast({
        title: "Error",
        description: "Failed to reorder BOQ items.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
      });
    },
  });

  // DnD sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !items || !currentRevision?.isActive) return;

    if (active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const reordered = arrayMove(items, oldIndex, newIndex);
      const updatedItems = reordered.map((item, index) => ({
        id: item.id,
        sortingIndex: index,
      }));

      // Update sortingIndex in the full items for optimistic update
      const optimisticItems = reordered.map((item, index) => ({
        ...item,
        sortingIndex: index,
      }));

      reorderItemsMutation.mutate({ 
        reorderedItems: updatedItems,
        optimisticItems: optimisticItems
      });
    }
  };

  // Calculate hierarchical subtotals for rows with levels
  const calculateSubtotal = (itemIndex: number, items: BOQItem[]): number => {
    const currentItem = items[itemIndex];
    if (currentItem.level === null) return 0;
    
    let subtotal = 0;
    const currentLevel = currentItem.level;
    
    // Sum all items below until we reach the next same-or-lower level
    for (let i = itemIndex + 1; i < items.length; i++) {
      const nextItem = items[i];
      
      // Stop if we reach a same-or-lower level
      if (nextItem.level !== null && nextItem.level <= currentLevel) {
        break;
      }
      
      // Only add items without a level (actual items, not headers)
      if (nextItem.level === null && nextItem.amount !== null) {
        subtotal += parseFloat(nextItem.amount as any);
      }
    }
    
    return subtotal;
  };

  // Calculate total amount (only items without level, since level rows show subtotals)
  const totalAmount = (items || []).reduce((sum, item) => {
    // Only sum items without a level (actual items)
    if (item.level === null) {
      return sum + parseFloat(item.amount as any || "0");
    }
    return sum;
  }, 0);

  // Handle inline field update with debouncing
  const handleUpdateField = (item: BOQItem, field: string, value: string) => {
    // Convert level from string to number or null
    let processedValue: any = value === '' ? null : value;
    if (field === 'level') {
      processedValue = value && value.trim() !== '' && value !== '-'
        ? parseInt(value, 10)
        : null;
    }
    
    const updatedItem = { ...item, [field]: processedValue };
    
    // Auto-calculate amount if quantity or rate changed
    if (field === 'quantity' || field === 'rate') {
      const qty = field === 'quantity' ? parseFloat(value) : parseFloat(updatedItem.quantity as any);
      const rt = field === 'rate' ? parseFloat(value) : parseFloat(updatedItem.rate as any);
      if (!isNaN(qty) && !isNaN(rt) && qty > 0 && rt > 0) {
        updatedItem.amount = parseFloat((qty * rt).toFixed(2));
      }
    }
    
    // Clear existing timer for this item
    if (saveTimerRef.current[item.id]) {
      clearTimeout(saveTimerRef.current[item.id]);
    }
    
    // Immediately update UI optimistically
    queryClient.setQueryData<BOQItem[]>(
      ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
      (old) => {
        if (!old) return old;
        return old.map((i) => (i.id === item.id ? updatedItem : i));
      }
    );
    
    // Debounce the actual server save (300ms)
    saveTimerRef.current[item.id] = setTimeout(() => {
      updateItemMutation.mutate({ item: updatedItem, showToast: false });
      delete saveTimerRef.current[item.id];
    }, 300);
  };

  // Selection handlers
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleAllItems = () => {
    if (selectedItems.size === items?.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items?.map(item => item.id) || []));
    }
  };

  // Move selected items up or down
  const moveSelectedUp = () => {
    if (!items || !currentRevision?.isActive || selectedItems.size === 0) return;

    // Get selected items sorted by their current index
    const selectedIndices = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => selectedItems.has(item.id))
      .sort((a, b) => a.index - b.index);

    // Can't move if the first selected item is already at the top
    if (selectedIndices[0].index === 0) return;

    // Create new array with moved items
    const reordered = [...items];
    for (const { item, index } of selectedIndices) {
      // Swap with item above
      [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    }

    const updatedItems = reordered.map((item, index) => ({
      id: item.id,
      sortingIndex: index,
    }));

    // Update sortingIndex in the full items for optimistic update
    const optimisticItems = reordered.map((item, index) => ({
      ...item,
      sortingIndex: index,
    }));

    reorderItemsMutation.mutate({
      reorderedItems: updatedItems,
      optimisticItems: optimisticItems
    });
  };

  const moveSelectedDown = () => {
    if (!items || !currentRevision?.isActive || selectedItems.size === 0) return;

    // Get selected items sorted by their current index (descending)
    const selectedIndices = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => selectedItems.has(item.id))
      .sort((a, b) => b.index - a.index); // Sort descending for moving down

    // Can't move if the last selected item is already at the bottom
    if (selectedIndices[0].index === items.length - 1) return;

    // Create new array with moved items
    const reordered = [...items];
    for (const { item, index } of selectedIndices) {
      // Swap with item below
      [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    }

    const updatedItems = reordered.map((item, index) => ({
      id: item.id,
      sortingIndex: index,
    }));

    // Update sortingIndex in the full items for optimistic update
    const optimisticItems = reordered.map((item, index) => ({
      ...item,
      sortingIndex: index,
    }));

    reorderItemsMutation.mutate({
      reorderedItems: updatedItems,
      optimisticItems: optimisticItems
    });
  };

  // Define editable fields in order
  const editableFields = ['itemNumber', 'description', 'unit', 'quantity', 'rate', 'notes'];

  // Handle arrow key navigation - pure DOM focus (no React state)
  const handleArrowNavigation = (key: string, currentCellElement: HTMLElement) => {
    if (!items || items.length === 0 || !currentCellElement) return;

    const cellId = currentCellElement.dataset.cellId;
    if (!cellId) return;

    const [currentItemId, currentField] = cellId.split('-');
    const currentItemIndex = items.findIndex(i => i.id === currentItemId);
    const currentFieldIndex = editableFields.indexOf(currentField);

    if (currentItemIndex === -1 || currentFieldIndex === -1) return;

    let newItemIndex = currentItemIndex;
    let newFieldIndex = currentFieldIndex;

    switch (key) {
      case 'ArrowUp':
        newItemIndex = Math.max(0, currentItemIndex - 1);
        break;
      case 'ArrowDown':
        newItemIndex = Math.min(items.length - 1, currentItemIndex + 1);
        break;
      case 'ArrowLeft':
        newFieldIndex = Math.max(0, currentFieldIndex - 1);
        break;
      case 'ArrowRight':
        newFieldIndex = Math.min(editableFields.length - 1, currentFieldIndex + 1);
        break;
    }

    const newItem = items[newItemIndex];
    const newField = editableFields[newFieldIndex];
    
    if (newItem && newField) {
      // Scroll virtualizer to target row if moving vertically
      if (newItemIndex !== currentItemIndex) {
        rowVirtualizer.scrollToIndex(newItemIndex, { align: 'auto' });
      }
      
      // Focus target cell after virtualizer renders
      requestAnimationFrame(() => {
        const cellElement = document.querySelector(`[data-cell-id="${newItem.id}-${newField}"]`) as HTMLElement;
        if (cellElement) {
          cellElement.focus({ preventScroll: true });
        }
      });
    }
  };

  // Auto-focus first cell when items load
  useEffect(() => {
    if (items && items.length > 0 && currentRevision?.isActive && document.activeElement?.tagName === 'BODY') {
      const firstItem = items[0];
      const firstField = 'itemNumber';
      
      // Just focus the DOM element - no state update needed!
      requestAnimationFrame(() => {
        const cellElement = document.querySelector(`[data-cell-id="${firstItem.id}-${firstField}"]`) as HTMLElement;
        if (cellElement) {
          cellElement.focus({ preventScroll: true });
        }
      });
    }
  }, [items, currentRevision?.isActive]);

  // Global keyboard handler for navigation - pure DOM, no state!
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (editingCell) return; // Don't navigate while editing

      const activeElement = document.activeElement as HTMLElement;
      const isCellFocused = activeElement?.hasAttribute('data-cell-id');
      
      if (!isCellFocused) return;

      // Arrow key navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        handleArrowNavigation(e.key, activeElement);
      }
      // Tab navigation
      else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          handleArrowNavigation('ArrowLeft', activeElement);
        } else {
          handleArrowNavigation('ArrowRight', activeElement);
        }
      }
      // Enter or F2 to start editing
      else if ((e.key === 'Enter' || e.key === 'F2') && currentRevision?.isActive) {
        e.preventDefault();
        const cellId = activeElement.dataset.cellId;
        if (cellId) {
          const [itemId, field] = cellId.split('-');
          setEditingCell({ itemId, field });
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editingCell, items, currentRevision?.isActive]);

  if (!selectedProject) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">No project selected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center flex-shrink-0">
        {/* Left side: Action buttons */}
        {currentRevision && !currentRevision.isActive && (
          <div className="text-sm text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-800">
            ⚠️ Viewing superseded revision
          </div>
        )}

        {/* Show action buttons if: (1) there's an active revision OR (2) there are no revisions */}
        {((currentRevision && currentRevision.isActive) || (!revisions || revisions.length === 0)) && (
          <>
            {/* Insert rows via right-click context menu */}

            {/* Move Up/Down buttons - only show when items are selected */}
            {currentRevision && currentRevision.isActive && selectedItems.size > 0 && (
              <>
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={moveSelectedUp}
                  disabled={reorderItemsMutation.isPending}
                  data-testid="button-move-up"
                  title={`Move ${selectedItems.size} item(s) up`}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={moveSelectedDown}
                  disabled={reorderItemsMutation.isPending}
                  data-testid="button-move-down"
                  title={`Move ${selectedItems.size} item(s) down`}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedItems.size} selected
                </span>
              </>
            )}

            {/* Import Excel button - only show if there's an active revision */}
            {currentRevision && currentRevision.isActive && (
              <Button 
                variant="outline"
                onClick={() => setShowImportDialog(true)}
                data-testid="button-import-excel"
                className="text-xs font-semibold border-green-600 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Excel
              </Button>
            )}

            {/* New Revision button - always show (even when no revisions exist) */}
            <Button 
              variant="outline" 
              onClick={() => setShowCreateRevisionDialog(true)}
              data-testid="button-new-boq-revision"
              className="text-xs font-semibold border-blue-600 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30"
            >
              <Clock className="h-4 w-4 mr-2" />
              New Revision
            </Button>

            {/* Global Variables button */}
            <Button 
              variant="outline"
              onClick={() => setShowGlobalVariablesDialog(true)}
              data-testid="button-global-variables"
              className="text-xs font-semibold border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30"
            >
              Global Variables
            </Button>

            {/* Resource Rates button - only show when specific business unit is selected */}
            {selectedBusinessUnit && typeof selectedBusinessUnit === 'object' && (
              <Button 
                variant="outline"
                onClick={() => setShowResourceRatesDialog(true)}
                data-testid="button-resource-rates"
                className="text-xs font-semibold border-emerald-700 text-emerald-800 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
              >
                Resource Rates
              </Button>
            )}

            {/* Worksheets button */}
            <Button 
              variant="outline"
              onClick={() => setShowWorksheetsDialog(true)}
              data-testid="button-worksheets"
              className="text-xs font-semibold border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30"
            >
              <Layers className="h-4 w-4 mr-2" />
              Worksheets
            </Button>

            {/* Settings button - always show */}
            <Button 
              variant="outline"
              onClick={() => setShowSettingsDialog(true)}
              data-testid="button-boq-settings"
              className="text-xs"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </>
        )}

        {/* View mode indicator */}
        {currentRevision && items && items.length > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-md border" data-testid="view-mode-indicator">
            View: {mode.kind === "all" ? "All" : mode.kind === "closed" ? "Headings only" : `Depth ≤ ${mode.max}`}
          </div>
        )}

        {/* Spacer to push revision selector to the right */}
        <div className="flex-1" />

        {/* Right side: Revision selector */}
        {currentRevision && (
          <Select 
            value={selectedRevisionId || activeRevision?.id} 
            onValueChange={setSelectedRevisionId}
          >
            <SelectTrigger className="w-[259px] sm:w-[317px] text-xs sm:text-sm" data-testid="select-boq-revision">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <SelectValue placeholder="Select revision" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {(revisions || []).map((revision) => (
                <SelectItem key={revision.id} value={revision.id}>
                  Rev {revision.revisionNumber} - {revision.revisionName}
                  {revision.isActive && " (Active)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* BOQ Table */}
      {isLoadingItems ? (
        <Card className="flex-shrink-0">
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Loading BOQ items...</p>
          </CardContent>
        </Card>
      ) : items && items.length > 0 ? (
        <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div ref={parentRef} className="flex-1 overflow-x-auto overflow-y-auto">
            {(() => {
              // Derive isActive once to ensure header and body use the same value
              const isRevisionActive = Boolean(currentRevision?.isActive);
              
              return (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <Table key={`boq-table-${currentRevision?.id}-${isRevisionActive ? 'active' : 'inactive'}`} className="table-fixed">
                    {/* Column group enforces consistent widths across header and body - always 10 columns */}
                    <colgroup>
                      <col key="col-drag" style={{ width: '32px' }} />
                      <col key="col-checkbox" style={{ width: '32px' }} />
                      <col key="col-level" style={{ width: '80px' }} />
                      <col key="col-item" style={{ width: `${columnWidths.itemNumber}px`, minWidth: '80px' }} />
                      <col key="col-desc" style={{ width: `${columnWidths.description}px`, minWidth: '150px' }} />
                      <col key="col-unit" style={{ width: `${columnWidths.unit}px`, minWidth: '60px' }} />
                      <col key="col-qty" style={{ width: `${columnWidths.quantity}px`, minWidth: '80px' }} />
                      <col key="col-rate" style={{ width: `${columnWidths.rate}px`, minWidth: '80px' }} />
                      <col key="col-amt" style={{ width: `${columnWidths.amount}px`, minWidth: '100px' }} />
                      <col key="col-notes" style={{ width: `${columnWidths.notes}px`, minWidth: '100px' }} />
                </colgroup>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-8" style={{ opacity: isRevisionActive ? 1 : 0, pointerEvents: isRevisionActive ? 'auto' : 'none' }} aria-hidden={!isRevisionActive}></TableHead>
                    <TableHead className="w-8" style={{ opacity: isRevisionActive ? 1 : 0, pointerEvents: isRevisionActive ? 'auto' : 'none' }} aria-hidden={!isRevisionActive}>
                      <Checkbox
                        checked={selectedItems.size === items?.length && items.length > 0}
                        onCheckedChange={toggleAllItems}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="w-20">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div className="flex items-center gap-1 cursor-context-menu" data-testid="level-column-header">
                            <span>Level</span>
                            <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={setAll} data-testid="menu-view-all">
                            <Layers className="mr-2 h-4 w-4" /> Open All
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={setClosed} data-testid="menu-view-closed">
                            <Layers className="mr-2 h-4 w-4" /> Close All
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          {[1,2,3,4,5,6,7,8,9].map(n => (
                            <ContextMenuItem key={n} onSelect={() => setDepth(n)} data-testid={`menu-view-depth-${n}`}>
                              Depth {n}
                            </ContextMenuItem>
                          ))}
                        </ContextMenuContent>
                      </ContextMenu>
                    </TableHead>
                    <ResizableTableHead
                      columnId="itemNumber"
                      currentWidth={columnWidths.itemNumber}
                      minWidth={80}
                      onResize={saveColumnWidth}
                    >
                      Item #
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnId="description"
                      currentWidth={columnWidths.description}
                      minWidth={150}
                      onResize={saveColumnWidth}
                    >
                      Description
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnId="unit"
                      currentWidth={columnWidths.unit}
                      minWidth={60}
                      onResize={saveColumnWidth}
                    >
                      Unit
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnId="quantity"
                      currentWidth={columnWidths.quantity}
                      minWidth={80}
                      onResize={saveColumnWidth}
                      className="text-right"
                    >
                      Quantity
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnId="rate"
                      currentWidth={columnWidths.rate}
                      minWidth={80}
                      onResize={saveColumnWidth}
                      className="text-right"
                    >
                      Rate
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnId="amount"
                      currentWidth={columnWidths.amount}
                      minWidth={100}
                      onResize={saveColumnWidth}
                      className="text-right"
                    >
                      Amount
                    </ResizableTableHead>
                    <ResizableTableHead
                      columnId="notes"
                      currentWidth={columnWidths.notes}
                      minWidth={100}
                      onResize={saveColumnWidth}
                    >
                      Notes
                    </ResizableTableHead>
                  </TableRow>
                </TableHeader>
                <SortableContext
                  items={items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <TableBody>
                    {items.map((item, index) => {
                      const itemIndex = allItems?.indexOf(item) ?? -1;
                      const meta = metaMap.get(item.id);
                      return (
                        <SortableRow
                          key={item.id}
                          item={item}
                          itemIndex={index}
                          isActive={isRevisionActive}
                          onInsertAbove={(item) => insertItemMutation.mutate({ targetItem: item, position: 'above' })}
                          onInsertBelow={(item) => insertItemMutation.mutate({ targetItem: item, position: 'below' })}
                          onDelete={(itemId) => deleteItemMutation.mutate(itemId)}
                          onUpdateField={handleUpdateField}
                          editingCell={editingCell}
                          setEditingCell={setEditingCell}
                          isSelected={selectedItems.has(item.id)}
                          onToggleSelect={toggleItemSelection}
                          hasChildren={meta?.hasChildren ?? false}
                          isCollapsed={collapsedItems.has(item.id)}
                          onToggleCollapse={() => toggleCollapse(item.id)}
                          virtualRow={undefined}
                          measureElement={undefined}
                          items={items}
                          rowVirtualizer={rowVirtualizer}
                          rollups={rollups}
                        />
                      );
                    })}
                  </TableBody>
                </SortableContext>
              <TableFooter>
                <TableRow>
                  <TableCell style={{ opacity: isRevisionActive ? 1 : 0, pointerEvents: isRevisionActive ? 'auto' : 'none' }} aria-hidden={!isRevisionActive} />
                  <TableCell style={{ opacity: isRevisionActive ? 1 : 0, pointerEvents: isRevisionActive ? 'auto' : 'none' }} aria-hidden={!isRevisionActive} />
                  <TableCell />
                  <TableCell colSpan={5} className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">
                    ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
              </Table>
            </DndContext>
              );
            })()}
          </div>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              No BOQ items yet. {currentRevision?.isActive && "Add items manually or import from Excel."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create Revision Dialog */}
      <Dialog open={showCreateRevisionDialog} onOpenChange={setShowCreateRevisionDialog}>
        <DialogContent data-testid="dialog-create-boq-revision">
          <DialogHeader>
            <DialogTitle>Create New BOQ Revision</DialogTitle>
            <DialogDescription>
              This will create a snapshot of the current BOQ. The current revision will be marked as superseded and locked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="boq-revision-name">Revision Name</Label>
              <Input
                id="boq-revision-name"
                placeholder="e.g., Tender Submission, Contract Award"
                value={newRevisionName}
                onChange={(e) => setNewRevisionName(e.target.value)}
                data-testid="input-boq-revision-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="boq-revision-notes">Notes (Optional)</Label>
              <Textarea
                id="boq-revision-notes"
                placeholder="Describe the reason for this revision..."
                value={newRevisionNotes}
                onChange={(e) => setNewRevisionNotes(e.target.value)}
                className="min-h-[100px]"
                data-testid="textarea-boq-revision-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCreateRevisionDialog(false)}
              data-testid="button-cancel-boq-revision"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => createRevisionMutation.mutate()}
              disabled={!newRevisionName.trim() || createRevisionMutation.isPending}
              data-testid="button-confirm-create-boq-revision"
            >
              {createRevisionMutation.isPending ? "Creating..." : "Create Revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Item Dialog */}
      <Dialog open={showCreateItemDialog} onOpenChange={setShowCreateItemDialog}>
        <DialogContent data-testid="dialog-create-boq-item">
          <DialogHeader>
            <DialogTitle>Add BOQ Item</DialogTitle>
            <DialogDescription>
              Add a new item to the active BOQ revision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-level">Level</Label>
                <Input
                  id="item-level"
                  type="text"
                  placeholder="1-9 or empty"
                  value={newItem.level}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || val === '-') {
                      setNewItem({ ...newItem, level: '' });
                    } else if (/^[1-9]$/.test(val)) {
                      setNewItem({ ...newItem, level: val });
                    }
                  }}
                  data-testid="input-item-level"
                />
                <p className="text-xs text-muted-foreground">Enter 1-9, or leave empty for "-"</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-number">Item Number</Label>
                <Input
                  id="item-number"
                  placeholder="e.g., 1.01"
                  value={newItem.itemNumber}
                  onChange={(e) => setNewItem({ ...newItem, itemNumber: e.target.value })}
                  data-testid="input-item-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-unit">Unit</Label>
                <Input
                  id="item-unit"
                  placeholder="e.g., m³, EA, LM"
                  value={newItem.unit}
                  onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                  data-testid="input-item-unit"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-description">Description</Label>
              <Textarea
                id="item-description"
                placeholder="Item description..."
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                data-testid="textarea-item-description"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-quantity">Quantity</Label>
                <Input
                  id="item-quantity"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                  data-testid="input-item-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-rate">Rate ($)</Label>
                <Input
                  id="item-rate"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newItem.rate}
                  onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
                  data-testid="input-item-rate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-amount">Amount ($)</Label>
                <Input
                  id="item-amount"
                  type="text"
                  placeholder="0.00"
                  value={newItem.amount}
                  readOnly
                  className="bg-muted"
                  data-testid="input-item-amount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-notes">Notes (Optional)</Label>
              <Textarea
                id="item-notes"
                placeholder="Additional notes..."
                value={newItem.notes}
                onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                data-testid="textarea-item-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCreateItemDialog(false)}
              data-testid="button-cancel-item"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => createItemMutation.mutate()}
              disabled={!newItem.itemNumber.trim() || !newItem.description.trim() || createItemMutation.isPending}
              data-testid="button-confirm-create-item"
            >
              {createItemMutation.isPending ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      {editItem && (
        <Dialog open={showEditItemDialog} onOpenChange={setShowEditItemDialog}>
          <DialogContent data-testid="dialog-edit-boq-item">
            <DialogHeader>
              <DialogTitle>Edit BOQ Item</DialogTitle>
              <DialogDescription>
                Update the BOQ item details.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-item-level">Level</Label>
                  <Input
                    id="edit-item-level"
                    type="text"
                    placeholder="1-9 or empty"
                    value={editItem.level?.toString() || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val === '-') {
                        setEditItem({ ...editItem, level: null });
                      } else if (/^[1-9]$/.test(val)) {
                        setEditItem({ ...editItem, level: parseInt(val) });
                      }
                    }}
                    data-testid="input-edit-item-level"
                  />
                  <p className="text-xs text-muted-foreground">Enter 1-9, or leave empty for "-"</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-item-number">Item Number</Label>
                  <Input
                    id="edit-item-number"
                    value={editItem.itemNumber}
                    onChange={(e) => setEditItem({ ...editItem, itemNumber: e.target.value })}
                    data-testid="input-edit-item-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-item-unit">Unit</Label>
                  <Input
                    id="edit-item-unit"
                    value={editItem.unit}
                    onChange={(e) => setEditItem({ ...editItem, unit: e.target.value })}
                    data-testid="input-edit-item-unit"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-item-description">Description</Label>
                <Textarea
                  id="edit-item-description"
                  value={editItem.description}
                  onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                  data-testid="textarea-edit-item-description"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-item-quantity">Quantity</Label>
                  <Input
                    id="edit-item-quantity"
                    type="number"
                    step="0.01"
                    value={editItem.quantity ?? ""}
                    onChange={(e) => setEditItem({ ...editItem, quantity: e.target.value ? parseFloat(e.target.value) : null })}
                    data-testid="input-edit-item-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-item-rate">Rate ($)</Label>
                  <Input
                    id="edit-item-rate"
                    type="number"
                    step="0.01"
                    value={editItem.rate ?? ""}
                    onChange={(e) => setEditItem({ ...editItem, rate: e.target.value ? parseFloat(e.target.value) : null })}
                    data-testid="input-edit-item-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-item-amount">Amount ($)</Label>
                  <Input
                    id="edit-item-amount"
                    type="text"
                    value={editItem.amount ?? ""}
                    readOnly
                    className="bg-muted"
                    data-testid="input-edit-item-amount"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-item-notes">Notes</Label>
                <Textarea
                  id="edit-item-notes"
                  value={editItem.notes ?? ""}
                  onChange={(e) => setEditItem({ ...editItem, notes: e.target.value })}
                  data-testid="textarea-edit-item-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowEditItemDialog(false);
                  setEditItem(null);
                }}
                data-testid="button-cancel-edit-item"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => updateItemMutation.mutate({ item: editItem, showToast: true })}
                disabled={!editItem.itemNumber.trim() || !editItem.description.trim() || updateItemMutation.isPending}
                data-testid="button-confirm-edit-item"
              >
                {updateItemMutation.isPending ? "Updating..." : "Update Item"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Import Excel Dialog */}
      {currentRevision && (
        <BOQImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          projectId={selectedProject.id}
          revisionId={currentRevision.id}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["/api/projects", selectedProject?.id, "boq", "items", currentRevision?.id],
            });
          }}
        />
      )}

      {/* Settings Dialog */}
      <BOQSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        projectId={selectedProject.id}
      />

      {/* Global Variables Dialog */}
      <GlobalVariablesDialog
        open={showGlobalVariablesDialog}
        onOpenChange={setShowGlobalVariablesDialog}
        projectId={selectedProject.id}
      />

      {/* Resource Rates Dialog */}
      {selectedBusinessUnit && typeof selectedBusinessUnit === 'object' && (
        <ResourceRatesDialog
          open={showResourceRatesDialog}
          onOpenChange={setShowResourceRatesDialog}
          projectId={selectedProject.id}
          companyId={selectedBusinessUnit.companyId}
        />
      )}

      {/* Worksheets Dialog */}
      <WorksheetsDialog
        open={showWorksheetsDialog}
        onOpenChange={setShowWorksheetsDialog}
        projectId={selectedProject.id}
      />
    </div>
  );
}

// Export wrapper component that provides BOQ view context
export function BOQTab() {
  const { selectedProject } = useProject();
  const [currentRevisionId, setCurrentRevisionId] = useState<string | null>(null);

  // Create a stable revision key for the provider
  const revisionKey = `${selectedProject?.id}-${currentRevisionId}`;

  if (!selectedProject) {
    return <BOQTabInner />;
  }

  return (
    <BoqViewProvider revisionKey={revisionKey}>
      <BOQTabInner />
    </BoqViewProvider>
  );
}
