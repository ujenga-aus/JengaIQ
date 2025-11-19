import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Plus, Trash2, GripHorizontal, GripVertical, Move } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface WorksheetItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  worksheetId: string;
  worksheetCode: string;
  worksheetDescription: string;
}

interface WorksheetItem {
  id: string;
  worksheetId: string;
  lq: string | null;
  description: string | null;
  formula: string | null;
  resourceRateId: string | null;
  result: string | null; // Computed from formula (alpha chars stripped)
  total: string | null; // Computed as tenderRate * result
  createdAt: string;
  updatedAt: string;
}

interface ResourceRate {
  id: string;
  code: string;
  description: string | null;
  unit: string | null;
  tenderRate: string | null;
}

const DEFAULT_COLUMN_WIDTHS = {
  lq: 80,
  description: 300,
  formula: 150,
  resource: 250,
  unit: 100,
  result: 100,
  tenderRate: 120,
  total: 120,
  actions: 80,
};

// ResizableTableHead component for column resizing
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

export default function WorksheetItemsDialog({
  open,
  onOpenChange,
  projectId,
  worksheetId,
  worksheetCode,
  worksheetDescription,
}: WorksheetItemsDialogProps) {
  const { toast } = useToast();
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState<{
    description: string;
    formula: string;
    resourceRateId: string | null;
  }>({
    description: '',
    formula: '',
    resourceRateId: null,
  });
  const [resourceSearchOpen, setResourceSearchOpen] = useState<string | null>(null);
  const saveTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const columnWidthSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dialog position and size state
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [dialogSize, setDialogSize] = useState({ width: 1400, height: 800 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);
  const resizeStartRef = useRef<{ width: number; height: number; mouseX: number; mouseY: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Load dialog position and size from localStorage
  useEffect(() => {
    const savedPrefs = localStorage.getItem('worksheet-items-dialog-prefs');
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.position) setDialogPosition(prefs.position);
        if (prefs.size) setDialogSize(prefs.size);
      } catch (e) {
        console.error('Failed to parse dialog preferences:', e);
      }
    }
  }, []);

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const contentEl = dialogRef.current;
    if (!contentEl) return;

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: dialogPosition.x,
      posY: dialogPosition.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current || !contentEl) return;
      
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - dragStartRef.current.mouseY;
      
      const newX = dragStartRef.current.posX + deltaX;
      const newY = dragStartRef.current.posY + deltaY;
      
      // Apply directly to DOM
      requestAnimationFrame(() => {
        contentEl.style.left = `calc(50% + ${newX}px)`;
        contentEl.style.top = `calc(50% + ${newY}px)`;
      });
    };

    const handleMouseUp = () => {
      if (!dragStartRef.current) return;

      const deltaX = dragStartRef.current.posX - dialogPosition.x;
      const deltaY = dragStartRef.current.posY - dialogPosition.y;
      
      // Get final position from computed style
      const computedLeft = contentEl.style.left;
      const computedTop = contentEl.style.top;
      
      // Extract position values (calc(50% + Xpx))
      const xMatch = computedLeft.match(/calc\(50%\s*\+\s*(-?\d+(?:\.\d+)?)px\)/);
      const yMatch = computedTop.match(/calc\(50%\s*\+\s*(-?\d+(?:\.\d+)?)px\)/);
      
      const finalX = xMatch ? parseFloat(xMatch[1]) : dialogPosition.x;
      const finalY = yMatch ? parseFloat(yMatch[1]) : dialogPosition.y;
      
      // Update state with final position
      setDialogPosition({ x: finalX, y: finalY });
      
      // Save to localStorage
      const savedPrefs = JSON.parse(localStorage.getItem('worksheet-items-dialog-prefs') || '{}');
      localStorage.setItem('worksheet-items-dialog-prefs', JSON.stringify({
        ...savedPrefs,
        position: { x: finalX, y: finalY },
      }));

      setIsDragging(false);
      dragStartRef.current = null;
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle resize start - generic handler that supports width, height, or both
  const handleResizeStart = (e: React.MouseEvent, mode: 'both' | 'width' | 'height') => {
    e.preventDefault();
    e.stopPropagation();
    const contentEl = dialogRef.current;
    if (!contentEl) return;

    setIsResizing(true);
    resizeStartRef.current = {
      width: dialogSize.width,
      height: dialogSize.height,
      mouseX: e.clientX,
      mouseY: e.clientY,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeStartRef.current || !contentEl) return;
      
      const deltaX = moveEvent.clientX - resizeStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - resizeStartRef.current.mouseY;
      
      let newWidth = resizeStartRef.current.width;
      let newHeight = resizeStartRef.current.height;
      
      // Update width if mode allows it
      if (mode === 'both' || mode === 'width') {
        newWidth = Math.max(800, resizeStartRef.current.width + deltaX);
      }
      
      // Update height if mode allows it
      if (mode === 'both' || mode === 'height') {
        newHeight = Math.max(500, resizeStartRef.current.height + deltaY);
      }
      
      // Apply directly to DOM
      requestAnimationFrame(() => {
        contentEl.style.width = `${newWidth}px`;
        contentEl.style.height = `${newHeight}px`;
        contentEl.style.maxWidth = `${newWidth}px`;
      });
    };

    const handleMouseUp = () => {
      if (!resizeStartRef.current || !contentEl) return;

      // Get final size from computed style
      const finalWidth = parseInt(contentEl.style.width) || dialogSize.width;
      const finalHeight = parseInt(contentEl.style.height) || dialogSize.height;
      
      // Update state with final size
      setDialogSize({ width: finalWidth, height: finalHeight });
      
      // Save to localStorage
      const savedPrefs = JSON.parse(localStorage.getItem('worksheet-items-dialog-prefs') || '{}');
      localStorage.setItem('worksheet-items-dialog-prefs', JSON.stringify({
        ...savedPrefs,
        size: { width: finalWidth, height: finalHeight },
      }));

      setIsResizing(false);
      resizeStartRef.current = null;
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimerRef.current).forEach(timer => clearTimeout(timer));
      saveTimerRef.current = {};
      if (columnWidthSaveTimerRef.current) {
        clearTimeout(columnWidthSaveTimerRef.current);
      }
    };
  }, []);

  // Fetch user column preferences from API
  const { data: columnPreferences } = useQuery<{ columnWidths?: Record<string, number> }>({
    queryKey: ['/api/user-worksheet-column-preferences'],
  });

  // Column widths state with API persistence
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);

  // Load column preferences when fetched
  useEffect(() => {
    if (columnPreferences?.columnWidths) {
      setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...columnPreferences.columnWidths });
    }
  }, [columnPreferences]);

  // Save column preferences mutation
  const saveColumnPreferencesMutation = useMutation({
    mutationFn: async (columnWidths: Record<string, number>) => {
      return await apiRequest('PUT', '/api/user-worksheet-column-preferences', { columnWidths });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/user-worksheet-column-preferences'],
      });
    },
  });

  const saveColumnWidth = (columnId: string, width: number) => {
    const newWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(newWidths);
    
    // Debounce the API call - wait 500ms after last resize before saving
    if (columnWidthSaveTimerRef.current) {
      clearTimeout(columnWidthSaveTimerRef.current);
    }
    
    columnWidthSaveTimerRef.current = setTimeout(() => {
      saveColumnPreferencesMutation.mutate(newWidths);
      columnWidthSaveTimerRef.current = null;
    }, 500);
  };

  // Fetch worksheet items
  const { data: items = [], isLoading: itemsLoading } = useQuery<WorksheetItem[]>({
    queryKey: ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
    enabled: open && !!projectId && !!worksheetId,
  });

  // Fetch resource rates for the project
  const { data: resourceRates = [] } = useQuery<ResourceRate[]>({
    queryKey: ['/api/projects', projectId, 'resource-rates'],
    enabled: open && !!projectId,
  });

  // Create a map for quick resource lookups
  const resourceMap = useMemo(() => {
    const map = new Map<string, ResourceRate>();
    resourceRates.forEach(r => map.set(r.id, r));
    return map;
  }, [resourceRates]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<WorksheetItem>) => {
      return await apiRequest(
        'POST',
        `/api/projects/${projectId}/worksheets/${worksheetId}/items`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
      });
      setShowNewRow(false);
      setNewRowData({
        description: '',
        formula: '',
        resourceRateId: null,
      });
      toast({
        title: 'Item created',
        description: 'Worksheet item has been added successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create item.',
        variant: 'destructive',
      });
    },
  });

  // Update mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: async (updatedItem: WorksheetItem) => {
      const response = await apiRequest(
        'PATCH',
        `/api/projects/${projectId}/worksheets/${worksheetId}/items/${updatedItem.id}`,
        {
          description: updatedItem.description,
          formula: updatedItem.formula,
          resourceRateId: updatedItem.resourceRateId,
        }
      );
      return await response.json() as WorksheetItem;
    },
    onMutate: async (updatedItem) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
      });

      // Snapshot the previous value
      const previousItems = queryClient.getQueryData<WorksheetItem[]>([
        '/api/projects',
        projectId,
        'worksheets',
        worksheetId,
        'items',
      ]);

      // Optimistically update
      queryClient.setQueryData<WorksheetItem[]>(
        ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
        (old) => {
          if (!old) return old;
          return old.map((item) => (item.id === updatedItem.id ? updatedItem : item));
        }
      );

      // Return context with the snapshot
      return { previousItems };
    },
    onError: (err, updatedItem, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData(
          ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
          context.previousItems
        );
      }
      toast({
        title: 'Error',
        description: 'Failed to update worksheet item.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Refetch after save or error to sync with server
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/projects/${projectId}/worksheets/${worksheetId}/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
      });
      toast({
        title: 'Item deleted',
        description: 'Worksheet item has been removed.',
      });
    },
  });

  // Debounced field update handler (300ms like BOQ)
  const handleFieldChange = (item: WorksheetItem, field: keyof WorksheetItem, value: any) => {
    const editKey = `${item.id}-${String(field)}`;

    // Immediately update local edit state for instant UI feedback
    setEditValues(prev => ({ ...prev, [editKey]: value }));

    // Clear existing timer for this item (ONE timer per item, not per field)
    if (saveTimerRef.current[item.id]) {
      clearTimeout(saveTimerRef.current[item.id]);
    }

    // Debounce the server save (300ms)
    // When the timer fires, it will save ALL pending edits for this item
    saveTimerRef.current[item.id] = setTimeout(() => {
      // Collect all pending edits for this item at save time
      setEditValues(currentEditValues => {
        // Build updated item with all pending changes
        const pendingEdits: Record<string, any> = {};
        Object.keys(currentEditValues).forEach(key => {
          if (key.startsWith(`${item.id}-`)) {
            const fieldName = key.substring(`${item.id}-`.length);
            pendingEdits[fieldName] = currentEditValues[key];
          }
        });

        // Get latest item from cache
        const currentItems = queryClient.getQueryData<WorksheetItem[]>([
          '/api/projects',
          projectId,
          'worksheets',
          worksheetId,
          'items',
        ]);
        const latestItem = currentItems?.find(i => i.id === item.id) || item;

        // Merge all pending edits
        const updatedItem = { ...latestItem, ...pendingEdits };
        updateMutation.mutate(updatedItem);

        // Clear all edit values for this item
        const next = { ...currentEditValues };
        Object.keys(next).forEach(key => {
          if (key.startsWith(`${item.id}-`)) {
            delete next[key];
          }
        });
        return next;
      });

      delete saveTimerRef.current[item.id];
    }, 300);
  };

  const handleCellClick = (id: string, field: string) => {
    // Don't allow editing unit, tenderRate, result, total, or LQ (computed fields)
    if (field === 'unit' || field === 'tenderRate' || field === 'result' || field === 'total' || field === 'lq') return;
    setEditingCell({ id, field });
  };

  const handleNewRowSave = () => {
    if (!newRowData.description?.trim()) {
      toast({
        title: 'Validation error',
        description: 'Description is required',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      ...newRowData,
      description: newRowData.description || null,
      formula: newRowData.formula || null,
      resourceRateId: newRowData.resourceRateId || null,
    });
  };

  const handleResourceSelect = (itemId: string | null, resourceId: string) => {
    if (itemId === null) {
      // New row
      setNewRowData({ ...newRowData, resourceRateId: resourceId });
    } else {
      // Existing row - find the item and update it
      const item = items.find(i => i.id === itemId);
      if (item) {
        handleFieldChange(item, 'resourceRateId', resourceId);
      }
    }
    setResourceSearchOpen(null);
  };

  const ResourceLookupCell = ({ itemId, currentResourceId }: { itemId: string | null; currentResourceId: string | null }) => {
    const currentResource = currentResourceId ? resourceMap.get(currentResourceId) : null;
    const cellKey = itemId || 'new';
    const isOpen = resourceSearchOpen === cellKey;

    return (
      <Popover open={isOpen} onOpenChange={(open) => setResourceSearchOpen(open ? cellKey : null)}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start font-normal h-auto px-2 hover-elevate text-data"
            style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
            data-testid={`button-resource-lookup-${itemId || 'new'}`}
          >
            {currentResource ? (
              <span className="truncate">{currentResource.description || currentResource.code}</span>
            ) : (
              <span className="text-muted-foreground">Select resource...</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <Command>
            <CommandInput placeholder="Type to search resources..." data-testid="input-resource-search" />
            <CommandList>
              <CommandEmpty>No resources found.</CommandEmpty>
              <CommandGroup>
                {resourceRates.map((resource) => (
                  <CommandItem
                    key={resource.id}
                    value={`${resource.code} ${resource.description || ''}`}
                    onSelect={() => handleResourceSelect(itemId, resource.id)}
                    data-testid={`item-resource-${resource.code}`}
                  >
                    <div className="flex flex-col">
                      <div className="font-medium">{resource.code}</div>
                      {resource.description && (
                        <div className="text-sm text-muted-foreground">{resource.description}</div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  // Apply position/size using refs after dialog mounts
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    
    const contentEl = dialogRef.current;
    contentEl.style.width = `${dialogSize.width}px`;
    contentEl.style.height = `${dialogSize.height}px`;
    contentEl.style.maxWidth = `${dialogSize.width}px`;
    
    // Position from center
    if (dialogPosition.x !== 0 || dialogPosition.y !== 0) {
      contentEl.style.left = `calc(50% + ${dialogPosition.x}px)`;
      contentEl.style.top = `calc(50% + ${dialogPosition.y}px)`;
    }
  }, [open, dialogSize, dialogPosition]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        className="flex flex-col p-0 gap-0"
        data-testid="worksheet-items-dialog"
      >
        <div className="flex flex-col h-full">
          {/* Drag Handle Header */}
          <div 
            className="drag-handle flex items-center justify-between px-6 py-4 border-b cursor-move bg-muted/30"
            onMouseDown={handleDragStart}
            data-testid="drag-handle"
          >
            <div className="flex items-center gap-2">
              <Move className="h-4 w-4 text-muted-foreground" />
              <DialogTitle className="text-data-lg">
                Worksheet Items - {worksheetCode}
                {worksheetDescription && ` (${worksheetDescription})`}
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-header"
            >
              <Plus className="h-4 w-4 rotate-45" />
            </Button>
          </div>

        <div className="flex-1 overflow-auto mx-6 my-4 border rounded-md">
          <Table className="table-fixed border-separate border-spacing-0">
            <colgroup>
              <col style={{ width: `${columnWidths.lq}px`, minWidth: '60px' }} />
              <col style={{ width: `${columnWidths.description}px`, minWidth: '150px' }} />
              <col style={{ width: `${columnWidths.formula}px`, minWidth: '100px' }} />
              <col style={{ width: `${columnWidths.resource}px`, minWidth: '150px' }} />
              <col style={{ width: `${columnWidths.unit}px`, minWidth: '60px' }} />
              <col style={{ width: `${columnWidths.result}px`, minWidth: '80px' }} />
              <col style={{ width: `${columnWidths.tenderRate}px`, minWidth: '100px' }} />
              <col style={{ width: `${columnWidths.total}px`, minWidth: '100px' }} />
              <col style={{ width: `${columnWidths.actions}px`, minWidth: '60px' }} />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <ResizableTableHead
                  columnId="lq"
                  currentWidth={columnWidths.lq}
                  minWidth={60}
                  onResize={saveColumnWidth}
                  className="text-left"
                >
                  LQ
                </ResizableTableHead>
                <ResizableTableHead
                  columnId="description"
                  currentWidth={columnWidths.description}
                  minWidth={150}
                  onResize={saveColumnWidth}
                  className="text-left"
                >
                  Description
                </ResizableTableHead>
                <ResizableTableHead
                  columnId="formula"
                  currentWidth={columnWidths.formula}
                  minWidth={100}
                  onResize={saveColumnWidth}
                  className="text-left"
                >
                  Formula
                </ResizableTableHead>
                <ResizableTableHead
                  columnId="resource"
                  currentWidth={columnWidths.resource}
                  minWidth={150}
                  onResize={saveColumnWidth}
                  className="text-left"
                >
                  Resource
                </ResizableTableHead>
                <ResizableTableHead
                  columnId="unit"
                  currentWidth={columnWidths.unit}
                  minWidth={60}
                  onResize={saveColumnWidth}
                  className="text-left"
                >
                  Unit
                </ResizableTableHead>
                <ResizableTableHead
                  columnId="result"
                  currentWidth={columnWidths.result}
                  minWidth={80}
                  onResize={saveColumnWidth}
                  className="text-right"
                >
                  Result
                </ResizableTableHead>
                <ResizableTableHead
                  columnId="tenderRate"
                  currentWidth={columnWidths.tenderRate}
                  minWidth={100}
                  onResize={saveColumnWidth}
                  className="text-right"
                >
                  Tender Rate
                </ResizableTableHead>
                <ResizableTableHead
                  columnId="total"
                  currentWidth={columnWidths.total}
                  minWidth={100}
                  onResize={saveColumnWidth}
                  className="text-right"
                >
                  Total
                </ResizableTableHead>
                <TableHead className="text-left">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const resource = item.resourceRateId ? resourceMap.get(item.resourceRateId) : null;
                const lineNumber = index + 1; // Auto-number starting from 1
                
                return (
                  <TableRow key={item.id} className="hover:bg-muted/50" data-testid={`row-item-${item.id}`}>
                    <TableCell
                      className="text-data text-muted-foreground bg-muted/30"
                      style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                      data-testid={`cell-lq-${item.id}`}
                    >
                      {lineNumber}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer p-0"
                      onClick={() => handleCellClick(item.id, 'description')}
                      data-testid={`cell-description-${item.id}`}
                    >
                      {editingCell?.id === item.id && editingCell?.field === 'description' ? (
                        <Input
                          value={editValues[`${item.id}-description`] ?? item.description ?? ''}
                          onChange={(e) => handleFieldChange(item, 'description', e.target.value || null)}
                          onBlur={() => setEditingCell(null)}
                          autoFocus
                          className="border-0 focus-visible:ring-1 h-auto py-0 text-data"
                          style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                          data-testid={`input-description-${item.id}`}
                        />
                      ) : (
                        <div 
                          className="text-data px-4" 
                          style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                        >
                          {editValues[`${item.id}-description`] ?? item.description ?? '-'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer p-0"
                      onClick={() => handleCellClick(item.id, 'formula')}
                      data-testid={`cell-formula-${item.id}`}
                    >
                      {editingCell?.id === item.id && editingCell?.field === 'formula' ? (
                        <Input
                          value={editValues[`${item.id}-formula`] ?? item.formula ?? ''}
                          onChange={(e) => handleFieldChange(item, 'formula', e.target.value || null)}
                          onBlur={() => setEditingCell(null)}
                          autoFocus
                          className="border-0 focus-visible:ring-1 h-auto py-0 text-data font-mono"
                          style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                          data-testid={`input-formula-${item.id}`}
                        />
                      ) : (
                        <div 
                          className="text-data font-mono px-4" 
                          style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                        >
                          {editValues[`${item.id}-formula`] ?? item.formula ?? '-'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="p-0" data-testid={`cell-resource-${item.id}`}>
                      <ResourceLookupCell itemId={item.id} currentResourceId={item.resourceRateId} />
                    </TableCell>
                    <TableCell 
                      className="text-muted-foreground text-data px-4" 
                      style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                      data-testid={`cell-unit-${item.id}`}
                    >
                      {resource?.unit || '-'}
                    </TableCell>
                    <TableCell 
                      className="text-muted-foreground text-data text-right px-4" 
                      style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                      data-testid={`cell-result-${item.id}`}
                    >
                      {item.result || '-'}
                    </TableCell>
                    <TableCell 
                      className="text-muted-foreground text-data text-right px-4" 
                      style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                      data-testid={`cell-tender-rate-${item.id}`}
                    >
                      {resource?.tenderRate || '-'}
                    </TableCell>
                    <TableCell 
                      className="text-muted-foreground text-data text-right px-4 font-medium" 
                      style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                      data-testid={`cell-total-${item.id}`}
                    >
                      {item.total || '-'}
                    </TableCell>
                    <TableCell 
                      className="px-2" 
                      style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(item.id)}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {showNewRow && (
                <TableRow className="bg-muted/50" data-testid="row-new-item">
                  <TableCell 
                    className="text-data text-muted-foreground bg-muted/30 px-4" 
                    style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                  >
                    {items.length + 1}
                  </TableCell>
                  <TableCell className="p-0">
                    <Input
                      value={newRowData.description}
                      onChange={(e) => setNewRowData({ ...newRowData, description: e.target.value })}
                      placeholder="Description *"
                      className="border-0 focus-visible:ring-1 h-auto py-0 text-data"
                      style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                      data-testid="input-new-description"
                      autoFocus
                    />
                  </TableCell>
                  <TableCell className="p-0">
                    <Input
                      value={newRowData.formula}
                      onChange={(e) => setNewRowData({ ...newRowData, formula: e.target.value })}
                      placeholder="Formula"
                      className="border-0 focus-visible:ring-1 h-auto py-0 text-data font-mono"
                      style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                      data-testid="input-new-formula"
                    />
                  </TableCell>
                  <TableCell className="p-0">
                    <ResourceLookupCell itemId={null} currentResourceId={newRowData.resourceRateId} />
                  </TableCell>
                  <TableCell 
                    className="text-muted-foreground text-data px-4" 
                    style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                  >
                    {newRowData.resourceRateId && resourceMap.get(newRowData.resourceRateId)?.unit || '-'}
                  </TableCell>
                  <TableCell 
                    className="text-muted-foreground text-data text-right px-4 italic" 
                    style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                    data-testid="cell-new-result"
                  >
                    auto
                  </TableCell>
                  <TableCell 
                    className="text-muted-foreground text-data text-right px-4" 
                    style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                  >
                    {newRowData.resourceRateId && resourceMap.get(newRowData.resourceRateId)?.tenderRate || '-'}
                  </TableCell>
                  <TableCell 
                    className="text-muted-foreground text-data text-right px-4 italic" 
                    style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                    data-testid="cell-new-total"
                  >
                    auto
                  </TableCell>
                  <TableCell 
                    className="px-2" 
                    style={{ paddingTop: 'var(--grid-cell-py)', paddingBottom: 'var(--grid-cell-py)' }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowNewRow(false)}
                      data-testid="button-cancel-new"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {!itemsLoading && items.length === 0 && !showNewRow && (
            <div className="p-8 text-center text-muted-foreground">
              <p>No items yet. Click "Add Item" to get started.</p>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t">
          <div className="flex gap-2">
            {showNewRow ? (
              <Button onClick={handleNewRowSave} disabled={createMutation.isPending} data-testid="button-save-new">
                Save Item
              </Button>
            ) : (
              <Button onClick={() => setShowNewRow(true)} data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close">
            Close
          </Button>
        </div>

        {/* Resize Handles */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-blue-500/20 z-10"
          onMouseDown={(e) => handleResizeStart(e, 'both')}
          data-testid="resize-handle-br"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground absolute bottom-0 right-0" />
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500/20 z-10"
          onMouseDown={(e) => handleResizeStart(e, 'height')}
          data-testid="resize-handle-bottom"
        />
        <div
          className="absolute top-0 bottom-0 right-0 w-1 cursor-ew-resize hover:bg-blue-500/20 z-10"
          onMouseDown={(e) => handleResizeStart(e, 'width')}
          data-testid="resize-handle-right"
        />
        </div>
      </DialogContent>
    </Dialog>
  );
}
