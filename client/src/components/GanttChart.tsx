import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ZoomIn, ZoomOut, Columns, ChevronRight, ChevronDown, Info, AlertCircle, AlertTriangle, FileText, Network } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ColumnPickerDialog } from './ColumnPickerDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface Program {
  id: string;
  projectId: string;
  name: string;
  fileKey: string;
  fileSize: number;
  dataDate: string | null;
  isContractBaseline: boolean;
  isBaselineApproved: boolean;
  comments: string | null;
  xerData: {
    project: any;
    tasks: XERTask[];
    wbs: XERWBS[];
    relationships: any[];
    calendars: any[];
  };
  insights: ScheduleInsights | null;
  uploadedByUserId: string;
  uploadedAt: string;
}

interface XERTask {
  taskId: string;
  taskCode: string;
  taskName: string;
  startDate: string | null;
  finishDate: string | null;
  duration: number | null;
  percentComplete: number | null;
  totalFloat: number | null;
  wbsId: string | null;
  calendarId: string | null;
  taskType: string | null;
  status: string | null;
  cstrType: string | null;
  cstrDate: string | null;
}

interface XERWBS {
  wbsId: string;
  wbsName: string;
  wbsShortName: string;
  parentWbsId: string | null;
  seqNum: number | null;
}

interface GanttChartProps {
  program: Program;
}

interface TaskRow {
  type: 'wbs' | 'task';
  id: string;
  level: number;
  data: XERWBS | XERTask;
  isCollapsed?: boolean;
}

interface InsightDetail {
  type: string;
  severity: "info" | "warn" | "error";
  message: string;
  ref?: Record<string, unknown>;
}

interface ScheduleInsights {
  score: number;
  summary: string;
  details: {
    openEnds: InsightDetail[];
    longDurations: InsightDetail[];
    hardConstraints: InsightDetail[];
    missingLogic: InsightDetail[];
    criticalPathAnalysis: InsightDetail[];
  };
}

interface ColumnDef {
  id: string;
  label: string;
  width: number;
  minWidth: number;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: 'taskCode', label: 'Activity ID', width: 120, minWidth: 80 },
  { id: 'taskName', label: 'Activity Name', width: 300, minWidth: 150 },
  { id: 'duration', label: 'Duration', width: 80, minWidth: 60 },
  { id: 'totalFloat', label: 'Total Float', width: 90, minWidth: 70 },
];

const ALL_COLUMNS: ColumnDef[] = [
  ...DEFAULT_COLUMNS,
  { id: 'startDate', label: 'Start', width: 100, minWidth: 80 },
  { id: 'finishDate', label: 'Finish', width: 100, minWidth: 80 },
  { id: 'percentComplete', label: '% Complete', width: 100, minWidth: 80 },
];

type DateScale = 'days' | 'months' | 'quarters' | 'years';

const STORAGE_KEY_COLUMN_WIDTHS = 'gantt-column-widths';
const STORAGE_KEY_DATE_SCALE = 'gantt-date-scale';
const STORAGE_KEY_VISIBLE_COLUMNS = 'gantt-visible-columns';
const STORAGE_KEY_ZOOM_LEVEL = 'gantt-zoom-level';
const STORAGE_KEY_SHOW_LINKS = 'gantt-show-links';
const STORAGE_KEY_LINK_FILTER = 'gantt-link-filter';

