import { useState, useEffect, useRef, useMemo, useCallback, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Trash2, Upload, FileText, GripVertical } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useWorksheetsWebSocket } from '@/hooks/useWorksheetsWebSocket';
import { WorksheetsImportDialog } from './WorksheetsImportDialog';
import WorksheetItemsDialog from './WorksheetItemsDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Worksheet } from '@shared/schema';

interface WorksheetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

// SortableRow component for drag-and-drop with inline editing
function SortableRow({
  worksheet,
  editingCell,
  selectedCell,
  onCellClick,
  onCellDoubleClick,
  onFieldChange,
  onViewItems,
  onDelete,
  virtualRow,
  measureElement,
  columnWidths,
}: {
  worksheet: Worksheet;
  editingCell: { id: string; field: string } | null;
  selectedCell: { id: string; field: string } | null;
  onCellClick: (id: string, field: string) => void;
  onCellDoubleClick: (id: string, field: string, currentValue: string | null) => void;
  onFieldChange: (id: string, field: string, value: string) => void;
  onViewItems: (worksheet: Worksheet) => void;
  onDelete: (id: string) => void;
  virtualRow?: { index: number; start: number; size: number; key: string | number | bigint };
  measureElement?: (node: Element | null) => void;
  columnWidths: Record<string, number>;
}) {
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editableFields = ['wkshtCode', 'description', 'unit'];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: worksheet.id });

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

  // Merge setNodeRef and measureElement callbacks
  const mergedRef = useCallback((node: HTMLTableRowElement | null) => {
    setNodeRef(node);
    if (measureElement && node) {
      measureElement(node);
    }
  }, [setNodeRef, measureElement]);

  // Focus on input when editing starts
  useEffect(() => {
    if (editingCell?.id === worksheet.id && inputRef.current) {
      const field = editingCell.field;
      const value = worksheet[field as keyof Worksheet] as string | null;
      setEditValue(value || '');
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell, worksheet]);

  const handleSave = (field: string) => {
    onFieldChange(worksheet.id, field, editValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(field);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCellClick(worksheet.id, field);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr 
          ref={mergedRef} 
          style={style} 
          data-testid={`row-worksheet-${worksheet.id}`}
          className="border-b hover-elevate"
        >
          {/* Drag handle */}
          <td className="p-2 w-8">
            <div className="cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </td>

          {/* Editable fields */}
          {editableFields.map((field) => {
            const isEditing = editingCell?.id === worksheet.id && editingCell?.field === field;
            const isSelected = selectedCell?.id === worksheet.id && selectedCell?.field === field;
            const value = worksheet[field as keyof Worksheet] as string | null;
            
            return (
              <td
                key={field}
                className={`p-2 cursor-pointer ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
                onClick={() => onCellClick(worksheet.id, field)}
                onDoubleClick={() => onCellDoubleClick(worksheet.id, field, value)}
                data-testid={`cell-${field}-${worksheet.id}`}
                style={{ 
                  width: `${columnWidths[field]}px`,
                  minWidth: `${columnWidths[field]}px`,
                  maxWidth: `${columnWidths[field]}px`,
                }}
              >
                {isEditing ? (
                  <Input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleSave(field)}
                    onKeyDown={(e) => handleKeyDown(e, field)}
                    className="text-data h-auto py-0.5 px-2 border-0 focus-visible:ring-0 bg-background"
                    data-testid={`input-edit-${field}`}
                  />
                ) : (
                  <span className="text-data block truncate">
                    {value || ''}
                  </span>
                )}
              </td>
            );
          })}

          {/* Action buttons */}
          <td className="p-2 w-24">
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewItems(worksheet);
                }}
                className="h-7 w-7"
                data-testid={`button-view-items-${worksheet.id}`}
                title="View worksheet items"
              >
                <FileText className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(worksheet.id);
                }}
                className="h-7 w-7"
                data-testid={`button-delete-worksheet-${worksheet.id}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </td>
        </tr>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => onDelete(worksheet.id)}
          className="text-destructive"
          data-testid={`menu-delete-${worksheet.id}`}
        >
          Delete Worksheet
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function WorksheetsDialog({
  open,
  onOpenChange,
  projectId,
}: WorksheetsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCell, setSelectedCell] = useState<{ id: string; field: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [showNewRow, setShowNewRow] = useState(false);
  const [sortColumn, setSortColumn] = useState<keyof Worksheet | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [newRowData, setNewRowData] = useState({ 
    wkshtCode: '', 
    description: '', 
    unit: ''
  });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    wkshtCode: 150,
    description: 350,
    unit: 100,
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const columnResizeRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null);
  const saveTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const parentRef = useRef<HTMLDivElement>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState<Worksheet | null>(null);

  // Cleanup pending save timers on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimerRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Load saved column widths from localStorage when dialog opens
  useEffect(() => {
    if (open && user?.id) {
      const storageKey = `worksheets_columns_${user.id}`;
      const saved = localStorage.getItem(storageKey);
      
      if (saved) {
        try {
          const savedWidths = JSON.parse(saved);
          setColumnWidths(savedWidths);
        } catch (error) {
          console.warn('Failed to load saved column widths:', error);
        }
      }
    }
  }, [open, user?.id]);

  // Save column widths to localStorage
  const saveColumnWidths = (widths: Record<string, number>) => {
    if (user?.id) {
      const storageKey = `worksheets_columns_${user.id}`;
      localStorage.setItem(storageKey, JSON.stringify(widths));
    }
  };

  // Fetch worksheets
  const { data: fetchedWorksheets = [], isLoading } = useQuery<Worksheet[]>({
    queryKey: ['/api/projects', projectId, 'worksheets'],
    enabled: open && !!projectId,
  });

  // Apply client-side sorting - default to sortingIndex if no column sort selected
  const worksheets = useMemo(() => {
    let sorted = [...fetchedWorksheets];
    
    if (!sortColumn) {
      // Default sort by sortingIndex
      return sorted.sort((a, b) => a.sortingIndex - b.sortingIndex);
    }

    return sorted.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [fetchedWorksheets, sortColumn, sortDirection]);

  // Setup row virtualization for performance with large lists
  const rowVirtualizer = useVirtualizer({
    count: worksheets?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
    getItemKey: (index) => worksheets?.[index]?.id ?? String(index),
  });

  // WebSocket subscription for real-time updates
  const { isConnected } = useWorksheetsWebSocket(open ? projectId : null);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Worksheet>) => {
      return await apiRequest(
        'POST',
        `/api/projects/${projectId}/worksheets`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets'],
      });
      setShowNewRow(false);
      setNewRowData({ wkshtCode: '', description: '', unit: '' });
      setEditingCell(null);
      setSortColumn(null);
      setSortDirection('asc');
      toast({
        title: 'Worksheet created',
        description: 'Worksheet has been added successfully.',
      });
    },
    onError: (error: any) => {
      const errorMessage = error.message?.includes('already exists') 
        ? 'Code already exists for this project. Please use a unique code.'
        : error.message || 'Failed to create worksheet.';
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Update mutation (with showToast option for debounced saves)
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates, showToast = false }: { id: string; updates: Partial<Worksheet>; showToast?: boolean }) => {
      const response = await apiRequest(
        'PATCH',
        `/api/projects/${projectId}/worksheets/${id}`,
        updates
      );
      return { data: await response.json() as Worksheet, showToast };
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['/api/projects', projectId, 'worksheets'],
      });

      // Snapshot the previous value
      const previousWorksheets = queryClient.getQueryData<Worksheet[]>([
        '/api/projects',
        projectId,
        'worksheets',
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<Worksheet[]>(
        ['/api/projects', projectId, 'worksheets'],
        (old) => {
          if (!old) return old;
          return old.map((worksheet) =>
            worksheet.id === id ? { ...worksheet, ...updates } : worksheet
          );
        }
      );

      return { previousWorksheets };
    },
    onSuccess: ({ data, showToast }) => {
      // Update cache with server response to ensure consistency
      queryClient.setQueryData<Worksheet[]>(
        ['/api/projects', projectId, 'worksheets'],
        (old) => {
          if (!old) return old;
          return old.map((worksheet) =>
            worksheet.id === data.id ? data : worksheet
          );
        }
      );
      
      setEditingCell(null);
      
      if (showToast) {
        toast({
          title: 'Worksheet updated',
          description: 'Changes saved successfully.',
        });
      }
    },
    onError: (error: any, variables, context) => {
      // Rollback on error
      if (context?.previousWorksheets) {
        queryClient.setQueryData(
          ['/api/projects', projectId, 'worksheets'],
          context.previousWorksheets
        );
      }
      
      const errorMessage = error.message?.includes('already exists') 
        ? 'Code already exists for this project. Please use a unique code.'
        : error.message || 'Failed to update worksheet.';
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets'],
      });
    },
  });

  // Reorder mutation (for drag-and-drop)
  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      return await apiRequest(
        'POST',
        `/api/projects/${projectId}/worksheets/reorder`,
        { orderedIds }
      );
    },
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({
        queryKey: ['/api/projects', projectId, 'worksheets'],
      });

      const previousWorksheets = queryClient.getQueryData<Worksheet[]>([
        '/api/projects',
        projectId,
        'worksheets',
      ]);

      // Optimistically update
      queryClient.setQueryData<Worksheet[]>(
        ['/api/projects', projectId, 'worksheets'],
        (old) => {
          if (!old) return old;
          const ordered = orderedIds
            .map(id => old.find(w => w.id === id))
            .filter((w): w is Worksheet => w !== undefined)
            .map((w, index) => ({ ...w, sortingIndex: index }));
          return ordered;
        }
      );

      return { previousWorksheets };
    },
    onError: (error: any, variables, context) => {
      if (context?.previousWorksheets) {
        queryClient.setQueryData(
          ['/api/projects', projectId, 'worksheets'],
          context.previousWorksheets
        );
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to reorder worksheets.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets'],
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(
        'DELETE',
        `/api/projects/${projectId}/worksheets/${id}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets'],
      });
      toast({
        title: 'Worksheet deleted',
        description: 'Worksheet has been removed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete worksheet.',
        variant: 'destructive',
      });
    },
  });

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = worksheets.findIndex((w) => w.id === active.id);
      const newIndex = worksheets.findIndex((w) => w.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(worksheets, oldIndex, newIndex);
        reorderMutation.mutate(newOrder.map(w => w.id));
      }
    }
  };

  // Cell navigation and editing handlers
  const handleCellClick = (id: string, field: string) => {
    setSelectedCell({ id, field });
    setEditingCell(null);
  };

  const handleCellDoubleClick = (id: string, field: string, currentValue: string | null) => {
    setEditingCell({ id, field });
  };

  const handleFieldChange = (id: string, field: string, value: string) => {
    // Cancel any pending save for this field
    const saveKey = `${id}-${field}`;
    if (saveTimerRef.current[saveKey]) {
      clearTimeout(saveTimerRef.current[saveKey]);
    }

    // Debounce save
    saveTimerRef.current[saveKey] = setTimeout(() => {
      updateMutation.mutate({
        id,
        updates: { [field]: value || null },
        showToast: false,
      });
      delete saveTimerRef.current[saveKey];
    }, 500);

    setEditingCell(null);
  };

  // Column header click for sorting
  const handleColumnHeaderClick = (column: keyof Worksheet) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Column resize handlers
  const handleColumnMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    columnResizeRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column],
    };
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!columnResizeRef.current) return;

      const delta = e.clientX - columnResizeRef.current.startX;
      const newWidth = Math.max(50, columnResizeRef.current.startWidth + delta);

      setColumnWidths(prev => ({
        ...prev,
        [columnResizeRef.current!.column]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      columnResizeRef.current = null;
      saveColumnWidths(columnWidths);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, columnWidths]);

  // Keyboard navigation
  const handleTableKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!selectedCell || editingCell) return;

    const currentIndex = worksheets.findIndex(w => w.id === selectedCell.id);
    const fields = ['wkshtCode', 'description', 'unit'];
    const currentFieldIndex = fields.indexOf(selectedCell.field);

    if (currentIndex === -1 || currentFieldIndex === -1) return;

    let newId: string | null = null;
    let newField: string | null = null;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex > 0) {
          newId = worksheets[currentIndex - 1].id;
          newField = selectedCell.field;
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < worksheets.length - 1) {
          newId = worksheets[currentIndex + 1].id;
          newField = selectedCell.field;
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (currentFieldIndex > 0) {
          newId = selectedCell.id;
          newField = fields[currentFieldIndex - 1];
        }
        break;
      case 'ArrowRight':
      case 'Tab':
        e.preventDefault();
        if (currentFieldIndex < fields.length - 1) {
          newId = selectedCell.id;
          newField = fields[currentFieldIndex + 1];
        }
        break;
      case 'Enter':
        e.preventDefault();
        const currentValue = worksheets[currentIndex][selectedCell.field as keyof Worksheet] as string | null;
        handleCellDoubleClick(selectedCell.id, selectedCell.field, currentValue);
        break;
    }

    if (newId && newField) {
      setSelectedCell({ id: newId, field: newField });
    }
  };

  // Handle new row
  const handleAddNewRow = () => {
    if (!newRowData.wkshtCode.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Code is required.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      wkshtCode: newRowData.wkshtCode,
      description: newRowData.description || null,
      unit: newRowData.unit || null,
    });
  };

  const handleNewRowKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isLast = false) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddNewRow();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowNewRow(false);
      setNewRowData({ wkshtCode: '', description: '', unit: '' });
    }
  };

  if (!open) return null;

  const isDragEnabled = sortColumn === null;
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-h4">Project Worksheets</DialogTitle>
                {isConnected && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span>Live</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImportDialog(true)}
                  data-testid="button-import-worksheets"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Import
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewRow(true)}
                  disabled={showNewRow}
                  data-testid="button-add-worksheet"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Worksheet
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Table Container with ScrollArea */}
          <ScrollArea className="flex-1">
            <div 
              ref={parentRef}
              className="relative"
              onKeyDown={handleTableKeyDown}
              tabIndex={0}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-muted z-10">
                    <tr>
                      <th className="text-data font-medium text-left p-2 border-b w-8">
                        <span className="sr-only">Drag</span>
                      </th>
                      <th
                        className="text-data font-medium text-left p-2 border-b cursor-pointer hover-elevate relative select-none"
                        style={{ width: `${columnWidths.wkshtCode}px`, minWidth: `${columnWidths.wkshtCode}px` }}
                        onClick={() => handleColumnHeaderClick('wkshtCode')}
                        data-testid="header-wkshtCode"
                      >
                        <div className="flex items-center justify-between">
                          <span>Code</span>
                          {sortColumn === 'wkshtCode' && (
                            <span className="text-xs ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                          onMouseDown={(e) => handleColumnMouseDown(e, 'wkshtCode')}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </th>
                      <th
                        className="text-data font-medium text-left p-2 border-b cursor-pointer hover-elevate relative select-none"
                        style={{ width: `${columnWidths.description}px`, minWidth: `${columnWidths.description}px` }}
                        onClick={() => handleColumnHeaderClick('description')}
                        data-testid="header-description"
                      >
                        <div className="flex items-center justify-between">
                          <span>Description</span>
                          {sortColumn === 'description' && (
                            <span className="text-xs ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                          onMouseDown={(e) => handleColumnMouseDown(e, 'description')}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </th>
                      <th
                        className="text-data font-medium text-left p-2 border-b cursor-pointer hover-elevate select-none"
                        style={{ width: `${columnWidths.unit}px`, minWidth: `${columnWidths.unit}px` }}
                        onClick={() => handleColumnHeaderClick('unit')}
                        data-testid="header-unit"
                      >
                        <div className="flex items-center justify-between">
                          <span>Unit</span>
                          {sortColumn === 'unit' && (
                            <span className="text-xs ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th className="text-data font-medium text-left p-2 border-b w-24">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      position: 'relative',
                    }}
                  >
                    {/* New row */}
                    {showNewRow && (
                      <tr className="border-b bg-accent/20" data-testid="row-new-worksheet">
                        <td className="p-2 w-8"></td>
                        <td className="p-2">
                          <Input
                            autoFocus
                            value={newRowData.wkshtCode}
                            onChange={(e) => setNewRowData({ ...newRowData, wkshtCode: e.target.value })}
                            onKeyDown={(e) => handleNewRowKeyDown(e)}
                            className="text-data"
                            data-testid="input-new-wkshtCode"
                            placeholder="Code"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={newRowData.description}
                            onChange={(e) => setNewRowData({ ...newRowData, description: e.target.value })}
                            onKeyDown={(e) => handleNewRowKeyDown(e)}
                            className="text-data"
                            data-testid="input-new-description"
                            placeholder="Description"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={newRowData.unit}
                            onChange={(e) => setNewRowData({ ...newRowData, unit: e.target.value })}
                            onKeyDown={(e) => handleNewRowKeyDown(e, true)}
                            className="text-data"
                            data-testid="input-new-unit"
                            placeholder="Unit"
                          />
                        </td>
                        <td className="p-2 w-24">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleAddNewRow}
                              disabled={createMutation.isPending}
                              data-testid="button-save-new-worksheet"
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setShowNewRow(false);
                                setNewRowData({ wkshtCode: '', description: '', unit: '' });
                              }}
                              data-testid="button-cancel-new-worksheet"
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Virtualized rows */}
                    {isDragEnabled ? (
                      <SortableContext
                        items={worksheets.map(w => w.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {virtualItems.map((virtualRow) => {
                          const worksheet = worksheets[virtualRow.index];
                          return (
                            <SortableRow
                              key={worksheet.id}
                              worksheet={worksheet}
                              editingCell={editingCell}
                              selectedCell={selectedCell}
                              onCellClick={handleCellClick}
                              onCellDoubleClick={handleCellDoubleClick}
                              onFieldChange={handleFieldChange}
                              onViewItems={setSelectedWorksheet}
                              onDelete={deleteMutation.mutate}
                              virtualRow={virtualRow}
                              measureElement={rowVirtualizer.measureElement}
                              columnWidths={columnWidths}
                            />
                          );
                        })}
                      </SortableContext>
                    ) : (
                      virtualItems.map((virtualRow) => {
                        const worksheet = worksheets[virtualRow.index];
                        return (
                          <SortableRow
                            key={worksheet.id}
                            worksheet={worksheet}
                            editingCell={editingCell}
                            selectedCell={selectedCell}
                            onCellClick={handleCellClick}
                            onCellDoubleClick={handleCellDoubleClick}
                            onFieldChange={handleFieldChange}
                            onViewItems={setSelectedWorksheet}
                            onDelete={deleteMutation.mutate}
                            virtualRow={virtualRow}
                            measureElement={rowVirtualizer.measureElement}
                            columnWidths={columnWidths}
                          />
                        );
                      })
                    )}
                  </tbody>
                </table>
              </DndContext>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <WorksheetsImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        projectId={projectId}
        onSuccess={() => {
          setShowImportDialog(false);
          toast({
            title: "Import successful",
            description: "Worksheets have been imported successfully",
          });
        }}
      />

      {/* Worksheet Items Dialog */}
      {selectedWorksheet && (
        <WorksheetItemsDialog
          open={!!selectedWorksheet}
          onOpenChange={(open) => !open && setSelectedWorksheet(null)}
          projectId={projectId}
          worksheetId={selectedWorksheet.id}
          worksheetCode={selectedWorksheet.wkshtCode}
          worksheetDescription={selectedWorksheet.description || ''}
        />
      )}
    </>
  );
}
