import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Plus, Upload } from 'lucide-react';
import { ResourceRatesImportDialog } from './ResourceRatesImportDialog';
import Draggable from 'react-draggable';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useResourceRatesWebSocket } from '@/hooks/useResourceRatesWebSocket';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface ResourceRatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  companyId: string;
}

interface ResourceRate {
  id: string;
  projectId: string;
  resourceTypeId: string | null;
  resourceTypeName: string | null;
  code: string;
  description: string | null;
  unit: string | null;
  tenderRate: string | null;
  costRate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ResourceType {
  id: string;
  companyId: string;
  resType: string;
  resourceDescription: string;
  sortingIndex: number;
}

export function ResourceRatesDialog({
  open,
  onOpenChange,
  projectId,
  companyId,
}: ResourceRatesDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCell, setSelectedCell] = useState<{ id: string; field: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showNewRow, setShowNewRow] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<keyof ResourceRate | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [newRowData, setNewRowData] = useState({ 
    resourceTypeId: '', 
    code: '', 
    description: '', 
    unit: '', 
    tenderRate: '', 
    costRate: '' 
  });
  const [isResizing, setIsResizing] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    resourceTypeName: 100,
    code: 150,
    description: 300,
    unit: 100,
    tenderRate: 130,
    costRate: 130,
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const columnResizeRef = useRef<{ column: string; startX: number; startWidth: number; nextColumn?: string; nextStartWidth?: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const isEscapingGrid = useRef(false);
  const shouldSelectText = useRef(true); // Track whether to select text when entering edit mode
  const isSaving = useRef(false); // Prevent duplicate saves from blur handler
  
  // Use refs for position/size to avoid re-renders during drag
  const positionRef = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 1000, height: 600 });
  const [size, setSize] = useState({ width: 1000, height: 600 });
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });

  // Load saved position/size/column widths from localStorage when dialog opens
  useEffect(() => {
    if (open && user?.id) {
      const storageKey = `resourceRates_${user.id}`;
      const saved = localStorage.getItem(storageKey);
      
      const defaultSize = { width: 1000, height: 600 };
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
            
            // Load column widths
            if (savedWidths) {
              setColumnWidths(savedWidths);
            }
            return;
          }
        } catch (error) {
          console.warn('Failed to load saved resource rates preferences:', error);
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
      const storageKey = `resourceRates_${user.id}`;
      localStorage.setItem(storageKey, JSON.stringify({
        position: newPosition || positionRef.current,
        size: newSize || sizeRef.current,
        columnWidths: newWidths || columnWidths,
      }));
    }
  };

  // Fetch resource rates
  const { data: fetchedRates = [], isLoading } = useQuery<ResourceRate[]>({
    queryKey: ['/api/projects', projectId, 'resource-rates'],
    enabled: open && !!projectId,
  });

  // Apply client-side sorting only if user has clicked a column header
  const rates = useMemo(() => {
    if (!sortColumn) {
      // No sorting - show in database order (insertion order)
      return fetchedRates;
    }

    return [...fetchedRates].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      // Handle null/undefined values
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      // Compare values
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [fetchedRates, sortColumn, sortDirection]);

  // Fetch resource types for the dropdown
  const { data: resourceTypes = [] } = useQuery<ResourceType[]>({
    queryKey: ['/api/companies', companyId, 'resource-types'],
    enabled: open && !!companyId,
  });

  // WebSocket subscription for real-time updates
  const { isConnected } = useResourceRatesWebSocket(open ? projectId : null);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<ResourceRate>) => {
      return await apiRequest(
        'POST',
        `/api/projects/${projectId}/resource-rates`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'resource-rates'],
      });
      setShowNewRow(false);
      setNewRowData({ resourceTypeId: '', code: '', description: '', unit: '', tenderRate: '', costRate: '' });
      setEditingCell(null);
      // Reset sorting so new record stays at end
      setSortColumn(null);
      setSortDirection('asc');
      toast({
        title: 'Rate created',
        description: 'Resource rate has been added successfully.',
      });
    },
    onError: (error: any) => {
      const errorMessage = error.message?.includes('already exists') 
        ? 'Code already exists for this project. Please use a unique code.'
        : error.message || 'Failed to create resource rate.';
      
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
      // Convert resourceTypeName field to resourceTypeId for API
      const fieldToUpdate = field === 'resourceTypeName' ? 'resourceTypeId' : field;
      const response = await apiRequest(
        'PATCH',
        `/api/projects/${projectId}/resource-rates/${id}`,
        { [fieldToUpdate]: value }
      );
      return await response.json() as ResourceRate;
    },
    onSuccess: (updatedRate: ResourceRate) => {
      // Update cache with complete server response (includes resourceTypeName from JOIN)
      queryClient.setQueryData(
        ['/api/projects', projectId, 'resource-rates'],
        (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((rate: ResourceRate) =>
            rate.id === updatedRate.id ? updatedRate : rate
          );
        }
      );
      setEditingCell(null);
    },
    onError: (error: any) => {
      const errorMessage = error.message?.includes('already exists') 
        ? 'Code already exists for this project. Please use a unique code.'
        : error.message || 'Failed to update resource rate.';
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      
      // Refresh data to revert the cell back to original value
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'resource-rates'],
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(
        'DELETE',
        `/api/projects/${projectId}/resource-rates/${id}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'resource-rates'],
      });
      toast({
        title: 'Rate deleted',
        description: 'Resource rate has been removed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete resource rate.',
        variant: 'destructive',
      });
    },
  });

  // Focus on input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      // Only select text for input fields (not dropdowns) AND when we want to select
      if (shouldSelectText.current && typeof inputRef.current.select === 'function') {
        inputRef.current.select();
      }
      // Reset the flag for next time
      shouldSelectText.current = true;
    }
  }, [editingCell]);
  
  // Initialize selected cell when dialog opens with data
  useEffect(() => {
    if (open && rates.length > 0 && !selectedCell && !editingCell && !showNewRow) {
      setSelectedCell({ id: rates[0].id, field: 'description' });
    }
  }, [open, rates.length, selectedCell, editingCell, showNewRow]);
  
  // Focus the table container after navigation or when selection changes
  useEffect(() => {
    // Don't auto-focus grid when new row form is open
    if (showNewRow) return;
    
    if (selectedCell && !editingCell && tableContainerRef.current && !isEscapingGrid.current) {
      // Small delay to let React finish rendering
      setTimeout(() => {
        tableContainerRef.current?.focus();
      }, 0);
    }
    
    // Reset escape flag after focus attempt
    if (isEscapingGrid.current) {
      setTimeout(() => {
        isEscapingGrid.current = false;
      }, 100);
    }
  }, [selectedCell, editingCell, showNewRow]);

  const handleCellDoubleClick = (id: string, field: string, currentValue: string | null, resourceTypeId?: string | null) => {
    setEditingCell({ id, field });
    // For resourceTypeName field, use resourceTypeId value instead of text value
    if (field === 'resourceTypeName' && resourceTypeId !== undefined) {
      setEditValue(resourceTypeId || '');
    } else {
      setEditValue(currentValue || '');
    }
  };

  // Excel-like keyboard navigation configuration
  const editableFields = ['resourceTypeName', 'code', 'description', 'unit', 'tenderRate', 'costRate'];
  
  const navigateCell = (direction: 'up' | 'down' | 'left' | 'right' | 'enter') => {
    if (!selectedCell) return;
    
    const { id, field } = selectedCell;
    const currentRowIndex = rates.findIndex(r => r.id === id);
    if (currentRowIndex === -1) return;
    
    const maxRow = rates.length - 1;
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
          // Move left within same row
          newField = editableFields[currentFieldIndex - 1];
        } else if (currentRowIndex > 0) {
          // Wrap to end of previous row
          newRowIndex = currentRowIndex - 1;
          newField = editableFields[editableFields.length - 1];
        }
        // If at start of first row, stay put (don't trap)
        break;
      case 'right':
        if (currentFieldIndex < editableFields.length - 1) {
          // Move right within same row
          newField = editableFields[currentFieldIndex + 1];
        } else if (currentRowIndex < maxRow) {
          // Wrap to start of next row
          newRowIndex = currentRowIndex + 1;
          newField = editableFields[0];
        }
        // If at end of last row, stay put (don't trap)
        break;
    }
    
    setSelectedCell({ id: rates[newRowIndex].id, field: newField });
  };
  
  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    // Ignore if we're editing
    if (editingCell) return;
    
    // Ignore if modifier keys are held (except Shift for Tab)
    if ((e.ctrlKey || e.metaKey || e.altKey) && e.key !== 'Tab') return;
    
    // Handle navigation keys
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
        const rate = rates.find(r => r.id === selectedCell.id);
        if (rate) {
          const currentValue = rate[selectedCell.field as keyof ResourceRate] as string;
          handleCellDoubleClick(rate.id, selectedCell.field, currentValue, rate.resourceTypeId);
        }
      }
    } else if (e.key === 'Tab') {
      // Only handle Tab if we can move within the grid
      // Let browser handle Tab when at edges (allows escaping grid)
      if (selectedCell) {
        const { id, field } = selectedCell;
        const rowIndex = rates.findIndex(r => r.id === id);
        if (rowIndex === -1) return;
        const maxRow = rates.length - 1;
        const currentFieldIndex = editableFields.indexOf(field);
        const isAtStart = rowIndex === 0 && currentFieldIndex === 0;
        const isAtEnd = rowIndex === maxRow && currentFieldIndex === editableFields.length - 1;
        
        if ((e.shiftKey && isAtStart) || (!e.shiftKey && isAtEnd)) {
          // At edge - let browser handle Tab to escape grid
          isEscapingGrid.current = true;
          return;
        }
        
        e.preventDefault();
        navigateCell(e.shiftKey ? 'left' : 'right');
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing any character starts editing (Excel behavior)
      e.preventDefault();
      if (selectedCell) {
        const rate = rates.find(r => r.id === selectedCell.id);
        if (rate) {
          // For resourceTypeName, don't set editValue to the typed key since it uses a Select dropdown
          // Just start editing with current value to open the dropdown
          if (selectedCell.field === 'resourceTypeName') {
            const currentValue = rate[selectedCell.field as keyof ResourceRate] as string;
            handleCellDoubleClick(rate.id, selectedCell.field, currentValue, rate.resourceTypeId);
          } else {
            // For other fields, start editing with the typed character
            shouldSelectText.current = false; // Don't select text when typing to enter edit mode
            setEditingCell({ id: rate.id, field: selectedCell.field });
            setEditValue(e.key);
          }
        }
      }
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    // Stop propagation to prevent table-level keyboard handler from interfering
    e.stopPropagation();
    
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (!editingCell) return; // Safety check
      
      // Save immediately
      isSaving.current = true;
      const currentValue = editValue;
      
      // Trigger mutation directly
      updateMutation.mutate({ 
        id: editingCell.id, 
        field: editingCell.field, 
        value: currentValue 
      });
      
      // Exit edit mode
      setEditingCell(null);
      
      // Navigate to next cell
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
      // Check if we can navigate within grid
      if (selectedCell) {
        const { id, field } = selectedCell;
        const rowIndex = rates.findIndex(r => r.id === id);
        if (rowIndex === -1) return;
        const maxRow = rates.length - 1;
        const currentFieldIndex = editableFields.indexOf(field);
        const isAtStart = rowIndex === 0 && currentFieldIndex === 0;
        const isAtEnd = rowIndex === maxRow && currentFieldIndex === editableFields.length - 1;
        
        if ((e.shiftKey && isAtStart) || (!e.shiftKey && isAtEnd)) {
          // At edge - save and let browser handle Tab to escape grid
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
    // If called from blur and we already saved via Enter/Tab, skip
    if (isSaving.current && valueOverride && typeof valueOverride !== 'string') {
      isSaving.current = false; // Reset for next edit
      return; // Blur event after keyboard save - ignore
    }
    
    if (editingCell) {
      // If valueOverride is a string, use it; otherwise use editValue
      const valueToSave = typeof valueOverride === 'string' ? valueOverride : editValue;
      updateMutation.mutate({ 
        id: editingCell.id, 
        field: editingCell.field, 
        value: valueToSave 
      });
      setEditingCell(null);
      isSaving.current = false; // Reset after save
    }
  };
  
  const handleCellClick = (id: string, field: string) => {
    setSelectedCell({ id, field });
  };

  const handleAddRow = () => {
    if (!newRowData.resourceTypeId || !newRowData.code) {
      toast({
        title: 'Validation error',
        description: 'Resource Type and Code are required fields.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      projectId,
      resourceTypeId: newRowData.resourceTypeId,
      code: newRowData.code,
      description: newRowData.description || null,
      unit: newRowData.unit || null,
      tenderRate: newRowData.tenderRate || null,
      costRate: newRowData.costRate || null,
    });
  };

  const handleNewRowKeyDown = (e: React.KeyboardEvent, isLastField: boolean = false) => {
    // Always stop propagation to prevent table keyboard handler from interfering
    e.stopPropagation();
    
    if (e.key === 'Enter' && isLastField) {
      // Only save when pressing Enter in the last field
      e.preventDefault();
      handleAddRow();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowNewRow(false);
      setNewRowData({ resourceTypeId: '', code: '', description: '', unit: '', tenderRate: '', costRate: '' });
    }
    // For other keys and non-last fields, let Tab/Shift+Tab work normally
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleColumnHeaderClick = (column: keyof ResourceRate) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column - default to ascending
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
      
      const newWidth = Math.max(800, resizeRef.current.startWidth + deltaX);
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

  // Handle column resize - adjust next column inversely to keep total width fixed
  const handleColumnResizeStart = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't allow resizing the last column (costRate) since it has no column to its right
    if (column === 'costRate') return;
    
    setResizingColumn(column);
    
    // Determine the next column to adjust inversely
    const columnOrder = ['resourceTypeName', 'code', 'description', 'unit', 'tenderRate', 'costRate'];
    const currentIndex = columnOrder.indexOf(column);
    const nextColumn = columnOrder[currentIndex + 1];
    
    columnResizeRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column],
      nextColumn,
      nextStartWidth: columnWidths[nextColumn],
    };
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!columnResizeRef.current) return;
      
      const delta = e.clientX - columnResizeRef.current.startX;
      const newWidth = Math.max(50, columnResizeRef.current.startWidth + delta);
      
      // Calculate the inverse change for the next column
      const actualDelta = newWidth - columnResizeRef.current.startWidth;
      const nextColumnNewWidth = Math.max(50, (columnResizeRef.current as any).nextStartWidth - actualDelta);
      
      // If the next column would be too small, limit the current column's growth
      const maxDelta = (columnResizeRef.current as any).nextStartWidth - 50;
      const limitedDelta = Math.min(actualDelta, maxDelta);
      const limitedNewWidth = columnResizeRef.current.startWidth + limitedDelta;
      const limitedNextWidth = (columnResizeRef.current as any).nextStartWidth - limitedDelta;
      
      setColumnWidths(prev => ({
        ...prev,
        [columnResizeRef.current!.column]: limitedNewWidth,
        [(columnResizeRef.current as any).nextColumn]: limitedNextWidth,
      }));
    };

    const handleMouseUp = () => {
      if (columnResizeRef.current) {
        savePreferences(undefined, undefined, columnWidths);
      }
      setResizingColumn(null);
      columnResizeRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, columnWidths]);

  if (!open) return null;

  const formatCurrency = (value: string | null) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('en-AU', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const renderCell = (rate: ResourceRate, field: keyof ResourceRate) => {
    const isEditing = editingCell?.id === rate.id && editingCell?.field === field;
    const isSelected = selectedCell?.id === rate.id && selectedCell?.field === field;
    const value = rate[field];
    
    if (isEditing) {
      // Special handling for resourceTypeName - use Select component with resourceTypeId values
      if (field === 'resourceTypeName') {
        // Find the selected resource type to display only its code
        const selectedRT = resourceTypes.find(rt => rt.id === editValue);
        
        return (
          <Select
            value={editValue}
            onValueChange={(value) => {
              setEditValue(value);
              // Auto-save immediately with the new value
              handleSaveCell(value);
            }}
            onOpenChange={(isOpen) => {
              if (!isOpen && editingCell) {
                // Dropdown closed - cancel edit mode
                setEditingCell(null);
              }
            }}
          >
            <SelectTrigger 
              ref={inputRef as any}
              className="border-0 focus-visible:ring-1 text-sm h-auto" 
              style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
              data-testid={`select-edit-${field}`}
            >
              {/* Show only the code in the trigger, not the full description */}
              <SelectValue placeholder="Select resource type">
                {selectedRT ? selectedRT.resType : 'Select...'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[400px]">
              {resourceTypes.map(rt => (
                <SelectItem key={rt.id} value={rt.id}>
                  {rt.resType} - {rt.resourceDescription}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      
      return (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleCellKeyDown}
          onBlur={handleSaveCell}
          type={field === 'tenderRate' || field === 'costRate' ? 'number' : 'text'}
          step={field === 'tenderRate' || field === 'costRate' ? '0.01' : undefined}
          className="border-0 focus-visible:ring-1 h-auto py-0 text-sm"
          style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
          data-testid={`input-edit-${field}`}
        />
      );
    }

    const displayValue = (field === 'tenderRate' || field === 'costRate') 
      ? formatCurrency(value as string) 
      : (value || '-');

    return (
      <div
        className={`cursor-cell select-none ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
        onClick={() => handleCellClick(rate.id, field)}
        onDoubleClick={() => handleCellDoubleClick(rate.id, field, value as string, rate.resourceTypeId)}
        aria-selected={isSelected}
        data-testid={`cell-${field}-${rate.id}`}
      >
        {displayValue}
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
          <div className="drag-handle flex items-center justify-between p-4 border-b border-border bg-muted/50 cursor-move select-none" data-testid="resource-rates-drag-handle">
            <h2 className="text-lg font-semibold">Resource Rates</h2>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-resource-rates"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-muted-foreground">Loading...</div>
              </div>
            ) : (
              <div 
                className="border border-border rounded-md flex flex-col h-full"
              >
                {/* Sticky Header Table */}
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
                            color: 'hsl(var(--table-header-fg))',
                            width: `${columnWidths.resourceTypeName}px`,
                            minWidth: `${columnWidths.resourceTypeName}px`,
                            maxWidth: `${columnWidths.resourceTypeName}px`,
                          }}
                          onClick={() => handleColumnHeaderClick('resourceTypeName')}
                          data-testid="header-res-type"
                        >
                          Res Type {sortColumn === 'resourceTypeName' && (sortDirection === 'asc' ? '↑' : '↓')}
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                            onMouseDown={(e) => handleColumnResizeStart(e, 'resourceTypeName')}
                          />
                        </th>
                        <th 
                          className="px-3 text-left text-sm font-semibold border-r border-border cursor-pointer hover-elevate select-none relative" 
                          style={{ 
                            paddingTop: 'var(--row-py)', 
                            paddingBottom: 'var(--row-py)', 
                            color: 'hsl(var(--table-header-fg))',
                            width: `${columnWidths.code}px`,
                            minWidth: `${columnWidths.code}px`,
                            maxWidth: `${columnWidths.code}px`,
                          }}
                          onClick={() => handleColumnHeaderClick('code')}
                          data-testid="header-code"
                        >
                          Code {sortColumn === 'code' && (sortDirection === 'asc' ? '↑' : '↓')}
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                            onMouseDown={(e) => handleColumnResizeStart(e, 'code')}
                          />
                        </th>
                        <th 
                          className="px-3 text-left text-sm font-semibold border-r border-border cursor-pointer hover-elevate select-none relative" 
                          style={{ 
                            paddingTop: 'var(--row-py)', 
                            paddingBottom: 'var(--row-py)', 
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
                          className="px-3 text-left text-sm font-semibold border-r border-border cursor-pointer hover-elevate select-none relative" 
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
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                            onMouseDown={(e) => handleColumnResizeStart(e, 'unit')}
                          />
                        </th>
                        <th 
                          className="px-3 text-right text-sm font-semibold border-r border-border cursor-pointer hover-elevate select-none relative" 
                          style={{ 
                            paddingTop: 'var(--row-py)', 
                            paddingBottom: 'var(--row-py)', 
                            color: 'hsl(var(--table-header-fg))',
                            width: `${columnWidths.tenderRate}px`,
                            minWidth: `${columnWidths.tenderRate}px`,
                            maxWidth: `${columnWidths.tenderRate}px`,
                          }}
                          onClick={() => handleColumnHeaderClick('tenderRate')}
                          data-testid="header-tender-rate"
                        >
                          Tender Rate {sortColumn === 'tenderRate' && (sortDirection === 'asc' ? '↑' : '↓')}
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
                            onMouseDown={(e) => handleColumnResizeStart(e, 'tenderRate')}
                          />
                        </th>
                        <th 
                          className="px-3 text-right text-sm font-semibold cursor-pointer hover-elevate select-none" 
                          style={{ 
                            paddingTop: 'var(--row-py)', 
                            paddingBottom: 'var(--row-py)', 
                            color: 'hsl(var(--table-header-fg))',
                            width: `${columnWidths.costRate}px`,
                            minWidth: `${columnWidths.costRate}px`,
                            maxWidth: `${columnWidths.costRate}px`,
                          }}
                          onClick={() => handleColumnHeaderClick('costRate')}
                          data-testid="header-cost-rate"
                        >
                          Cost Rate {sortColumn === 'costRate' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                      <col style={{ width: `${columnWidths.resourceTypeName}px` }} />
                      <col style={{ width: `${columnWidths.code}px` }} />
                      <col style={{ width: `${columnWidths.description}px` }} />
                      <col style={{ width: `${columnWidths.unit}px` }} />
                      <col style={{ width: `${columnWidths.tenderRate}px` }} />
                      <col style={{ width: `${columnWidths.costRate}px` }} />
                    </colgroup>
                    <tbody>
                    {rates.map((rate, index) => (
                      <ContextMenu key={rate.id}>
                        <ContextMenuTrigger asChild>
                          <tr 
                            className={`border-b border-border hover:bg-accent/30 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
                            data-testid={`row-resource-rate-${index}`}
                          >
                            <td className="px-2 font-mono text-sm border-r border-border" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(rate, 'resourceTypeName')}</td>
                            <td className="px-2 font-mono text-sm border-r border-border" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(rate, 'code')}</td>
                            <td className="px-2 text-sm border-r border-border" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(rate, 'description')}</td>
                            <td className="px-2 text-sm border-r border-border" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(rate, 'unit')}</td>
                            <td className="px-2 text-right font-mono text-sm border-r border-border" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(rate, 'tenderRate')}</td>
                            <td className="px-2 text-right font-mono text-sm" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>{renderCell(rate, 'costRate')}</td>
                          </tr>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => handleDelete(rate.id)}
                            className="text-destructive focus:text-destructive"
                            data-testid={`menu-delete-${rate.id}`}
                          >
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                      ))}

                      {/* New row */}
                      {showNewRow && (
                      <tr className="border-b border-border bg-white">
                        <td className="px-1 border-r border-border">
                          <Select
                            value={newRowData.resourceTypeId}
                            onValueChange={(value) => setNewRowData(prev => ({ ...prev, resourceTypeId: value }))}
                          >
                            <SelectTrigger className="border-0 focus-visible:ring-1 text-sm h-auto" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }} data-testid="select-new-res-type">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {resourceTypes.map(rt => (
                                <SelectItem key={rt.id} value={rt.id}>
                                  {rt.resType} - {rt.resourceDescription}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 border-r border-border">
                          <Input
                            value={newRowData.code}
                            onChange={(e) => setNewRowData(prev => ({ ...prev, code: e.target.value }))}
                            onKeyDown={(e) => handleNewRowKeyDown(e, false)}
                            className="border-0 focus-visible:ring-1 h-auto py-0 text-sm font-mono bg-white"
                            style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                            placeholder="Code"
                            data-testid="input-new-code"
                          />
                        </td>
                        <td className="px-1 border-r border-border">
                          <Input
                            value={newRowData.description}
                            onChange={(e) => setNewRowData(prev => ({ ...prev, description: e.target.value }))}
                            onKeyDown={(e) => handleNewRowKeyDown(e, false)}
                            className="border-0 focus-visible:ring-1 h-auto py-0 text-sm bg-white"
                            style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                            placeholder="Description"
                            data-testid="input-new-description"
                          />
                        </td>
                        <td className="px-1 border-r border-border">
                          <Input
                            value={newRowData.unit}
                            onChange={(e) => setNewRowData(prev => ({ ...prev, unit: e.target.value }))}
                            onKeyDown={(e) => handleNewRowKeyDown(e, false)}
                            className="border-0 focus-visible:ring-1 h-auto py-0 text-sm bg-white"
                            style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                            placeholder="Unit"
                            data-testid="input-new-unit"
                          />
                        </td>
                        <td className="px-1 border-r border-border">
                          <Input
                            value={newRowData.tenderRate}
                            onChange={(e) => setNewRowData(prev => ({ ...prev, tenderRate: e.target.value }))}
                            onKeyDown={(e) => handleNewRowKeyDown(e, false)}
                            className="border-0 focus-visible:ring-1 h-auto py-0 text-sm text-right font-mono bg-white"
                            style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                            placeholder="0.00"
                            type="number"
                            step="0.01"
                            data-testid="input-new-tender-rate"
                          />
                        </td>
                        <td className="px-1">
                          <Input
                            value={newRowData.costRate}
                            onChange={(e) => setNewRowData(prev => ({ ...prev, costRate: e.target.value }))}
                            onKeyDown={(e) => handleNewRowKeyDown(e, true)}
                            className="border-0 focus-visible:ring-1 h-auto py-0 text-sm text-right font-mono bg-white"
                            style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}
                            placeholder="0.00"
                            type="number"
                            step="0.01"
                            data-testid="input-new-cost-rate"
                          />
                        </td>
                      </tr>
                    )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border p-3 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              {!showNewRow ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowNewRow(true);
                      setSelectedCell(null);
                      setEditingCell(null);
                    }}
                    variant="outline"
                    data-testid="button-add-resource-rate"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Resource Rate
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowImportDialog(true)}
                    variant="outline"
                    data-testid="button-import-from-excel"
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Import from Excel
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowNewRow(false);
                    setNewRowData({ resourceTypeId: '', code: '', description: '', unit: '', tenderRate: '', costRate: '' });
                  }}
                  data-testid="button-cancel-add"
                >
                  Cancel
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{rates.length} rate{rates.length !== 1 ? 's' : ''}</span>
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-primary/20 transition-colors"
            onMouseDown={handleMouseDown}
            style={{ 
              clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
            }}
            data-testid="resize-handle-resource-rates"
          />
        </div>
      </Draggable>

      {/* Import Dialog */}
      <ResourceRatesImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        projectId={projectId}
        onImportComplete={() => {
          queryClient.invalidateQueries({
            queryKey: ['/api/projects', projectId, 'resource-rates'],
          });
        }}
      />
    </div>
  );
}
