import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Trash2, Upload } from 'lucide-react';
import Draggable from 'react-draggable';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useWorksheetsWebSocket } from '@/hooks/useWorksheetsWebSocket';
import { WorksheetsImportDialog } from './WorksheetsImportDialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface WorksheetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface Worksheet {
  id: string;
  projectId: string;
  wkshtCode: string;
  description: string | null;
  unit: string | null;
  createdAt: string;
  updatedAt: string;
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
  const [editValue, setEditValue] = useState('');
  const [showNewRow, setShowNewRow] = useState(false);
  const [sortColumn, setSortColumn] = useState<keyof Worksheet | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [newRowData, setNewRowData] = useState({ 
    wkshtCode: '', 
    description: '', 
    unit: ''
  });
  const [isResizing, setIsResizing] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    wkshtCode: 150,
    description: 350,
    unit: 100,
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const columnResizeRef = useRef<{ column: string; startX: number; startWidth: number; nextColumn?: string; nextStartWidth?: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const isEscapingGrid = useRef(false);
  const shouldSelectText = useRef(true);
  const isSaving = useRef(false);
  
  const positionRef = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 700, height: 500 });
  const [size, setSize] = useState({ width: 700, height: 500 });
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Load saved position/size/column widths from localStorage when dialog opens
  useEffect(() => {
    if (open && user?.id) {
      const storageKey = `worksheets_${user.id}`;
      const saved = localStorage.getItem(storageKey);
      
      const defaultSize = { width: 700, height: 500 };
      const defaultPosition = {
        x: (window.innerWidth - defaultSize.width) / 2,
        y: (window.innerHeight - defaultSize.height) / 2
      };
      
      if (saved) {
        try {
          const { position: savedPosition, size: savedSize, columnWidths: savedWidths } = JSON.parse(saved);
          if (savedPosition && savedSize) {
            const maxX = window.innerWidth - savedSize.width;
            const maxY = window.innerHeight - savedSize.height;
            const pos = {
              x: Math.max(0, Math.min(savedPosition.x, maxX)),
              y: Math.max(0, Math.min(savedPosition.y, maxY))
            };
            positionRef.current = pos;
            sizeRef.current = savedSize;
            setInitialPosition(pos);
            setSize(savedSize);
            
            if (savedWidths) {
              setColumnWidths(savedWidths);
            }
            return;
          }
        } catch (error) {
          console.warn('Failed to load saved worksheets preferences:', error);
        }
      }
      
      positionRef.current = defaultPosition;
      sizeRef.current = defaultSize;
      setInitialPosition(defaultPosition);
      setSize(defaultSize);
    }
  }, [open, user?.id]);

  // Save position/size to localStorage
  const savePreferences = (newPosition?: { x: number; y: number }, newSize?: { width: number; height: number }, newWidths?: Record<string, number>) => {
    if (user?.id) {
      const storageKey = `worksheets_${user.id}`;
      localStorage.setItem(storageKey, JSON.stringify({
        position: newPosition || positionRef.current,
        size: newSize || sizeRef.current,
        columnWidths: newWidths || columnWidths,
      }));
    }
  };

  // Fetch worksheets
  const { data: fetchedWorksheets = [], isLoading } = useQuery<Worksheet[]>({
    queryKey: ['/api/projects', projectId, 'worksheets'],
    enabled: open && !!projectId,
  });

  // Apply client-side sorting
  const worksheets = useMemo(() => {
    if (!sortColumn) {
      return fetchedWorksheets;
    }

    return [...fetchedWorksheets].sort((a, b) => {
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

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string }) => {
      const response = await apiRequest(
        'PATCH',
        `/api/projects/${projectId}/worksheets/${id}`,
        { [field]: value }
      );
      return await response.json() as Worksheet;
    },
    onSuccess: (updatedWorksheet: Worksheet) => {
      queryClient.setQueryData(
        ['/api/projects', projectId, 'worksheets'],
        (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((worksheet: Worksheet) =>
            worksheet.id === updatedWorksheet.id ? updatedWorksheet : worksheet
          );
        }
      );
      setEditingCell(null);
    },
    onError: (error: any) => {
      const errorMessage = error.message?.includes('already exists') 
        ? 'Code already exists for this project. Please use a unique code.'
        : error.message || 'Failed to update worksheet.';
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      
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

  // Focus on input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (shouldSelectText.current && typeof inputRef.current.select === 'function') {
        inputRef.current.select();
      }
      shouldSelectText.current = true;
    }
  }, [editingCell]);
  
  // Initialize selected cell when dialog opens with data
  useEffect(() => {
    if (open && worksheets.length > 0 && !selectedCell && !editingCell && !showNewRow) {
      setSelectedCell({ id: worksheets[0].id, field: 'wkshtCode' });
    }
  }, [open, worksheets.length, selectedCell, editingCell, showNewRow]);
  
  // Focus the table container after navigation or when selection changes
  useEffect(() => {
    if (showNewRow) return;
    
    if (selectedCell && !editingCell && tableContainerRef.current && !isEscapingGrid.current) {
      setTimeout(() => {
        tableContainerRef.current?.focus();
      }, 0);
    }
    
    if (isEscapingGrid.current) {
      setTimeout(() => {
        isEscapingGrid.current = false;
      }, 100);
    }
  }, [selectedCell, editingCell, showNewRow]);

  const handleCellDoubleClick = (id: string, field: string, currentValue: string | null) => {
    setEditingCell({ id, field });
    setEditValue(currentValue || '');
  };

  // Excel-like keyboard navigation
  const editableFields = ['wkshtCode', 'description', 'unit'];
  
  const navigateCell = (direction: 'up' | 'down' | 'left' | 'right' | 'enter') => {
    if (!selectedCell) return;
    
    const { id, field } = selectedCell;
    const currentRowIndex = worksheets.findIndex(w => w.id === id);
    if (currentRowIndex === -1) return;
    
    const maxRow = worksheets.length - 1;
    const currentFieldIndex = editableFields.indexOf(field);
    
    let newRowIndex = currentRowIndex;
    let newField = field;
    
    switch (direction) {
      case 'up':
        newRowIndex = Math.max(0, currentRowIndex - 1);
        break;
      case 'down':
      case 'enter':
        newRowIndex = Math.min(maxRow, currentRowIndex + 1);
        break;
      case 'left':
        if (currentFieldIndex > 0) {
          newField = editableFields[currentFieldIndex - 1];
        } else if (currentRowIndex > 0) {
          newRowIndex = currentRowIndex - 1;
          newField = editableFields[editableFields.length - 1];
        }
        break;
      case 'right':
        if (currentFieldIndex < editableFields.length - 1) {
          newField = editableFields[currentFieldIndex + 1];
        } else if (currentRowIndex < maxRow) {
          newRowIndex = currentRowIndex + 1;
          newField = editableFields[0];
        }
        break;
    }
    
    setSelectedCell({ id: worksheets[newRowIndex].id, field: newField });
  };
  
  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (editingCell) return;
    if ((e.ctrlKey || e.metaKey || e.altKey) && e.key !== 'Tab') return;
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateCell('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateCell('down');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateCell('left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateCell('right');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedCell) {
        const worksheet = worksheets.find(w => w.id === selectedCell.id);
        if (worksheet) {
          const currentValue = worksheet[selectedCell.field as keyof Worksheet] as string;
          handleCellDoubleClick(worksheet.id, selectedCell.field, currentValue);
        }
      }
    } else if (e.key === 'Tab') {
      if (selectedCell) {
        const { id, field } = selectedCell;
        const rowIndex = worksheets.findIndex(w => w.id === id);
        if (rowIndex === -1) return;
        const maxRow = worksheets.length - 1;
        const currentFieldIndex = editableFields.indexOf(field);
        const isAtStart = rowIndex === 0 && currentFieldIndex === 0;
        const isAtEnd = rowIndex === maxRow && currentFieldIndex === editableFields.length - 1;
        
        if ((e.shiftKey && isAtStart) || (!e.shiftKey && isAtEnd)) {
          isEscapingGrid.current = true;
          return;
        }
        
        e.preventDefault();
        navigateCell(e.shiftKey ? 'left' : 'right');
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (selectedCell) {
        const worksheet = worksheets.find(w => w.id === selectedCell.id);
        if (worksheet) {
          shouldSelectText.current = false;
          setEditingCell({ id: worksheet.id, field: selectedCell.field });
          setEditValue(e.key);
        }
      }
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (!editingCell) return;
      
      isSaving.current = true;
      const currentValue = editValue;
      
      updateMutation.mutate({ 
        id: editingCell.id, 
        field: editingCell.field, 
        value: currentValue 
      });
      
      setEditingCell(null);
      
      if (selectedCell) {
        setTimeout(() => {
          navigateCell('enter');
          isSaving.current = false;
        }, 0);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isSaving.current = false;
      setEditingCell(null);
    } else if (e.key === 'Tab') {
      if (selectedCell) {
        const { id, field } = selectedCell;
        const rowIndex = worksheets.findIndex(w => w.id === id);
        if (rowIndex === -1) return;
        const maxRow = worksheets.length - 1;
        const currentFieldIndex = editableFields.indexOf(field);
        const isAtStart = rowIndex === 0 && currentFieldIndex === 0;
        const isAtEnd = rowIndex === maxRow && currentFieldIndex === editableFields.length - 1;
        
        if ((e.shiftKey && isAtStart) || (!e.shiftKey && isAtEnd)) {
          isEscapingGrid.current = true;
          isSaving.current = true;
          handleSaveCell();
          return;
        }
        
        e.preventDefault();
        isSaving.current = true;
        handleSaveCell();
        navigateCell(e.shiftKey ? 'left' : 'right');
      }
    }
  };

  const handleSaveCell = (valueOverride?: string | React.FocusEvent) => {
    if (isSaving.current && valueOverride && typeof valueOverride !== 'string') {
      isSaving.current = false;
      return;
    }
    
    if (editingCell) {
      const valueToSave = typeof valueOverride === 'string' ? valueOverride : editValue;
      updateMutation.mutate({ 
        id: editingCell.id, 
        field: editingCell.field, 
        value: valueToSave 
      });
      setEditingCell(null);
      isSaving.current = false;
    }
  };
  
  const handleCellClick = (id: string, field: string) => {
    setSelectedCell({ id, field });
  };

  const handleAddRow = () => {
    if (!newRowData.wkshtCode) {
      toast({
        title: 'Validation error',
        description: 'Code is required.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      projectId,
      wkshtCode: newRowData.wkshtCode,
      description: newRowData.description || null,
      unit: newRowData.unit || null,
    });
  };

  const handleNewRowKeyDown = (e: React.KeyboardEvent, isLastField: boolean = false) => {
    e.stopPropagation();
    
    if (e.key === 'Enter' && isLastField) {
      e.preventDefault();
      handleAddRow();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowNewRow(false);
      setNewRowData({ wkshtCode: '', description: '', unit: '' });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleColumnHeaderClick = (column: keyof Worksheet) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Handle dialog resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: sizeRef.current.width,
      startHeight: sizeRef.current.height,
    };
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      
      const deltaX = e.clientX - resizeRef.current.startX;
      const deltaY = e.clientY - resizeRef.current.startY;
      
      const newWidth = Math.max(600, resizeRef.current.startWidth + deltaX);
      const newHeight = Math.max(300, resizeRef.current.startHeight + deltaY);
      
      sizeRef.current = { width: newWidth, height: newHeight };
      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
      savePreferences(undefined, sizeRef.current);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Handle column resizing
  const handleColumnMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    
    const columns = Object.keys(columnWidths);
    const currentIndex = columns.indexOf(column);
    const nextColumn = currentIndex < columns.length - 1 ? columns[currentIndex + 1] : undefined;
    
    columnResizeRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column],
      nextColumn,
      nextStartWidth: nextColumn ? columnWidths[nextColumn] : undefined,
    };
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!columnResizeRef.current) return;
      
      const delta = e.clientX - columnResizeRef.current.startX;
      const newWidth = Math.max(80, columnResizeRef.current.startWidth + delta);
      
      const newWidths = { ...columnWidths, [columnResizeRef.current.column]: newWidth };
      
      if (columnResizeRef.current.nextColumn && columnResizeRef.current.nextStartWidth !== undefined) {
        const nextWidth = Math.max(80, columnResizeRef.current.nextStartWidth - delta);
        newWidths[columnResizeRef.current.nextColumn] = nextWidth;
      }
      
      setColumnWidths(newWidths);
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      columnResizeRef.current = null;
      savePreferences(undefined, undefined, columnWidths);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, columnWidths]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <Draggable
        handle=".drag-handle"
        position={initialPosition}
        onStop={(e, data) => {
          positionRef.current = { x: data.x, y: data.y };
          savePreferences({ x: data.x, y: data.y });
        }}
      >
        <div
          className="absolute bg-card border rounded-lg shadow-lg flex flex-col"
          style={{
            width: `${size.width}px`,
            height: `${size.height}px`,
          }}
        >
          {/* Header */}
          <div className="drag-handle flex items-center justify-between px-4 py-3 border-b cursor-move">
            <div className="flex items-center gap-2">
              <h2 className="text-h4 font-medium">
                Project Worksheets
              </h2>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                data-testid="button-close-worksheets"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-hidden">
            <div 
              ref={tableContainerRef}
              className="h-full overflow-auto focus:outline-none"
              onKeyDown={handleTableKeyDown}
              tabIndex={0}
            >
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr>
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
                    <th className="text-data font-medium text-left p-2 border-b w-12">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {showNewRow && (
                    <tr className="border-b bg-muted/30">
                      <td className="p-2" style={{ width: `${columnWidths.wkshtCode}px` }}>
                        <Input
                          placeholder="Code"
                          value={newRowData.wkshtCode}
                          onChange={(e) => setNewRowData({ ...newRowData, wkshtCode: e.target.value })}
                          onKeyDown={(e) => handleNewRowKeyDown(e)}
                          className="text-data"
                          data-testid="input-new-wkshtCode"
                          autoFocus
                        />
                      </td>
                      <td className="p-2" style={{ width: `${columnWidths.description}px` }}>
                        <Input
                          placeholder="Description"
                          value={newRowData.description}
                          onChange={(e) => setNewRowData({ ...newRowData, description: e.target.value })}
                          onKeyDown={(e) => handleNewRowKeyDown(e)}
                          className="text-data"
                          data-testid="input-new-description"
                        />
                      </td>
                      <td className="p-2" style={{ width: `${columnWidths.unit}px` }}>
                        <Input
                          placeholder="Unit"
                          value={newRowData.unit}
                          onChange={(e) => setNewRowData({ ...newRowData, unit: e.target.value })}
                          onKeyDown={(e) => handleNewRowKeyDown(e, true)}
                          className="text-data"
                          data-testid="input-new-unit"
                        />
                      </td>
                      <td className="p-2 w-12">
                        {/* Empty cell for alignment */}
                      </td>
                    </tr>
                  )}
                  {worksheets.map((worksheet) => (
                    <ContextMenu key={worksheet.id}>
                      <ContextMenuTrigger asChild>
                        <tr 
                          className="border-b hover-elevate cursor-pointer"
                          data-testid={`row-worksheet-${worksheet.id}`}
                        >
                          {editableFields.map((field) => {
                            const isEditing = editingCell?.id === worksheet.id && editingCell?.field === field;
                            const isSelected = selectedCell?.id === worksheet.id && selectedCell?.field === field;
                            const value = worksheet[field as keyof Worksheet] as string | null;
                            
                            return (
                              <td
                                key={field}
                                className={`p-2 ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
                                style={{ width: `${columnWidths[field]}px` }}
                                onClick={() => handleCellClick(worksheet.id, field)}
                                onDoubleClick={() => handleCellDoubleClick(worksheet.id, field, value)}
                                data-testid={`cell-${field}-${worksheet.id}`}
                              >
                                {isEditing ? (
                                  <Input
                                    ref={inputRef}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={handleSaveCell}
                                    onKeyDown={handleCellKeyDown}
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
                          <td className="p-2 w-12">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(worksheet.id);
                              }}
                              className="h-7 w-7"
                              data-testid={`button-delete-worksheet-${worksheet.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onClick={() => handleDelete(worksheet.id)}
                          className="text-destructive"
                          data-testid={`menu-delete-${worksheet.id}`}
                        >
                          Delete Worksheet
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </tbody>
              </table>
              {isLoading && (
                <div className="flex items-center justify-center p-8">
                  <span className="text-muted-foreground text-data">Loading...</span>
                </div>
              )}
              {!isLoading && worksheets.length === 0 && !showNewRow && (
                <div className="flex items-center justify-center p-8">
                  <span className="text-muted-foreground text-data">No worksheets yet. Add one to get started.</span>
                </div>
              )}
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={handleMouseDown}
            style={{
              background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.2) 50%)',
            }}
          />
        </div>
      </Draggable>

      <WorksheetsImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        projectId={projectId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/worksheets`] });
          toast({
            title: "Import successful",
            description: "Worksheets have been imported successfully",
          });
        }}
      />
    </div>
  );
}