export function GanttChart({ program }: GanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS.map(c => c.id));
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [collapsedWbs, setCollapsedWbs] = useState<Set<string>>(new Set());
  const [dateScale, setDateScale] = useState<DateScale>('days');
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showLinks, setShowLinks] = useState(true);
  const [linkFilter, setLinkFilter] = useState<'all' | 'critical' | 'driving'>('driving');
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const tasks = program.xerData?.tasks || [];
  const wbsItems = program.xerData?.wbs || [];
  const relationships = program.xerData?.relationships || [];

  // Load saved settings from localStorage
  useEffect(() => {
    // Load column widths
    const storedWidths = localStorage.getItem(STORAGE_KEY_COLUMN_WIDTHS);
    if (storedWidths) {
      try {
        setColumnWidths(JSON.parse(storedWidths));
      } catch (e) {
        console.error('Failed to parse stored column widths:', e);
      }
    }

    // Load date scale
    const storedScale = localStorage.getItem(STORAGE_KEY_DATE_SCALE);
    if (storedScale && ['days', 'months', 'quarters', 'years'].includes(storedScale)) {
      setDateScale(storedScale as DateScale);
    }

    // Load visible columns
    const storedColumns = localStorage.getItem(STORAGE_KEY_VISIBLE_COLUMNS);
    if (storedColumns) {
      try {
        const parsed = JSON.parse(storedColumns);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleColumns(parsed);
        }
      } catch (e) {
        console.error('Failed to parse stored visible columns:', e);
      }
    }

    // Load zoom level
    const storedZoom = localStorage.getItem(STORAGE_KEY_ZOOM_LEVEL);
    if (storedZoom) {
      const zoom = parseFloat(storedZoom);
      if (!isNaN(zoom) && zoom >= 0.5 && zoom <= 3) {
        setZoomLevel(zoom);
      }
    }

    // Load show links preference
    const storedShowLinks = localStorage.getItem(STORAGE_KEY_SHOW_LINKS);
    if (storedShowLinks !== null) {
      setShowLinks(storedShowLinks === 'true');
    }

    // Load link filter preference
    const storedLinkFilter = localStorage.getItem(STORAGE_KEY_LINK_FILTER);
    if (storedLinkFilter && ['all', 'critical', 'driving'].includes(storedLinkFilter)) {
      setLinkFilter(storedLinkFilter as 'all' | 'critical' | 'driving');
    }
  }, []);

  // Save column widths to localStorage
  const saveColumnWidths = useCallback((widths: Record<string, number>) => {
    localStorage.setItem(STORAGE_KEY_COLUMN_WIDTHS, JSON.stringify(widths));
    setColumnWidths(widths);
  }, []);

  // Save date scale to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DATE_SCALE, dateScale);
  }, [dateScale]);

  // Save visible columns to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VISIBLE_COLUMNS, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Save zoom level to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ZOOM_LEVEL, zoomLevel.toString());
  }, [zoomLevel]);

  // Save show links preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHOW_LINKS, showLinks.toString());
  }, [showLinks]);

  // Save link filter preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LINK_FILTER, linkFilter);
  }, [linkFilter]);

  // Pan with mouse drag functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start panning on left mouse button and not on interactive elements
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    
    // Don't pan if clicking on buttons, inputs, or resize handles
    if (target.closest('button') || target.closest('input') || target.classList.contains('cursor-col-resize')) {
      return;
    }
    
    setIsPanning(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanning) return;
    
    const deltaX = dragStart.x - e.clientX;
    const deltaY = dragStart.y - e.clientY;
    
    // Update scroll positions for both panels
    if (mainScrollRef.current) {
      const viewport = mainScrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        viewport.scrollLeft += deltaX;
        viewport.scrollTop += deltaY;
      }
    }
    
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isPanning, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Add/remove global mouse event listeners for panning
  useEffect(() => {
    if (isPanning) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isPanning, handleMouseMove, handleMouseUp]);

  // Get column width (from saved widths or default)
  const getColumnWidth = (columnId: string) => {
    return columnWidths[columnId] || ALL_COLUMNS.find(c => c.id === columnId)?.width || 100;
  };

  // Determine which tasks to show based on link filter
  const getVisibleTaskIds = (): Set<string> => {
    if (linkFilter === 'all') {
      return new Set(tasks.map(t => t.taskId));
    }
    
    const visibleIds = new Set<string>();
    
    // Add critical path tasks (totalFloat <= 0)
    tasks.forEach(task => {
      if (task.totalFloat !== null && task.totalFloat <= 0) {
        visibleIds.add(task.taskId);
      }
    });
    
    // For 'driving' filter, also add tasks that feed into critical tasks
    if (linkFilter === 'driving') {
      relationships.forEach((rel: any) => {
        // If successor is critical, add the predecessor (it's a "driving" task)
        const succTask = tasks.find(t => t.taskId === rel.taskId);
        if (succTask && succTask.totalFloat !== null && succTask.totalFloat <= 0) {
          visibleIds.add(rel.predTaskId);
        }
      });
    }
    
    return visibleIds;
  };

  const visibleTaskIds = getVisibleTaskIds();

  // Build WBS hierarchy
  const buildWbsHierarchy = (): TaskRow[] => {
    const rows: TaskRow[] = [];
    const wbsMap = new Map<string, XERWBS>();
    const tasksByWbs = new Map<string, XERTask[]>();
    
    // Index WBS items
    wbsItems.forEach(wbs => {
      wbsMap.set(wbs.wbsId, wbs);
    });
    
    // Group tasks by WBS (filter by visible tasks)
    tasks.forEach(task => {
      if (task.wbsId && visibleTaskIds.has(task.taskId)) {
        if (!tasksByWbs.has(task.wbsId)) {
          tasksByWbs.set(task.wbsId, []);
        }
        tasksByWbs.get(task.wbsId)!.push(task);
      }
    });

    // Build hierarchy recursively
    const addWbsAndTasks = (wbsId: string | null | undefined, parentLevel: number = -1) => {
      // Find child WBS items - check for both null and empty string
      const childWbs = wbsItems
        .filter(w => {
          if (wbsId === null || wbsId === undefined) {
            return !w.parentWbsId || w.parentWbsId === '';
          }
          return w.parentWbsId === wbsId;
        })
        .sort((a, b) => (a.seqNum || 0) - (b.seqNum || 0));

      childWbs.forEach(wbs => {
        const level = parentLevel + 1;
        const isCollapsed = collapsedWbs.has(wbs.wbsId);
        
        // Add WBS header row
        rows.push({
          type: 'wbs',
          id: wbs.wbsId,
          level,
          data: wbs,
          isCollapsed
        });

        if (!isCollapsed) {
          // Add tasks for this WBS
          const wbsTasks = tasksByWbs.get(wbs.wbsId) || [];
          wbsTasks.forEach(task => {
            rows.push({
              type: 'task',
              id: task.taskId,
              level: level + 1,
              data: task
            });
          });

          // Recursively add child WBS
          addWbsAndTasks(wbs.wbsId, level);
        }
      });
    };

    addWbsAndTasks(null);

    // Add orphaned tasks (tasks without WBS or with WBS that doesn't exist in hierarchy)
    // Only add if they're in the visible set
    const addedTaskIds = new Set(rows.filter(r => r.type === 'task').map(r => r.id));
    const orphanedTasks = tasks.filter(t => !addedTaskIds.has(t.taskId) && visibleTaskIds.has(t.taskId));
    
    if (orphanedTasks.length > 0) {
      orphanedTasks.forEach(task => {
        rows.push({
          type: 'task',
          id: task.taskId,
          level: 0,
          data: task
        });
      });
    }

    return rows;
  };

  const hierarchyRows = buildWbsHierarchy();

  // Calculate date range
  const getDateRange = () => {
    const validTasks = tasks.filter(t => t.startDate && t.finishDate);
    if (validTasks.length === 0) return { min: new Date(), max: new Date() };

    const dates = validTasks.flatMap(t => [
      new Date(t.startDate!),
      new Date(t.finishDate!)
    ]);

    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));

    // Add some padding
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 7);

    return { min, max };
  };

  const { min: startDate, max: endDate } = getDateRange();

  // Generate timeline dates based on scale
  const generateTimelineDates = () => {
    const dates: Date[] = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      dates.push(new Date(current));
      
      switch (dateScale) {
        case 'days':
          current.setDate(current.getDate() + 7);
          break;
        case 'months':
          current.setMonth(current.getMonth() + 1);
          break;
        case 'quarters':
          current.setMonth(current.getMonth() + 3);
          break;
        case 'years':
          current.setFullYear(current.getFullYear() + 1);
          break;
      }
    }
    
    return dates;
  };

  const timelineDates = generateTimelineDates();
  
  // Calculate pixel width based on scale
  const getScaleMultiplier = () => {
    switch (dateScale) {
      case 'days':
        return 1;
      case 'months':
        return 0.15;
      case 'quarters':
        return 0.05;
      case 'years':
        return 0.012;
      default:
        return 1;
    }
  };

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dayWidth = 40 * zoomLevel * getScaleMultiplier();
  const timelineWidth = totalDays * dayWidth;

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.2, 0.5));
  };

  const toggleWbs = (wbsId: string) => {
    setCollapsedWbs(prev => {
      const next = new Set(prev);
      if (next.has(wbsId)) {
        next.delete(wbsId);
      } else {
        next.add(wbsId);
      }
      return next;
    });
  };

  const collapseAll = () => {
    const allWbsIds = new Set(wbsItems.map(w => w.wbsId));
    setCollapsedWbs(allWbsIds);
  };

  const expandAll = () => {
    setCollapsedWbs(new Set());
  };

  const displayedColumns = ALL_COLUMNS.filter(col => visibleColumns.includes(col.id));
  
  // Freeze columns (Activity ID and Activity Name)
  const freezeColumns = displayedColumns.filter(c => c.id === 'taskCode' || c.id === 'taskName');
  const scrollColumns = displayedColumns.filter(c => c.id !== 'taskCode' && c.id !== 'taskName');
  
  const freezePanelWidth = freezeColumns.reduce((sum, col) => sum + getColumnWidth(col.id), 0);
  const scrollPanelWidth = scrollColumns.reduce((sum, col) => sum + getColumnWidth(col.id), 0);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: '2-digit'
    });
  };

  const formatDateLabel = (date: Date) => {
    switch (dateScale) {
      case 'days':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'months':
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      case 'quarters':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `Q${quarter} ${date.getFullYear().toString().slice(-2)}`;
      case 'years':
        return date.getFullYear().toString();
      default:
        return date.toLocaleDateString();
    }
  };

  const formatDuration = (hours: number | null) => {
    if (hours === null) return '-';
    const days = Math.round(hours / 8);
    return `${days}d`;
  };

  const formatFloat = (hours: number | null) => {
    if (hours === null || hours === undefined) return '-';
    const days = Math.round(hours / 8);
    return `${days}d`;
  };

  const formatPercent = (percent: number | null) => {
    if (percent === null) return '-';
    return `${percent.toFixed(0)}%`;
  };

  // Calculate task bar position and width
  const getTaskBarStyle = (task: XERTask) => {
    if (!task.startDate || !task.finishDate) return null;

    const taskStart = new Date(task.startDate);
    const taskEnd = new Date(task.finishDate);

    const daysFromStart = Math.ceil((taskStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const taskDuration = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24));

    const left = daysFromStart * dayWidth;
    const width = Math.max(taskDuration * dayWidth, 20);

    const isCritical = task.totalFloat !== null && task.totalFloat !== undefined && task.totalFloat <= 0;
    const percentComplete = task.percentComplete || 0;

    return {
      left: `${left}px`,
      width: `${width}px`,
      leftNum: left,
      widthNum: width,
      isCritical,
      percentComplete
    };
  };

  // Build task position map for link rendering (only visible tasks)
  const taskPositionMap = new Map<string, { 
    rowIndex: number; 
    barStyle: ReturnType<typeof getTaskBarStyle>;
    task: XERTask;
  }>();
  hierarchyRows.forEach((row, index) => {
    if (row.type === 'task') {
      const task = row.data as XERTask;
      const barStyle = getTaskBarStyle(task);
      if (barStyle) {
        taskPositionMap.set(task.taskId, { rowIndex: index, barStyle, task });
      }
    }
  });

  // Filter relationships based on selected filter
  const filteredRelationships = relationships.filter((rel: any) => {
    // Only show links where both tasks are visible
    const predPos = taskPositionMap.get(rel.predTaskId);
    const succPos = taskPositionMap.get(rel.taskId);
    
    if (!predPos || !succPos) return false;

    // Apply filter
    switch (linkFilter) {
      case 'critical':
        // Only show if BOTH tasks are on critical path
        return predPos.task.totalFloat !== null && predPos.task.totalFloat <= 0 &&
               succPos.task.totalFloat !== null && succPos.task.totalFloat <= 0;
      
      case 'driving':
        // Show if successor is on critical path (these are the "driving" links)
        return succPos.task.totalFloat !== null && succPos.task.totalFloat <= 0;
      
      case 'all':
      default:
        return true;
    }
  });

  // Calculate dependency link paths
  const calculateLinkPath = (
    predTaskId: string,
    succTaskId: string,
    predType: string
  ): string | null => {
    const predPos = taskPositionMap.get(predTaskId);
    const succPos = taskPositionMap.get(succTaskId);
    
    if (!predPos || !succPos) return null;

    const rowHeight = 22;
    const barHeight = 16;
    const barTop = (rowHeight - barHeight) / 2;

    // Calculate vertical positions
    const predY = predPos.rowIndex * rowHeight + barTop + barHeight / 2;
    const succY = succPos.rowIndex * rowHeight + barTop + barHeight / 2;

    // Calculate horizontal positions based on relationship type
    let predX = 0;
    let succX = 0;

    switch (predType) {
      case 'PR_FS': // Finish-to-Start (most common)
        predX = predPos.barStyle!.leftNum + predPos.barStyle!.widthNum;
        succX = succPos.barStyle!.leftNum;
        break;
      case 'PR_SS': // Start-to-Start
        predX = predPos.barStyle!.leftNum;
        succX = succPos.barStyle!.leftNum;
        break;
      case 'PR_FF': // Finish-to-Finish
        predX = predPos.barStyle!.leftNum + predPos.barStyle!.widthNum;
        succX = succPos.barStyle!.leftNum + succPos.barStyle!.widthNum;
        break;
      case 'PR_SF': // Start-to-Finish (rare)
        predX = predPos.barStyle!.leftNum;
        succX = succPos.barStyle!.leftNum + succPos.barStyle!.widthNum;
        break;
      default:
        predX = predPos.barStyle!.leftNum + predPos.barStyle!.widthNum;
        succX = succPos.barStyle!.leftNum;
    }

    // Create path with simple right-angle routing
    const midX = (predX + succX) / 2;
    
    // Draw path: horizontal from pred, vertical, horizontal to succ
    return `M ${predX} ${predY} L ${midX} ${predY} L ${midX} ${succY} L ${succX} ${succY}`;
  };


  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Gantt Chart - {tasks.length} Activities</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Program Metrics Button */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-program-metrics">
                  <FileText className="h-4 w-4 mr-2" />
                  Program Metrics
                  {program.insights && (
                    <Badge 
                      className="ml-2"
                      variant={
                        program.insights.score >= 80 ? "default" :
                        program.insights.score >= 60 ? "secondary" :
                        "destructive"
                      }
                    >
                      {program.insights.score}/100
                    </Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{program.name}</DialogTitle>
                  <DialogDescription>
                    Program details and schedule quality insights
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  {/* Program Details */}
                  <div className="grid grid-cols-3 gap-4 pb-4 border-b">
                    <div>
                      <p className="text-sm text-muted-foreground">Data Date</p>
                      <p className="text-sm font-medium">{program.dataDate || 'Not available'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">File Size</p>
                      <p className="text-sm font-medium">{(program.fileSize / 1024).toFixed(2)} KB</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Uploaded</p>
                      <p className="text-sm font-medium">{new Date(program.uploadedAt).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {program.comments && (
                    <div className="pb-4 border-b">
                      <p className="text-sm text-muted-foreground">Comments</p>
                      <p className="text-sm mt-1">{program.comments}</p>
                    </div>
                  )}

                  {/* Schedule Insights */}
                  {program.insights && (
                    <>
                      <div className="grid grid-cols-2 gap-3 pb-4 border-b">
                        {program.insights.details.hardConstraints.length > 0 && (
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                            <div>
                              <p className="font-medium text-destructive">Hard Constraints</p>
                              <p className="text-sm text-muted-foreground">{program.insights.details.hardConstraints.length} found</p>
                            </div>
                          </div>
                        )}
                        
                        {program.insights.details.openEnds.length > 0 && (
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="font-medium text-yellow-600">Open Ends</p>
                              <p className="text-sm text-muted-foreground">{program.insights.details.openEnds.length} activities</p>
                            </div>
                          </div>
                        )}
                        
                        {program.insights.details.longDurations.length > 0 && (
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="font-medium text-yellow-600">Long Durations</p>
                              <p className="text-sm text-muted-foreground">{program.insights.details.longDurations.length} activities</p>
                            </div>
                          </div>
                        )}
                        
                        {program.insights.details.missingLogic.length > 0 && (
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                            <div>
                              <p className="font-medium text-destructive">Unlinked Activities</p>
                              <p className="text-sm text-muted-foreground">{program.insights.details.missingLogic.length} activities</p>
                            </div>
                          </div>
                        )}
                        
                        {program.insights.details.criticalPathAnalysis.length > 0 && (
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                            <div>
                              <p className="font-medium text-blue-600">Critical Path</p>
                              <p className="text-sm text-muted-foreground">{program.insights.details.criticalPathAnalysis.length} activities</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {program.insights.details.hardConstraints.length > 0 && (
                        <div>
                          <h3 className="text-base font-medium mb-2 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-destructive" />
                            Hard Constraints ({program.insights.details.hardConstraints.length})
                          </h3>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {program.insights.details.hardConstraints.map((insight, idx) => (
                              <div key={idx} className="text-sm p-2 bg-destructive/10 rounded-md">
                                {insight.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {program.insights.details.missingLogic.length > 0 && (
                        <div>
                          <h3 className="text-base font-medium mb-2 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-destructive" />
                            Unlinked Activities ({program.insights.details.missingLogic.length})
                          </h3>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {program.insights.details.missingLogic.map((insight, idx) => (
                              <div key={idx} className="text-sm p-2 bg-destructive/10 rounded-md">
                                {insight.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {program.insights.details.openEnds.length > 0 && (
                        <div>
                          <h3 className="text-base font-medium mb-2 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                            Open Ends ({program.insights.details.openEnds.length})
                          </h3>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {program.insights.details.openEnds.map((insight, idx) => (
                              <div key={idx} className="text-sm p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-md">
                                {insight.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {program.insights.details.longDurations.length > 0 && (
                        <div>
                          <h3 className="text-base font-medium mb-2 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                            Long Durations ({program.insights.details.longDurations.length})
                          </h3>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {program.insights.details.longDurations.map((insight, idx) => (
                              <div key={idx} className="text-sm p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-md">
                                {insight.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {program.insights.details.criticalPathAnalysis.length > 0 && (
                        <div>
                          <h3 className="text-base font-medium mb-2 flex items-center gap-2">
                            <Info className="h-5 w-5 text-blue-600" />
                            Critical Path Activities ({program.insights.details.criticalPathAnalysis.length})
                          </h3>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {program.insights.details.criticalPathAnalysis.slice(0, 10).map((insight, idx) => (
                              <div key={idx} className="text-sm p-2 bg-blue-100 dark:bg-blue-900/20 rounded-md">
                                {insight.message}
                              </div>
                            ))}
                            {program.insights.details.criticalPathAnalysis.length > 10 && (
                              <p className="text-sm text-muted-foreground italic">
                                ... and {program.insights.details.criticalPathAnalysis.length - 10} more
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Date Scale Toggle */}
            <ToggleGroup type="single" value={dateScale} onValueChange={(v) => v && setDateScale(v as DateScale)} data-testid="toggle-date-scale">
              <ToggleGroupItem value="days" aria-label="Days view" data-testid="toggle-days">
                Days
              </ToggleGroupItem>
              <ToggleGroupItem value="months" aria-label="Months view" data-testid="toggle-months">
                Months
              </ToggleGroupItem>
              <ToggleGroupItem value="quarters" aria-label="Quarters view" data-testid="toggle-quarters">
                Quarters
              </ToggleGroupItem>
              <ToggleGroupItem value="years" aria-label="Years view" data-testid="toggle-years">
                Years
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Zoom Controls */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[60px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            {/* Column Picker */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColumnPickerOpen(true)}
              data-testid="button-column-picker"
            >
              <Columns className="h-4 w-4 mr-2" />
              Columns
            </Button>

            {/* Show Links Toggle */}
            <Button
              variant={showLinks ? "default" : "outline"}
              size="sm"
              onClick={() => setShowLinks(!showLinks)}
              data-testid="button-toggle-links"
            >
              <Network className="h-4 w-4 mr-2" />
              {showLinks ? 'Hide Links' : 'Show Links'}
            </Button>

            {/* Link Filter (only shown when links are visible) */}
            {showLinks && (
              <ToggleGroup 
                type="single" 
                value={linkFilter} 
                onValueChange={(v) => v && setLinkFilter(v as 'all' | 'critical' | 'driving')}
                data-testid="toggle-link-filter"
              >
                <ToggleGroupItem value="driving" aria-label="Driving path links" data-testid="toggle-driving" className="text-xs">
                  Driving
                </ToggleGroupItem>
                <ToggleGroupItem value="critical" aria-label="Critical path only" data-testid="toggle-critical" className="text-xs">
                  Critical
                </ToggleGroupItem>
                <ToggleGroupItem value="all" aria-label="All links" data-testid="toggle-all" className="text-xs">
                  All
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            {/* WBS Collapse/Expand Controls */}
            <div className="flex items-center gap-1 border-l pl-2">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAll}
                data-testid="button-expand-all"
              >
                <ChevronDown className="h-4 w-4 mr-1" />
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAll}
                data-testid="button-collapse-all"
              >
                <ChevronRight className="h-4 w-4 mr-1" />
                Collapse All
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea 
          className="h-[calc(100vh-370px)] border-t"
          ref={mainScrollRef}
          onMouseDown={handleMouseDown}
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        >
          <div className="flex min-w-full">
            {/* Frozen Left Panel (Activity ID & Activity Name) - Sticky */}
            <div className="sticky left-0 z-20 border-r bg-background" style={{ width: freezePanelWidth }}>
              {/* Frozen Headers */}
              <div className="flex border-b bg-background sticky top-0 z-30">
                {freezeColumns.map((col) => (
                  <div
                    key={col.id}
                    className="px-2 py-1 text-xs font-semibold border-r last:border-r-0 relative"
                    style={{ width: getColumnWidth(col.id) }}
                  >
                    {col.label}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary active:bg-primary"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const startX = e.pageX;
                        const startWidth = getColumnWidth(col.id);
                        const column = ALL_COLUMNS.find(c => c.id === col.id);
                        if (!column) return;
                        
                        let currentWidth = startWidth;
                        
                        const handleMouseMove = (e: MouseEvent) => {
                          const diff = e.pageX - startX;
                          currentWidth = Math.max(column.minWidth, startWidth + diff);
                          // Update immediately for visual feedback
                          const newWidths = { ...columnWidths, [col.id]: currentWidth };
                          setColumnWidths(newWidths);
                        };
                        
                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                          // Save to localStorage on mouseup
                          const newWidths = { ...columnWidths, [col.id]: currentWidth };
                          saveColumnWidths(newWidths);
                        };
                        
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Frozen Rows */}
              {hierarchyRows.map((row) => (
                <div
                  key={row.id}
                  className={`flex border-b ${row.type === 'wbs' ? 'h-6 bg-muted/30' : 'h-[22px]'}`}
                >
                  {freezeColumns.map((col) => (
                    <div
                      key={col.id}
                      className="px-2 py-0.5 text-xs border-r last:border-r-0 truncate bg-background"
                      style={{ 
                        width: getColumnWidth(col.id),
                        paddingLeft: col.id === 'taskCode' ? `${row.level * 16 + 8}px` : undefined
                      }}
                    >
                      {col.id === 'taskCode' && row.type === 'wbs' && (
                        <button
                          onClick={() => toggleWbs(row.id)}
                          className="inline-flex items-center hover-elevate p-1 rounded mr-1"
                          data-testid={`button-toggle-wbs-${row.id}`}
                          aria-expanded={!row.isCollapsed}
                          aria-label={`Toggle ${(row.data as XERWBS).wbsName}`}
                        >
                          {row.isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      {col.id === 'taskCode' && (
                        <span className={row.type === 'wbs' ? 'font-semibold' : ''}>
                          {row.type === 'task' ? (row.data as XERTask).taskCode : (row.data as XERWBS).wbsShortName}
                        </span>
                      )}
                      {col.id === 'taskName' && (
                        <span className={row.type === 'wbs' ? 'font-semibold' : ''}>
                          {row.type === 'task' ? (row.data as XERTask).taskName : (row.data as XERWBS).wbsName}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Scrollable Right Panel (Remaining columns + Timeline) */}
            <div className="flex-1">
              <div className="flex">
                {/* Scrollable Columns */}
                {scrollColumns.length > 0 && (
                  <div className="border-r" style={{ width: scrollPanelWidth }}>
                    {/* Scrollable Headers */}
                    <div className="flex border-b bg-background sticky top-0 z-10">
                      {scrollColumns.map((col) => (
                        <div
                          key={col.id}
                          className="px-2 py-1 text-xs font-semibold border-r last:border-r-0 relative"
                          style={{ width: getColumnWidth(col.id) }}
                        >
                          {col.label}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary active:bg-primary"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const startX = e.pageX;
                              const startWidth = getColumnWidth(col.id);
                              const column = ALL_COLUMNS.find(c => c.id === col.id);
                              if (!column) return;
                              
                              let currentWidth = startWidth;
                              
                              const handleMouseMove = (e: MouseEvent) => {
                                const diff = e.pageX - startX;
                                currentWidth = Math.max(column.minWidth, startWidth + diff);
                                // Update immediately for visual feedback
                                const newWidths = { ...columnWidths, [col.id]: currentWidth };
                                setColumnWidths(newWidths);
                              };
                              
                              const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                                // Save to localStorage on mouseup
                                const newWidths = { ...columnWidths, [col.id]: currentWidth };
                                saveColumnWidths(newWidths);
                              };
                              
                              document.addEventListener('mousemove', handleMouseMove);
                              document.addEventListener('mouseup', handleMouseUp);
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Scrollable Rows */}
                    <div>
                      {hierarchyRows.map((row) => (
                        <div
                          key={row.id}
                          className={`flex border-b ${row.type === 'wbs' ? 'h-6' : 'h-[22px]'}`}
                        >
                          {scrollColumns.map((col) => (
                            <div
                              key={col.id}
                              className="px-2 py-0.5 text-xs border-r last:border-r-0 truncate"
                              style={{ width: getColumnWidth(col.id) }}
                            >
                              {row.type === 'task' && (
                                <>
                                  {col.id === 'duration' && formatDuration((row.data as XERTask).duration)}
                                  {col.id === 'startDate' && formatDate((row.data as XERTask).startDate)}
                                  {col.id === 'finishDate' && formatDate((row.data as XERTask).finishDate)}
                                  {col.id === 'percentComplete' && formatPercent((row.data as XERTask).percentComplete)}
                                  {col.id === 'totalFloat' && formatFloat((row.data as XERTask).totalFloat)}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div style={{ minWidth: timelineWidth }}>
                  {/* Timeline Header */}
                  <div className="flex border-b bg-background sticky top-0 z-10">
                    {timelineDates.map((date, idx) => (
                      <div
                        key={idx}
                        className="px-2 py-1 text-xs font-semibold border-r text-center"
                        style={{
                          minWidth: dateScale === 'days' ? dayWidth * 7 : 
                                   dateScale === 'months' ? dayWidth * 30 :
                                   dateScale === 'quarters' ? dayWidth * 90 :
                                   dayWidth * 365
                        }}
                      >
                        {formatDateLabel(date)}
                      </div>
                    ))}
                  </div>

                  {/* Timeline Rows */}
                  <div className="relative">
                    {/* SVG overlay for dependency links */}
                    {showLinks && (
                      <svg
                        className="absolute inset-0 pointer-events-none"
                        style={{ 
                          width: timelineWidth,
                          height: hierarchyRows.length * 22,
                          zIndex: 5
                        }}
                      >
                        {filteredRelationships.map((rel: any, idx: number) => {
                          const path = calculateLinkPath(rel.predTaskId, rel.taskId, rel.predType);
                          if (!path) return null;
                          
                          // Check if this is a critical path link
                          const predTask = taskPositionMap.get(rel.predTaskId)?.task;
                          const succTask = taskPositionMap.get(rel.taskId)?.task;
                          const isCriticalLink = !!(predTask?.totalFloat !== null && predTask?.totalFloat !== undefined && predTask.totalFloat <= 0 &&
                                                 succTask?.totalFloat !== null && succTask?.totalFloat !== undefined && succTask.totalFloat <= 0);
                          
                          return (
                            <path
                              key={idx}
                              d={path}
                              stroke={isCriticalLink ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                              strokeWidth={isCriticalLink ? "2" : "1"}
                              fill="none"
                              opacity={isCriticalLink ? "0.4" : "0.3"}
                            />
                          );
                        })}
                      </svg>
                    )}
                    
                    {hierarchyRows.map((row) => (
                      <div
                        key={row.id}
                        className={`relative border-b ${row.type === 'wbs' ? 'h-6 bg-muted/30' : 'h-[22px]'}`}
                      >
                        {row.type === 'task' && (() => {
                          const barStyle = getTaskBarStyle(row.data as XERTask);
                          if (!barStyle) return null;

                          return (
                            <>
                              {/* Task Bar */}
                              <div
                                className={`absolute top-1 h-4 rounded ${
                                  barStyle.isCritical ? 'bg-destructive' : 'bg-primary'
                                }`}
                                style={{
                                  left: barStyle.left,
                                  width: barStyle.width,
                                }}
                              >
                                <div
                                  className="absolute top-0 left-0 bottom-0 bg-primary-foreground/20 rounded"
                                  style={{ width: `${barStyle.percentComplete}%` }}
                                />
                              </div>
                              {/* Task Name - to the right of bar */}
                              <span
                                className="absolute top-1 text-[10px] text-foreground truncate"
                                style={{
                                  left: `calc(${barStyle.left} + ${barStyle.width} + 4px)`,
                                }}
                              >
                                {(row.data as XERTask).taskName}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </CardContent>

      <ColumnPickerDialog
        open={columnPickerOpen}
        onOpenChange={setColumnPickerOpen}
        allColumns={ALL_COLUMNS}
        visibleColumns={visibleColumns}
        onColumnsChange={setVisibleColumns}
      />
    </Card>
  );
}
