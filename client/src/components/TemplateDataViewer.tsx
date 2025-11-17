import { useQuery } from "@tanstack/react-query";
import { Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from '@/components/ui/button';

interface TemplateDataViewerProps {
  templateId: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface TemplateRow {
  id: string;
  templateId: string;
  rowIndex: number;
  cells: Array<{
    columnId: string;
    value?: string;
    employmentRoleId?: string;
  }>;
}

interface ColumnConfig {
  id: string;
  columnHeader: string;
  isEditable: boolean;
  orderIndex: number;
  isDoaAcronymColumn: boolean;
}

interface EmploymentRole {
  id: string;
  doaAcronym: string;
  title: string;
}

export function TemplateDataViewer({ templateId, isFullscreen = false, onToggleFullscreen }: TemplateDataViewerProps) {
  // Load saved zoom level from localStorage, default to 100
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('templateViewerZoom');
    return saved ? parseInt(saved, 10) : 100;
  });

  // Save zoom level to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('templateViewerZoom', zoom.toString());
  }, [zoom]);

  const { data: columnConfigs, isLoading: isLoadingColumns } = useQuery<ColumnConfig[]>({
    queryKey: ['/api/templates', templateId, 'columns'],
  });

  const { data: templateRows, isLoading: isLoadingRows } = useQuery<TemplateRow[]>({
    queryKey: ['/api/templates', templateId, 'rows'],
  });

  const { data: employmentRoles } = useQuery<EmploymentRole[]>({
    queryKey: ['/api/employment-roles'],
  });

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 10, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 10, 50));
  const handleZoomReset = () => setZoom(100);

  if (isLoadingColumns || isLoadingRows) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!columnConfigs || !templateRows) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No template data available
      </div>
    );
  }

  // Create a map of employment roles for quick lookup
  const roleMap = new Map<string, EmploymentRole>();
  employmentRoles?.forEach(role => {
    roleMap.set(role.id, role);
  });

  // Render cell value - if it has employmentRoleId, lookup current acronym
  const renderCellValue = (cell: { columnId: string; value?: string; employmentRoleId?: string }) => {
    if (cell.employmentRoleId) {
      const role = roleMap.get(cell.employmentRoleId);
      return role?.doaAcronym || cell.value || '';
    }
    return cell.value || '';
  };

  return (
    <div className="space-y-2">
      {/* Zoom controls */}
      <div className="border-b">
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
          <span className="text-sm text-muted-foreground">Zoom: {zoom}%</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 50}
              data-testid="button-zoom-out"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomReset}
              data-testid="button-zoom-reset"
              title="Reset zoom to 100%"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 200}
              data-testid="button-zoom-in"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            {onToggleFullscreen && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleFullscreen}
                data-testid="button-toggle-fullscreen"
                title="Toggle fullscreen"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table content with zoom */}
      <div className={`overflow-auto ${isFullscreen ? 'h-[calc(100vh-250px)]' : 'max-h-[400px]'}`}>
        <div
          style={
            CSS.supports && CSS.supports('zoom', '1')
              ? { zoom: zoom / 100 }
              : {
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                  width: `${10000 / zoom}%`
                }
          }
        >
          <table className="w-full border-collapse" data-testid="template-data-table">
            <thead>
              <tr>
                {columnConfigs.map((config) => (
                  <th
                    key={config.id}
                    className="border border-border px-4 py-2 text-left font-semibold sticky top-0 bg-muted z-[100]"
                    data-testid={`header-${config.columnHeader}`}
                  >
                    {config.columnHeader}
                    {config.isDoaAcronymColumn && (
                      <span className="ml-2 text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                        DOA
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templateRows.map((row) => (
                <tr key={row.id} className="hover-elevate" data-testid={`row-${row.rowIndex}`}>
                  {columnConfigs.map((config) => {
                    // Filter out null values from cells array before searching
                    const validCells = (row.cells || []).filter(c => c !== null && c !== undefined);
                    const cell = validCells.find(c => c.columnId === config.id);
                    const cellValue = cell ? renderCellValue(cell) : '';
                    
                    return (
                      <td
                        key={config.id}
                        className="border border-border px-4 py-2"
                        data-testid={`cell-${row.rowIndex}-${config.columnHeader}`}
                      >
                        {cellValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
