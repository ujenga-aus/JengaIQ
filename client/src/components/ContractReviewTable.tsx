import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Trash2, Bell, Filter, FileText, Wifi, WifiOff, Sparkles, ListChecks, CheckCircle2, Columns3, FilePlus, Eraser, Clock, MessageSquare, Loader2, XCircle, FileDown, FileSearch } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ImportContractDialog } from "./ImportContractDialog";
import { useContractReviewWebSocket } from "@/hooks/useContractReviewWebSocket";
import { Badge } from "@/components/ui/badge";
import { TextDiff } from "./TextDiff";
import { ApprovalDialog } from "./ApprovalDialog";
import { CellChatDialog } from "./CellChatDialog";
import { ContractNoticesDialog } from "./ContractNoticesDialog";
import { ContractViewerDialog } from "./ContractViewerDialog";
import { useCompany } from "@/contexts/CompanyContext";
import { parseTOC, isClauseNumber, CLAUSE_NUMBER_PATTERN } from "@/lib/tocParser";
import { ClauseTooltip } from "./ClauseTooltip";
import { useClauseTooltips } from "@/hooks/useClauseTooltips";

interface ContractReviewTableProps {
  projectId: string;
  projectName: string;
  templateId: string;
  templateVersion: string;
  templateFileName: string;
  businessUnitId?: string;
}

