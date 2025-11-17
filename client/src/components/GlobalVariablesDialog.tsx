import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';
import Draggable from 'react-draggable';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useGlobalVariablesWebSocket } from '@/hooks/useGlobalVariablesWebSocket';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface GlobalVariablesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface GlobalVariable {
  id: string;
  projectId: string;
  variableName: string;
  description: string | null;
  value: string | null;
  unit: string | null;
  createdAt: string;
  updatedAt: string;
}

type ColumnField = 'variableName' | 'description' | 'value' | 'unit';

interface ColumnWidths {
  variableName: number;
  description: number;
  value: number;
  unit: number;
}

export function GlobalVariablesDialog({
  open,
  onOpenChange,
  projectId,
}: GlobalVariablesDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editingCell, setEditingCell] = useState<{ id: string; field: ColumnField } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ id: string; field: ColumnField } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState({ variableName: '', description: '', value: '', unit: '' });
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<ColumnField | null>(null);
  const [sortColumn, setSortColumn] = useState<ColumnField | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const columnResizeRef = useRef<{ startX: number; startWidth: number; nextWidth: number } | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const isSaving = useRef(false);
  
  // Use refs for position/size to avoid re-renders during drag
  const positionRef = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 900, height: 600 });
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });

  // Column widths (total width: 900px = 200 + 350 + 200 + 150)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({
    variableName: 200,
    description: 350,
    value: 200,
    unit: 150,
  });
  const columnWidthsRef = useRef(columnWidths);

  // Keep ref in sync with state
  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  // Load saved position/size/columnWidths from localStorage when dialog opens
  useEffect(() => {
    if (open && user?.id) {
      const storageKey = `globalVariables_${user.id}`;
      const saved = localStorage.getItem(storageKey);
      
      const defaultSize = { width: 900, height: 600 };
      const defaultPosition = {
        x: (window.innerWidth - defaultSize.width) / 2,
        y: (window.innerHeight - defaultSize.height) / 2
      };
      const defaultColumnWidths = {
        variableName: 200,
        description: 350,
        value: 200,
        unit: 150,
      };
      
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const savedPosition = parsed.position;
          const savedSize = parsed.size;
          const savedColumnWidths = parsed.columnWidths || defaultColumnWidths;
          
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
            setColumnWidths(savedColumnWidths);
            return;
          }
        } catch (error) {
          console.warn('Failed to load saved global variables preferences:', error);
        }
      }
      
      positionRef.current = defaultPosition;
      sizeRef.current = defaultSize;
      setInitialPosition(defaultPosition);
      setSize(defaultSize);
      setColumnWidths(defaultColumnWidths);
    }
  }, [open, user?.id]);

  // Save position/size/columnWidths to localStorage
  const savePreferences = (
    newPosition?: { x: number; y: number },
    newSize?: { width: number; height: number },
    newColumnWidths?: ColumnWidths
  ) => {
    if (user?.id) {
      const storageKey = `globalVariables_${user.id}`;
      localStorage.setItem(storageKey, JSON.stringify({
        position: newPosition || positionRef.current,
        size: newSize || sizeRef.current,
        columnWidths: newColumnWidths || columnWidths,
      }));
    }
  };

  // Fetch global variables
  const { data: variables = [], isLoading } = useQuery<GlobalVariable[]>({
    queryKey: ['/api/projects', projectId, 'global-variables'],
    enabled: open && !!projectId,
  });

  // WebSocket subscription for real-time updates
  const { isConnected } = useGlobalVariablesWebSocket(open ? projectId : null);

  // Sort variables
  const sortedVariables = [...variables].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = (a[sortColumn] || '').toString().toLowerCase();
    const bVal = (b[sortColumn] || '').toString().toLowerCase();
    return sortDirection === 'asc'
      ? aVal.localeCompare(bVal)
      : bVal.localeCompare(aVal);
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<GlobalVariable>) => {
      return await apiRequest(
        'POST',
        `/api/projects/${projectId}/global-variables`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'global-variables'],
      });
      setShowNewRow(false);
      setNewRowData({ variableName: '', description: '', value: '', unit: '' });
      setEditingCell(null);
      setSelectedCell(null);
      isSaving.current = false;
      toast({
        title: 'Variable created',
        description: 'Global variable has been added successfully.',
      });
    },
    onError: (error: any) => {
      isSaving.current = false;
      toast({
        title: 'Error',
        description: error.message || 'Failed to create global variable.',
        variant: 'destructive',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string }) => {
      return await apiRequest(
        'PATCH',
        `/api/projects/${projectId}/global-variables/${id}`,
        { [field]: value }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'global-variables'],
      });
      setEditingCell(null);
      isSaving.current = false;
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update global variable.',
        variant: 'destructive',
      });
      isSaving.current = false;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(
        'DELETE',
        `/api/projects/${projectId}/global-variables/${id}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'global-variables'],
      });
      toast({
        title: 'Variable deleted',
        description: 'Global variable has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete global variable.',
        variant: 'destructive',
      });
    },
  });

  // Auto-focus input when editing
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.select();
    }
  }, [editingCell]);

  // Initialize selectedCell when variables load
  useEffect(() => {
    if (open && !selectedCell && sortedVariables.length > 0 && !showNewRow) {
      setSelectedCell({ id: sortedVariables[0].id, field: 'variableName' });
    }
  }, [open, sortedVariables, selectedCell, showNewRow]);

  // Handle cell click - enter edit mode
  const handleCellClick = (id: string, field: ColumnField, currentValue: string) => {
    setEditingCell({ id, field });
    setSelectedCell({ id, field });
    setEditValue(currentValue);
  };

  // Handle cell keydown - Enter to edit
  const handleCellKeyDown = (e: KeyboardEvent<HTMLDivElement>, id: string, field: ColumnField, currentValue: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellClick(id, field, currentValue);
    }
  };

  // Handle input keydown - Enter to save, Escape to cancel
  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
      setEditValue('');
    }
  };

  // Handle save
  const handleSave = () => {
    if (!editingCell || isSaving.current) return;
    
    if (editingCell.id === 'new') {
      // Creating new variable - validate and submit
      if (!newRowData.variableName.trim()) {
        toast({
          title: 'Error',
          description: 'Variable name is required',
          variant: 'destructive',
        });
        return;
      }
      
      isSaving.current = true;
      createMutation.mutate({
        variableName: newRowData.variableName,
        description: newRowData.description || null,
        value: newRowData.value || null,
        unit: newRowData.unit || null,
      });
    } else {
      // Updating existing variable
      isSaving.current = true;
      updateMutation.mutate({
        id: editingCell.id,
        field: editingCell.field,
        value: editValue,
      });
    }
  };

  // Handle add new row
  const handleAddRow = () => {
    setShowNewRow(true);
    setNewRowData({ variableName: '', description: '', value: '', unit: '' });
    setEditingCell({ id: 'new', field: 'variableName' });
    setSelectedCell({ id: 'new', field: 'variableName' });
    setEditValue('');
  };

  // Handle delete
  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  // Column resize handlers
  const handleColumnResizeStart = (e: React.MouseEvent, column: ColumnField) => {
    e.preventDefault();
    e.stopPropagation();
    
    const columnIndex = getColumnIndex(column);
    if (columnIndex >= 3) return; // Last column (unit) is not resizable
    
    const nextColumn = getNextColumn(column);
    if (!nextColumn) return;
    
    setResizingColumn(column);
    columnResizeRef.current = {
      startX: e.clientX,
      startWidth: columnWidths[column],
      nextWidth: columnWidths[nextColumn],
    };
  };

  const getColumnIndex = (column: ColumnField): number => {
    const fields: ColumnField[] = ['variableName', 'description', 'value', 'unit'];
    return fields.indexOf(column);
  };

  const getNextColumn = (column: ColumnField): ColumnField | null => {
    const fields: ColumnField[] = ['variableName', 'description', 'value', 'unit'];
    const currentIndex = fields.indexOf(column);
    return currentIndex < fields.length - 1 ? fields[currentIndex + 1] : null;
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!columnResizeRef.current) return;
      
      const deltaX = e.clientX - columnResizeRef.current.startX;
      const newWidth = Math.max(80, columnResizeRef.current.startWidth + deltaX);
      const nextColumn = getNextColumn(resizingColumn);
      if (!nextColumn) return;
      
      const newNextWidth = Math.max(80, columnResizeRef.current.nextWidth - deltaX);
      
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: newWidth,
        [nextColumn]: newNextWidth,
      }));
    };

    const handleMouseUp = () => {
      savePreferences(undefined, undefined, columnWidthsRef.current);
      setResizingColumn(null);
      columnResizeRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  // Column header click for sorting
  const handleColumnHeaderClick = (column: ColumnField) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Keyboard navigation
  const handleTableKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editingCell) return;
    if (!selectedCell) return;

    const fields: ColumnField[] = ['variableName', 'description', 'value', 'unit'];
    const allVariables = showNewRow ? [{ id: 'new', variableName: '', description: '', value: '', unit: '' } as GlobalVariable, ...sortedVariables] : sortedVariables;
    
    const currentVariableIndex = allVariables.findIndex(v => v.id === selectedCell.id);
    const currentFieldIndex = fields.indexOf(selectedCell.field);
    
    let newVariableIndex = currentVariableIndex;
    let newFieldIndex = currentFieldIndex;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        newVariableIndex = Math.max(0, currentVariableIndex - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        newVariableIndex = Math.min(allVariables.length - 1, currentVariableIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newFieldIndex = Math.max(0, currentFieldIndex - 1);
        break;
      case 'ArrowRight':
      case 'Tab':
        e.preventDefault();
        newFieldIndex = Math.min(fields.length - 1, currentFieldIndex + 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (currentVariableIndex >= 0) {
          const variable = allVariables[currentVariableIndex];
          const value = variable[selectedCell.field]?.toString() || '';
          handleCellClick(variable.id, selectedCell.field, value);
        }
        return;
      default:
        return;
    }

    if (newVariableIndex !== currentVariableIndex || newFieldIndex !== currentFieldIndex) {
      const newVariable = allVariables[newVariableIndex];
      const newField = fields[newFieldIndex];
      setSelectedCell({ id: newVariable.id, field: newField });
      
      // Scroll into view
      const cellElement = tableContainerRef.current?.querySelector(
        `[data-cell-id="${newVariable.id}-${newField}"]`
      ) as HTMLElement;
      if (cellElement) {
        cellElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  };

  // Dialog resize handlers
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
      const newHeight = Math.max(400, resizeRef.current.startHeight + deltaY);
      
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

  if (!open) return null;

  const renderCell = (variable: GlobalVariable, field: ColumnField) => {
    const isEditing = editingCell?.id === variable.id && editingCell.field === field;
    const value = variable[field]?.toString() || '';
    const cellId = `${variable.id}-${field}`;
    const isSelected = selectedCell?.id === variable.id && selectedCell.field === field;

    if (isEditing) {
      return (
        <Input
          ref={inputRef}
          type={field === 'value' ? 'number' : 'text'}
          step={field === 'value' ? '0.000001' : undefined}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={handleSave}
          className="border-0 focus-visible:ring-1 h-auto py-0"
          style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
          data-testid={`input-${field}-${variable.id}`}
        />
      );
    }

    return (
      <div
        className={`px-2 cursor-cell select-none flex items-center ${isSelected ? 'bg-primary/10 ring-1 ring-primary' : ''}`}
        style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
        onClick={() => {
          setSelectedCell({ id: variable.id, field });
          handleCellClick(variable.id, field, value);
        }}
        onKeyDown={(e) => handleCellKeyDown(e, variable.id, field, value)}
        tabIndex={0}
        data-cell-id={cellId}
      >
        {value || '-'}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <Draggable
        defaultPosition={initialPosition}
        onStop={(e, data) => {
          positionRef.current = { x: data.x, y: data.y };
          savePreferences(positionRef.current);
        }}
        handle=".drag-handle"
        bounds="parent"
      >
        <div
          className="pointer-events-auto absolute bg-background border border-border shadow-2xl rounded-lg flex flex-col overflow-hidden"
          style={{ width: size.width, height: size.height }}
        >
          {/* Header */}
          <div className="drag-handle flex items-center justify-between p-4 border-b border-border bg-muted/50 cursor-move select-none" data-testid="global-variables-drag-handle">
            <h2 className="text-lg font-semibold">Global Variables</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
              }}
              data-testid="button-close-global-variables"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden p-4">
            <div className="mb-4">
              <Button
                size="sm"
                onClick={handleAddRow}
                disabled={showNewRow}
                data-testid="button-add-global-variable"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Variable
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-muted-foreground">Loading...</div>
              </div>
            ) : (
              <div className="border border-border rounded-md flex flex-col h-full">
                {/* Header Table */}
                <div className="overflow-x-auto flex-shrink-0">
                  <table className="border-collapse" style={{ 
                    tableLayout: 'fixed', 
                    width: `${Object.values(columnWidths).reduce((sum, w) => sum + w, 0)}px` 
                  }}>
                    <thead style={{ backgroundColor: 'hsl(var(--table-header-bg))' }}>
                      <tr className="border-b border-border">
                        <th 
                          className="px-3 text-left text-sm font-semibold border-r border-border cursor-pointer hover-elevate select-none relative" 
                          style={{ 
                            paddingTop: 'var(--row-py)', 
                            paddingBottom: 'var(--row-py)', 
                            backgroundColor: 'hsl(var(--table-header-bg))',
                            color: 'hsl(var(--table-header-fg))',
                            width: `${columnWidths.variableName}px`,
                            minWidth: `${columnWidths.variableName}px`,
                            maxWidth: `${columnWidths.variableName}px`,
                          }}
                          onClick={() => handleColumnHeaderClick('variableName')}
                          data-testid="header-variable-name"
                        >
                          Variable Name {sortColumn === 'variableName' && (sortDirection === 'asc' ? '↑' : '↓')}
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                            onMouseDown={(e) => handleColumnResizeStart(e, 'variableName')}
                          />
                        </th>
                        <th 
                          className="px-3 text-left text-sm font-semibold border-r border-border cursor-pointer hover-elevate select-none relative sticky top-0 z-10" 
                          style={{ 
                            paddingTop: 'var(--row-py)', 
                            paddingBottom: 'var(--row-py)', 
                            backgroundColor: 'hsl(var(--table-header-bg))',
                            color: 'hsl(var(--table-header-fg))',
                            width: `${columnWidths.description}px`,
                            minWidth: `${columnWidths.description}px`,
                            maxWidth: `${columnWidths.description}px`,
                          }}
                          onClick={() => handleColumnHeaderClick('description')}
                          data-testid="header-description"
                        >
                          Description {sortColumn === 'description' && (sortDirection === 'asc' ? '↑' : '↓')}
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                            onMouseDown={(e) => handleColumnResizeStart(e, 'description')}
                          />
                        </th>
                        <th 
                          className="px-3 text-right text-sm font-semibold border-r border-border cursor-pointer hover-elevate select-none relative" 
                          style={{ 
                            paddingTop: 'var(--row-py)', 
                            paddingBottom: 'var(--row-py)', 
                            color: 'hsl(var(--table-header-fg))',
                            width: `${columnWidths.value}px`,
                            minWidth: `${columnWidths.value}px`,
                            maxWidth: `${columnWidths.value}px`,
                          }}
                          onClick={() => handleColumnHeaderClick('value')}
                          data-testid="header-value"
                        >
                          Value {sortColumn === 'value' && (sortDirection === 'asc' ? '↑' : '↓')}
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                            onMouseDown={(e) => handleColumnResizeStart(e, 'value')}
                          />
                        </th>
                        <th 
                          className="px-3 text-left text-sm font-semibold cursor-pointer hover-elevate select-none" 
                          style={{ 
                            paddingTop: 'var(--row-py)', 
                            paddingBottom: 'var(--row-py)', 
                            color: 'hsl(var(--table-header-fg))',
                            width: `${columnWidths.unit}px`,
                            minWidth: `${columnWidths.unit}px`,
                            maxWidth: `${columnWidths.unit}px`,
                          }}
                          onClick={() => handleColumnHeaderClick('unit')}
                          data-testid="header-unit"
                        >
                          Unit {sortColumn === 'unit' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* Scrollable Body Table */}
                <div 
                  ref={tableContainerRef}
                  tabIndex={0}
                  role="grid"
                  onKeyDown={handleTableKeyDown}
                  className="overflow-auto outline-none"
                  style={{ maxHeight: '400px' }}
                >
                  <table className="border-collapse" style={{ 
                    tableLayout: 'fixed', 
                    width: `${Object.values(columnWidths).reduce((sum, w) => sum + w, 0)}px` 
                  }}>
                    <colgroup>
                      <col style={{ width: `${columnWidths.variableName}px` }} />
                      <col style={{ width: `${columnWidths.description}px` }} />
                      <col style={{ width: `${columnWidths.value}px` }} />
                      <col style={{ width: `${columnWidths.unit}px` }} />
                    </colgroup>
                    <tbody>
                      {/* New row form */}
                      {showNewRow && (
                        <tr className="border-b border-border bg-background" data-row-id="new">
                          <td className="px-1 border-r border-border">
                            {editingCell?.id === 'new' && editingCell.field === 'variableName' ? (
                              <Input
                                ref={inputRef}
                                autoFocus
                                value={editValue}
                                onChange={(e) => {
                                  setEditValue(e.target.value);
                                  setNewRowData({ ...newRowData, variableName: e.target.value });
                                }}
                                onKeyDown={handleInputKeyDown}
                                onBlur={handleSave}
                                placeholder="Variable name"
                                className="border-0 focus-visible:ring-1 h-auto py-0"
                                style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                                data-testid="input-variable-name-new"
                              />
                            ) : (
                              <div
                                className="px-2 cursor-cell select-none flex items-center font-mono"
                                style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                                onClick={() => {
                                  setEditingCell({ id: 'new', field: 'variableName' });
                                  setEditValue(newRowData.variableName);
                                }}
                                tabIndex={0}
                                data-cell-id="new-variableName"
                              >
                                {newRowData.variableName || <span className="text-muted-foreground">Variable name</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-1 border-r border-border">
                            {editingCell?.id === 'new' && editingCell.field === 'description' ? (
                              <Input
                                ref={inputRef}
                                value={editValue}
                                onChange={(e) => {
                                  setEditValue(e.target.value);
                                  setNewRowData({ ...newRowData, description: e.target.value });
                                }}
                                onKeyDown={handleInputKeyDown}
                                onBlur={handleSave}
                                placeholder="Description"
                                className="border-0 focus-visible:ring-1 h-auto py-0"
                                style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                                data-testid="input-description-new"
                              />
                            ) : (
                              <div
                                className="px-2 cursor-cell select-none flex items-center"
                                style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                                onClick={() => {
                                  setEditingCell({ id: 'new', field: 'description' });
                                  setEditValue(newRowData.description);
                                }}
                                tabIndex={0}
                                data-cell-id="new-description"
                              >
                                {newRowData.description || <span className="text-muted-foreground">Description</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-1 border-r border-border">
                            {editingCell?.id === 'new' && editingCell.field === 'value' ? (
                              <Input
                                ref={inputRef}
                                type="number"
                                step="0.000001"
                                value={editValue}
                                onChange={(e) => {
                                  setEditValue(e.target.value);
                                  setNewRowData({ ...newRowData, value: e.target.value });
                                }}
                                onKeyDown={handleInputKeyDown}
                                onBlur={handleSave}
                                placeholder="0.00"
                                className="border-0 focus-visible:ring-1 h-auto py-0 text-right"
                                style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                                data-testid="input-value-new"
                              />
                            ) : (
                              <div
                                className="px-2 cursor-cell select-none flex items-center text-right justify-end"
                                style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                                onClick={() => {
                                  setEditingCell({ id: 'new', field: 'value' });
                                  setEditValue(newRowData.value);
                                }}
                                tabIndex={0}
                                data-cell-id="new-value"
                              >
                                {newRowData.value || <span className="text-muted-foreground">0.00</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-1">
                            {editingCell?.id === 'new' && editingCell.field === 'unit' ? (
                              <Input
                                ref={inputRef}
                                value={editValue}
                                onChange={(e) => {
                                  setEditValue(e.target.value);
                                  setNewRowData({ ...newRowData, unit: e.target.value });
                                }}
                                onKeyDown={handleInputKeyDown}
                                onBlur={handleSave}
                                placeholder="Unit"
                                className="border-0 focus-visible:ring-1 h-auto py-0"
                                style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                                data-testid="input-unit-new"
                              />
                            ) : (
                              <div
                                className="px-2 cursor-cell select-none flex items-center"
                                style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                                onClick={() => {
                                  setEditingCell({ id: 'new', field: 'unit' });
                                  setEditValue(newRowData.unit);
                                }}
                                tabIndex={0}
                                data-cell-id="new-unit"
                              >
                                {newRowData.unit || <span className="text-muted-foreground">Unit</span>}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}

                      {/* Existing rows */}
                      {sortedVariables.length === 0 && !showNewRow ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                            No global variables yet. Click "Add Variable" to create one.
                          </td>
                        </tr>
                      ) : (
                        sortedVariables.map((variable, index) => (
                          <ContextMenu key={variable.id}>
                            <ContextMenuTrigger asChild>
                              <tr 
                                className={`border-b border-border hover:bg-accent/30 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
                                data-testid={`row-variable-${variable.id}`}
                              >
                                <td className="px-1 font-mono text-sm border-r border-border" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(variable, 'variableName')}</td>
                                <td className="px-1 text-sm border-r border-border" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(variable, 'description')}</td>
                                <td className="px-1 text-sm text-right border-r border-border" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(variable, 'value')}</td>
                                <td className="px-1 text-sm" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(variable, 'unit')}</td>
                              </tr>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(variable.id)}
                                data-testid={`menu-delete-${variable.id}`}
                              >
                                Delete Variable
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={handleMouseDown}
            style={{
              background: 'linear-gradient(135deg, transparent 50%, hsl(var(--border)) 50%)',
            }}
          />
        </div>
      </Draggable>
    </div>
  );
}
