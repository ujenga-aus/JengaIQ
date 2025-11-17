import { useEffect, useState } from 'react';
import { encode } from 'plantuml-encoder';
import { Loader2, AlertCircle } from 'lucide-react';

interface PlantUMLDiagramProps {
  chart: string;
  className?: string;
}

export function PlantUMLDiagram({ chart, className = '' }: PlantUMLDiagramProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  // Monitor theme changes
  useEffect(() => {
    const handleThemeChange = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };

    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    handleThemeChange();

    return () => observer.disconnect();
  }, []);

  // Render diagram when chart or theme changes
  useEffect(() => {
    const renderDiagram = async () => {
      if (!chart) {
        console.log('[PlantUML] No chart data');
        setIsLoading(false);
        return;
      }

      console.log('[PlantUML] Starting render, chart length:', chart?.length, 'theme:', theme);
      setIsLoading(true);
      setError(null);

      try {
        // Apply theme-specific styling to PlantUML
        let themedChart = chart;
        
        if (theme === 'dark') {
          // Add dark theme skinparam if not already present
          if (!chart.includes('skinparam')) {
            themedChart = `@startuml
skinparam backgroundColor #1a1a1a
skinparam defaultFontColor #e5e5e5
skinparam activity {
  BackgroundColor #2a2a2a
  BorderColor #3a3a3a
  FontColor #e5e5e5
  ArrowColor #666666
}
skinparam note {
  BackgroundColor #2a2a2a
  BorderColor #3a3a3a
  FontColor #e5e5e5
}
${chart.replace('@startuml', '').replace('@enduml', '')}
@enduml`;
          }
        }

        // Encode PlantUML text
        const encoded = encode(themedChart);
        
        // Use public PlantUML server with HTTPS to avoid mixed content issues
        const plantUmlServerUrl = 'https://www.plantuml.com/plantuml/svg/' + encoded;
        
        console.log('[PlantUML] Fetching from server...');
        setSvgUrl(plantUmlServerUrl);
        setIsLoading(false);
        console.log('[PlantUML] Render complete');
      } catch (err: any) {
        console.error('[PlantUML] Rendering error:', err);
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
      
      {svgUrl && !isLoading && !error && (
        <div className={`overflow-x-auto ${className}`} data-testid="plantuml-diagram">
          <img 
            src={svgUrl} 
            alt="PlantUML Flowchart"
            className="max-w-full h-auto"
            onError={(e) => {
              console.error('[PlantUML] Image load error');
              setError('Failed to load diagram from PlantUML server');
            }}
            onLoad={() => {
              console.log('[PlantUML] Image loaded successfully');
            }}
          />
        </div>
      )}
    </div>
  );
}