export function ContractReviewTable({
  projectId,
  projectName,
  templateId,
  templateVersion,
  templateFileName,
  businessUnitId,
}: ContractReviewTableProps) {
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAiAnalyzeDialogOpen, setIsAiAnalyzeDialogOpen] = useState(false);
  const [isAiReviewMenuOpen, setIsAiReviewMenuOpen] = useState(false);
  const [clearExistingAiContent, setClearExistingAiContent] = useState(true);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingSingleRow, setAnalyzingSingleRow] = useState<number | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{ 
    current: number; 
    total: number; 
    percentage: number;
    status?: 'reading' | 'analyzing' | 'milestone' | 'error';
    fileName?: string;
    milestone?: string;
    estimatedSecondsRemaining?: number;
    errorMessage?: string;
  }>({ current: 0, total: 0, percentage: 0 });
  const [completionSummary, setCompletionSummary] = useState<{
    open: boolean;
    totalRows: number;
    analyzedCount: number;
    errorCount: number;
    actualDurationSeconds: number;
    projectedDurationSeconds: number;
  } | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedApprovalRow, setSelectedApprovalRow] = useState<{ rowId: string; rowIndex: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<{ columnId: string; startX: number; startWidth: number } | null>(null);
  const [scrollbarVisible, setScrollbarVisible] = useState(true); // Force true for now
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement>>({});
  const [editingCells, setEditingCells] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null); // Cell actively being edited
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('contractReview_hiddenColumns');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [contractNoticesOpen, setContractNoticesOpen] = useState(false);
  const [contractViewerOpen, setContractViewerOpen] = useState(false);
  const [contractViewerData, setContractViewerData] = useState<{
    revisionId: string;
    pdfUrl: string;
    title: string;
  } | null>(null);
  const [cellChatDialog, setCellChatDialog] = useState<{
    open: boolean;
    cellId: string;
    rowIndex: number;
    columnName: string;
    currentValue: string;
  } | null>(null);
  const [singleRowAnalysisDialog, setSingleRowAnalysisDialog] = useState<{
    open: boolean;
    rowNumber: number;
    status: 'analyzing' | 'success' | 'error';
    errorMessage?: string;
  } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  
  // Note: Locked cell styling now uses Tailwind dark mode classes instead of inline styles

  // Fetch business unit to get company ID
  const { data: businessUnit } = useQuery<any>({
    queryKey: ['/api/business-units', businessUnitId],
    enabled: !!businessUnitId,
    refetchOnWindowFocus: false,
  });

  // WebSocket for real-time updates - DISABLED due to constant reconnection causing focus/typing issues
  // TODO: Fix WebSocket reconnection loop in useContractReviewWebSocket hook
  // Backend broadcasting works correctly, frontend has stability issue
  // const { isConnected, lockCell, unlockCell, isCellLocked, getCellLockOwner } = useContractReviewWebSocket(selectedRevisionId, projectId);
  const isConnected = false;
  const lockCell = () => {};
  const unlockCell = () => {};
  const isCellLocked = () => false;
  const getCellLockOwner = () => undefined;

  // Fetch revisions
  const { data: revisions, isLoading: isLoadingRevisions } = useQuery<any[]>({
    queryKey: ['/api/projects', projectId, 'contract-review', 'revisions'],
    enabled: !!projectId,
    refetchOnWindowFocus: false,
  });

  // Fetch rows for selected revision (includes both snapshot cells and revision cells)
  const { data: rows, isLoading: isLoadingRows } = useQuery<any[]>({
    queryKey: selectedRevisionId ? ['/api/contract-review/revisions', selectedRevisionId, 'rows'] : [],
    enabled: !!selectedRevisionId,
    refetchOnWindowFocus: false,
  });

  // Fetch template column configs
  const { data: templateColumns } = useQuery<any[]>({
    queryKey: ['/api/templates', templateId, 'columns'],
    enabled: !!templateId,
    refetchOnWindowFocus: false,
  });

  // Fetch employment roles for DOA lookup
  const companyId = businessUnit?.companyId;
  const { data: employmentRoles = [] } = useQuery<any[]>({
    queryKey: companyId ? [`/api/employment-roles?companyId=${companyId}`] : [],
    enabled: !!companyId,
    refetchOnWindowFocus: false,
  });

  // Fetch TOC data for clause heading tooltips
  const { data: tocData, isLoading: isLoadingTOC, error: tocError } = useQuery<{ tocText: string } | null>({
    queryKey: selectedRevisionId ? [`/api/contract-review/revisions/${selectedRevisionId}/toc-chunk`] : [],
    enabled: !!selectedRevisionId,
    refetchOnWindowFocus: false,
    retry: false, // Don't retry if TOC not available
  });

  // Parse TOC into clause map for quick lookups (memoized for performance)
  // Note: If parsing hasn't completed (409 error), clauseMap will be empty and tooltips won't appear
  const clauseMap = useMemo(() => {
    if (!tocData?.tocText) {
      return new Map<string, string>();
    }
    return parseTOC(tocData.tocText);
  }, [tocData?.tocText]);

  // Initialize clause tooltip system using shared hook
  const tableContainerRef = useRef<HTMLTableSectionElement>(null);
  const { tooltip: clauseTooltip, registerContainer } = useClauseTooltips({
    clauseMap,
    enabled: clauseMap.size > 0,
  });

  // Register table container for tooltip detection
  useEffect(() => {
    if (tableContainerRef.current) {
      return registerContainer(tableContainerRef.current);
    }
  }, [registerContainer]);

  // Get current revision for building columns
  const currentRevision = revisions?.find((r: any) => r.id === selectedRevisionId);

  // Get selected template columns from current revision
  const selectedTemplateColumnIds = currentRevision?.selectedTemplateColumnIds || [];
  
  // LEFT SECTION: Read-only template columns (filtered by selectedTemplateColumnIds)
  const readOnlyTemplateColumns = templateColumns?.filter(c => 
    selectedTemplateColumnIds.includes(c.id)
  ).map(c => ({ 
    ...c, 
    source: 'template', 
    locked: true 
  })) || [];

  // RIGHT SECTION: Editable review work columns (Summary Position, Clause Ref, Notes)
  const reviewWorkColumns: any[] = [];
  const reviewWorkColumnHeaders = new Set<string>();
  
  if (rows && rows.length > 0) {
    for (const row of rows) {
      if (row.revisionCells) {
        for (const cell of row.revisionCells) {
          if (cell.columnKind === 'review_work' && !reviewWorkColumnHeaders.has(cell.columnHeader)) {
            reviewWorkColumnHeaders.add(cell.columnHeader);
            reviewWorkColumns.push({
              id: `review_${cell.columnHeader.toLowerCase().replace(/\s+/g, '_')}`,
              columnHeader: cell.columnHeader,
              source: 'review_work',
              locked: false,
              orderIndex: reviewWorkColumns.length + 1000,
            });
          }
        }
      }
    }
  }

  // Custom ordering: Summary Position of Document → AI Proposed Mitigation → Cl. Ref → Others
  const customColumnOrder = [
    'Summary Position of Document',
    'AI Proposed Mitigation',
    'Cl. Ref',
  ];

  reviewWorkColumns.sort((a, b) => {
    const aIndex = customColumnOrder.indexOf(a.columnHeader);
    const bIndex = customColumnOrder.indexOf(b.columnHeader);
    
    // If both are in custom order, sort by custom order
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    // If only a is in custom order, a comes first
    if (aIndex !== -1) return -1;
    // If only b is in custom order, b comes first
    if (bIndex !== -1) return 1;
    // Otherwise maintain original order
    return a.orderIndex - b.orderIndex;
  });

  // Re-assign orderIndex after sorting
  reviewWorkColumns.forEach((col, index) => {
    col.orderIndex = 1000 + index;
  });

  // Find the Comply column index to insert Status right after it
  const complyColumnIndex = reviewWorkColumns.findIndex(
    c => c.columnHeader.toLowerCase() === 'comply'
  );
  
  // Insert calculated Status column right after Comply
  const statusColumn = {
    id: 'calculated_status',
    columnHeader: 'Status',
    source: 'calculated',
    locked: true,
    orderIndex: complyColumnIndex >= 0 ? reviewWorkColumns[complyColumnIndex].orderIndex + 0.5 : 999,
  };
  
  // Define approval display columns (after Status)
  // Consolidated into a single column that shows all approval information in aligned rows
  const approvalDisplayColumns = [
    {
      id: 'approval_consolidated',
      columnHeader: 'DOA Approvals',
      source: 'approval_consolidated',
      locked: true,
      orderIndex: 10000,
    },
  ];

  // Build unified table: template columns + review work columns + Status (after Comply) + approval columns
  const allColumnsBase = [
    ...readOnlyTemplateColumns,
    ...reviewWorkColumns,
    ...(complyColumnIndex >= 0 ? [statusColumn] : []), // Only add Status if Comply exists
    ...approvalDisplayColumns,
  ];

  // Filter out hidden columns
  const allColumns = allColumnsBase.filter(col => !hiddenColumns.has(col.columnHeader));

  // Select active revision by default
  useEffect(() => {
    if (revisions && revisions.length > 0 && !selectedRevisionId) {
      const activeRevision = revisions.find((r: any) => r.status === 'active');
      if (activeRevision) {
        setSelectedRevisionId(activeRevision.id);
      } else {
        setSelectedRevisionId(revisions[0].id);
      }
    }
  }, [revisions, selectedRevisionId]);

  // Auto-resize textareas when data loads
  useEffect(() => {
    if (rows && rows.length > 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach((textarea) => {
          textarea.style.height = 'auto';
          textarea.style.height = textarea.scrollHeight + 'px';
        });
      }, 100);
    }
  }, [rows]);

  // Auto-focus first cell when rows load (Excel-like behavior) - Pure DOM, no state!
  useEffect(() => {
    if (rows && rows.length > 0 && allColumns && allColumns.length > 0 && document.activeElement?.tagName === 'BODY') {
      // Focus first visible column in first row (allColumns already filtered for hidden)
      requestAnimationFrame(() => {
        const firstColId = allColumns[0].id;
        const firstRowIndex = 0;
        
        const cellElement = document.querySelector(
          `[data-column-id="${firstColId}"][data-row-index="${firstRowIndex}"]`
        ) as HTMLElement;
        
        if (cellElement) {
          cellElement.focus({ preventScroll: true });
        }
      });
    }
  }, [rows, allColumns]);

  // Load column widths from localStorage
  useEffect(() => {
    if (templateId) {
      const saved = localStorage.getItem(`contract-review-column-widths-${templateId}`);
      if (saved) {
        try {
          setColumnWidths(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse saved column widths:', e);
        }
      }
    }
  }, [templateId]);

  // Save column widths to localStorage
  useEffect(() => {
    if (templateId && Object.keys(columnWidths).length > 0) {
      localStorage.setItem(`contract-review-column-widths-${templateId}`, JSON.stringify(columnWidths));
    }
  }, [columnWidths, templateId]);

  // Handle column resize
  const handleMouseDown = (columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[columnId] || 150;
    setResizing({ columnId, startX, startWidth });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing) return;
    const diff = e.clientX - resizing.startX;
    const newWidth = Math.max(100, resizing.startWidth + diff);
    setColumnWidths(prev => ({
      ...prev,
      [resizing.columnId]: newWidth,
    }));
  };

  const handleMouseUp = () => {
    setResizing(null);
  };

  // Add/remove event listeners for resize
  useEffect(() => {
    if (resizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizing]);

  // Recalculate row heights when column widths change
  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) {
      // Small delay to ensure DOM has updated with new widths
      setTimeout(() => {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach((textarea) => {
          textarea.style.height = 'auto';
          textarea.style.height = textarea.scrollHeight + 'px';
        });
      }, 50);
    }
  }, [columnWidths]);

  // Sync horizontal scroll between table and sticky scrollbar
  useEffect(() => {
    // Use setTimeout to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const tableContainer = document.getElementById('table-scroll-container');
      const scrollbar = document.getElementById('sticky-scrollbar');
      
      if (!tableContainer || !scrollbar) {
        console.log('[Scroll] Elements not found:', { tableContainer: !!tableContainer, scrollbar: !!scrollbar });
        return;
      }

      const handleTableScroll = () => {
        scrollbar.scrollLeft = tableContainer.scrollLeft;
      };

      const handleScrollbarScroll = () => {
        tableContainer.scrollLeft = scrollbar.scrollLeft;
      };

      tableContainer.addEventListener('scroll', handleTableScroll);
      scrollbar.addEventListener('scroll', handleScrollbarScroll);

      console.log('[Scroll] Event listeners attached');

      return () => {
        tableContainer.removeEventListener('scroll', handleTableScroll);
        scrollbar.removeEventListener('scroll', handleScrollbarScroll);
      };
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [scrollbarVisible, rows]); // Re-run when scrollbar visibility or rows change

  // Update scrollbar width when rows load
  useEffect(() => {
    const updateScrollbarWidth = () => {
      const tableContainer = document.getElementById('table-scroll-container');
      if (tableContainer) {
        setTableScrollWidth(tableContainer.scrollWidth);
        console.log('[Scroll] Width updated:', tableContainer.scrollWidth);
      }
    };

    // Update after render
    const timeoutId = setTimeout(updateScrollbarWidth, 100);
    const timeoutId2 = setTimeout(updateScrollbarWidth, 500);
    
    window.addEventListener('resize', updateScrollbarWidth);
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      window.removeEventListener('resize', updateScrollbarWidth);
    };
  }, [rows, columnWidths]);

  const isCurrentRevisionActive = currentRevision?.status === 'active';
  
  // Calculate max revision number to enable delete only for latest revision
  const maxRevisionNumber = revisions && revisions.length > 0 
    ? Math.max(...revisions.map((r: any) => r.revisionNumber))
    : 0;
  const isMaxRevision = currentRevision?.revisionNumber === maxRevisionNumber;

  const handleCellEdit = (cellId: string, value: string) => {
    if (!isCurrentRevisionActive || !currentRevision) return;

    // Update local state immediately for responsive UI
    setEditingCells(prev => ({ ...prev, [cellId]: value }));

    // Clear existing debounce timer
    if (debounceTimers.current[cellId]) {
      clearTimeout(debounceTimers.current[cellId]);
    }

    // Debounce the API call (300ms delay - reduced from 800ms to prevent data loss)
    // This ensures changes are saved quickly, even if user closes dialog before blur
    debounceTimers.current[cellId] = setTimeout(async () => {
      try {
        await fetch(`/api/contract-review/revisions/${selectedRevisionId}/cells/${cellId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value,
            editedBy: 'Current User', // TODO: Get from auth context
          }),
        });

        // Remove from editing state after successful save
        setEditingCells(prev => {
          const newState = { ...prev };
          delete newState[cellId];
          return newState;
        });

        queryClient.invalidateQueries({ 
          queryKey: ['/api/contract-review/revisions', selectedRevisionId, 'rows'] 
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to update cell",
          variant: "destructive",
        });
      }
    }, 300);
  };

  const handleEnterEditMode = (cellId: string, initialValue: string) => {
    if (!isCurrentRevisionActive || isCellLocked?.(cellId)) return;

    setEditingCell(cellId);
    setEditingCells(prev => ({ ...prev, [cellId]: initialValue }));
    
    // Lock the cell via WebSocket
    if (lockCell) {
      lockCell(cellId);
    }

    // Focus the textarea after a short delay
    setTimeout(() => {
      const textarea = textareaRefs.current[cellId];
      if (textarea) {
        textarea.focus();
      }
    }, 50);
  };

  const handleExitEditMode = async (cellId: string, save: boolean = true) => {
    // Clear debounce timer if exists
    if (debounceTimers.current[cellId]) {
      clearTimeout(debounceTimers.current[cellId]);
      delete debounceTimers.current[cellId];
    }

    // Save changes if requested
    if (save && editingCells[cellId] !== undefined) {
      try {
        await fetch(`/api/contract-review/revisions/${selectedRevisionId}/cells/${cellId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: editingCells[cellId],
            editedBy: 'Current User', // TODO: Get from auth context
          }),
        });

        queryClient.invalidateQueries({ 
          queryKey: ['/api/contract-review/revisions', selectedRevisionId, 'rows'] 
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to save cell",
          variant: "destructive",
        });
      }
    }

    // Clear editing state
    setEditingCell(null);
    setEditingCells(prev => {
      const newState = { ...prev };
      delete newState[cellId];
      return newState;
    });

    // Unlock the cell via WebSocket
    if (unlockCell) {
      unlockCell(cellId);
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, cellId: string, isInEditMode: boolean, initialValue: string, currentCellElement: HTMLElement) => {
    if (isInEditMode) {
      // In edit mode - Excel-like behavior
      if (e.key === 'Enter') {
        if (e.altKey) {
          // Alt+Enter: Insert newline at cursor position
          e.preventDefault();
          const textarea = textareaRefs.current[cellId];
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentValue = editingCells[cellId] || '';
            const newValue = currentValue.substring(0, start) + '\n' + currentValue.substring(end);
            
            // Update the value
            handleCellEdit(cellId, newValue);
            
            // Restore cursor position after the newline
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = start + 1;
              textarea.focus();
            }, 0);
          }
        } else {
          // Enter alone: Save and move down (Excel-like)
          e.preventDefault();
          handleExitEditMode(cellId, true).then(() => {
            // Move to cell below
            if (e.shiftKey) {
              handleArrowNavigation('ArrowUp', currentCellElement);
            } else {
              handleArrowNavigation('ArrowDown', currentCellElement);
            }
          });
        }
      } else if (e.key === 'Tab') {
        // Tab: Save and move right/left
        e.preventDefault();
        handleExitEditMode(cellId, true).then(() => {
          if (e.shiftKey) {
            handleArrowNavigation('ArrowLeft', currentCellElement);
          } else {
            handleArrowNavigation('ArrowRight', currentCellElement);
          }
        });
      } else if (e.key === 'Escape') {
        // Escape: Exit without saving (cancel changes)
        e.preventDefault();
        handleExitEditMode(cellId, false); // false = don't save
        // Return focus to cell (use requestAnimationFrame for reliable DOM focus)
        requestAnimationFrame(() => {
          currentCellElement.focus({ preventScroll: true });
        });
      }
    }
  };

  // Pure DOM navigation - instant like Excel! Handles hidden columns and virtual columns.
  const handleArrowNavigation = (key: string, currentCellElement: HTMLElement) => {
    if (!rows || !allColumns) return;
    
    // Get position from data attributes (works for both real and virtual columns)
    const currentColumnId = currentCellElement.dataset.columnId;
    const currentRowIndexStr = currentCellElement.dataset.rowIndex;
    
    if (!currentColumnId || currentRowIndexStr === undefined) return;
    
    const currentRowIndex = parseInt(currentRowIndexStr, 10);
    const currentColIndex = allColumns.findIndex((col) => col.id === currentColumnId);
    
    if (currentColIndex === -1 || currentRowIndex < 0 || currentRowIndex >= rows.length) return;

    // Calculate new position in allColumns (already filtered for hidden columns)
    let newRowIndex = currentRowIndex;
    let newColIndex = currentColIndex;
    let foundValidCell = false;
    const maxAttempts = allColumns.length; // Prevent infinite loops
    let attempts = 0;

    while (!foundValidCell && attempts < maxAttempts) {
      const prevRowIndex = newRowIndex;
      const prevColIndex = newColIndex;
      
      // Calculate next position
      switch (key) {
        case 'ArrowUp':
          newRowIndex = Math.max(0, newRowIndex - 1);
          break;
        case 'ArrowDown':
          newRowIndex = Math.min(rows.length - 1, newRowIndex + 1);
          break;
        case 'ArrowLeft':
          newColIndex = Math.max(0, newColIndex - 1);
          break;
        case 'ArrowRight':
          newColIndex = Math.min(allColumns.length - 1, newColIndex + 1);
          break;
      }

      // Stop if position didn't change (already at boundary)
      if (newRowIndex === prevRowIndex && newColIndex === prevColIndex) {
        return;
      }

      // Check if this cell element exists in the DOM
      const newCol = allColumns[newColIndex];
      const newCellElement = document.querySelector(
        `[data-column-id="${newCol.id}"][data-row-index="${newRowIndex}"]`
      ) as HTMLElement;
      
      if (newCellElement) {
        // Found a valid cell, focus it
        foundValidCell = true;
        newCellElement.focus({ preventScroll: true });
        
        // Manually scroll to keep visible
        const container = document.getElementById('table-scroll-container');
        if (container) {
          const cellRect = newCellElement.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          
          // Scroll vertically if needed
          if (cellRect.top < containerRect.top) {
            container.scrollTop -= (containerRect.top - cellRect.top);
          } else if (cellRect.bottom > containerRect.bottom) {
            container.scrollTop += (cellRect.bottom - containerRect.bottom);
          }
          
          // Scroll horizontally if needed
          if (cellRect.left < containerRect.left) {
            container.scrollLeft -= (containerRect.left - cellRect.left);
          } else if (cellRect.right > containerRect.right) {
            container.scrollLeft += (cellRect.right - containerRect.right);
          }
        }
      } else {
        // Cell element not found in DOM
        // This shouldn't happen since allColumns is filtered and rendering matches it
        // But if it does, try next position for horizontal, stop for vertical
        attempts++;
        if (key === 'ArrowUp' || key === 'ArrowDown') {
          // For vertical navigation, stop if element missing
          return;
        }
        // For horizontal, continue loop to try next column
      }
    }
  };

  // Global keyboard handler for navigation - pure DOM, no state!
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (editingCell) return; // Don't navigate while editing

      const activeElement = document.activeElement as HTMLElement;
      // A cell is focused if it has both column and row data attributes
      const isCellFocused = activeElement?.hasAttribute('data-column-id') && activeElement?.hasAttribute('data-row-index');
      
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
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editingCell, rows]);

  const handleClearAllAiReview = async () => {
    if (!selectedRevisionId) return;

    setIsAiReviewMenuOpen(false);
    
    try {
      toast({
        title: "Clearing AI Review",
        description: "Removing all AI-generated content...",
      });

      const response = await fetch(`/api/contract-review/revisions/${selectedRevisionId}/clear-ai-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to clear AI content');
      }

      // Manual cache invalidation since WebSocket is disabled
      await queryClient.invalidateQueries({ 
        queryKey: [`/api/contract-review/revisions/${selectedRevisionId}/rows`] 
      });

      toast({
        title: "AI Review Cleared",
        description: "All AI-generated content has been removed.",
      });
    } catch (error) {
      console.error('Error clearing AI content:', error);
      toast({
        title: "Error",
        description: "Failed to clear AI review content.",
        variant: "destructive",
      });
    }
  };

  const handleAiAnalyze = async () => {
    if (!selectedRevisionId || !rows) return;

    setIsAnalyzing(true);
    setIsAiAnalyzeDialogOpen(false);
    setIsAiReviewMenuOpen(false);
    const totalRows = rows.length;
    setAnalysisProgress({ current: 0, total: totalRows, percentage: 0 });

    try {
      console.log('[AI] Starting batch analysis for revision:', selectedRevisionId);
      
      // Clear existing AI content if requested
      if (clearExistingAiContent) {
        console.log('[AI] Clearing existing AI commentary...');
        await fetch(`/api/contract-review/revisions/${selectedRevisionId}/clear-ai-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      }
      
      // Start the analysis job
      const response = await fetch(`/api/contract-review/revisions/${selectedRevisionId}/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[AI] Error response:', errorData);
        throw new Error(errorData.error || 'Failed to start AI analysis');
      }

      const { jobId } = await response.json();
      console.log('[AI] Job started:', jobId);

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressRes = await fetch(
            `/api/contract-review/revisions/${selectedRevisionId}/ai-analyze/${jobId}/progress`,
            { credentials: 'include' }
          );

          if (!progressRes.ok && progressRes.status !== 202) {
            console.error('[AI] Progress polling error:', progressRes.status);
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            return;
          }

          const progress = await progressRes.json();
          console.log('[AI] Progress update:', progress);

          // Calculate estimated time remaining (approximately 10 seconds per row)
          const remainingRows = progress.total - progress.current;
          const estimatedSecondsRemaining = remainingRows * 10;

          // Update UI
          setAnalysisProgress({
            current: progress.current,
            total: progress.total,
            percentage: progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0,
            status: 'analyzing',
            estimatedSecondsRemaining,
          });

          // Check job status
          if (progress.status === 'completed') {
            clearInterval(pollInterval);
            
            // Refresh data to show AI-generated content
            queryClient.invalidateQueries({ 
              queryKey: ['/api/contract-review/revisions', selectedRevisionId, 'rows'] 
            });

            // Calculate actual duration using backend's startTime
            const actualDurationSeconds = progress.startTime && progress.endTime
              ? Math.round((progress.endTime - progress.startTime) / 1000)
              : 0;
            const projectedDurationSeconds = totalRows * 10; // 10 seconds per row estimate

            // Show completion summary dialog
            setCompletionSummary({
              open: true,
              totalRows: progress.total,
              analyzedCount: progress.analyzedCount || 0,
              errorCount: progress.errorCount || 0,
              actualDurationSeconds,
              projectedDurationSeconds,
            });
            
            setIsAnalyzing(false);
            setAnalysisProgress({ current: 0, total: 0, percentage: 0 });
          } else if (progress.status === 'failed') {
            clearInterval(pollInterval);
            
            toast({
              title: "AI Analysis Failed",
              description: progress.error || "Could not complete AI analysis.",
              variant: "destructive",
            });
            setIsAnalyzing(false);
            setAnalysisProgress({ current: 0, total: 0, percentage: 0 });
          }
        } catch (pollError) {
          console.error('[AI] Polling error:', pollError);
        }
      }, 500); // Poll every 500ms
    } catch (error) {
      console.error('[AI] Analysis error:', error);
      const errorMessage = error instanceof Error ? error.message : "Could not complete AI analysis.";
      
      // Show error in the progress dialog
      setAnalysisProgress({
        current: 0,
        total: 0,
        percentage: 0,
        status: 'error',
        errorMessage,
      });
      
      // Auto-close error dialog after 5 seconds
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress({ current: 0, total: 0, percentage: 0 });
      }, 5000);
    }
  };

  const handleDeleteRevision = () => {
    if (!currentRevision) {
      toast({
        title: "Cannot delete",
        description: "No revision selected.",
        variant: "destructive",
      });
      return;
    }

    if (!isMaxRevision) {
      toast({
        title: "Cannot delete",
        description: "Only the latest revision can be deleted.",
        variant: "destructive",
      });
      return;
    }

    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteRevision = async () => {
    if (!selectedRevisionId) return;

    try {
      const response = await fetch(`/api/contract-review/revisions/${selectedRevisionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete revision');
      }

      toast({
        title: "Revision Deleted",
        description: "The revision and all related data have been permanently deleted.",
      });

      // Invalidate queries to refresh the revision list
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'contract-review', 'revisions']
      });

      // Reset to first available revision or null
      const updatedRevisions = revisions?.filter(r => r.id !== selectedRevisionId);
      if (updatedRevisions && updatedRevisions.length > 0) {
        setSelectedRevisionId(updatedRevisions[0].id);
      } else {
        setSelectedRevisionId(null);
      }

      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting revision:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete revision.",
        variant: "destructive",
      });
    }
  };

  const handleNotifyDOAs = () => {
    toast({
      title: "Notify DOAs",
      description: "DOA notifications will be sent.",
    });
  };


  // Handle single-row AI analysis
  const handleAnalyzeSingleRow = async (rowIndex: number, rowId: string) => {
    if (!selectedRevisionId) return;

    // Set loading state
    setAnalyzingSingleRow(rowIndex);

    // Show analyzing dialog
    setSingleRowAnalysisDialog({
      open: true,
      rowNumber: rowIndex + 1,
      status: 'analyzing',
    });

    try {
      const response = await fetch(`/api/contract-review/revisions/${selectedRevisionId}/rows/${rowIndex}/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'AI analysis failed' }));
        throw new Error(errorData.error || 'AI analysis failed');
      }

      const result = await response.json();

      // Refresh data to show AI-generated content
      queryClient.invalidateQueries({ 
        queryKey: ['/api/contract-review/revisions', selectedRevisionId, 'rows'] 
      });

      // Show success dialog
      setSingleRowAnalysisDialog({
        open: true,
        rowNumber: rowIndex + 1,
        status: 'success',
      });

      // Auto-close after 3 seconds
      setTimeout(() => {
        setSingleRowAnalysisDialog(null);
      }, 3000);
    } catch (error) {
      // Show error dialog with the actual error message
      setSingleRowAnalysisDialog({
        open: true,
        rowNumber: rowIndex + 1,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Could not analyze row',
      });

      // Auto-close after 5 seconds (longer for errors so user can read)
      setTimeout(() => {
        setSingleRowAnalysisDialog(null);
      }, 5000);
    } finally {
      // Clear loading state
      setAnalyzingSingleRow(null);
    }
  };

  // Export to Excel
  const handleExportToExcel = async () => {
    if (!rows || !currentRevision || !templateColumns) return;

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Contract Review');

    // Get selected template columns
    const selectedIds = currentRevision.selectedTemplateColumnIds || [];
    const readOnlyColumns = templateColumns.filter(c => selectedIds.includes(c.id)).map(c => ({ 
      ...c, 
      source: 'template', 
      locked: true 
    }));

    // Get review work columns
    const reviewColumns: any[] = [];
    const reviewHeaders = new Set<string>();
    
    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (row.revisionCells) {
          for (const cell of row.revisionCells) {
            if (cell.columnKind === 'review_work' && !reviewHeaders.has(cell.columnHeader)) {
              reviewHeaders.add(cell.columnHeader);
              reviewColumns.push({
                id: `review_${cell.columnHeader.toLowerCase().replace(/\s+/g, '_')}`,
                columnHeader: cell.columnHeader,
                source: 'review_work',
                locked: false,
              });
            }
          }
        }
      }
    }

    // Combine all columns and filter by visible columns only
    const allExportColumns = [...readOnlyColumns, ...reviewColumns].filter(
      col => !hiddenColumns.has(col.columnHeader)
    );

    // Add header row
    const headerRow = worksheet.addRow(allExportColumns.map(col => col.columnHeader));
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    rows.forEach((row) => {
      const rowData = allExportColumns.map(col => {
        // Find the cell value for this column
        let cellValue = '';
        
        if (col.source === 'template') {
          const snapshotCell = row.snapshotCells?.find(
            c => c.templateColumnConfigId === col.id
          );
          cellValue = snapshotCell?.value || '';
        } else {
          const revisionCell = row.revisionCells?.find(
            c => c.columnHeader === col.columnHeader && c.columnKind === 'review_work'
          );
          cellValue = revisionCell?.value || '';
        }
        
        return cellValue;
      });
      
      worksheet.addRow(rowData);
    });

    // Set column widths based on screen widths
    worksheet.columns.forEach((column, index) => {
      const col = allExportColumns[index];
      const screenWidth = columnWidths[col.id] || 150;
      // Convert pixels to Excel character width (rough approximation: 1 char ≈ 7 pixels)
      column.width = Math.max(10, Math.min(screenWidth / 7, 100));
    });

    // Generate file and trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}_Contract_Review_R${currentRevision.revisionNumber}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: `Contract review exported to Excel.`,
    });
  };

  // Export to Word
  const handleExportToWord = async () => {
    if (!rows || !currentRevision || !templateColumns) return;

    const docx = await import('docx');
    const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, AlignmentType } = docx;

    // Get selected template columns
    const selectedIds = currentRevision.selectedTemplateColumnIds || [];
    const readOnlyColumns = templateColumns.filter(c => selectedIds.includes(c.id)).map(c => ({ 
      ...c, 
      source: 'template', 
      locked: true 
    }));

    // Get review work columns
    const reviewColumns: any[] = [];
    const reviewHeaders = new Set<string>();
    
    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (row.revisionCells) {
          for (const cell of row.revisionCells) {
            if (cell.columnKind === 'review_work' && !reviewHeaders.has(cell.columnHeader)) {
              reviewHeaders.add(cell.columnHeader);
              reviewColumns.push({
                id: `review_${cell.columnHeader.toLowerCase().replace(/\s+/g, '_')}`,
                columnHeader: cell.columnHeader,
                source: 'review_work',
                locked: false,
              });
            }
          }
        }
      }
    }

    // Combine all columns and filter by visible columns only
    const allExportColumns = [...readOnlyColumns, ...reviewColumns].filter(
      col => !hiddenColumns.has(col.columnHeader)
    );

    // Calculate total width and proportional widths for visible columns
    const totalWidth = allExportColumns.reduce((sum, col) => {
      return sum + (columnWidths[col.id] || 150);
    }, 0);

    const columnWidthPercentages = allExportColumns.map(col => {
      const width = columnWidths[col.id] || 150;
      return Math.round((width / totalWidth) * 100);
    });

    // Create header row
    const headerCells = allExportColumns.map((col, index) => 
      new TableCell({
        children: [new Paragraph({ 
          children: [new docx.TextRun({ text: col.columnHeader, bold: true })]
        })],
        shading: { fill: 'E0E0E0' },
        width: {
          size: columnWidthPercentages[index],
          type: WidthType.PERCENTAGE,
        },
      })
    );

    // Create data rows
    const dataRows = rows.map(row => {
      const cells = allExportColumns.map((col, index) => {
        let cellValue = '';
        
        if (col.source === 'template') {
          const snapshotCell = row.snapshotCells?.find(
            c => c.templateColumnConfigId === col.id
          );
          cellValue = snapshotCell?.value || '';
        } else {
          const revisionCell = row.revisionCells?.find(
            c => c.columnHeader === col.columnHeader && c.columnKind === 'review_work'
          );
          cellValue = revisionCell?.value || '';
        }
        
        return new TableCell({
          children: [new Paragraph(cellValue)],
          width: {
            size: columnWidthPercentages[index],
            type: WidthType.PERCENTAGE,
          },
        });
      });
      
      return new TableRow({ children: cells });
    });

    // Create table
    const table = new Table({
      rows: [
        new TableRow({ children: headerCells }),
        ...dataRows
      ],
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
        insideVertical: { style: BorderStyle.SINGLE, size: 1 },
      },
    });

    // Create document
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: `${projectName} - Contract Review`,
            heading: docx.HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Revision ${currentRevision.revisionNumber} - ${currentRevision.status}`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }), // Empty line
          table,
        ],
      }],
    });

    // Generate file and trigger download
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}_Contract_Review_R${currentRevision.revisionNumber}.docx`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: `Contract review exported to Word.`,
    });
  };

  // Export to PDF
  const handleExportToPDF = async () => {
    if (!rows || !currentRevision || !templateColumns) return;

    const { Document, Page, Text, View, StyleSheet, pdf } = await import('@react-pdf/renderer');

    // Get selected template columns
    const selectedIds = currentRevision.selectedTemplateColumnIds || [];
    const readOnlyColumns = templateColumns.filter(c => selectedIds.includes(c.id)).map(c => ({ 
      ...c, 
      source: 'template', 
      locked: true 
    }));

    // Get review work columns
    const reviewColumns: any[] = [];
    const reviewHeaders = new Set<string>();
    
    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (row.revisionCells) {
          for (const cell of row.revisionCells) {
            if (cell.columnKind === 'review_work' && !reviewHeaders.has(cell.columnHeader)) {
              reviewHeaders.add(cell.columnHeader);
              reviewColumns.push({
                id: `review_${cell.columnHeader.toLowerCase().replace(/\s+/g, '_')}`,
                columnHeader: cell.columnHeader,
                source: 'review_work',
                locked: false,
              });
            }
          }
        }
      }
    }

    // Combine all columns and filter by visible columns only
    const allExportColumns = [...readOnlyColumns, ...reviewColumns].filter(
      col => !hiddenColumns.has(col.columnHeader)
    );

    // Calculate total width and proportional widths for visible columns
    const totalWidth = allExportColumns.reduce((sum, col) => {
      return sum + (columnWidths[col.id] || 150);
    }, 0);

    const columnWidthPercentages = allExportColumns.map(col => {
      const width = columnWidths[col.id] || 150;
      return `${(width / totalWidth * 100).toFixed(2)}%`;
    });

    // Create PDF styles
    const styles = StyleSheet.create({
      page: {
        paddingTop: 90,
        paddingBottom: 40,
        paddingHorizontal: 30,
        fontSize: 10,
      },
      header: {
        position: 'absolute',
        top: 20,
        left: 30,
        right: 30,
      },
      title: {
        fontSize: 14,
        marginBottom: 3,
        textAlign: 'center',
        fontWeight: 'bold',
      },
      subtitle: {
        fontSize: 10,
        marginBottom: 5,
        textAlign: 'center',
      },
      tableHeader: {
        position: 'absolute',
        top: 62,
        left: 30,
        right: 30,
      },
      tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f0f0f0',
        borderWidth: 1,
        borderColor: '#bfbfbf',
        fontWeight: 'bold',
      },
      table: {
        width: '100%',
      },
      tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#bfbfbf',
        borderLeftWidth: 1,
        borderLeftColor: '#bfbfbf',
        borderRightWidth: 1,
        borderRightColor: '#bfbfbf',
      },
      tableCell: {
        padding: 5,
        borderRightWidth: 1,
        borderRightColor: '#bfbfbf',
        fontSize: 7,
        flexWrap: 'wrap',
      },
      footer: {
        position: 'absolute',
        bottom: 20,
        left: 30,
        right: 30,
        textAlign: 'center',
        fontSize: 9,
        color: '#666',
      },
    });

    // Create PDF document
    const MyDocument = () => (
      <Document>
        <Page size="A4" orientation="landscape" style={styles.page}>
          {/* Fixed Header */}
          <View style={styles.header} fixed>
            <Text style={styles.title}>{projectName} - Contract Review</Text>
            <Text style={styles.subtitle}>
              Revision {currentRevision.revisionNumber} - {currentRevision.status}
            </Text>
          </View>

          {/* Fixed Table Header */}
          <View style={styles.tableHeader} fixed>
            <View style={styles.tableHeaderRow}>
              {allExportColumns.map((col, index) => (
                <View key={index} style={[styles.tableCell, { width: columnWidthPercentages[index] }]}>
                  <Text>{col.columnHeader}</Text>
                </View>
              ))}
            </View>
          </View>
          
          {/* Table Data */}
          <View style={styles.table}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.tableRow}>
                {allExportColumns.map((col, colIndex) => {
                  let cellValue = '';
                  
                  if (col.source === 'template') {
                    const snapshotCell = row.snapshotCells?.find(
                      c => c.templateColumnConfigId === col.id
                    );
                    cellValue = snapshotCell?.value || '';
                  } else {
                    const revisionCell = row.revisionCells?.find(
                      c => c.columnHeader === col.columnHeader && c.columnKind === 'review_work'
                    );
                    cellValue = revisionCell?.value || '';
                  }
                  
                  return (
                    <View key={colIndex} style={[styles.tableCell, { width: columnWidthPercentages[colIndex] }]}>
                      <Text>{cellValue}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Fixed Footer with Page Numbers */}
          <Text 
            style={styles.footer} 
            fixed
            render={({ pageNumber, totalPages }) => (
              `Page ${pageNumber} of ${totalPages}`
            )}
          />
        </Page>
      </Document>
    );

    // Generate PDF and trigger download
    const blob = await pdf(<MyDocument />).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}_Contract_Review_R${currentRevision.revisionNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: `Contract review exported to PDF.`,
    });
  };

  // Helper function to render cell content with clause tooltips
  // Uses shared useClauseTooltips hook for tooltip state management
  const renderCellContentWithTooltips = (text: string) => {
    // If no text or TOC data not available, return text without tooltips
    if (!text || clauseMap.size === 0) {
      return <>{text}</>;
    }

    // Use lookahead/lookbehind instead of word boundaries to support parenthetical suffixes
    // (?<![A-Za-z0-9]) - not preceded by alphanumeric (prevents matching middle of words)
    // (?![A-Za-z0-9]) - not followed by alphanumeric (allows punctuation/space after parentheses)
    const clausePattern = new RegExp(`(?<![A-Za-z0-9])(${CLAUSE_NUMBER_PATTERN})(?![A-Za-z0-9])`, 'g');
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;
    let keyIndex = 0;

    while ((match = clausePattern.exec(text)) !== null) {
      const clauseNumber = match[1];
      
      // Only highlight if we have this clause in our map
      if (isClauseNumber(clauseNumber) && clauseMap.has(clauseNumber)) {
        // Add text before the clause number (even if empty when match.index === 0)
        const textBefore = text.substring(lastIndex, match.index);
        if (textBefore) {
          parts.push(textBefore);
        }

        // Add the clause number as a hoverable span with data attribute
        // Tooltip is managed by shared useClauseTooltips hook
        parts.push(
          <span
            key={`clause-${keyIndex++}`}
            data-clause-number={clauseNumber}
            className="text-purple-600 dark:text-purple-400 underline decoration-dotted cursor-help"
          >
            {clauseNumber}
          </span>
        );

        lastIndex = match.index + match[0].length;
      }
    }

    // Add any remaining text after the last match
    const textAfter = text.substring(lastIndex);
    if (textAfter) {
      parts.push(textAfter);
    }

    // Return parts if any clauses were found, otherwise return original text
    return parts.length > 0 ? <>{parts}</> : <>{text}</>;
  };

  // Helper function to toggle column visibility
  const toggleColumnVisibility = (columnHeader: string) => {
    setHiddenColumns(prev => {
      const newHidden = new Set(prev);
      if (newHidden.has(columnHeader)) {
        newHidden.delete(columnHeader);
      } else {
        newHidden.add(columnHeader);
      }
      // Persist to localStorage
      localStorage.setItem('contractReview_hiddenColumns', JSON.stringify(Array.from(newHidden)));
      return newHidden;
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <ImportContractDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        projectId={projectId}
        templateId={templateId}
        onSuccess={(newRevisionId: string) => {
          queryClient.invalidateQueries({ 
            queryKey: ['/api/projects', projectId, 'contract-review', 'revisions'] 
          });
          // Auto-select the newly created revision
          setSelectedRevisionId(newRevisionId);
        }}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-revision">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Revision</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Revision {currentRevision?.revisionNumber}? 
              This will permanently delete all associated data including rows, cells, and the uploaded contract document. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteRevision}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Revision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Revision No:</label>
            <Select
              value={selectedRevisionId || ''}
              onValueChange={setSelectedRevisionId}
            >
              <SelectTrigger className="w-32 h-8" data-testid="select-revision">
                <SelectValue placeholder="Select revision" />
              </SelectTrigger>
              <SelectContent>
                {revisions?.map((rev: any) => (
                  <SelectItem key={rev.id} value={rev.id}>
                    {rev.revisionNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevisionDialogOpen(true)}
            className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20 font-semibold"
            data-testid="button-revision"
          >
            <FilePlus className="h-4 w-4 mr-2" />
            Revision
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNotifyDOAs}
            className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/20 font-semibold"
            data-testid="button-notify-doas"
          >
            <Bell className="h-4 w-4 mr-2" />
            Notify DOAs
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setContractNoticesOpen(true)}
            disabled={!selectedRevisionId}
            className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
            data-testid="button-contract-notices"
          >
            <Bell className="h-4 w-4 mr-2" />
            Notices
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selectedRevisionId && currentRevision) {
                setContractViewerData({
                  revisionId: selectedRevisionId,
                  pdfUrl: `/api/contract-review/revisions/${selectedRevisionId}/download`,
                  title: `Contract Viewer - ${currentRevision.revisionNumber}`,
                });
                setContractViewerOpen(true);
              }
            }}
            disabled={!selectedRevisionId || !currentRevision?.clientContractFileKey}
            className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20"
            data-testid="button-view-contract"
          >
            <FileSearch className="h-4 w-4 mr-2" />
            View Contract
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAiReviewMenuOpen(true)}
            disabled={!isCurrentRevisionActive || isAnalyzing}
            className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20"
            data-testid="button-ai-analyze"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isAnalyzing 
              ? (analysisProgress.status === 'reading' 
                  ? 'Reading document...' 
                  : analysisProgress.status === 'milestone'
                    ? 'Preparing...'
                    : `Analysing... ${analysisProgress.percentage}%`)
              : 'AI Review'}
          </Button>

          {isAnalyzing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {analysisProgress.status === 'reading' ? (
                <span>Reading {analysisProgress.fileName || 'contract document'}...</span>
              ) : analysisProgress.status === 'milestone' ? (
                <span>{analysisProgress.milestone || 'Preparing analysis...'}</span>
              ) : analysisProgress.total > 0 ? (
                <span>Processing row {analysisProgress.current} of {analysisProgress.total}</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportDialogOpen(true)}
            disabled={!rows || rows.length === 0}
            className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
            data-testid="button-export"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Export
          </Button>

          <Popover open={showColumnSelector} onOpenChange={setShowColumnSelector}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20 font-semibold"
                data-testid="button-columns"
              >
                <Columns3 className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Show/Hide Columns</h4>
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {allColumnsBase.map((col) => (
                    <div key={col.columnHeader} className="flex items-center space-x-2">
                      <Checkbox
                        id={`col-${col.columnHeader}`}
                        checked={!hiddenColumns.has(col.columnHeader)}
                        onCheckedChange={() => toggleColumnVisibility(col.columnHeader)}
                        data-testid={`checkbox-column-${col.columnHeader}`}
                      />
                      <label
                        htmlFor={`col-${col.columnHeader}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {col.columnHeader}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant={showFilter ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilter(!showFilter)}
            className="bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20 hover:bg-gray-500/20 font-semibold"
            data-testid="button-show-filter"
          >
            <Filter className="h-4 w-4 mr-2" />
            Show Filter
          </Button>
        </div>
      </div>

      {/* AI Analysis Progress Bar */}
      {isAnalyzing && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-pulse" />
                  <span className="font-medium text-purple-600 dark:text-purple-400">
                    AI Analysis in Progress
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {analysisProgress.total > 0 && (
                    <>
                      <span className="font-medium">
                        {analysisProgress.current} of {analysisProgress.total} rows
                      </span>
                      {analysisProgress.estimatedSecondsRemaining !== undefined && analysisProgress.estimatedSecondsRemaining > 0 && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>
                            ~{Math.ceil(analysisProgress.estimatedSecondsRemaining / 60)} min remaining
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium text-purple-600 dark:text-purple-400">
                    {analysisProgress.percentage}%
                  </span>
                </div>
                <Progress value={analysisProgress.percentage} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Panel */}
      {showFilter && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Item Number</label>
                <Input placeholder="Filter by item number..." data-testid="input-filter-item" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Compliance Status</label>
                <Select>
                  <SelectTrigger data-testid="select-filter-compliance">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="compliant">Compliant</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="non-compliant">Non-compliant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Search Text</label>
                <Input placeholder="Search in notes, comments..." data-testid="input-filter-search" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Revision State */}
      {!revisions || revisions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Contract Uploaded</h3>
            <p className="text-muted-foreground mb-4">
              Upload a client contract to start the review process.
            </p>
            <Button onClick={() => setIsImportDialogOpen(true)} data-testid="button-upload-first">
              <Upload className="h-4 w-4 mr-2" />
              Upload Contract
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* LEGACY: Unified Contract Review Table */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
              <div className="relative flex-1 overflow-hidden">
                <div 
                  className="overflow-x-auto overflow-y-auto" 
                  id="table-scroll-container"
                  style={{ 
                    height: 'calc(100vh - 300px)',
                    maxHeight: 'calc(100vh - 300px)'
                  }}
                >
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>
                      <col style={{ width: '50px' }} />
                      {allColumns.map((col) => (
                        <col
                          key={col.id}
                          style={{
                            width: `${columnWidths[col.id] || 150}px`,
                          }}
                        />
                      ))}
                    </colgroup>
                    <thead 
                      className="sticky top-0 z-20 border-b"
                      style={{ backgroundColor: 'hsl(var(--table-header-bg))' }}
                    >
                    <tr>
                      <th 
                        className="px-4 py-1 text-center text-sm font-medium border-r border-border"
                        style={{ color: 'hsl(var(--table-header-fg))' }}
                      >
                        Item<br/>No.
                      </th>
                      {allColumns.map((col) => (
                        <th 
                          key={col.id} 
                          className="relative px-4 py-1 text-center text-sm font-medium border-r border-border"
                          style={{ color: 'hsl(var(--table-header-fg))' }}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span>
                              {col.columnHeader}
                            </span>
                          </div>
                          <div
                            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary"
                            onMouseDown={(e) => handleMouseDown(col.id, e)}
                            data-testid={`resize-handle-${col.id}`}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody ref={tableContainerRef}>
                    {isLoadingRows ? (
                      <tr>
                        <td colSpan={allColumns.length + 1} className="px-4 py-8 text-center text-muted-foreground">
                          Loading contract review data...
                        </td>
                      </tr>
                    ) : !rows || rows.length === 0 ? (
                      <tr>
                        <td colSpan={allColumns.length + 1} className="px-4 py-8 text-center text-muted-foreground">
                          No data available for this revision.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row: any, rowIndex: number) => {
                        const canEdit = isCurrentRevisionActive;
                        
                        return (
                          <ContextMenu key={row.id}>
                            <ContextMenuTrigger asChild>
                              <tr className="border-t hover:bg-muted/30">
                                <td className="px-3 py-1 text-sm font-mono border-r border-border align-top">
                                  {analyzingSingleRow === row.rowIndex ? (
                                    <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      <span>{rowIndex + 1}</span>
                                    </div>
                                  ) : (
                                    <span>{rowIndex + 1}</span>
                                  )}
                                </td>
                                {allColumns.map((col) => {
                              // Find cell based on column source
                              let cell;
                              let latestApproval = null;
                              
                              // Get latest approval (first in array since they're ordered newest first)
                              if (row.approvals && row.approvals.length > 0) {
                                latestApproval = row.approvals[0];
                              }
                              
                              if (col.source === 'approval' || col.source === 'approval_action') {
                                // Approval columns are virtual (no actual cell in DB)
                                cell = null;
                              } else if (col.source === 'calculated') {
                                // Calculated columns are virtual (no actual cell in DB)
                                cell = null;
                              } else if (col.source === 'template') {
                                cell = row.snapshotCells?.find((c: any) => c.templateColumnConfigId === col.id);
                              } else if (col.source === 'review_work') {
                                // Review work columns match by header since columnConfigId is null
                                cell = row.revisionCells?.find((c: any) => 
                                  c.columnKind === 'review_work' && c.columnHeader === col.columnHeader
                                );
                              } else {
                                // Template editable columns match by columnConfigId
                                cell = row.revisionCells?.find((c: any) => c.columnConfigId === col.id);
                              }
                              
                              const isEditable = !col.locked && canEdit;
                              // Check if this cell was AI-generated based on database field
                              const isAiGenerated = cell?.lastEditedBy === 'AI Assistant';
                              // Check if this is the Summary Position column
                              const isSummaryColumn = col.columnHeader.toLowerCase().includes('summary position');
                              // Check if this is the Approval Required column
                              const isApprovalColumn = col.columnHeader.toLowerCase().includes('approval');
                              // Check if this cell has been edited by a user (has originalAiValue and not AI-edited)
                              const hasUserEdits = cell?.originalAiValue && cell?.lastEditedBy && cell.lastEditedBy !== 'AI Assistant';
                              
                              // Get employment role title if this cell has an employmentRoleId
                              const employmentRoleTitle = cell?.employmentRoleId 
                                ? employmentRoles.find((r: any) => r.id === cell.employmentRoleId)?.title 
                                : null;
                              
                              // Find the Comply cell value
                              const complyCell = row.revisionCells?.find((c: any) => 
                                c.columnKind === 'review_work' && c.columnHeader.toLowerCase() === 'comply'
                              );
                              const complyValue = complyCell?.value || '';
                              
                              // Calculate Status based on Comply value and approval status
                              let calculatedStatus = 'Pending';
                              if (complyValue.toLowerCase() === 'yes') {
                                calculatedStatus = 'Approved';
                              } else if (complyValue.toLowerCase() === 'no') {
                                // Check if there's an approved approval
                                const hasApprovedStatus = row.approvals?.some((a: any) => 
                                  a.status.toLowerCase() === 'approved'
                                );
                                calculatedStatus = hasApprovedStatus ? 'Approved' : 'Pending';
                              }
                              
                              // Get display value based on column source
                              let displayValue;
                              if (col.source === 'calculated' && col.id === 'calculated_status') {
                                // Calculated Status column
                                displayValue = calculatedStatus;
                              } else if (col.source === 'approval') {
                                // Approval columns get their data from the latest approval
                                if (col.id === 'approval_proposed_departure') {
                                  displayValue = latestApproval?.proposedDeparture || '-';
                                } else if (col.id === 'approval_doa_comments') {
                                  displayValue = latestApproval?.reviewComments || '-';
                                } else {
                                  displayValue = '-';
                                }
                              } else if (col.source === 'approval_action') {
                                // Approve/Reject button column
                                displayValue = '';
                              } else {
                                displayValue = employmentRoleTitle || cell?.value || '-';
                              }
                              
                              // Determine approval status color
                              const approvalColorClass = isApprovalColumn && cell?.value 
                                ? cell.value.toLowerCase() === 'yes' 
                                  ? 'text-red-600 dark:text-red-400 font-semibold' 
                                  : cell.value.toLowerCase() === 'no'
                                  ? 'text-green-600 dark:text-green-400 font-semibold'
                                  : ''
                                : '';
                              
                              // Check if cell is locked by another user
                              const cellLockOwner = cell ? getCellLockOwner?.(cell.id) : undefined;
                              const isCellLockedByOther = cell ? isCellLocked?.(cell.id) : false;
                              const isInEditMode = cell && editingCell === cell.id;
                              
                              // Single click handler - just focus the cell (pure DOM!)
                              const handleCellClick = (e: React.MouseEvent) => {
                                if (!cell) return;
                                if (isInEditMode) return; // Already editing
                                
                                // Focus the cell for navigation (pure DOM, no state!)
                                const tdElement = (e.currentTarget as HTMLElement);
                                if (tdElement) {
                                  tdElement.focus({ preventScroll: true });
                                }
                              };
                              
                              // Check if cell has AI analysis (for chat icon)
                              const hasAiAnalysis = isAiGenerated || (cell?.originalAiValue != null && cell.originalAiValue !== '');
                              
                              // Render chat icon button (shown for all AI-analyzed cells)
                              const chatIconButton = hasAiAnalysis && cell ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCellChatDialog({
                                      open: true,
                                      cellId: cell.id,
                                      rowIndex: row.rowIndex,
                                      columnName: col.columnHeader,
                                      currentValue: cell.value || '',
                                    });
                                  }}
                                  data-testid={`button-chat-${row.id}-${col.id}`}
                                >
                                  <MessageSquare className="h-3 w-3" />
                                </Button>
                              ) : null;
                              
                              // Show TextDiff for user-edited cells (read-only view), otherwise show textarea/dropdown if in edit mode
                              // Special rendering for calculated status and approval columns
                              const cellContent = col.source === 'calculated' && col.id === 'calculated_status' ? (
                                <div 
                                  className={`w-full px-3 py-1 text-sm whitespace-pre-wrap relative select-none`}
                                  data-testid={`cell-${row.id}-${col.id}`}
                                >
                                  <Badge 
                                    variant={
                                      calculatedStatus.toLowerCase() === 'approved' ? 'default' : 
                                      calculatedStatus.toLowerCase() === 'rejected' ? 'destructive' : 
                                      'secondary'
                                    }
                                    className={
                                      calculatedStatus.toLowerCase() === 'approved' 
                                        ? 'capitalize font-bold' 
                                        : calculatedStatus.toLowerCase() === 'pending'
                                        ? 'capitalize text-orange-700 dark:text-orange-400'
                                        : 'capitalize'
                                    }
                                  >
                                    {calculatedStatus}
                                  </Badge>
                                </div>
                              ) : col.id === 'approval_consolidated' ? (
                                <div 
                                  className={`w-full px-3 py-1 text-sm relative select-none overflow-hidden`}
                                  data-testid={`cell-${row.id}-${col.id}`}
                                >
                                  {row.approvals && row.approvals.length > 0 ? (
                                    <div className="space-y-2">
                                      {row.approvals.map((approval: any, idx: number) => {
                                        const versionNumber = row.approvals.length - idx;
                                        const bgColor = idx % 2 === 0 ? 'bg-muted/30' : 'bg-transparent';
                                        
                                        return (
                                          <div 
                                            key={`${row.id}-approval-row-${idx}`}
                                            className={`flex flex-col gap-2 p-2 border border-border/50 rounded ${bgColor}`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className="text-xs font-semibold text-muted-foreground shrink-0">
                                                v{versionNumber}
                                              </div>
                                              <Badge 
                                                variant={
                                                  approval.status.toLowerCase() === 'approved' ? 'default' : 
                                                  approval.status.toLowerCase() === 'rejected' ? 'destructive' : 'secondary'
                                                }
                                                className={`capitalize text-xs shrink-0 ${
                                                  approval.status.toLowerCase() === 'approved' 
                                                    ? 'text-white dark:text-white' 
                                                    : ''
                                                }`}
                                              >
                                                {approval.status}
                                              </Badge>
                                            </div>
                                            <div className="space-y-1">
                                              <div className="text-xs font-semibold text-muted-foreground">
                                                Proposed Mitigation
                                              </div>
                                              <div className="text-sm text-foreground break-words">
                                                {approval.proposedDeparture || '-'}
                                              </div>
                                            </div>
                                            <div className="space-y-1">
                                              <div className="text-xs font-semibold text-muted-foreground">
                                                DOA Comments
                                              </div>
                                              <div className="text-sm text-foreground break-words">
                                                {approval.reviewComments || '-'}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                  {complyValue.toLowerCase() === 'no' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedApprovalRow({ rowId: row.id, rowIndex: row.rowIndex });
                                        setApprovalDialogOpen(true);
                                      }}
                                      data-testid={`button-approve-reject-row-${row.id}`}
                                      className="h-7 mt-2"
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Add
                                    </Button>
                                  )}
                                  {!row.approvals?.length && complyValue.toLowerCase() !== 'no' && (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </div>
                              ) : isInEditMode ? (
                                isApprovalColumn ? (
                                  <Select
                                    value={editingCells[cell!.id] ?? (cell!.value || '')}
                                    onValueChange={(value) => {
                                      handleCellEdit(cell!.id, value);
                                      // Auto-exit after selection
                                      setTimeout(() => handleExitEditMode(cell!.id, true), 100);
                                    }}
                                    open={true}
                                  >
                                    <SelectTrigger 
                                      className="w-full h-full border-0 rounded-none bg-transparent px-3 py-1 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                                      data-testid={`select-cell-${row.id}-${col.id}`}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          handleExitEditMode(cell!.id, false);
                                        }
                                        if (e.key === 'Tab') {
                                          e.preventDefault();
                                          handleExitEditMode(cell!.id, false);
                                        }
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleExitEditMode(cell!.id, true);
                                        }
                                      }}
                                    >
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Yes">Yes</SelectItem>
                                      <SelectItem value="No">No</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <textarea
                                    ref={(el) => {
                                      if (el) {
                                        textareaRefs.current[cell!.id] = el;
                                        // Auto-resize to fit content immediately
                                        el.style.height = 'auto';
                                        el.style.height = Math.max(el.scrollHeight, 40) + 'px';
                                      }
                                    }}
                                    value={editingCells[cell!.id] ?? (employmentRoleTitle || cell!.value || '')}
                                    onChange={(e) => {
                                      handleCellEdit(cell!.id, e.target.value);
                                    }}
                                    onKeyDown={(e) => {
                                      // ALT+ENTER for line break
                                      if (e.key === 'Enter' && e.altKey) {
                                        e.preventDefault();
                                        const cursorPos = e.currentTarget.selectionStart;
                                        const currentValue = editingCells[cell!.id] ?? (cell!.value || '');
                                        const newValue = currentValue.substring(0, cursorPos) + '\n' + currentValue.substring(cursorPos);
                                        handleCellEdit(cell!.id, newValue);
                                        // Set cursor position after the newline
                                        setTimeout(() => {
                                          e.currentTarget.selectionStart = cursorPos + 1;
                                          e.currentTarget.selectionEnd = cursorPos + 1;
                                        }, 0);
                                        return;
                                      }
                                      // ENTER to save
                                      if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
                                        e.preventDefault();
                                        handleExitEditMode(cell!.id, true);
                                        return;
                                      }
                                      // ESC to cancel
                                      if (e.key === 'Escape') {
                                        e.preventDefault();
                                        handleExitEditMode(cell!.id, false);
                                        return;
                                      }
                                      // TAB to save and move
                                      if (e.key === 'Tab') {
                                        e.preventDefault();
                                        handleExitEditMode(cell!.id, true);
                                        return;
                                      }
                                    }}
                                    onBlur={() => {
                                      handleExitEditMode(cell!.id, true);
                                    }}
                                    rows={1}
                                    onInput={(e) => {
                                      const target = e.target as HTMLTextAreaElement;
                                      target.style.height = 'auto';
                                      target.style.height = Math.max(target.scrollHeight, 40) + 'px';
                                    }}
                                    className={`w-full h-full border-0 rounded-none bg-transparent px-3 py-1 text-sm resize-none overflow-hidden focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 caret-foreground ${
                                      approvalColorClass || (isAiGenerated ? 'text-blue-600 dark:text-blue-400' : '')
                                    }`}
                                    data-testid={`input-cell-${row.id}-${col.id}`}
                                  />
                                )
                              ) : (
                                <div 
                                  className="w-full px-3 py-1 text-sm whitespace-pre-wrap relative select-none hover:bg-accent/20"
                                  data-testid={`cell-${row.id}-${col.id}`}
                                >
                                  {isCellLockedByOther ? (
                                    <>
                                      <div className="absolute inset-0 border-2 border-yellow-500/30 pointer-events-none" />
                                      <span className={approvalColorClass || (isAiGenerated ? 'text-blue-600 dark:text-blue-400' : '')}>
                                        {renderCellContentWithTooltips(displayValue)}
                                      </span>
                                      <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                                        (Editing: {cellLockOwner})
                                      </span>
                                    </>
                                  ) : cell?.originalAiValue && cell?.lastEditedBy && cell.lastEditedBy !== 'AI Assistant' ? (
                                    <div className="flex items-start justify-between gap-2 group">
                                      <TextDiff 
                                        originalAiValue={cell.originalAiValue} 
                                        currentValue={cell.value || ''} 
                                      />
                                      {chatIconButton}
                                    </div>
                                  ) : col.columnHeader === 'Comply' && cell?.value === 'No' ? (
                                    <div className="flex items-center gap-2">
                                      <span className={approvalColorClass}>
                                        {renderCellContentWithTooltips(displayValue)}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedApprovalRow({ rowId: row.id, rowIndex: row.rowIndex });
                                          setApprovalDialogOpen(true);
                                        }}
                                        data-testid={`button-approvals-row-${row.id}`}
                                        className="h-6"
                                      >
                                        <ListChecks className="h-3 w-3 mr-1" />
                                        Approvals
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-start justify-between gap-2 group">
                                      <span className={approvalColorClass || (isAiGenerated ? 'text-blue-600 dark:text-blue-400' : '')}>
                                        {renderCellContentWithTooltips(displayValue)}
                                      </span>
                                      {chatIconButton}
                                    </div>
                                  )}
                                </div>
                              );
                              
                              return (
                                <td 
                                  key={col.id} 
                                  className={`border-r border-border align-top relative ${
                                    isEditable ? 'cursor-pointer' : ''
                                  } focus:ring-2 focus:ring-primary focus:ring-inset focus:z-10 focus:outline-none`}
                                  style={col.locked ? {
                                    backgroundColor: 'hsl(var(--locked-column-bg))',
                                    color: 'hsl(var(--locked-column-fg))'
                                  } : undefined}
                                  tabIndex={0}
                                  data-cell-id={cell?.id}
                                  data-column-id={col.id}
                                  data-row-index={rowIndex}
                                  onClick={handleCellClick}
                                  onKeyDown={(e) => {
                                    if (!cell) return;
                                    
                                    if (isInEditMode) {
                                      // In edit mode
                                      handleCellKeyDown(e, cell.id, true, cell.value || '', e.currentTarget);
                                    } else {
                                      // In focused mode - Enter or F2 to start editing
                                      if ((e.key === 'Enter' || e.key === 'F2') && !isCellLocked?.(cell.id)) {
                                        // Check if editable
                                        const canEdit = isCurrentRevisionActive;
                                        const isNonEditableSource = col?.source === 'template' ||
                                                                   col?.source === 'approval' || 
                                                                   col?.source === 'approval_action' || 
                                                                   col?.source === 'calculated';
                                        const isEditableCell = col && !col.locked && canEdit && !isNonEditableSource;
                                        
                                        if (isEditableCell) {
                                          e.preventDefault();
                                          handleEnterEditMode(cell.id, cell.value || '');
                                        }
                                      }
                                    }
                                  }}
                                >
                                  {cellContent}
                                </td>
                              );
                            })}
                              </tr>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onClick={() => handleAnalyzeSingleRow(row.rowIndex, row.id)}
                                data-testid={`context-ai-analyze-row-${row.id}`}
                              >
                                <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                                Analyze Row with AI
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Sticky Horizontal Scrollbar at bottom of viewport */}
              {scrollbarVisible && (
                <div 
                  id="sticky-scrollbar"
                  className="fixed bottom-0 left-0 right-0 overflow-x-auto overflow-y-hidden bg-muted/50 backdrop-blur-sm border-t border-border z-50"
                  style={{ height: '20px' }}
                >
                  <div style={{ 
                    width: tableScrollWidth,
                    height: '1px' 
                  }} />
                </div>
              )}
            </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 border rounded" 
                style={{ 
                  backgroundColor: '#f1f5f9',
                  borderColor: '#cbd5e1'
                }} 
              />
              <span>Template Reference (Read-Only)</span>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 border rounded" 
                style={{ 
                  backgroundColor: '#ffffff',
                  borderColor: '#cbd5e1'
                }} 
              />
              <span>Review Work (Editable)</span>
            </div>
          </div>
        </>
      )}

      {/* AI Review Menu Dialog */}
      <Dialog open={isAiReviewMenuOpen} onOpenChange={setIsAiReviewMenuOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-ai-review-menu">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              AI Review Options
            </DialogTitle>
            <DialogDescription>
              Choose an action to manage AI-generated contract review content
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Perform Complete AI Review */}
            <button
              onClick={() => {
                setIsAiReviewMenuOpen(false);
                setIsAiAnalyzeDialogOpen(true);
              }}
              className="w-full group cursor-pointer hover-elevate active-elevate-2 overflow-visible"
              data-testid="option-perform-ai-review"
            >
              <div className="flex items-center gap-4 p-4 rounded-lg border-2 bg-purple-500/5 border-purple-500/20 text-left">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-purple-600 dark:text-purple-400 mb-1">
                    Perform Complete AI Review
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Analyze contract and populate AI commentary for all rows
                  </div>
                </div>
              </div>
            </button>

            {/* Clear All AI Review */}
            <button
              onClick={handleClearAllAiReview}
              className="w-full group cursor-pointer hover-elevate active-elevate-2 overflow-visible"
              data-testid="option-clear-ai-review"
            >
              <div className="flex items-center gap-4 p-4 rounded-lg border-2 bg-red-500/5 border-red-500/20 text-left">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-red-500/15 flex items-center justify-center">
                  <Eraser className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-red-600 dark:text-red-400 mb-1">
                    Clear All AI Review
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Remove all AI-generated content from this revision
                  </div>
                </div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Analysis Confirmation Dialog */}
      <AlertDialog open={isAiAnalyzeDialogOpen} onOpenChange={setIsAiAnalyzeDialogOpen}>
        <AlertDialogContent data-testid="dialog-ai-analyze-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Start AI Analysis?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                The AI will analyze all rows and populate the following columns:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Summary Position of Document</li>
                <li>Cl. Ref</li>
                <li>AI Proposed Mitigation</li>
              </ul>

              {rows && rows.length > 0 && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-md p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-purple-600 dark:text-purple-400">
                    <Clock className="h-4 w-4" />
                    <span>Estimated Time</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This analysis will process <strong>{rows.length} rows</strong> and take approximately{' '}
                    <strong>{Math.ceil((rows.length * 10) / 60)} minutes</strong> to complete.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You can continue working while the analysis runs in the background.
                  </p>
                </div>
              )}
              
              <div className="flex items-start space-x-2 pt-2">
                <Checkbox
                  id="clear-existing"
                  checked={clearExistingAiContent}
                  onCheckedChange={(checked) => setClearExistingAiContent(checked as boolean)}
                  data-testid="checkbox-clear-existing"
                />
                <label
                  htmlFor="clear-existing"
                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Clear all existing AI commentary before starting
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-ai-analyze">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleAiAnalyze}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-confirm-ai-analyze"
            >
              Start Analysis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Approval Dialog */}
      {selectedApprovalRow && (
        <ApprovalDialog
          open={approvalDialogOpen}
          onOpenChange={setApprovalDialogOpen}
          revisionRowId={selectedApprovalRow.rowId}
          rowIndex={selectedApprovalRow.rowIndex}
          employmentRoles={employmentRoles}
        />
      )}
      
      {/* Cell Chat Dialog */}
      {cellChatDialog && selectedRevisionId && (
        <CellChatDialog
          open={cellChatDialog.open}
          onOpenChange={(open) => {
            if (!open) setCellChatDialog(null);
          }}
          revisionId={selectedRevisionId}
          cellId={cellChatDialog.cellId}
          rowIndex={cellChatDialog.rowIndex}
          columnName={cellChatDialog.columnName}
          currentValue={cellChatDialog.currentValue}
          onValueUpdate={(newValue) => {
            // Invalidate queries to refresh the table
            queryClient.invalidateQueries({ 
              queryKey: ['/api/contract-review/revisions', selectedRevisionId, 'rows'] 
            });
          }}
        />
      )}

      {/* AI Analysis Progress Modal - Prominent during analysis */}
      <AlertDialog open={isAnalyzing} onOpenChange={() => {}}>
        <AlertDialogContent className="max-w-lg" data-testid="dialog-ai-progress">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {analysisProgress.status === 'error' ? (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  AI Analysis Failed
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-pulse" />
                  AI Analysis in Progress
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-6 pt-4">
              {analysisProgress.status === 'error' ? (
                <>
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                    <p className="text-sm text-foreground">
                      {analysisProgress.errorMessage || 'Could not start AI analysis.'}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span>This dialog will close automatically in 5 seconds</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Progress</span>
                      <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {analysisProgress.percentage}%
                      </span>
                    </div>
                    <Progress value={analysisProgress.percentage} className="h-3" />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {analysisProgress.current} of {analysisProgress.total} rows analyzed
                      </span>
                      {analysisProgress.estimatedSecondsRemaining !== undefined && analysisProgress.estimatedSecondsRemaining > 0 && (
                        <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                          <Clock className="h-4 w-4" />
                          <span className="font-medium">
                            ~{Math.ceil(analysisProgress.estimatedSecondsRemaining / 60)} min remaining
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-md p-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Please wait while the AI analyzes each row and generates:<br />
                      <span className="font-medium text-foreground">Summary Position • Clause References • Proposed Mitigations</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analysis running... This dialog will close automatically when complete</span>
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Analysis Completion Summary Dialog */}
      {completionSummary && (
        <AlertDialog 
          open={completionSummary.open} 
          onOpenChange={(open) => {
            if (!open) setCompletionSummary(null);
          }}
        >
          <AlertDialogContent className="max-w-lg" data-testid="dialog-completion-summary">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                AI Analysis Complete
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                    <p className="text-2xl font-bold">{completionSummary.totalRows}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Successfully Analyzed</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {completionSummary.analyzedCount}
                    </p>
                  </div>
                  {completionSummary.errorCount > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Failed</p>
                      <p className="text-2xl font-bold text-destructive">
                        {completionSummary.errorCount}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Success Rate</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {Math.round((completionSummary.analyzedCount / completionSummary.totalRows) * 100)}%
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Projected Time:</span>
                    <span className="text-sm font-medium">
                      {Math.floor(completionSummary.projectedDurationSeconds / 60)}m {completionSummary.projectedDurationSeconds % 60}s
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Actual Time:</span>
                    <span className="text-sm font-medium">
                      {Math.floor(completionSummary.actualDurationSeconds / 60)}m {completionSummary.actualDurationSeconds % 60}s
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-semibold">Time Difference:</span>
                    <span className={`text-sm font-semibold ${
                      completionSummary.actualDurationSeconds < completionSummary.projectedDurationSeconds
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-orange-600 dark:text-orange-400'
                    }`}>
                      {completionSummary.actualDurationSeconds < completionSummary.projectedDurationSeconds ? '−' : '+'}
                      {Math.abs(
                        Math.floor((completionSummary.actualDurationSeconds - completionSummary.projectedDurationSeconds) / 60)
                      )}m{' '}
                      {Math.abs(
                        (completionSummary.actualDurationSeconds - completionSummary.projectedDurationSeconds) % 60
                      )}s
                      {completionSummary.actualDurationSeconds < completionSummary.projectedDurationSeconds
                        ? ' (faster than expected)'
                        : ' (slower than expected)'}
                    </span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction 
                onClick={() => setCompletionSummary(null)}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="button-close-summary"
              >
                Close
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Single Row AI Analysis Dialog */}
      {singleRowAnalysisDialog && (
        <AlertDialog 
          open={singleRowAnalysisDialog.open} 
          onOpenChange={(open) => {
            if (!open) setSingleRowAnalysisDialog(null);
          }}
        >
          <AlertDialogContent className="max-w-md" data-testid="dialog-single-row-analysis">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {singleRowAnalysisDialog.status === 'analyzing' && (
                  <>
                    <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
                    AI Analysis In Progress
                  </>
                )}
                {singleRowAnalysisDialog.status === 'success' && (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    AI Analysis Complete
                  </>
                )}
                {singleRowAnalysisDialog.status === 'error' && (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    AI Analysis Failed
                  </>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {singleRowAnalysisDialog.status === 'analyzing' && (
                  <p className="text-base">Analyzing row {singleRowAnalysisDialog.rowNumber}... This typically takes 8-12 seconds.</p>
                )}
                {singleRowAnalysisDialog.status === 'success' && (
                  <p className="text-base">Row {singleRowAnalysisDialog.rowNumber} analyzed successfully.</p>
                )}
                {singleRowAnalysisDialog.status === 'error' && (
                  <p className="text-base">{singleRowAnalysisDialog.errorMessage || `Could not analyze row ${singleRowAnalysisDialog.rowNumber}.`}</p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {singleRowAnalysisDialog.status !== 'analyzing' && (
              <AlertDialogFooter>
                <AlertDialogAction 
                  onClick={() => setSingleRowAnalysisDialog(null)}
                  data-testid="button-close-single-row-analysis"
                >
                  Close
                </AlertDialogAction>
              </AlertDialogFooter>
            )}
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Revision Actions Dialog */}
      <AlertDialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <AlertDialogContent className="max-w-lg" data-testid="dialog-revision-actions">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Revision Actions
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-4">
              <p className="text-base">Choose an action for contract revisions:</p>
              
              <div className="space-y-3">
                {/* New Revision */}
                <button
                  onClick={() => {
                    setRevisionDialogOpen(false);
                    setIsImportDialogOpen(true);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-md border-2 border-green-500/20 bg-green-500/10 hover:bg-green-500/20 hover:border-green-500/30 transition-all group"
                  data-testid="button-new-revision-option"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-green-500/20 group-hover:bg-green-500/30">
                    <FilePlus className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-green-600 dark:text-green-400">New Revision</div>
                    <div className="text-sm text-muted-foreground">Upload a new contract revision</div>
                  </div>
                </button>

                {/* Delete Revision */}
                <button
                  onClick={() => {
                    setRevisionDialogOpen(false);
                    handleDeleteRevision();
                  }}
                  disabled={!currentRevision || !isMaxRevision}
                  className="w-full flex items-center gap-4 p-4 rounded-md border-2 border-red-500/20 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/30 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-delete-revision-option"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-red-500/20 group-hover:bg-red-500/30">
                    <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-red-600 dark:text-red-400">Delete Revision</div>
                    <div className="text-sm text-muted-foreground">
                      {!currentRevision || !isMaxRevision 
                        ? 'Only the latest revision can be deleted' 
                        : 'Permanently delete the current revision'}
                    </div>
                  </div>
                </button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revision">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Format Selection Dialog */}
      <AlertDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <AlertDialogContent className="max-w-lg" data-testid="dialog-export-format">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Export Contract Review
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-4">
              <p className="text-base">Choose your preferred export format:</p>
              
              <div className="space-y-3">
                {/* Excel Export */}
                <button
                  onClick={() => {
                    setExportDialogOpen(false);
                    handleExportToExcel();
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-md border-2 border-green-500/20 bg-green-500/10 hover:bg-green-500/20 hover:border-green-500/30 transition-all group"
                  data-testid="button-export-excel-option"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-green-500/20 group-hover:bg-green-500/30">
                    <FileDown className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-green-600 dark:text-green-400">Excel Spreadsheet</div>
                    <div className="text-sm text-muted-foreground">Full data with formatting (.xlsx)</div>
                  </div>
                </button>

                {/* PDF Export */}
                <button
                  onClick={() => {
                    setExportDialogOpen(false);
                    handleExportToPDF();
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-md border-2 border-red-500/20 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/30 transition-all group"
                  data-testid="button-export-pdf-option"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-red-500/20 group-hover:bg-red-500/30">
                    <FileDown className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-red-600 dark:text-red-400">PDF Document</div>
                    <div className="text-sm text-muted-foreground">Print-ready format (.pdf)</div>
                  </div>
                </button>

                {/* Word Export */}
                <button
                  onClick={() => {
                    setExportDialogOpen(false);
                    handleExportToWord();
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-md border-2 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/30 transition-all group"
                  data-testid="button-export-word-option"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-blue-500/20 group-hover:bg-blue-500/30">
                    <FileDown className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-blue-600 dark:text-blue-400">Word Document</div>
                    <div className="text-sm text-muted-foreground">Editable format (.docx)</div>
                  </div>
                </button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-export">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contract Notices Dialog */}
      {selectedRevisionId && (
        <ContractNoticesDialog
          projectId={projectId}
          revisionId={selectedRevisionId}
          open={contractNoticesOpen}
          onOpenChange={setContractNoticesOpen}
        />
      )}

      {/* Contract Viewer Dialog */}
      {contractViewerData && (
        <ContractViewerDialog
          open={contractViewerOpen}
          onOpenChange={(open) => {
            setContractViewerOpen(open);
            if (!open) {
              // Clear stored data when dialog closes
              setContractViewerData(null);
            }
          }}
          revisionId={contractViewerData.revisionId}
          pdfUrl={contractViewerData.pdfUrl}
          title={contractViewerData.title}
        />
      )}

      {/* Clause Heading Tooltip - Managed by shared useClauseTooltips hook */}
      {clauseTooltip && (
        <ClauseTooltip
          visible={true}
          clauseNumber={clauseTooltip.clauseNumber}
          heading={clauseTooltip.heading}
          x={clauseTooltip.x}
          y={clauseTooltip.y}
        />
      )}
    </div>
  );
}
