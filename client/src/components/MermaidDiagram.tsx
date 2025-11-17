import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Loader2, AlertCircle } from 'lucide-react';

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

// Initialize mermaid once with secure settings
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  fontFamily: 'Inter, system-ui, sans-serif',
});

export function MermaidDiagram({ chart, className = '' }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'default'>('default');
  const retryCount = useRef(0);

  // Monitor theme changes
  useEffect(() => {
    const handleThemeChange = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const newTheme = isDark ? 'dark' : 'default';
      setTheme(newTheme);
      mermaid.initialize({
        startOnLoad: false,
        theme: newTheme,
        securityLevel: 'strict',
        fontFamily: 'Inter, system-ui, sans-serif',
      });
    };

    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    handleThemeChange();

    return () => observer.disconnect();
  }, []);

  // Re-render diagram when chart or theme changes
  useEffect(() => {
    retryCount.current = 0; // Reset retry count on chart/theme change
    
    const renderDiagram = async () => {
      if (!chart) {
        console.log('[Mermaid] No chart data');
        setIsLoading(false);
        return;
      }

      // Wait for ref to be available (happens on first render) - max 10 retries
      if (!containerRef.current) {
        if (retryCount.current < 10) {
          retryCount.current++;
          console.log('[Mermaid] Waiting for container ref... (attempt', retryCount.current, ')');
          setTimeout(renderDiagram, 100);
          return;
        } else {
          console.error('[Mermaid] Container ref never became available after 10 retries');
          setError('Failed to initialize diagram container');
          setIsLoading(false);
          return;
        }
      }

      console.log('[Mermaid] Starting render, chart length:', chart?.length, 'theme:', theme);
      setIsLoading(true);
      setError(null);

      try {
        const uniqueId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('[Mermaid] Calling mermaid.render with id:', uniqueId);
        const { svg } = await mermaid.render(uniqueId, chart);
        
        console.log('[Mermaid] Render successful, svg length:', svg?.length);
        
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
        setIsLoading(false);
        console.log('[Mermaid] Render complete');
      } catch (err: any) {
        console.error('[Mermaid] Rendering error:', err);
        setError(err.message || 'Failed to render diagram');
        setIsLoading(false);
      }
    };

    renderDiagram();
  }, [chart, theme]);

  return (
    <div className="relative">
      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      
      {error && !isLoading && (
        <div className="flex items-center gap-2 p-4 border border-destructive/50 rounded-md bg-destructive/10">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">Failed to render diagram</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      )}
      
      <div 
        ref={containerRef} 
        className={`mermaid-diagram overflow-x-auto ${isLoading || error ? 'hidden' : ''} ${className}`}
        data-testid="mermaid-diagram"
      />
    </div>
  );
}
