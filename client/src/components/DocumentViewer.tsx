import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { Loader2, FileText, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DocumentViewerProps {
  fileUrl: string;
  fileName: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function DocumentViewer({ fileUrl, fileName, isFullscreen = false, onToggleFullscreen }: DocumentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        const fileExtension = fileName.toLowerCase().split('.').pop();

        if (fileExtension === 'pdf') {
          setContent(''); // PDF handled by iframe
          setLoading(false);
          return;
        }

        // Fetch the blob
        const response = await fetch(fileUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        
        const blob = await response.blob();

        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
          // Handle Excel files
          const arrayBuffer = await blob.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });

          // Convert all sheets to HTML
          const allSheets = workbook.SheetNames.map((name) => ({
            name,
            html: XLSX.utils.sheet_to_html(workbook.Sheets[name], {
              id: 'excel-table',
              editable: false,
            }),
          }));

          setSheets(allSheets);
          setActiveSheet(0);
        } else if (fileExtension === 'docx' || fileExtension === 'doc') {
          // Handle Word files
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setContent(result.value);
        } else {
          setError('Unsupported file type');
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading document:', err);
        
        // Check if it's a blob URL that's no longer valid
        if (fileUrl.startsWith('blob:')) {
          setError('File no longer available. This file was uploaded with a temporary link and needs to be re-uploaded.');
        } else {
          setError('Failed to load document. The file may have been moved or deleted.');
        }
        setLoading(false);
      }
    };

    loadDocument();
  }, [fileUrl, fileName]);

  const fileExtension = fileName.toLowerCase().split('.').pop();

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 10, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 10, 50));
  const handleZoomReset = () => setZoom(100);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="text-center space-y-3 max-w-md px-4">
          <FileText className="h-12 w-12 mx-auto text-destructive/70" />
          <div>
            <p className="font-medium text-destructive">{error}</p>
            {fileUrl.startsWith('blob:') && (
              <p className="text-sm text-muted-foreground mt-2">
                Please upload a new version of this template to view it properly.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (fileExtension === 'pdf') {
    return (
      <div>
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
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
          </div>
        </div>
        <div className={`overflow-auto ${isFullscreen ? 'h-[calc(100vh-200px)]' : 'h-[400px]'}`}>
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left', width: `${10000 / zoom}%` }}>
            <iframe
              src={fileUrl}
              className={`w-full border-0 ${isFullscreen ? 'h-[calc(100vh-200px)]' : 'h-[400px]'}`}
              title="PDF Preview"
            />
          </div>
        </div>
      </div>
    );
  }

  if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    return (
      <div className="space-y-2">
        {/* Zoom controls and sheet tabs */}
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
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              {onToggleFullscreen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onToggleFullscreen}
                  data-testid="button-toggle-fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          
          {sheets.length > 1 && (
            <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
              {sheets.map((sheet, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveSheet(idx)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    activeSheet === idx
                      ? 'bg-background font-medium border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`tab-sheet-${idx}`}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sheet content */}
        <div className={`overflow-auto ${isFullscreen ? 'h-[calc(100vh-250px)]' : 'max-h-[400px]'}`}>
          <style>{`
            #excel-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 0.75rem;
            }
            #excel-table td,
            #excel-table th {
              border: 1px solid hsl(var(--border));
              padding: 0.375rem 0.5rem;
              text-align: left;
              word-wrap: break-word;
              max-width: 300px;
              resize: horizontal;
              overflow: auto;
            }
            /* Make first row cells sticky (header row) */
            #excel-table tbody tr:first-child td {
              position: sticky;
              top: 0;
              z-index: 100;
              background-color: hsl(var(--muted));
              font-weight: 500;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            /* Legacy support for proper thead if it exists */
            #excel-table th {
              background-color: hsl(var(--muted));
              font-weight: 500;
              position: sticky;
              top: 0;
              z-index: 100;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            #excel-table thead {
              position: sticky;
              top: 0;
              z-index: 100;
            }
            #excel-table tr:hover {
              background-color: hsl(var(--muted) / 0.5);
            }
          `}</style>
          {sheets[activeSheet] && (
            <div
              className="px-4 pb-4"
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
              <div
                dangerouslySetInnerHTML={{ __html: sheets[activeSheet].html }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (fileExtension === 'docx' || fileExtension === 'doc') {
    return (
      <div>
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
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
          </div>
        </div>
        <div className={`overflow-auto ${isFullscreen ? 'h-[calc(100vh-200px)]' : 'max-h-[400px]'}`}>
          <style>{`
            .docx-content {
              line-height: 1.6;
            }
            .docx-content p {
              margin-bottom: 1rem;
            }
            .docx-content h1,
            .docx-content h2,
            .docx-content h3 {
              margin-top: 1.5rem;
              margin-bottom: 0.75rem;
              font-weight: 600;
            }
            .docx-content h1 {
              font-size: 1.5rem;
            }
            .docx-content h2 {
              font-size: 1.25rem;
            }
            .docx-content h3 {
              font-size: 1.1rem;
            }
            .docx-content ul,
            .docx-content ol {
              margin-left: 2rem;
              margin-bottom: 1rem;
            }
            .docx-content table {
              width: 100%;
              border-collapse: collapse;
              margin: 1rem 0;
            }
            .docx-content td,
            .docx-content th {
              border: 1px solid hsl(var(--border));
              padding: 0.5rem;
            }
            .docx-content th {
              background-color: hsl(var(--muted));
              font-weight: 500;
            }
          `}</style>
          <div
            style={{ 
              transform: `scale(${zoom / 100})`, 
              transformOrigin: 'top left',
              width: `${10000 / zoom}%`
            }}
            className="px-6 py-4"
          >
            <div
              className="docx-content"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
