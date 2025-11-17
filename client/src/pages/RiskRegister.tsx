import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, X, Clock, Lock, Settings2, BarChart3, Columns3, GripVertical, Sparkles, Send, Move, FileText, MessageSquare } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import Draggable from "react-draggable";
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
import { useProject } from "@/contexts/ProjectContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { AIStatusDialog } from "@/components/AIStatusDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ConsequenceRatingPicker } from "@/components/ConsequenceRatingPicker";
import { DistributionModelPicker } from "@/components/DistributionModelPicker";
import { RiskOpportunityMatrix } from "@/components/RiskOpportunityMatrix";
import { MonteCarloReportDashboard } from "@/components/MonteCarloReportDashboard";
import { useRiskRegisterWebSocket } from "@/hooks/useRiskRegisterWebSocket";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

type RiskRegisterRevision = {
  id: string;
  projectId: string;
  revisionNumber: number;
  revisionName: string;
  status: "active" | "superseded";
  notes: string | null;
  createdById: string;
  createdAt: string;
};

type Risk = {
  id: string;
  revisionId: string;
  riskNumber: string;
  title: string;
  description: string | null;
  riskType: string;
  ownerId: string | null;
  potentialCauses: string | null;
  potentialImpacts: string | null;
  existingControls: string | null;
  existingControlsStatus: string | null;
  consequenceTypeId: string | null;
  consequenceLevel: number | null;
  optimisticP10: number | null;
  likelyP50: number | null;
  pessimisticP90: number | null;
  probability: number | null;
  distributionModel: string | null;
  isDistributionAiSelected: boolean;
  treatmentDescription: string | null;
  treatmentOwnerId: string | null;
  treatmentDate: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LikelihoodScale = {
  id: string;
  projectId: string;
  level: number;
  label: string;
  description: string | null;
  probability: number | null;
  createdAt: string;
};

type ConsequenceScale = {
  id: string;
  projectId: string;
  level: number;
  dimension: string;
  label: string;
  description: string | null;
};

type HeatmapMatrixCell = {
  id: string;
  projectId: string;
  likelihood: number;
  impact: number;
  band: number;
  colorCode: string | null;
};

type DoaEscalationRule = {
  id: string;
  projectId: string;
  band: number;
  riskOrOpportunity: string;
  groupLevel: string | null;
  divisionLevel: string | null;
  businessUnitLevel: string | null;
  projectLevel: string | null;
  requiredActions: string | null;
  monitoringRequirements: string | null;
  createdAt: string;
};


// Column configuration
type RiskColumn = {
  id: string;
  label: string;
  width?: string;
  defaultVisible: boolean;
};

const ALL_RISK_COLUMNS: RiskColumn[] = [
  { id: "riskNumber", label: "Risk #", width: "w-[150px]", defaultVisible: true },
  { id: "title", label: "Title", defaultVisible: true },
  { id: "description", label: "Description", defaultVisible: true },
  { id: "owner", label: "Owner", defaultVisible: false },
  { id: "potentialCauses", label: "Potential Causes", defaultVisible: false },
  { id: "potentialImpacts", label: "Potential Impacts", defaultVisible: false },
  { id: "existingControls", label: "Existing Controls", defaultVisible: false },
  { id: "existingControlsStatus", label: "Controls Status", defaultVisible: false },
  { id: "consequenceRating", label: "Consequence Rating", defaultVisible: false },
  { id: "optimisticP10", label: "Optimistic (P10)", defaultVisible: false },
  { id: "likelyP50", label: "Likely (P50)", defaultVisible: false },
  { id: "pessimisticP90", label: "Pessimistic (P90)", defaultVisible: false },
  { id: "probability", label: "Prob %", defaultVisible: false },
  { id: "expectedValue", label: "(Prob % x Likely)", defaultVisible: false },
  { id: "distributionModel", label: "Distribution Model", defaultVisible: false },
  { id: "treatmentDescription", label: "Treatment Description", defaultVisible: false },
  { id: "treatmentOwner", label: "Treatment Owner", defaultVisible: false },
  { id: "treatmentDate", label: "Treatment Date", defaultVisible: false },
];

// Columns that contain numeric data and should be right-aligned
const NUMERIC_COLUMNS = new Set([
  "optimisticP10",
  "likelyP50", 
  "pessimisticP90",
  "probability",
  "expectedValue"
]);

const DEFAULT_VISIBLE_COLUMNS = ALL_RISK_COLUMNS
  .filter(col => col.defaultVisible)
  .map(col => col.id);

const DEFAULT_COLUMN_ORDER = ALL_RISK_COLUMNS.map(col => col.id);

// Sortable column item component
function SortableColumnItem({
  id,
  label,
  isVisible,
  onToggle,
}: {
  id: string;
  label: string;
  isVisible: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 p-2 bg-background border rounded-md cursor-grab active:cursor-grabbing"
      data-testid={`sortable-column-${id}`}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div 
        className="flex items-center gap-2 flex-1"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          id={`column-${id}`}
          checked={isVisible}
          onCheckedChange={onToggle}
          data-testid={`checkbox-column-${id}`}
        />
        <Label
          htmlFor={`column-${id}`}
          className="flex-1 cursor-pointer text-sm"
        >
          {label}
        </Label>
      </div>
    </div>
  );
}

// Project Risk Settings Component
function ProjectRiskSettings({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [editingRevenue, setEditingRevenue] = useState(false);
  const [editingProfit, setEditingProfit] = useState(false);
  const [revenueValue, setRevenueValue] = useState("");
  const [profitValue, setProfitValue] = useState("");

  // Fetch project data
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['/api/projects', projectId],
    enabled: !!projectId,
  });

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (data: { projectRevenue?: string; projectProfit?: string }) => {
      return await apiRequest('PATCH', `/api/projects/${projectId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: "Success",
        description: "Project financials updated successfully",
      });
      setEditingRevenue(false);
      setEditingProfit(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update project financials",
        variant: "destructive",
      });
    },
  });

  // Calculate delivery duration in days
  const calculateDeliveryDuration = (): number | null => {
    if (!project?.tenderStartDate || !project?.deliveryEndDate) {
      return null;
    }
    const startDate = new Date(project.tenderStartDate);
    const endDate = new Date(project.deliveryEndDate);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const deliveryDuration = calculateDeliveryDuration();

  // Calculate profit percentage
  const calculateProfitPercentage = (): string => {
    if (!project?.projectRevenue || !project?.projectProfit) {
      return "Not calculated";
    }
    const revenue = parseFloat(project.projectRevenue.replace(/,/g, ''));
    const profit = parseFloat(project.projectProfit.replace(/,/g, ''));
    
    if (isNaN(revenue) || isNaN(profit) || revenue === 0) {
      return "Not calculated";
    }
    
    const percentage = (profit / revenue) * 100;
    return `${percentage.toFixed(2)}%`;
  };

  // Revenue handlers
  const handleSaveRevenue = () => {
    const trimmedRevenue = revenueValue.trim();
    
    if (!trimmedRevenue) {
      toast({
        title: "Validation Error",
        description: "Please enter a revenue amount",
        variant: "destructive",
      });
      return;
    }
    
    const numericRevenue = trimmedRevenue.replace(/,/g, '');
    
    if (!/^\d+(\.\d{1,2})?$/.test(numericRevenue)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid number for revenue",
        variant: "destructive",
      });
      return;
    }
    
    updateProjectMutation.mutate({ projectRevenue: numericRevenue });
  };

  // Profit handlers
  const handleSaveProfit = () => {
    const trimmedProfit = profitValue.trim();
    
    if (!trimmedProfit) {
      toast({
        title: "Validation Error",
        description: "Please enter a profit amount",
        variant: "destructive",
      });
      return;
    }
    
    const numericProfit = trimmedProfit.replace(/,/g, '');
    
    if (!/^\d+(\.\d{1,2})?$/.test(numericProfit)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid number for profit",
        variant: "destructive",
      });
      return;
    }
    
    updateProjectMutation.mutate({ projectProfit: numericProfit });
  };

  const formatCurrency = (value: string | null | undefined): string => {
    if (!value) return "Not set";
    const numericValue = parseFloat(value.replace(/,/g, ''));
    if (isNaN(numericValue)) return value;
    return `$${numericValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading project settings...</div>;
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="mb-1">Project Risk Settings</h3>
          <p className="text-sm text-muted-foreground">
            Configure project parameters for consequence calculations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Project Revenue */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="project-revenue" className="text-sm font-medium">
                Project Revenue
              </Label>
              {editingRevenue ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={handleSaveRevenue}
                    disabled={updateProjectMutation.isPending}
                    data-testid="button-save-revenue"
                    className="h-6 px-2 text-xs"
                  >
                    {updateProjectMutation.isPending ? "..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingRevenue(false)}
                    data-testid="button-cancel-revenue"
                    className="h-6 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setRevenueValue(project?.projectRevenue || "");
                    setEditingRevenue(true);
                  }}
                  data-testid="button-edit-revenue"
                  className="h-6 px-2 text-xs"
                >
                  Edit
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Total contract value
            </p>
            {editingRevenue ? (
              <Input
                id="project-revenue"
                type="text"
                value={revenueValue}
                onChange={(e) => setRevenueValue(e.target.value)}
                placeholder="e.g., 50000000"
                data-testid="input-project-revenue"
              />
            ) : (
              <div className="font-mono text-lg font-semibold" data-testid="text-project-revenue">
                {formatCurrency(project?.projectRevenue)}
              </div>
            )}
          </div>

          {/* Delivery Duration */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">
              Delivery Period Duration
            </Label>
            <p className="text-xs text-muted-foreground">
              Used for time consequence ratings
            </p>
            <div className="font-mono text-lg font-semibold" data-testid="text-delivery-duration">
              {deliveryDuration !== null ? (
                <span>{deliveryDuration} days</span>
              ) : (
                <span className="text-muted-foreground">Not configured</span>
              )}
            </div>
          </div>

          {/* Project Gross Margin */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="project-profit" className="text-sm font-medium">
                Project Gross Margin
              </Label>
              {editingProfit ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={handleSaveProfit}
                    disabled={updateProjectMutation.isPending}
                    data-testid="button-save-profit"
                    className="h-6 px-2 text-xs"
                  >
                    {updateProjectMutation.isPending ? "..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingProfit(false)}
                    data-testid="button-cancel-profit"
                    className="h-6 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setProfitValue(project?.projectProfit || "");
                    setEditingProfit(true);
                  }}
                  data-testid="button-edit-profit"
                  className="h-6 px-2 text-xs"
                >
                  Edit
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              For financial consequence ratings
            </p>
            {editingProfit ? (
              <Input
                id="project-profit"
                type="text"
                value={profitValue}
                onChange={(e) => setProfitValue(e.target.value)}
                placeholder="e.g., 6388708"
                data-testid="input-project-profit"
              />
            ) : (
              <div className="font-mono text-lg font-semibold" data-testid="text-project-profit">
                {formatCurrency(project?.projectProfit)}
              </div>
            )}
          </div>

          {/* Profit Percentage */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">
              Profit Margin %
            </Label>
            <p className="text-xs text-muted-foreground">
              (Gross Margin / Revenue) × 100
            </p>
            <div className="font-mono text-lg font-semibold" data-testid="text-profit-percentage">
              {calculateProfitPercentage()}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Consequence Ratings Settings Component
type ConsequenceType = {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
};

type ConsequenceRating = {
  id: string;
  projectId: string;
  consequenceTypeId: string;
  level: number;
  description: string | null;
  createdAt: string;
};

function ConsequenceRatingsSettings({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [editingCell, setEditingCell] = useState<{typeId: string, level: number} | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAddTypeDialog, setShowAddTypeDialog] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [deleteTypeId, setDeleteTypeId] = useState<string | null>(null);

  // Fetch project data for calculations
  const { data: project } = useQuery<Project>({
    queryKey: ['/api/projects', projectId],
    enabled: !!projectId,
  });

  // Fetch consequence types
  const { data: types = [], isLoading: typesLoading } = useQuery<ConsequenceType[]>({
    queryKey: ['/api/projects', projectId, 'consequence-types'],
    enabled: !!projectId,
  });

  // Fetch consequence ratings
  const { data: ratings = [], isLoading: ratingsLoading } = useQuery<ConsequenceRating[]>({
    queryKey: ['/api/projects', projectId, 'consequence-ratings'],
    enabled: !!projectId,
  });

  // Add consequence type mutation
  const addTypeMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest('POST', `/api/projects/${projectId}/consequence-types`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'consequence-types'] });
      toast({
        title: "Success",
        description: "Consequence type added successfully",
      });
      setShowAddTypeDialog(false);
      setNewTypeName("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to add consequence type",
        variant: "destructive",
      });
    },
  });

  // Validate and add new type
  const handleAddType = () => {
    const trimmedName = newTypeName.trim();
    
    // Validation
    if (!trimmedName) {
      toast({
        title: "Validation Error",
        description: "Type name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicates (case-insensitive)
    const isDuplicate = types.some(
      type => type.name.toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (isDuplicate) {
      toast({
        title: "Validation Error",
        description: `A consequence type named "${trimmedName}" already exists`,
        variant: "destructive",
      });
      return;
    }

    addTypeMutation.mutate(trimmedName);
  };

  // Delete consequence type mutation
  const deleteTypeMutation = useMutation({
    mutationFn: async (typeId: string) => {
      return await apiRequest('DELETE', `/api/projects/${projectId}/consequence-types/${typeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'consequence-types'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'consequence-ratings'] });
      toast({
        title: "Success",
        description: "Consequence type deleted successfully",
      });
      setDeleteTypeId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete consequence type",
        variant: "destructive",
      });
      setDeleteTypeId(null);
    },
  });

  // Update rating mutation
  const updateRatingMutation = useMutation({
    mutationFn: async ({ typeId, level, description }: { typeId: string; level: number; description: string }) => {
      return await apiRequest('PUT', `/api/projects/${projectId}/consequence-ratings`, {
        consequenceTypeId: typeId,
        level,
        description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'consequence-ratings'] });
      toast({
        title: "Success",
        description: "Rating updated successfully",
      });
      // Only close editor on success
      setEditingCell(null);
      setEditValue("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update rating",
        variant: "destructive",
      });
      // Keep editor open on error so user can retry
    },
  });

  const handleCellClick = (typeId: string, typeName: string, level: number) => {
    // Prevent editing for Financial and Time types (they are locked)
    if (typeName === 'Financial' || typeName === 'Time') {
      return;
    }
    
    const rating = ratings.find(r => r.consequenceTypeId === typeId && r.level === level);
    setEditingCell({ typeId, level });
    setEditValue(rating?.description || "");
  };

  const handleCellSave = () => {
    if (editingCell) {
      updateRatingMutation.mutate({
        typeId: editingCell.typeId,
        level: editingCell.level,
        description: editValue.trim(),
      });
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const getRatingValue = (typeId: string, level: number) => {
    const rating = ratings.find(r => r.consequenceTypeId === typeId && r.level === level);
    return rating?.description || "";
  };

  // Calculate delivery duration in days
  const calculateDeliveryDuration = (): number | null => {
    if (!project?.tenderStartDate || !project?.deliveryEndDate) {
      return null;
    }
    const startDate = new Date(project.tenderStartDate);
    const endDate = new Date(project.deliveryEndDate);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get calculated values for Financial consequence type
  const getFinancialCalculatedValues = (level: number): string[] => {
    if (!project?.projectProfit) return [];
    const profit = parseFloat(project.projectProfit.replace(/,/g, ''));
    if (isNaN(profit)) return [];
    
    // Percentage ranges for each level
    const ranges: {[key: number]: number[]} = {
      1: [0.05],           // <5%
      2: [0.05, 0.20],     // 5-20%
      3: [0.20, 0.40],     // 20-40%
      4: [0.40, 0.70],     // 40-70%
      5: [0.70, 1.00],     // 70-100%
      6: [1.00],           // >100%
    };
    
    const percentages = ranges[level] || [];
    return percentages.map(pct => {
      const value = profit * pct;
      return `$${Math.round(value).toLocaleString('en-US')}`;
    });
  };

  // Get calculated values for Time consequence type
  const getTimeCalculatedValues = (level: number): string[] => {
    const duration = calculateDeliveryDuration();
    if (duration === null) return [];
    
    // Percentage ranges for each level (as schedule overrun)
    const ranges: {[key: number]: number[]} = {
      1: [0],              // Short term slippage
      2: [0],              // Schedule slippage without impact
      3: [0.05],           // <5%
      4: [0.05, 0.10],     // 5-10%
      5: [0.10, 0.20],     // 10-20%
      6: [0.20],           // >20%
    };
    
    const percentages = ranges[level] || [];
    if (level <= 2) {
      // For levels 1-2, show "0 Weeks"
      return ["0 Weeks"];
    }
    
    return percentages.map(pct => {
      const overrunDays = duration * pct;
      const months = overrunDays / 30;
      if (months >= 1) {
        return `${months.toFixed(1)} Months`;
      } else {
        const weeks = overrunDays / 7;
        return `${Math.round(weeks)} Weeks`;
      }
    });
  };

  // Get calculated values based on consequence type name
  const getCalculatedValues = (typeName: string, level: number): string[] => {
    if (typeName === "Financial") {
      return getFinancialCalculatedValues(level);
    } else if (typeName === "Time") {
      return getTimeCalculatedValues(level);
    }
    return [];
  };

  if (typesLoading || ratingsLoading) {
    return (
      <Card className="p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </Card>
    );
  }

  const sortedTypes = [...types].sort((a, b) => {
    // Financial first, Time second, then alphabetical
    if (a.name === "Financial") return -1;
    if (b.name === "Financial") return 1;
    if (a.name === "Time") return -1;
    if (b.name === "Time") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3>Consequence Ratings Matrix</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Define rating descriptions for levels 1-6 across all consequence types
            </p>
          </div>
          <Button
            onClick={() => setShowAddTypeDialog(true)}
            size="sm"
            data-testid="button-add-consequence-type"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Type
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px] text-center font-semibold">Level</TableHead>
                  {sortedTypes.map((type) => (
                    <TableHead key={type.id} className="min-w-[250px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{type.name}</span>
                        {!type.isDefault && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setDeleteTypeId(type.id)}
                            data-testid={`button-delete-type-${type.id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5, 6].map((level) => (
                  <TableRow key={level}>
                    <TableCell className="text-center font-semibold bg-muted">
                      {level}
                    </TableCell>
                    {sortedTypes.map((type) => {
                      const isEditing = editingCell?.typeId === type.id && editingCell?.level === level;
                      const value = getRatingValue(type.id, level);
                      const isLocked = type.name === 'Financial' || type.name === 'Time';
                      
                      return (
                        <TableCell
                          key={`${type.id}-${level}`}
                        >
                          {isEditing ? (
                            <div>
                              <Textarea
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="min-h-[60px] mb-2"
                                placeholder="Enter description..."
                                autoFocus
                                data-testid={`textarea-rating-${type.id}-${level}`}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={handleCellSave}
                                  disabled={updateRatingMutation.isPending}
                                  data-testid={`button-save-rating-${type.id}-${level}`}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCellCancel}
                                  data-testid={`button-cancel-rating-${type.id}-${level}`}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`${isLocked ? 'bg-muted/30' : 'cursor-pointer hover-elevate'}`}
                              onClick={() => !isLocked && handleCellClick(type.id, type.name, level)}
                              data-testid={`cell-rating-${type.id}-${level}`}
                            >
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  {value ? (
                                    <p className="text-sm whitespace-pre-wrap flex-1">{value}</p>
                                  ) : (
                                    <p className="text-sm text-muted-foreground italic flex-1">Click to add description...</p>
                                  )}
                                  {isLocked && (
                                    <Lock className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                  )}
                                </div>
                                
                                {/* Calculated values for Financial and Time */}
                                {(() => {
                                  const calculatedValues = getCalculatedValues(type.name, level);
                                  if (calculatedValues.length > 0) {
                                    return (
                                      <div className="flex gap-2 flex-wrap">
                                        {calculatedValues.map((calcValue, idx) => (
                                          <span key={idx} className="text-base font-semibold text-red-600 dark:text-red-400">
                                            {calcValue}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Financial and Time are default consequence types and cannot be deleted</p>
          <p>• Financial and Time descriptions are locked and explain how the calculated values are generated</p>
          <p>• Click any unlocked cell to edit the description for that level and type</p>
          <p>• Use these ratings to assess the potential impact of risks</p>
        </div>
      </div>

      {/* Add Type Dialog */}
      <Dialog open={showAddTypeDialog} onOpenChange={setShowAddTypeDialog}>
        <DialogContent data-testid="dialog-add-consequence-type">
          <DialogHeader>
            <DialogTitle>Add Consequence Type</DialogTitle>
            <DialogDescription>
              Create a new consequence type to assess risk impacts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-type-name">Type Name</Label>
              <Input
                id="new-type-name"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g., Safety, Reputation, Environmental"
                data-testid="input-new-type-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddTypeDialog(false);
                setNewTypeName("");
              }}
              data-testid="button-cancel-add-type"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddType}
              disabled={addTypeMutation.isPending}
              data-testid="button-confirm-add-type"
            >
              {addTypeMutation.isPending ? "Adding..." : "Add Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Type Confirmation */}
      <Dialog open={!!deleteTypeId} onOpenChange={(open) => !open && setDeleteTypeId(null)}>
        <DialogContent data-testid="dialog-delete-consequence-type">
          <DialogHeader>
            <DialogTitle>Delete Consequence Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this consequence type? All associated ratings will also be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTypeId(null)}
              data-testid="button-cancel-delete-type"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTypeId && deleteTypeMutation.mutate(deleteTypeId)}
              disabled={deleteTypeMutation.isPending}
              data-testid="button-confirm-delete-type"
            >
              {deleteTypeMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function RiskRegister() {
  const { selectedProject } = useProject();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [showCreateRevisionDialog, setShowCreateRevisionDialog] = useState(false);
  const [newRevisionName, setNewRevisionName] = useState("");
  const [newRevisionNotes, setNewRevisionNotes] = useState("");
  
  // Local state for text fields in Risk Detail Dialog to prevent cursor jumping
  const [localTitle, setLocalTitle] = useState("");
  const [localDescription, setLocalDescription] = useState("");
  const [localPotentialCauses, setLocalPotentialCauses] = useState("");
  const [localPotentialImpacts, setLocalPotentialImpacts] = useState("");
  const [localExistingControls, setLocalExistingControls] = useState("");
  const [localTreatmentDescription, setLocalTreatmentDescription] = useState("");
  const [showCreateRiskDialog, setShowCreateRiskDialog] = useState(false);
  const [newRiskType, setNewRiskType] = useState<"threat" | "opportunity">("threat");
  const [newRiskTitle, setNewRiskTitle] = useState("");
  const [newRiskDescription, setNewRiskDescription] = useState("");
  
  // Edit risk state
  const [showEditRiskDialog, setShowEditRiskDialog] = useState(false);
  const [editRiskData, setEditRiskData] = useState<Partial<Risk>>({});
  
  // Consequence rating picker state
  const [showConsequenceRatingPicker, setShowConsequenceRatingPicker] = useState(false);
  const [consequencePickerRiskId, setConsequencePickerRiskId] = useState<string | null>(null);
  
  // Distribution model picker state
  const [showDistributionPicker, setShowDistributionPicker] = useState(false);
  const [distributionPickerRiskId, setDistributionPickerRiskId] = useState<string | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState("risks");
  
  // Track if risk was opened from Reports tab (for tornado chart clicks)
  const [openedFromReports, setOpenedFromReports] = useState(false);
  
  // Trigger for re-running Monte Carlo simulation after editing a risk in Reports tab
  const [monteCarloRerunTrigger, setMonteCarloRerunTrigger] = useState(0);
  
  // AI Risk Analysis state
  const [showAIAnalysisChoiceDialog, setShowAIAnalysisChoiceDialog] = useState(false);
  const [showAIAnalysisDialog, setShowAIAnalysisDialog] = useState(false);
  
  // Delete confirmation dialog state
  const [deleteConfirmRisk, setDeleteConfirmRisk] = useState<{ id: string; riskNumber: string; title: string } | null>(null);
  const [aiAnalysisResults, setAIAnalysisResults] = useState<any[]>([]);
  const [selectedAIRisks, setSelectedAIRisks] = useState<Set<number>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiOperationId, setAiOperationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // Local state for number inputs to prevent cursor jumping
  const [editingP10, setEditingP10] = useState<string>("");
  const [editingP50, setEditingP50] = useState<string>("");
  const [editingP90, setEditingP90] = useState<string>("");
  const [editingProbability, setEditingProbability] = useState<string>("");
  const [isEditingNumber, setIsEditingNumber] = useState<string | null>(null);
  
  // Initialize WebSocket for real-time updates
  useRiskRegisterWebSocket({
    projectId: selectedProject?.id || null,
    enabled: !!selectedProject,
  });
  
  // Column preferences state
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS);
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMN_ORDER);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  
  // Dialog positioning for perfect centering
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dialogPosition, setDialogPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizeStartX, setResizeStartX] = useState<number>(0);
  const [resizeStartWidth, setResizeStartWidth] = useState<number>(0);

  // Fetch user's column preferences
  const { data: columnPreferences } = useQuery<{ visibleColumns?: string[]; columnOrder?: string[]; columnWidths?: Record<string, number> }>({
    queryKey: ["/api/user-risk-column-preferences"],
  });

  // Load column preferences on mount
  useEffect(() => {
    if (columnPreferences) {
      const validColumnIds = ALL_RISK_COLUMNS.map(col => col.id);
      
      // Filter out invalid column IDs from saved preferences
      if (columnPreferences.visibleColumns) {
        const sanitizedVisible = columnPreferences.visibleColumns.filter((colId: string) => 
          validColumnIds.includes(colId)
        );
        setVisibleColumns(sanitizedVisible.length > 0 ? sanitizedVisible : DEFAULT_VISIBLE_COLUMNS);
      }
      
      if (columnPreferences.columnOrder) {
        const sanitizedOrder = columnPreferences.columnOrder.filter((colId: string) => 
          validColumnIds.includes(colId)
        );
        // Add any new columns that aren't in the saved order
        const missingColumns = validColumnIds.filter(id => !sanitizedOrder.includes(id));
        setColumnOrder([...sanitizedOrder, ...missingColumns]);
      }

      if (columnPreferences.columnWidths) {
        setColumnWidths(columnPreferences.columnWidths);
      }
    }
  }, [columnPreferences]);

  // Save column preferences mutation
  const saveColumnPreferencesMutation = useMutation({
    mutationFn: async (data: { visibleColumns: string[]; columnOrder: string[]; columnWidths?: Record<string, number> }) => {
      return await apiRequest("PUT", "/api/user-risk-column-preferences", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/user-risk-column-preferences"],
      });
    },
  });

  // Save preferences helper
  const savePreferences = (newVisibleColumns?: string[], newColumnOrder?: string[], newColumnWidths?: Record<string, number>) => {
    const cols = newVisibleColumns ?? visibleColumns;
    const order = newColumnOrder ?? columnOrder;
    const widths = newColumnWidths ?? columnWidths;
    saveColumnPreferencesMutation.mutate({ 
      visibleColumns: cols, 
      columnOrder: order,
      columnWidths: widths
    });
  };

  // Ordered visible columns
  const orderedVisibleColumns = useMemo(() => {
    return columnOrder
      .filter(colId => visibleColumns.includes(colId))
      .map(colId => ALL_RISK_COLUMNS.find(col => col.id === colId))
      .filter((col): col is RiskColumn => col !== undefined);
  }, [columnOrder, visibleColumns]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle column reorder
  const handleDragEnd = (event: DragEndEvent) => {
    try {
      console.log('[Column Reorder] handleDragEnd called!', event);
      const { active, over } = event;
      console.log('[Column Reorder] Drag end event:', { active: active.id, over: over?.id });
      if (over && active.id !== over.id) {
        const oldIndex = columnOrder.indexOf(active.id as string);
        const newIndex = columnOrder.indexOf(over.id as string);
        const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
        console.log('[Column Reorder] New order:', newOrder);
        setColumnOrder(newOrder);
        // Save immediately with new order
        console.log('[Column Reorder] Saving preferences...');
        savePreferences(visibleColumns, newOrder);
      } else {
        console.log('[Column Reorder] No reorder needed - same position or no over target');
      }
    } catch (error) {
      console.error('[Column Reorder] Error in handleDragEnd:', error);
    }
  };

  // Toggle column visibility
  const toggleColumn = (columnId: string) => {
    const newVisible = visibleColumns.includes(columnId)
      ? visibleColumns.filter(id => id !== columnId)
      : [...visibleColumns, columnId];
    setVisibleColumns(newVisible);
    // Save immediately with new visibility
    savePreferences(newVisible, columnOrder);
  };

  // Column resize handlers
  const handleResizeStart = (columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnId);
    setResizeStartX(e.clientX);
    const currentWidth = columnWidths[columnId] || 150; // Default width
    setResizeStartWidth(currentWidth);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingColumn) return;
    
    const delta = e.clientX - resizeStartX;
    const newWidth = Math.max(80, resizeStartWidth + delta); // Min width of 80px
    
    setColumnWidths(prev => ({
      ...prev,
      [resizingColumn]: newWidth
    }));
  };

  const handleResizeEnd = () => {
    if (resizingColumn) {
      // Save the new widths
      savePreferences(visibleColumns, columnOrder, columnWidths);
      setResizingColumn(null);
    }
  };

  // Add and remove global mouse event listeners for resize
  useEffect(() => {
    if (resizingColumn) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth, columnWidths]);

  // Get column width
  const getColumnWidth = (columnId: string) => {
    return columnWidths[columnId] || undefined;
  };

  // Fetch all revisions for the project (ordered by revision_number desc, so highest is first)
  const { data: revisions, isLoading: isLoadingRevisions } = useQuery<RiskRegisterRevision[]>({
    queryKey: ["/api/projects", selectedProject?.id, "risk-revisions"],
    enabled: !!selectedProject?.id,
  });

  // Fetch or initialize the active revision (backend auto-creates if none exists)
  const { data: activeRevision } = useQuery<RiskRegisterRevision>({
    queryKey: ["/api/projects", selectedProject?.id, "risk-revisions", "active"],
    enabled: !!selectedProject?.id,
  });

  // Get the highest revision number (first in the list since it's ordered desc)
  const highestRevision = revisions?.[0];

  // Use selected revision or default to active revision or highest revision number
  const currentRevision = selectedRevisionId 
    ? revisions?.find(r => r.id === selectedRevisionId)
    : activeRevision || highestRevision;

  const isViewingSuperseded = currentRevision?.status === "superseded";

  // Fetch risks for the current revision
  const { data: risks, isLoading } = useQuery<Risk[]>({
    queryKey: ["/api/projects", selectedProject?.id, "risks", currentRevision?.id],
    queryFn: currentRevision 
      ? async () => {
          const response = await fetch(
            `/api/projects/${selectedProject?.id}/risks?revisionId=${currentRevision.id}`
          );
          if (!response.ok) throw new Error("Failed to fetch risks");
          return response.json();
        }
      : undefined,
    enabled: !!selectedProject?.id && !!currentRevision,
  });

  // Fetch people for owner names  
  const { data: usersData } = useQuery<Array<{ personId: string; givenName: string; familyName: string }>>({
    queryKey: ["/api/users"],
    enabled: !!selectedCompany,
  });

  // Map users to people format for easier use
  const people = usersData?.map(user => ({
    id: user.personId,
    givenName: user.givenName,
    familyName: user.familyName,
  }));

  // Fetch consequence types for risk consequence rating
  const { data: types = [] } = useQuery<ConsequenceType[]>({
    queryKey: ['/api/projects', selectedProject?.id, 'consequence-types'],
    enabled: !!selectedProject?.id,
  });

  // Create new revision mutation
  const createRevisionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        `/api/projects/${selectedProject?.id}/risk-revisions`,
        {
          revisionName: newRevisionName,
          notes: newRevisionNotes,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risk-revisions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      toast({
        title: "Revision created",
        description: "New risk register revision created successfully.",
      });
      setShowCreateRevisionDialog(false);
      setNewRevisionName("");
      setNewRevisionNotes("");
      setSelectedRevisionId(null); // Switch to new active revision
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create new revision.",
        variant: "destructive",
      });
    },
  });

  // Create new risk mutation
  const createRiskMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "POST",
        `/api/projects/${selectedProject?.id}/risks`,
        {
          title: newRiskTitle,
          description: newRiskDescription || null,
          riskType: newRiskType,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      toast({
        title: newRiskType === "opportunity" ? "Opportunity created" : "Risk created",
        description: `New ${newRiskType} created successfully.`,
      });
      setShowCreateRiskDialog(false);
      setNewRiskTitle("");
      setNewRiskDescription("");
      setNewRiskType("threat");
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to create ${newRiskType}.`,
        variant: "destructive",
      });
    },
  });

  // AI Risk Analysis mutation
  const runAIAnalysisMutation = useMutation({
    mutationFn: async () => {
      // Generate unique operation ID for progress tracking
      const operationId = `risk-analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setAiOperationId(operationId);
      setIsAnalyzing(true);
      
      const response = await apiRequest(
        "POST",
        `/api/projects/${selectedProject?.id}/ai-risk-analysis`,
        {
          aiModel: selectedCompany?.aiLetterModel || 'gpt-4o',
          operationId
        }
      );
      return await response.json();
    },
    onSuccess: (data: any) => {
      console.log('[AI Risk Analysis] Response received:', data);
      console.log('[AI Risk Analysis] data.risks:', data.risks);
      console.log('[AI Risk Analysis] data.risks?.length:', data.risks?.length);
      setAIAnalysisResults(data.risks || []);
      setSelectedAIRisks(new Set());
      setIsAnalyzing(false);
      setAiOperationId(null);
      setShowAIAnalysisDialog(true);
      
      toast({
        title: "Analysis complete",
        description: `Found ${data.risks?.length || 0} potential risks and opportunities.`,
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
      setAiOperationId(null);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze project documents.",
        variant: "destructive",
      });
    },
  });

  // Import selected AI risks mutation
  const importAIRisksMutation = useMutation({
    mutationFn: async () => {
      const selectedRisks = aiAnalysisResults.filter((_, idx) => 
        selectedAIRisks.has(idx)
      );
      
      // Helper to convert AI value to integer (handles both percentages and dollar amounts)
      const parseAIValue = (value: string | undefined) => {
        if (!value) return null;
        const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
        // If value is less than 100, assume it's a percentage and multiply by 1000
        // Otherwise treat as dollar amount
        return Math.round(numericValue * (numericValue < 100 ? 1000 : 1));
      };
      
      // Create risks sequentially to maintain order
      const results = [];
      for (const risk of selectedRisks) {
        const response = await apiRequest(
          "POST",
          `/api/projects/${selectedProject?.id}/risks`,
          {
            title: risk.title,
            description: risk.description || null,
            riskType: risk.riskType,
            potentialCauses: risk.potentialCauses || null,
            potentialImpacts: risk.potentialImpacts || null,
            existingControls: risk.existingControls || null,
            optimisticP10: parseAIValue(risk.p10),
            likelyP50: parseAIValue(risk.p50),
            pessimisticP90: parseAIValue(risk.p90),
            probability: risk.probability ? Math.round(parseFloat(String(risk.probability).replace(/[^0-9.-]/g, '')) * 100) : null,
          }
        );
        const result = await response.json();
        results.push(result);
      }
      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      toast({
        title: "Risks imported",
        description: `Successfully imported ${data.length} risk${data.length !== 1 ? 's' : ''}.`,
      });
      setShowAIAnalysisDialog(false);
      setAIAnalysisResults([]);
      setSelectedAIRisks(new Set());
      setChatMessages([]);
      setChatInput('');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to import risks.",
        variant: "destructive",
      });
    },
  });

  // Handle chat send
  const handleChatSend = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const response = await apiRequest(
        "POST",
        `/api/projects/${selectedProject?.id}/ai-risk-chat`,
        {
          messages: [...chatMessages, { role: 'user', content: userMessage }],
          aiModel: selectedCompany?.aiLetterModel || 'gpt-4o'
        }
      );
      const data = await response.json();

      // Add assistant message to chat
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message }]);

      // Add any new risks to the results
      if (data.risks && data.risks.length > 0) {
        setAIAnalysisResults(prev => [...prev, ...data.risks]);
        toast({
          title: "Risks added",
          description: `${data.risks.length} new risk${data.risks.length !== 1 ? 's' : ''} added to the list.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Chat error",
        description: error.message || "Failed to process chat message.",
        variant: "destructive",
      });
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Auto-save risk mutation (silent, no toast, doesn't close dialog)
  const autoSaveRiskMutation = useMutation({
    mutationFn: async (payload: Partial<Risk> & { id: string }) => {
      const { id, ...updateData } = payload;
      return await apiRequest("PATCH", `/api/risks/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
    },
    onError: (error) => {
      console.error('Auto-save failed:', error);
      toast({
        title: "Auto-save failed",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Helper function to auto-save a field
  const autoSaveField = (fieldName: keyof Risk, value: any) => {
    if (!editRiskData.id) return;
    
    autoSaveRiskMutation.mutate({
      id: editRiskData.id,
      [fieldName]: value,
    });
  };

  // Update risk mutation (for explicit save button)
  const updateRiskMutation = useMutation({
    mutationFn: async () => {
      if (!editRiskData.id) throw new Error("No risk ID");
      // Sanitize payload to only include updateable fields
      const payload = {
        title: editRiskData.title,
        description: editRiskData.description,
        ownerId: editRiskData.ownerId,
        potentialCauses: editRiskData.potentialCauses,
        potentialImpacts: editRiskData.potentialImpacts,
        existingControls: editRiskData.existingControls,
        existingControlsStatus: editRiskData.existingControlsStatus,
        consequenceTypeId: editRiskData.consequenceTypeId,
        consequenceLevel: editRiskData.consequenceLevel,
        optimisticP10: editRiskData.optimisticP10,
        likelyP50: editRiskData.likelyP50,
        pessimisticP90: editRiskData.pessimisticP90,
        probability: editRiskData.probability,
        distributionModel: editRiskData.distributionModel,
        isDistributionAiSelected: editRiskData.isDistributionAiSelected,
        treatmentDescription: editRiskData.treatmentDescription,
        treatmentOwnerId: editRiskData.treatmentOwnerId,
        treatmentDate: editRiskData.treatmentDate,
      };
      return await apiRequest("PATCH", `/api/risks/${editRiskData.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      toast({
        title: "Risk updated",
        description: "Risk updated successfully.",
      });
      setShowEditRiskDialog(false);
      setSelectedRiskId(null);
      setEditRiskData({});
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update risk.",
        variant: "destructive",
      });
    },
  });

  // Delete risk mutation
  const deleteRiskMutation = useMutation({
    mutationFn: async (riskId: string) => {
      return await apiRequest("DELETE", `/api/risks/${riskId}`, {});
    },
    onSuccess: async () => {
      // Invalidate and refetch to ensure UI updates
      await queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      // Force a refetch to ensure the UI updates immediately
      await queryClient.refetchQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks", currentRevision?.id],
        exact: true,
      });
      toast({
        title: "Risk deleted",
        description: "Risk deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete risk.",
        variant: "destructive",
      });
    },
  });

  // AI Distribution Analysis Mutations
  const analyzeDistributionMutation = useMutation({
    mutationFn: async (riskId: string) => {
      const response = await apiRequest("POST", `/api/risks/${riskId}/ai-distribution`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      toast({
        title: "AI Analysis Complete",
        description: `Distribution model "${data.recommendation.distributionModel}" recommended with ${data.recommendation.confidence} confidence.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "AI Analysis Failed",
        description: error.message || "Failed to analyze distribution. Ensure P10, P50, and P90 values are set.",
        variant: "destructive",
      });
    },
  });

  const analyzeBulkDistributionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject?.id || !currentRevision?.id) {
        throw new Error("No project or revision selected");
      }
      const response = await apiRequest("POST", `/api/projects/${selectedProject.id}/risks/ai-distribution-bulk`, {
        revisionId: currentRevision.id,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      toast({
        title: "Bulk AI Analysis Complete",
        description: `Analyzed ${data.analyzed} risks successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Analysis Failed",
        description: error.message || "Failed to analyze distributions.",
        variant: "destructive",
      });
    },
  });

  // Consequence rating update mutation
  const updateConsequenceRatingMutation = useMutation({
    mutationFn: async ({ riskId, typeId, level }: { riskId: string; typeId: string; level: number }) => {
      return await apiRequest("PATCH", `/api/risks/${riskId}`, {
        consequenceTypeId: typeId,
        consequenceLevel: level,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      toast({
        title: "Consequence rating updated",
        description: "Risk consequence rating updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update consequence rating.",
        variant: "destructive",
      });
    },
  });

  // Handler to open consequence rating picker
  const handleConsequenceRatingClick = (riskId: string) => {
    setConsequencePickerRiskId(riskId);
    setShowConsequenceRatingPicker(true);
  };

  // Calculate heatmap color based on consequence level (1-6) and probability %
  const getRiskHeatmapColor = (consequenceLevel: number, probability: number): string => {
    // Probability categories based on likelihood table
    // Rare: <5%, Unlikely: 5-19%, Possible: 20-49%, Likely: 50-79%, Almost Certain: >=80%
    
    // Map probability to likelihood category (0-4)
    let likelihoodCategory = 0;
    if (probability >= 80) likelihoodCategory = 4; // Almost Certain
    else if (probability >= 50) likelihoodCategory = 3; // Likely
    else if (probability >= 20) likelihoodCategory = 2; // Possible
    else if (probability >= 5) likelihoodCategory = 1; // Unlikely
    else likelihoodCategory = 0; // Rare

    // Risk matrix colors: Green (low) → Yellow → Orange → Red (high)
    // Matrix is 6 columns (consequence 1-6) x 5 rows (likelihood 0-4)
    const riskMatrix = [
      // Rare (0-4%)
      ["bg-green-200 dark:bg-green-900/40", "bg-green-200 dark:bg-green-900/40", "bg-green-200 dark:bg-green-900/40", "bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-300 dark:bg-yellow-800/50"],
      // Unlikely (5-19%)
      ["bg-green-200 dark:bg-green-900/40", "bg-green-200 dark:bg-green-900/40", "bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-300 dark:bg-yellow-800/50", "bg-orange-300 dark:bg-orange-900/40"],
      // Possible (20-49%)
      ["bg-green-200 dark:bg-green-900/40", "bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-300 dark:bg-yellow-800/50", "bg-orange-300 dark:bg-orange-900/40", "bg-red-400 dark:bg-red-900/50"],
      // Likely (50-79%)
      ["bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-300 dark:bg-yellow-800/50", "bg-orange-300 dark:bg-orange-900/40", "bg-orange-400 dark:bg-orange-800/50", "bg-red-500 dark:bg-red-900/60"],
      // Almost Certain (80-100%)
      ["bg-yellow-200 dark:bg-yellow-900/40", "bg-yellow-300 dark:bg-yellow-800/50", "bg-orange-300 dark:bg-orange-900/40", "bg-orange-400 dark:bg-orange-800/50", "bg-red-400 dark:bg-red-900/50", "bg-red-600 dark:bg-red-900/70"],
    ];

    // Get color from matrix (consequence level is 1-6, convert to 0-5)
    const consequenceIndex = Math.min(Math.max(consequenceLevel - 1, 0), 5);
    return riskMatrix[likelihoodCategory][consequenceIndex];
  };

  // Handler when consequence rating is selected
  const handleConsequenceRatingSelect = (typeId: string, level: number) => {
    if (consequencePickerRiskId) {
      // Check if we're in edit mode (edit dialog is open)
      if (showEditRiskDialog && consequencePickerRiskId === editRiskData.id) {
        // Update edit form data instead of directly mutating
        setEditRiskData({
          ...editRiskData,
          consequenceTypeId: typeId,
          consequenceLevel: level,
        });
      } else {
        // Direct table cell update - mutate immediately
        updateConsequenceRatingMutation.mutate({
          riskId: consequencePickerRiskId,
          typeId,
          level,
        });
      }
    }
  };

  // Debounce timers for text fields
  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Quick update mutation for auto-save
  const handleQuickUpdate = useCallback(async (riskId: string, updates: Partial<Risk>, debounce = false) => {
    // For text fields, debounce to avoid excessive API calls
    if (debounce) {
      const key = `${riskId}-${Object.keys(updates)[0]}`;
      if (debounceTimers.current.has(key)) {
        clearTimeout(debounceTimers.current.get(key)!);
      }
      
      const timer = setTimeout(async () => {
        try {
          console.log('[Risk Update] Sending debounced update:', { riskId, updates });
          await apiRequest("PATCH", `/api/risks/${riskId}`, updates);
          queryClient.invalidateQueries({
            queryKey: ["/api/projects", selectedProject?.id, "risks"],
            exact: false,
          });
          debounceTimers.current.delete(key);
        } catch (error) {
          console.error('[Risk Update] Error:', error);
          toast({
            title: "Update failed",
            description: "Failed to save changes. Please try again.",
            variant: "destructive",
          });
        }
      }, 500); // 500ms debounce for text fields
      
      debounceTimers.current.set(key, timer);
    } else {
      // Immediate update for selects, numbers, etc.
      try {
        console.log('[Risk Update] Sending immediate update:', { riskId, updates });
        const result = await apiRequest("PATCH", `/api/risks/${riskId}`, updates);
        console.log('[Risk Update] Success:', result);
        queryClient.invalidateQueries({
          queryKey: ["/api/projects", selectedProject?.id, "risks"],
          exact: false,
        });
      } catch (error) {
        console.error('[Risk Update] Error:', error);
        toast({
          title: "Update failed",
          description: "Failed to save changes. Please try again.",
          variant: "destructive",
        });
      }
    }
  }, [selectedProject?.id, toast]);

  // Distribution model update mutation
  const updateDistributionModelMutation = useMutation({
    mutationFn: async ({ riskId, model }: { riskId: string; model: string }) => {
      return await apiRequest("PATCH", `/api/risks/${riskId}`, {
        distributionModel: model,
        isDistributionAiSelected: false, // Manual selection from picker
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", selectedProject?.id, "risks"],
        exact: false,
      });
      toast({
        title: "Distribution model updated",
        description: "Risk distribution model updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update distribution model.",
        variant: "destructive",
      });
    },
  });

  // Handler to open distribution picker
  const handleDistributionModelClick = (riskId: string) => {
    setDistributionPickerRiskId(riskId);
    setShowDistributionPicker(true);
  };

  // Handler when distribution model is selected
  const handleDistributionModelSelect = (model: string) => {
    if (distributionPickerRiskId) {
      // Check if we're in edit mode (edit dialog is open)
      if (showEditRiskDialog && distributionPickerRiskId === editRiskData.id) {
        // Update edit form data instead of directly mutating
        setEditRiskData({
          ...editRiskData,
          distributionModel: model,
          isDistributionAiSelected: false,
        });
      } else {
        // Direct table cell update - mutate immediately
        updateDistributionModelMutation.mutate({
          riskId: distributionPickerRiskId,
          model,
        });
      }
    }
  };

  // Handler to open edit dialog
  const handleEditRisk = (risk: Risk) => {
    setEditRiskData(risk);
    setShowEditRiskDialog(true);
  };


  const filteredRisks = (risks || []).filter((risk) => {
    return risk.riskNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (risk.description || "").toLowerCase().includes(searchQuery.toLowerCase());
  });

  const selectedRisk = selectedRiskId ? risks?.find(r => r.id === selectedRiskId) : null;
  
  // Sync local state when selectedRisk changes
  useEffect(() => {
    if (selectedRisk) {
      setLocalTitle(selectedRisk.title || "");
      setLocalDescription(selectedRisk.description || "");
      setLocalPotentialCauses(selectedRisk.potentialCauses || "");
      setLocalPotentialImpacts(selectedRisk.potentialImpacts || "");
      setLocalExistingControls(selectedRisk.existingControls || "");
      setLocalTreatmentDescription(selectedRisk.treatmentDescription || "");
    } else {
      // Clear local state when dialog closes
      setLocalTitle("");
      setLocalDescription("");
      setLocalPotentialCauses("");
      setLocalPotentialImpacts("");
      setLocalExistingControls("");
      setLocalTreatmentDescription("");
    }
  }, [selectedRisk?.id]); // Only update when risk ID changes, not on every field change

  // Calculate centered position for dialog when it opens
  useLayoutEffect(() => {
    if (selectedRiskId && dialogRef.current) {
      const dialog = dialogRef.current;
      const dialogWidth = dialog.offsetWidth;
      const dialogHeight = dialog.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calculate centered position
      const centeredX = (viewportWidth - dialogWidth) / 2;
      const centeredY = (viewportHeight - dialogHeight) / 2;
      
      setDialogPosition({ x: centeredX, y: centeredY });
    }
  }, [selectedRiskId]);

  const clearFilters = () => {
    setSearchQuery("");
  };

  // Helper function to render cell content
  const renderCellContent = (risk: Risk, columnId: string) => {
    switch (columnId) {
      case "riskNumber":
        const isOpportunity = risk.riskNumber.startsWith("O");
        return (
          <button
            className="flex items-center gap-2 cursor-pointer hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary rounded px-1"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRiskId(risk.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedRiskId(risk.id);
              }
            }}
            data-testid={`button-open-risk-${risk.id}`}
            type="button"
          >
            <span className="font-mono font-medium">{risk.riskNumber}</span>
            <Badge 
              variant="secondary" 
              className={isOpportunity ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-400"}
            >
              {isOpportunity ? "O" : "R"}
            </Badge>
          </button>
        );
      case "title":
        return <div className="font-medium">{risk.title}</div>;
      case "description":
        return risk.description || "-";
      case "owner":
        const owner = people?.find(p => p.id === risk.ownerId);
        return owner ? `${owner.givenName} ${owner.familyName}` : "-";
      case "potentialCauses":
        return risk.potentialCauses || "-";
      case "potentialImpacts":
        return risk.potentialImpacts || "-";
      case "existingControls":
        return risk.existingControls || "-";
      case "existingControlsStatus":
        if (!risk.existingControlsStatus) return "-";
        const statusColors = {
          green: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
          amber: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
          red: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
        };
        const statusLabels = {
          green: "Effective",
          amber: "Adequate",
          red: "Weak",
        };
        const status = risk.existingControlsStatus as "green" | "amber" | "red";
        return (
          <Badge className={`${statusColors[status]} border`}>
            {statusLabels[status]}
          </Badge>
        );
      case "consequenceRating":
        const heatmapColor = (risk.consequenceLevel && risk.probability !== null && risk.probability !== undefined) 
          ? getRiskHeatmapColor(risk.consequenceLevel, risk.probability)
          : "";
        
        if (!risk.consequenceTypeId || !risk.consequenceLevel) {
          return (
            <button
              className={`cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary rounded px-2 py-1 w-full text-left ${heatmapColor}`}
              onClick={(e) => {
                e.stopPropagation();
                handleConsequenceRatingClick(risk.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConsequenceRatingClick(risk.id);
                }
              }}
              data-testid={`button-select-consequence-${risk.id}`}
              type="button"
            >
              <span className="text-sm text-muted-foreground">Select...</span>
            </button>
          );
        }
        const consequenceType = types?.find((t: ConsequenceType) => t.id === risk.consequenceTypeId);
        if (!consequenceType) return "-";
        return (
          <button 
            className={`flex items-center justify-between gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary rounded px-2 py-1 border-0 w-full ${heatmapColor}`}
            onClick={(e) => {
              e.stopPropagation();
              handleConsequenceRatingClick(risk.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                handleConsequenceRatingClick(risk.id);
              }
            }}
            data-testid={`consequence-rating-${risk.id}`}
            type="button"
          >
            <Badge variant="outline" className="bg-white/80 dark:bg-black/80">
              {consequenceType.name}
            </Badge>
            <Badge className="bg-primary/10 text-primary border-primary/30 border bg-white/80 dark:bg-black/80">
              Level {risk.consequenceLevel}
            </Badge>
          </button>
        );
      case "optimisticP10":
        return risk.optimisticP10 != null ? `$${risk.optimisticP10.toLocaleString()}` : "-";
      case "likelyP50":
        return risk.likelyP50 != null ? `$${risk.likelyP50.toLocaleString()}` : "-";
      case "pessimisticP90":
        return risk.pessimisticP90 != null ? `$${risk.pessimisticP90.toLocaleString()}` : "-";
      case "probability":
        return risk.probability != null ? `${risk.probability}%` : "-";
      case "expectedValue":
        // Calculate (Prob % x Likely) = (probability / 100 * likelyP50)
        if (risk.probability != null && risk.likelyP50 != null) {
          const expectedValue = (risk.probability / 100) * risk.likelyP50;
          return `$${expectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        }
        return "-";
      case "distributionModel":
        if (!risk.distributionModel) {
          return (
            <button
              className="text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary rounded px-2 py-1"
              onClick={(e) => {
                e.stopPropagation();
                handleDistributionModelClick(risk.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleDistributionModelClick(risk.id);
                }
              }}
              data-testid={`button-select-distribution-${risk.id}`}
              type="button"
            >
              Select...
            </button>
          );
        }
        const displayName = risk.distributionModel.charAt(0).toUpperCase() + risk.distributionModel.slice(1);
        const isAI = risk.isDistributionAiSelected;
        return (
          <button
            className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary rounded"
            onClick={(e) => {
              e.stopPropagation();
              handleDistributionModelClick(risk.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleDistributionModelClick(risk.id);
              }
            }}
            data-testid={`distribution-${risk.id}`}
            type="button"
          >
            <Badge 
              variant="outline"
              className={isAI 
                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-500/50 font-mono" 
                : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-500/50 font-mono"
              }
            >
              {isAI ? "🤖 " : "✏️ "}{displayName}
            </Badge>
          </button>
        );
      case "treatmentDescription":
        return risk.treatmentDescription || "-";
      case "treatmentOwner":
        const treatmentOwner = people?.find(p => p.id === risk.treatmentOwnerId);
        return treatmentOwner ? `${treatmentOwner.givenName} ${treatmentOwner.familyName}` : "-";
      case "treatmentDate":
        return risk.treatmentDate || "-";
      default:
        return "-";
    }
  };

  const hasActiveFilters = searchQuery.length > 0;

  if (!selectedProject) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please select a project to view its Risk Register.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList data-testid="tabs-risk-register" className="w-full justify-start">
          <TabsTrigger value="risks" data-testid="tab-risks">
            Risks
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <BarChart3 className="h-4 w-4 mr-2" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings2 className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="risks" className="space-y-4 mt-0">
          {isViewingSuperseded && (
            <Badge variant="secondary" className="gap-1.5" data-testid="badge-superseded-revision">
              <Lock className="h-3 w-3" />
              Read-Only (Superseded)
            </Badge>
          )}

      <div className="space-y-4">
        {/* Top action bar - matches pink box layout */}
        <div className="flex gap-2 items-center">
          {/* Left side: Action buttons */}
          {!isViewingSuperseded && (
            <>
              {/* Columns button */}
              <Popover open={showColumnManager} onOpenChange={setShowColumnManager}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    data-testid="button-manage-columns"
                  >
                    <Columns3 className="h-4 w-4 mr-2" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96" align="start">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-3">Manage Columns ({columnOrder.length} total)</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Show/hide and reorder columns by dragging
                      </p>
                    </div>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={columnOrder}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2 max-h-[500px] overflow-y-auto border rounded-md p-2">
                          {columnOrder.map(colId => {
                            const column = ALL_RISK_COLUMNS.find(c => c.id === colId);
                            if (!column) return null;
                            return (
                              <SortableColumnItem
                                key={column.id}
                                id={column.id}
                                label={column.label}
                                isVisible={visibleColumns.includes(column.id)}
                                onToggle={() => toggleColumn(column.id)}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </PopoverContent>
              </Popover>

              {/* AI Risk Analysis button */}
              <Button 
                variant="outline"
                onClick={() => setShowAIAnalysisChoiceDialog(true)}
                disabled={isAnalyzing}
                data-testid="button-ai-risk-analysis"
                className="text-xs sm:text-sm bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20"
              >
                <Sparkles className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{isAnalyzing ? "Analyzing..." : "AI Risk Analysis"}</span>
                <span className="sm:hidden">{isAnalyzing ? "Analyzing..." : "AI Risks"}</span>
              </Button>

              {/* Create Risk button */}
              <Button 
                variant="outline"
                onClick={() => setShowCreateRiskDialog(true)}
                data-testid="button-create-risk"
                className="text-xs sm:text-sm font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
              >
                <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Create Risk</span>
                <span className="sm:hidden">Create</span>
              </Button>

              {/* New Revision button */}
              <Button 
                variant="outline" 
                onClick={() => setShowCreateRevisionDialog(true)}
                data-testid="button-create-revision"
                className="text-xs sm:text-sm"
              >
                <Clock className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">New Revision</span>
                <span className="sm:hidden">New Rev</span>
              </Button>
            </>
          )}

          {/* Spacer to push revision selector to the right */}
          <div className="flex-1" />

          {/* Right side: Revision selector */}
          {currentRevision && (
            <Select 
              value={selectedRevisionId || highestRevision?.id} 
              onValueChange={setSelectedRevisionId}
            >
              <SelectTrigger className="w-[180px] sm:w-[220px] text-xs sm:text-sm" data-testid="select-revision">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <SelectValue placeholder="Select revision" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {(revisions || []).map((revision) => (
                  <SelectItem key={revision.id} value={revision.id}>
                    Rev {revision.revisionNumber} - {revision.revisionName}
                    {revision.status === "active" && " (Active)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Search and filters row */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search risks..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-risks"
            />
          </div>

          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading risks...</p>
        </div>
      ) : filteredRisks.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                {orderedVisibleColumns.map((column) => {
                  const width = getColumnWidth(column.id);
                  
                  // Add context menu for distribution model column header
                  if (column.id === 'distributionModel') {
                    return (
                      <TableHead 
                        key={column.id} 
                        className="relative"
                        style={{ width: width ? `${width}px` : undefined, minWidth: '80px' }}
                        data-testid={`header-${column.id}`}
                      >
                        <ContextMenu>
                          <ContextMenuTrigger>
                            <div className="flex items-center justify-between w-full">
                              <span>{column.label}</span>
                              <div
                                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                                onMouseDown={(e) => handleResizeStart(column.id, e)}
                                data-testid={`resize-handle-${column.id}`}
                              />
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem
                              onClick={() => analyzeBulkDistributionMutation.mutate()}
                              disabled={analyzeBulkDistributionMutation.isPending}
                              data-testid="context-bulk-ai-analyze"
                            >
                              🤖 Apply AI to All Risks
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      </TableHead>
                    );
                  }
                  
                  return (
                    <TableHead 
                      key={column.id} 
                      className={`relative ${NUMERIC_COLUMNS.has(column.id) ? 'text-right' : ''}`}
                      style={{ width: width ? `${width}px` : undefined, minWidth: '80px' }}
                      data-testid={`header-${column.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{column.label}</span>
                        <div
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                          onMouseDown={(e) => handleResizeStart(column.id, e)}
                          data-testid={`resize-handle-${column.id}`}
                        />
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRisks.map((risk) => (
                <ContextMenu key={risk.id}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className="cursor-pointer hover-elevate"
                      onClick={() => setSelectedRiskId(risk.id)}
                      data-testid={`row-risk-${risk.id}`}
                    >
                      {orderedVisibleColumns.map((column) => {
                        const width = getColumnWidth(column.id);
                        const cellContent = renderCellContent(risk, column.id);
                        
                        // Add context menu for distribution model column
                        if (column.id === 'distributionModel') {
                          return (
                            <TableCell 
                              key={column.id}
                              style={{ width: width ? `${width}px` : undefined, minWidth: '80px' }}
                              data-testid={`cell-${column.id}-${risk.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ContextMenu>
                                <ContextMenuTrigger>
                                  {cellContent}
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                  <ContextMenuItem
                                    onClick={() => analyzeDistributionMutation.mutate(risk.id)}
                                    disabled={analyzeDistributionMutation.isPending || risk.optimisticP10 == null || risk.likelyP50 == null || risk.pessimisticP90 == null}
                                    data-testid={`context-ai-analyze-${risk.id}`}
                                  >
                                    🤖 Apply AI Distribution
                                  </ContextMenuItem>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem
                                    onClick={() => handleEditRisk(risk)}
                                    data-testid={`context-edit-${risk.id}`}
                                  >
                                    ✏️ Manual Override
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            </TableCell>
                          );
                        }
                        
                        return (
                          <TableCell 
                            key={column.id}
                            className={NUMERIC_COLUMNS.has(column.id) ? 'text-right' : ''}
                            style={{ width: width ? `${width}px` : undefined, minWidth: '80px' }}
                            data-testid={`cell-${column.id}-${risk.id}`}
                          >
                            {cellContent}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmRisk({
                          id: risk.id,
                          riskNumber: risk.riskNumber,
                          title: risk.title
                        });
                      }}
                      className="text-destructive focus:text-destructive"
                      data-testid={`context-delete-risk-${risk.id}`}
                    >
                      🗑️ Delete Risk
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                {orderedVisibleColumns.map((column) => {
                  const width = getColumnWidth(column.id);
                  
                  if (column.id === 'expectedValue') {
                    // Calculate total for expectedValue column
                    const total = filteredRisks.reduce((sum, risk) => {
                      if (risk.probability != null && risk.likelyP50 != null) {
                        return sum + ((risk.probability / 100) * risk.likelyP50);
                      }
                      return sum;
                    }, 0);
                    
                    return (
                      <TableCell 
                        key={column.id}
                        className="text-right font-bold"
                        style={{ width: width ? `${width}px` : undefined, minWidth: '80px' }}
                        data-testid="footer-expected-value-total"
                      >
                        ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                    );
                  }
                  
                  if (column.id === 'riskNumber') {
                    return (
                      <TableCell 
                        key={column.id}
                        className="font-bold"
                        style={{ width: width ? `${width}px` : undefined, minWidth: '80px' }}
                      >
                        Total
                      </TableCell>
                    );
                  }
                  
                  return (
                    <TableCell 
                      key={column.id}
                      style={{ width: width ? `${width}px` : undefined, minWidth: '80px' }}
                    />
                  );
                })}
              </TableRow>
            </TableFooter>
          </Table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {risks && risks.length > 0
              ? "No risks match your search criteria."
              : "No risks yet. Create your first risk to get started."}
          </p>
        </div>
      )}

      </TabsContent>

      {/* Create Revision Dialog */}
      <Dialog open={showCreateRevisionDialog} onOpenChange={setShowCreateRevisionDialog}>
        <DialogContent data-testid="dialog-create-revision">
          <DialogHeader>
            <DialogTitle>Create New Risk Register Revision</DialogTitle>
            <DialogDescription>
              This will create a snapshot of the current risk register. The current revision will be marked as superseded and locked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="revision-name">Revision Name</Label>
              <Input
                id="revision-name"
                placeholder="e.g., Tender Submission, Delivery Phase"
                value={newRevisionName}
                onChange={(e) => setNewRevisionName(e.target.value)}
                data-testid="input-revision-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revision-notes">Notes (Optional)</Label>
              <Textarea
                id="revision-notes"
                placeholder="Describe the reason for this revision..."
                value={newRevisionNotes}
                onChange={(e) => setNewRevisionNotes(e.target.value)}
                className="min-h-[100px]"
                data-testid="textarea-revision-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCreateRevisionDialog(false)}
              data-testid="button-cancel-revision"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => createRevisionMutation.mutate()}
              disabled={!newRevisionName.trim() || createRevisionMutation.isPending}
              data-testid="button-confirm-create-revision"
            >
              {createRevisionMutation.isPending ? "Creating..." : "Create Revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Risk Dialog */}
      <Dialog open={showCreateRiskDialog} onOpenChange={setShowCreateRiskDialog}>
        <DialogContent data-testid="dialog-create-risk">
          <DialogHeader>
            <DialogTitle>Create New {newRiskType === "opportunity" ? "Opportunity" : "Risk"}</DialogTitle>
            <DialogDescription>
              Add a new {newRiskType} to the active risk register revision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="risk-type">Type</Label>
              <Select 
                value={newRiskType} 
                onValueChange={(value: "threat" | "opportunity") => setNewRiskType(value)}
              >
                <SelectTrigger id="risk-type" data-testid="select-risk-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="threat">Risk (R prefix)</SelectItem>
                  <SelectItem value="opportunity">Opportunity (O prefix)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Risks will be numbered R001, R002, etc. Opportunities will be numbered O001, O002, etc.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="risk-title">Title</Label>
              <Input
                id="risk-title"
                placeholder={newRiskType === "opportunity" ? "e.g., Cost savings opportunity" : "e.g., Schedule delay risk"}
                value={newRiskTitle}
                onChange={(e) => setNewRiskTitle(e.target.value)}
                data-testid="input-risk-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="risk-description">Description (Optional)</Label>
              <Textarea
                id="risk-description"
                placeholder={newRiskType === "opportunity" ? "Describe the opportunity..." : "Describe the risk..."}
                value={newRiskDescription}
                onChange={(e) => setNewRiskDescription(e.target.value)}
                className="min-h-[100px]"
                data-testid="textarea-risk-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateRiskDialog(false);
                setNewRiskTitle("");
                setNewRiskDescription("");
                setNewRiskType("threat");
              }}
              data-testid="button-cancel-risk"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => createRiskMutation.mutate()}
              disabled={!newRiskTitle.trim() || createRiskMutation.isPending}
              data-testid="button-confirm-create-risk"
            >
              {createRiskMutation.isPending ? "Creating..." : `Create ${newRiskType === "opportunity" ? "Opportunity" : "Risk"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Risk Dialog */}
      <Dialog open={showEditRiskDialog} onOpenChange={setShowEditRiskDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2" data-testid="dialog-edit-risk">
          <DialogHeader>
            <DialogTitle>Edit {editRiskData.riskNumber} - {editRiskData.title}</DialogTitle>
            <DialogDescription>
              Update the risk details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editRiskData.title || ""}
                onChange={(e) => setEditRiskData({ ...editRiskData, title: e.target.value })}
                onBlur={(e) => autoSaveField('title', e.target.value)}
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editRiskData.description || ""}
                onChange={(e) => setEditRiskData({ ...editRiskData, description: e.target.value })}
                onBlur={(e) => autoSaveField('description', e.target.value)}
                className="min-h-[80px]"
                data-testid="textarea-edit-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-owner">Owner</Label>
              <Select
                value={editRiskData.ownerId || ""}
                onValueChange={(value) => {
                  setEditRiskData({ ...editRiskData, ownerId: value });
                  autoSaveField('ownerId', value);
                }}
              >
                <SelectTrigger id="edit-owner" data-testid="select-edit-owner">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {people?.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.givenName} {person.familyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-potential-causes">Potential Causes</Label>
              <Textarea
                id="edit-potential-causes"
                value={editRiskData.potentialCauses || ""}
                onChange={(e) => setEditRiskData({ ...editRiskData, potentialCauses: e.target.value })}
                onBlur={(e) => autoSaveField('potentialCauses', e.target.value)}
                className="min-h-[80px]"
                data-testid="textarea-edit-potential-causes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-potential-impacts">Potential Impacts</Label>
              <Textarea
                id="edit-potential-impacts"
                value={editRiskData.potentialImpacts || ""}
                onChange={(e) => setEditRiskData({ ...editRiskData, potentialImpacts: e.target.value })}
                onBlur={(e) => autoSaveField('potentialImpacts', e.target.value)}
                className="min-h-[80px]"
                data-testid="textarea-edit-potential-impacts"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-existing-controls">Existing Controls</Label>
              <Textarea
                id="edit-existing-controls"
                value={editRiskData.existingControls || ""}
                onChange={(e) => setEditRiskData({ ...editRiskData, existingControls: e.target.value })}
                onBlur={(e) => autoSaveField('existingControls', e.target.value)}
                className="min-h-[80px]"
                data-testid="textarea-edit-existing-controls"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-treatment">Treatment Description</Label>
                <Textarea
                  id="edit-treatment"
                  value={editRiskData.treatmentDescription || ""}
                  onChange={(e) => setEditRiskData({ ...editRiskData, treatmentDescription: e.target.value })}
                  className="min-h-[80px]"
                  data-testid="textarea-edit-treatment"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-controls-status">Controls Status</Label>
                <Select
                  value={editRiskData.existingControlsStatus || ""}
                  onValueChange={(value) => {
                    setEditRiskData({ ...editRiskData, existingControlsStatus: value });
                    autoSaveField('existingControlsStatus', value);
                  }}
                >
                  <SelectTrigger id="edit-controls-status" data-testid="select-edit-controls-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="green">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">●</span>
                        <span>Effective - Verified, stable, monitored</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="amber">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-600">●</span>
                        <span>Adequate - Partly effective; improvement underway</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="red">
                      <div className="flex items-center gap-2">
                        <span className="text-red-600">●</span>
                        <span>Weak - Ineffective or missing; urgent remediation</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Consequence Rating</Label>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setConsequencePickerRiskId(editRiskData.id || null);
                  setShowConsequenceRatingPicker(true);
                }}
                data-testid="button-open-consequence-picker"
              >
                {editRiskData.consequenceTypeId && editRiskData.consequenceLevel ? (
                  <div className="flex items-center justify-between gap-2 w-full">
                    <Badge variant="outline">
                      {types?.find(t => t.id === editRiskData.consequenceTypeId)?.name || "Unknown"}
                    </Badge>
                    <Badge className="bg-primary/10 text-primary border-primary/30 border">
                      Level {editRiskData.consequenceLevel}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Select consequence rating...</span>
                )}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-p10">Optimistic (P10) $</Label>
                <Input
                  id="edit-p10"
                  type="number"
                  value={editRiskData.optimisticP10 || ""}
                  onChange={(e) => setEditRiskData({ ...editRiskData, optimisticP10: e.target.value ? parseInt(e.target.value) : null })}
                  onBlur={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : null;
                    autoSaveField('optimisticP10', value);
                  }}
                  data-testid="input-edit-p10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-p50">Likely (P50) $</Label>
                <Input
                  id="edit-p50"
                  type="number"
                  value={editRiskData.likelyP50 || ""}
                  onChange={(e) => setEditRiskData({ ...editRiskData, likelyP50: e.target.value ? parseInt(e.target.value) : null })}
                  onBlur={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : null;
                    autoSaveField('likelyP50', value);
                  }}
                  data-testid="input-edit-p50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-p90">Pessimistic (P90) $</Label>
                <Input
                  id="edit-p90"
                  type="number"
                  value={editRiskData.pessimisticP90 || ""}
                  onChange={(e) => setEditRiskData({ ...editRiskData, pessimisticP90: e.target.value ? parseInt(e.target.value) : null })}
                  onBlur={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : null;
                    autoSaveField('pessimisticP90', value);
                  }}
                  data-testid="input-edit-p90"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-probability">Probability %</Label>
                <Input
                  id="edit-probability"
                  type="number"
                  min="0"
                  max="100"
                  value={editRiskData.probability || ""}
                  onChange={(e) => setEditRiskData({ ...editRiskData, probability: e.target.value ? parseInt(e.target.value) : null })}
                  onBlur={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : null;
                    autoSaveField('probability', value);
                  }}
                  data-testid="input-edit-probability"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-distribution-model">Distribution Model (Monte Carlo)</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 justify-start"
                  onClick={() => {
                    setDistributionPickerRiskId(editRiskData.id || null);
                    setShowDistributionPicker(true);
                  }}
                  data-testid="button-open-distribution-picker"
                >
                  {editRiskData.distributionModel ? (
                    <div className="flex items-center gap-2">
                      {editRiskData.isDistributionAiSelected ? "🤖" : "✏️"}
                      <span>{editRiskData.distributionModel.charAt(0).toUpperCase() + editRiskData.distributionModel.slice(1)}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select distribution model...</span>
                  )}
                </Button>
                {editRiskData.distributionModel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditRiskData({ 
                      ...editRiskData, 
                      distributionModel: null,
                      isDistributionAiSelected: false
                    })}
                    data-testid="button-clear-distribution"
                  >
                    Clear
                  </Button>
                )}
              </div>
              {editRiskData.distributionModel && (
                <p className="text-xs text-muted-foreground">
                  {editRiskData.isDistributionAiSelected 
                    ? "🤖 AI-recommended distribution. Editing will mark as user-selected." 
                    : "✏️ User-selected distribution model."}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-treatment-owner">Treatment Owner</Label>
                <Select
                  value={editRiskData.treatmentOwnerId || ""}
                  onValueChange={(value) => setEditRiskData({ ...editRiskData, treatmentOwnerId: value })}
                >
                  <SelectTrigger id="edit-treatment-owner" data-testid="select-edit-treatment-owner">
                    <SelectValue placeholder="Select treatment owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {people?.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.givenName} {person.familyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-treatment-date">Treatment Date</Label>
                <Input
                  id="edit-treatment-date"
                  type="date"
                  value={editRiskData.treatmentDate || ""}
                  onChange={(e) => setEditRiskData({ ...editRiskData, treatmentDate: e.target.value })}
                  data-testid="input-edit-treatment-date"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditRiskDialog(false);
                setEditRiskData({});
              }}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={() => updateRiskMutation.mutate()}
              disabled={!editRiskData.title?.trim() || updateRiskMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateRiskMutation.isPending ? "Updating..." : "Update Risk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        <TabsContent value="reports" className="space-y-4 mt-0">
          {selectedProject && currentRevision ? (
            <MonteCarloReportDashboard
              projectId={selectedProject.id}
              revisionId={currentRevision.id}
              onRiskClick={(riskId) => {
                setSelectedRiskId(riskId);
                setOpenedFromReports(true);
              }}
              autoRunTrigger={monteCarloRerunTrigger}
            />
          ) : (
            <Card className="p-6">
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="mb-2">Risk Reports</h3>
                <p className="text-sm text-muted-foreground">
                  Please select a project to view Monte Carlo simulation reports
                </p>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-0">
          {selectedProject && currentRevision && (
            <>
              <ProjectRiskSettings projectId={selectedProject.id} />
              <ConsequenceRatingsSettings projectId={selectedProject.id} />
            </>
          )}
        </TabsContent>
      </Tabs>
      {/* Risk Detail Dialog - Draggable Floating Form */}
      {!!selectedRiskId && (
        <>
          {/* Backdrop Overlay */}
          <div 
            className="fixed inset-0 z-50 bg-black/80"
            onClick={async () => {
              // Dialog is closing
              const wasOpen = !!selectedRiskId;
              setSelectedRiskId(null);
              
              // If risk was opened from Reports tab (tornado chart), switch back to Reports and re-run simulation
              if (wasOpen && openedFromReports) {
                setActiveTab("reports");
                await queryClient.refetchQueries({
                  queryKey: ["/api/projects", selectedProject?.id, "risks"],
                  exact: false,
                });
                setMonteCarloRerunTrigger(prev => prev + 1);
                setOpenedFromReports(false);
              }
              // If we were viewing a risk already in Reports tab, trigger simulation re-run
              else if (wasOpen && activeTab === "reports") {
                await queryClient.refetchQueries({
                  queryKey: ["/api/projects", selectedProject?.id, "risks"],
                  exact: false,
                });
                setMonteCarloRerunTrigger(prev => prev + 1);
              }
            }}
          />
          
          {/* Draggable Dialog Content */}
          <Draggable 
            handle=".drag-handle" 
            position={dialogPosition} 
            onDrag={(e, data) => setDialogPosition({ x: data.x, y: data.y })}
            onStop={(e, data) => setDialogPosition({ x: data.x, y: data.y })}
          >
            <div ref={dialogRef} className="fixed top-0 left-0 z-50 w-[1180px] max-h-[90vh] bg-background border shadow-lg rounded-lg overflow-hidden flex flex-col" data-testid="dialog-risk-detail">
              {selectedRisk && (
                <>
                  <div className="drag-handle cursor-move bg-muted/50 px-6 py-3 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                    <Move className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm font-semibold">{selectedRisk.riskNumber}</span>
                    <Select
                      value={selectedRisk.riskNumber.startsWith("O") ? "opportunity" : "risk"}
                      onValueChange={(value) => {
                        const newType = value === "opportunity" ? "O" : "R";
                        const currentNumber = selectedRisk.riskNumber.substring(1);
                        const newRiskNumber = `${newType}${currentNumber}`;
                        handleQuickUpdate(selectedRisk.id, { riskNumber: newRiskNumber });
                      }}
                    >
                      <SelectTrigger className="w-[140px]" data-testid="select-risk-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="risk">Risk</SelectItem>
                        <SelectItem value="opportunity">Opportunity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="px-6 py-3 border-b">
                  <Input
                    value={localTitle}
                    onChange={(e) => {
                      // Update local state only for instant UI response
                      setLocalTitle(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Save on blur
                      handleQuickUpdate(selectedRisk.id, { title: e.target.value });
                    }}
                    placeholder="Risk title"
                    data-testid="input-risk-title"
                  />
                </div>

              <div className="grid gap-x-8 gap-y-4 px-6 py-4 overflow-y-auto flex-1" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
                {/* Left Column - Text Areas */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Description</Label>
                    <Textarea
                      value={localDescription}
                      onChange={(e) => {
                        setLocalDescription(e.target.value);
                      }}
                      onBlur={(e) => {
                        handleQuickUpdate(selectedRisk.id, { description: e.target.value });
                      }}
                      className="min-h-[80px] text-sm"
                      placeholder="Describe the risk or opportunity"
                      data-testid="textarea-risk-description"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Potential Causes</Label>
                    <Textarea
                      value={localPotentialCauses}
                      onChange={(e) => {
                        setLocalPotentialCauses(e.target.value);
                      }}
                      onBlur={(e) => {
                        handleQuickUpdate(selectedRisk.id, { potentialCauses: e.target.value });
                      }}
                      className="min-h-[100px] text-sm"
                      placeholder="What could cause this?"
                      data-testid="textarea-potential-causes"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Potential Impacts</Label>
                    <Textarea
                      value={localPotentialImpacts}
                      onChange={(e) => {
                        setLocalPotentialImpacts(e.target.value);
                      }}
                      onBlur={(e) => {
                        handleQuickUpdate(selectedRisk.id, { potentialImpacts: e.target.value });
                      }}
                      className="min-h-[100px] text-sm"
                      placeholder="Potential impacts?"
                      data-testid="textarea-potential-impacts"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Existing Controls</Label>
                    <Textarea
                      value={localExistingControls}
                      onChange={(e) => {
                        setLocalExistingControls(e.target.value);
                      }}
                      onBlur={(e) => {
                        handleQuickUpdate(selectedRisk.id, { existingControls: e.target.value });
                      }}
                      className="min-h-[100px] text-sm"
                      placeholder="Current controls?"
                      data-testid="textarea-existing-controls"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Treatment Description</Label>
                    <Textarea
                      value={localTreatmentDescription}
                      onChange={(e) => {
                        setLocalTreatmentDescription(e.target.value);
                      }}
                      onBlur={(e) => {
                        handleQuickUpdate(selectedRisk.id, { treatmentDescription: e.target.value });
                      }}
                      className="min-h-[100px] text-sm"
                      placeholder="Treatment plan?"
                      data-testid="textarea-treatment-description"
                    />
                  </div>
                </div>

                {/* Right Column - Structured Fields */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Owner</Label>
                    <Select
                      value={selectedRisk.ownerId || "unassigned"}
                      onValueChange={(value) => handleQuickUpdate(selectedRisk.id, { ownerId: value === "unassigned" ? null : value })}
                    >
                      <SelectTrigger data-testid="select-risk-owner" className="h-8 text-sm">
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Not assigned</SelectItem>
                        {people?.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.givenName} {person.familyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Controls Status</Label>
                    <Select
                      value={selectedRisk.existingControlsStatus || "not_set"}
                      onValueChange={(value) => handleQuickUpdate(selectedRisk.id, { existingControlsStatus: value === "not_set" ? null : value })}
                    >
                      <SelectTrigger data-testid="select-controls-status" className="h-8 text-sm">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_set">Not set</SelectItem>
                        <SelectItem value="green">✓ Effective</SelectItem>
                        <SelectItem value="amber">⚠ Adequate</SelectItem>
                        <SelectItem value="red">✗ Weak</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Treatment Owner</Label>
                      <Select
                        value={selectedRisk.treatmentOwnerId || "unassigned"}
                        onValueChange={(value) => handleQuickUpdate(selectedRisk.id, { treatmentOwnerId: value === "unassigned" ? null : value })}
                      >
                        <SelectTrigger data-testid="select-treatment-owner" className="h-8 text-sm">
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Not assigned</SelectItem>
                          {people?.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.givenName} {person.familyName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Treatment Date</Label>
                      <Input
                        type="date"
                        value={selectedRisk.treatmentDate || ""}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          handleQuickUpdate(selectedRisk.id, { treatmentDate: newValue || null });
                        }}
                        className="h-8 text-sm"
                        data-testid="input-treatment-date"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Consequence Rating</Label>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-8 text-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConsequencePickerRiskId(selectedRisk.id);
                        setShowConsequenceRatingPicker(true);
                      }}
                      data-testid="button-select-consequence"
                    >
                      {selectedRisk.consequenceTypeId && selectedRisk.consequenceLevel ? (
                        <div className="flex items-center justify-between gap-2 w-full">
                          <Badge variant="outline" className="text-xs">
                            {types?.find((t: ConsequenceType) => t.id === selectedRisk.consequenceTypeId)?.name || "Unknown"}
                          </Badge>
                          <Badge className="bg-primary/10 text-primary border-primary/30 border text-xs">
                            Level {selectedRisk.consequenceLevel}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Select consequence</span>
                      )}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Pessimistic (P90)</Label>
                      <Input
                        type="text"
                        value={isEditingNumber === "p90" ? editingP90 : (selectedRisk.pessimisticP90 != null ? selectedRisk.pessimisticP90.toLocaleString() : "")}
                        onFocus={() => {
                          setIsEditingNumber("p90");
                          setEditingP90(selectedRisk.pessimisticP90 != null ? selectedRisk.pessimisticP90.toString() : "");
                        }}
                        onChange={(e) => setEditingP90(e.target.value)}
                        onBlur={(e) => {
                          const numValue = e.target.value.replace(/,/g, "");
                          handleQuickUpdate(selectedRisk.id, { pessimisticP90: numValue ? parseFloat(numValue) : null });
                          setIsEditingNumber(null);
                          setEditingP90("");
                        }}
                        placeholder="$0"
                        className="text-right h-8 text-sm"
                        data-testid="input-pessimistic-p90"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Likely (P50)</Label>
                      <Input
                        type="text"
                        value={isEditingNumber === "p50" ? editingP50 : (selectedRisk.likelyP50 != null ? selectedRisk.likelyP50.toLocaleString() : "")}
                        onFocus={() => {
                          setIsEditingNumber("p50");
                          setEditingP50(selectedRisk.likelyP50 != null ? selectedRisk.likelyP50.toString() : "");
                        }}
                        onChange={(e) => setEditingP50(e.target.value)}
                        onBlur={(e) => {
                          const numValue = e.target.value.replace(/,/g, "");
                          handleQuickUpdate(selectedRisk.id, { likelyP50: numValue ? parseFloat(numValue) : null });
                          setIsEditingNumber(null);
                          setEditingP50("");
                        }}
                        placeholder="$0"
                        className="text-right h-8 text-sm"
                        data-testid="input-likely-p50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Optimistic (P10)</Label>
                      <Input
                        type="text"
                        value={isEditingNumber === "p10" ? editingP10 : (selectedRisk.optimisticP10 != null ? selectedRisk.optimisticP10.toLocaleString() : "")}
                        onFocus={() => {
                          setIsEditingNumber("p10");
                          setEditingP10(selectedRisk.optimisticP10 != null ? selectedRisk.optimisticP10.toString() : "");
                        }}
                        onChange={(e) => setEditingP10(e.target.value)}
                        onBlur={(e) => {
                          const numValue = e.target.value.replace(/,/g, "");
                          handleQuickUpdate(selectedRisk.id, { optimisticP10: numValue ? parseFloat(numValue) : null });
                          setIsEditingNumber(null);
                          setEditingP10("");
                        }}
                        placeholder="$0"
                        className="text-right h-8 text-sm"
                        data-testid="input-optimistic-p10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Probability %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={isEditingNumber === "probability" ? editingProbability : (selectedRisk.probability != null ? selectedRisk.probability : "")}
                        onFocus={() => {
                          setIsEditingNumber("probability");
                          setEditingProbability(selectedRisk.probability != null ? selectedRisk.probability.toString() : "");
                        }}
                        onChange={(e) => setEditingProbability(e.target.value)}
                        onBlur={(e) => {
                          const numValue = e.target.value ? parseFloat(e.target.value) : null;
                          handleQuickUpdate(selectedRisk.id, { probability: numValue });
                          setIsEditingNumber(null);
                          setEditingProbability("");
                        }}
                        placeholder="0-100"
                        className="text-right h-8 text-sm"
                        data-testid="input-probability"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <Label className="text-xs mb-2 block">Risk Matrix</Label>
                    <RiskOpportunityMatrix
                      type={selectedRisk.riskNumber.startsWith("O") ? "opportunity" : "risk"}
                      consequenceLevel={selectedRisk.consequenceLevel ?? undefined}
                      likelihood={selectedRisk.probability ?? undefined}
                    />
                  </div>
                </div>
              </div>
                </>
              )}
              {/* Close Button */}
              <button
                onClick={async () => {
                  const wasOpen = !!selectedRiskId;
                  setSelectedRiskId(null);
                  
                  if (wasOpen && openedFromReports) {
                    setActiveTab("reports");
                    await queryClient.refetchQueries({
                      queryKey: ["/api/projects", selectedProject?.id, "risks"],
                      exact: false,
                    });
                    setMonteCarloRerunTrigger(prev => prev + 1);
                    setOpenedFromReports(false);
                  }
                  else if (wasOpen && activeTab === "reports") {
                    await queryClient.refetchQueries({
                      queryKey: ["/api/projects", selectedProject?.id, "risks"],
                      exact: false,
                    });
                    setMonteCarloRerunTrigger(prev => prev + 1);
                  }
                }}
                className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity z-10"
                data-testid="button-close-risk-dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </Draggable>
        </>
      )}


      {/* Consequence Rating Picker Dialog */}
      <ConsequenceRatingPicker
        open={showConsequenceRatingPicker}
        onOpenChange={setShowConsequenceRatingPicker}
        onSelect={handleConsequenceRatingSelect}
        currentTypeId={risks?.find(r => r.id === consequencePickerRiskId)?.consequenceTypeId ?? undefined}
        currentLevel={risks?.find(r => r.id === consequencePickerRiskId)?.consequenceLevel ?? undefined}
      />
      
      {/* Distribution Model Picker Dialog */}
      <DistributionModelPicker
        open={showDistributionPicker}
        onOpenChange={setShowDistributionPicker}
        onSelect={handleDistributionModelSelect}
        currentModel={risks?.find(r => r.id === distributionPickerRiskId)?.distributionModel}
        isAiSelected={risks?.find(r => r.id === distributionPickerRiskId)?.isDistributionAiSelected ?? false}
      />

      {/* AI Risk Analysis Choice Dialog */}
      <Dialog open={showAIAnalysisChoiceDialog} onOpenChange={setShowAIAnalysisChoiceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AI Risk Analysis</DialogTitle>
            <DialogDescription>
              Choose how you'd like to generate risks and opportunities
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full h-auto flex flex-col items-start p-4 hover-elevate"
              onClick={() => {
                setShowAIAnalysisChoiceDialog(false);
                runAIAnalysisMutation.mutate();
              }}
              disabled={!selectedProject?.contractDocumentPath || !selectedProject?.contractSpecificationPath}
              data-testid="button-analyze-contract-docs"
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium">Analyze Contract Documents</span>
              </div>
              <p className="text-xs text-muted-foreground text-left whitespace-normal break-words">
                AI will scan your contract documents and specifications to identify project-specific risks
              </p>
              {(!selectedProject?.contractDocumentPath || !selectedProject?.contractSpecificationPath) && (
                <p className="text-xs text-destructive mt-2">
                  Contract paths must be configured in Settings
                </p>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full h-auto flex flex-col items-start p-4 hover-elevate"
              onClick={() => {
                setShowAIAnalysisChoiceDialog(false);
                setShowAIAnalysisDialog(true);
              }}
              data-testid="button-skip-to-chat"
            >
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="h-5 w-5 text-primary" />
                <span className="font-medium">Skip to Chat</span>
              </div>
              <p className="text-xs text-muted-foreground text-left whitespace-normal break-words">
                Go straight to the AI chat to develop generic risks or have a conversation
              </p>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Risk Analysis Dialog */}
      <Dialog open={showAIAnalysisDialog} onOpenChange={setShowAIAnalysisDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>AI Risk Analysis</DialogTitle>
            <DialogDescription>
              AI-generated risks and opportunities from contract documents and chat
            </DialogDescription>
          </DialogHeader>

          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
              <p className="text-muted-foreground">Analyzing contract documents...</p>
              <p className="text-xs text-muted-foreground mt-2">This may take 30-60 seconds</p>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Results Table */}
              {aiAnalysisResults.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {aiAnalysisResults.length} potential risk{aiAnalysisResults.length !== 1 ? 's' : ''} identified
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const allIndices = new Set(aiAnalysisResults.map((_, idx) => idx));
                          setSelectedAIRisks(allIndices);
                        }}
                        data-testid="button-select-all-ai-risks"
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedAIRisks(new Set())}
                        data-testid="button-deselect-all-ai-risks"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>

                  <div className="border rounded-md overflow-auto max-h-64">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left w-12"></th>
                          <th className="p-2 text-left w-16">Type</th>
                          <th className="p-2 text-left">Title</th>
                          <th className="p-2 text-left">Description</th>
                          <th className="p-2 text-left w-24">P10</th>
                          <th className="p-2 text-left w-24">P50</th>
                          <th className="p-2 text-left w-24">P90</th>
                          <th className="p-2 text-left w-20">Prob</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiAnalysisResults.map((risk, idx) => (
                          <tr key={idx} className="border-t hover-elevate">
                            <td className="p-2">
                              <Checkbox
                                checked={selectedAIRisks.has(idx)}
                                onCheckedChange={(checked) => {
                                  const newSelected = new Set(selectedAIRisks);
                                  if (checked) {
                                    newSelected.add(idx);
                                  } else {
                                    newSelected.delete(idx);
                                  }
                                  setSelectedAIRisks(newSelected);
                                }}
                                data-testid={`checkbox-ai-risk-${idx}`}
                              />
                            </td>
                            <td className="p-2">
                              <Badge 
                                variant={risk.riskType === 'opportunity' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {risk.riskType === 'opportunity' ? 'Opp' : 'Risk'}
                              </Badge>
                            </td>
                            <td className="p-2 font-medium">{risk.title}</td>
                            <td className="p-2 text-xs text-muted-foreground max-w-md truncate">
                              {risk.description}
                            </td>
                            <td className="p-2 font-mono text-xs">{risk.p10}</td>
                            <td className="p-2 font-mono text-xs">{risk.p50}</td>
                            <td className="p-2 font-mono text-xs">{risk.p90}</td>
                            <td className="p-2 font-mono text-xs">{risk.probability}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Chat Interface */}
              <div className="flex-1 flex flex-col border rounded-md overflow-hidden min-h-[300px]">
                <div className="bg-muted/50 px-3 py-2 border-b">
                  <p className="text-sm font-medium">Chat with AI</p>
                  <p className="text-xs text-muted-foreground">Ask for more risks, opportunities, or generic items</p>
                </div>
                
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {chatMessages.length === 0 && aiAnalysisResults.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <p>Start a conversation to generate risks and opportunities</p>
                      <p className="text-xs mt-2">Try: "Add 5 generic schedule risks" or "What about quality risks?"</p>
                    </div>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-3 py-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="border-t p-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ask AI for more risks/opportunities..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
                          e.preventDefault();
                          handleChatSend();
                        }
                      }}
                      disabled={isChatLoading}
                      data-testid="input-ai-chat"
                    />
                    <Button
                      onClick={handleChatSend}
                      disabled={!chatInput.trim() || isChatLoading}
                      data-testid="button-send-chat"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAIAnalysisDialog(false);
                setAIAnalysisResults([]);
                setSelectedAIRisks(new Set());
                setChatMessages([]);
                setChatInput('');
              }}
              data-testid="button-cancel-ai-analysis"
            >
              Cancel
            </Button>
            <Button
              onClick={() => importAIRisksMutation.mutate()}
              disabled={selectedAIRisks.size === 0 || importAIRisksMutation.isPending}
              data-testid="button-import-ai-risks"
            >
              {importAIRisksMutation.isPending 
                ? "Importing..." 
                : `Import ${selectedAIRisks.size} Selected`
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmRisk} onOpenChange={(open) => !open && setDeleteConfirmRisk(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete-risk">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Risk</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteConfirmRisk?.riskNumber}: {deleteConfirmRisk?.title}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmRisk) {
                  deleteRiskMutation.mutate(deleteConfirmRisk.id);
                  setDeleteConfirmRisk(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Status Dialog */}
      <AIStatusDialog
        open={isAnalyzing && aiOperationId !== null}
        operationId={aiOperationId}
        title="Analyzing Contract Documents"
        onComplete={() => {
          // Progress dialog will close automatically when operation completes
        }}
        onError={(error) => {
          // Handle error - allow user to close dialog
          console.error('AI Progress Error:', error);
        }}
        onClose={() => {
          // User manually closed the dialog (error state)
          setIsAnalyzing(false);
          setAiOperationId(null);
        }}
      />
    </div>
  );
}
