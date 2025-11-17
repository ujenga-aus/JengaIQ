import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dateFormat";

interface PhaseTimelineProps {
  tenderStart: string;
  tenderEnd: string;
  deliveryStart: string;
  deliveryEnd: string;
  defectsPeriodStart: string;
  defectsPeriodEnd: string;
  closedStart: string;
  closedEnd: string;
  currentPhase: "Tender" | "Delivery" | "Defects Period" | "Closed";
  tenderLabel?: string;
  deliveryLabel?: string;
  defectsPeriodLabel?: string;
  closedLabel?: string;
}

export function PhaseTimeline({
  tenderStart,
  tenderEnd,
  deliveryStart,
  deliveryEnd,
  defectsPeriodStart,
  defectsPeriodEnd,
  closedStart,
  closedEnd,
  currentPhase,
  tenderLabel = "Tender",
  deliveryLabel = "Delivery",
  defectsPeriodLabel = "Defects Period",
  closedLabel = "Liability Period",
}: PhaseTimelineProps) {
  const phases = [
    { name: tenderLabel, start: tenderStart, end: tenderEnd, key: "Tender" },
    { name: deliveryLabel, start: deliveryStart, end: deliveryEnd, key: "Delivery" },
    { name: defectsPeriodLabel, start: defectsPeriodStart, end: defectsPeriodEnd, key: "Defects Period" },
    { name: closedLabel, start: closedStart, end: closedEnd, key: "Closed" },
  ];

  const today = new Date();

  // Find which phase we're currently in
  const getCurrentPhaseIndex = (): number | null => {
    // First check if we're currently in any phase
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      if (!phase.start || !phase.end) continue;
      
      const start = new Date(phase.start);
      const end = new Date(phase.end);
      
      if (today >= start && today <= end) {
        return i; // Found the current phase
      }
    }
    
    // Not in any phase - return null
    return null;
  };

  const currentPhaseIndex = getCurrentPhaseIndex();

  // Check if all phases are complete
  const allPhasesComplete = (): boolean => {
    const lastPhase = phases[phases.length - 1];
    if (!lastPhase.end) return false;
    return today > new Date(lastPhase.end);
  };

  const isAllComplete = allPhasesComplete();

  // Determine phase status based on current phase
  const getPhaseStatus = (phaseIndex: number): 'complete' | 'in-progress' | 'to-complete' => {
    if (isAllComplete) {
      // All phases are complete
      return 'complete';
    }

    const phase = phases[phaseIndex];
    if (!phase.start || !phase.end) return 'to-complete';

    const start = new Date(phase.start);
    const end = new Date(phase.end);

    // Check if this specific phase is complete
    if (today > end) {
      return 'complete';
    }

    // Check if this is the current phase
    if (currentPhaseIndex === phaseIndex) {
      return 'in-progress';
    }

    // Future phase
    if (today < start) {
      return 'to-complete';
    }

    // Edge case: in a gap after this phase but before next
    return 'complete';
  };

  // Get circle color for a specific circle position
  const getCircleColor = (circleIndex: number): string => {
    if (isAllComplete) {
      // All complete - all circles green
      return 'bg-success border-success';
    }

    // Circle 0 is the start of phase 0
    if (circleIndex === 0) {
      const status = getPhaseStatus(0);
      return status === 'to-complete' ? 'bg-purple-500 border-purple-500' : 'bg-success border-success';
    }

    // For other circles, determine based on the phase they END
    const phaseEndingAtThisCircle = circleIndex - 1;
    const status = getPhaseStatus(phaseEndingAtThisCircle);

    if (status === 'complete') {
      return 'bg-success border-success';
    } else if (status === 'in-progress') {
      return 'bg-blue-400 dark:bg-blue-500 border-blue-400 dark:border-blue-500';
    } else {
      return 'bg-purple-500 border-purple-500';
    }
  };

  // Get circle inline style for a specific circle position (for in-progress blue)
  const getCircleStyle = (circleIndex: number): React.CSSProperties | undefined => {
    // Not needed - blue is handled via Tailwind classes
    return undefined;
  };

  return (
    <Card>
      <CardContent className="pt-2 pb-2">
        {/* Horizontal scroll container for mobile */}
        <div className="overflow-x-auto -mx-3 px-3">
          <div className="relative py-4 px-2 min-w-[640px]">
            {/* Timeline container with circles and connecting lines */}
            <div className="flex items-start justify-between">
              {/* First circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`h-6 w-6 rounded-full border-4 border-background z-10 ${getCircleColor(0)}`}
                  style={getCircleStyle(0)}
                  data-testid="circle-0"
                />
              </div>

              {/* Phases with connecting lines and end circles */}
              {phases.map((phase, phaseIndex) => {
              const status = getPhaseStatus(phaseIndex);
              
              // Calculate progress percentage for in-progress phase
              let progressPercentage = 0;
              let progressWidth = '0%';
              if (status === 'in-progress' && phase.start && phase.end) {
                const start = new Date(phase.start);
                const end = new Date(phase.end);
                const totalDuration = end.getTime() - start.getTime();
                const elapsed = today.getTime() - start.getTime();
                progressPercentage = totalDuration > 0 ? Math.round((elapsed / totalDuration) * 100) : 0;
                progressPercentage = Math.min(100, Math.max(0, progressPercentage)); // Clamp between 0-100
                
                // Ensure minimum visible width for 0% to show phase has started
                if (progressPercentage === 0) {
                  progressWidth = '2px'; // Minimum visible indicator
                } else {
                  progressWidth = `${progressPercentage}%`;
                }
              }
              
              // Determine line and text color
              let lineColor = 'bg-border';
              let textColor = 'text-muted-foreground font-semibold';
              let badge = null;

              if (status === 'complete') {
                lineColor = 'bg-success';
                textColor = 'text-success font-semibold';
                badge = <Badge variant="success">Complete</Badge>;
              } else if (status === 'in-progress') {
                lineColor = 'bg-blue-400 dark:bg-blue-500';
                textColor = 'text-blue-400 dark:text-blue-500 font-semibold';
                badge = <Badge className="bg-blue-400/10 dark:bg-blue-500/10 text-blue-400 dark:text-blue-500 border-blue-400/20 dark:border-blue-500/20">In Progress</Badge>;
              } else {
                lineColor = 'bg-purple-500';
                textColor = 'text-purple-500 font-semibold';
                badge = <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">To Complete</Badge>;
              }

              return (
                <div key={phase.name} className="flex items-start flex-1" data-testid={`phase-${phase.name.toLowerCase()}`}>
                  {/* Phase info and connecting line */}
                  <div className="flex-1 flex flex-col items-center px-2">
                    {/* Connecting line with progress overlay for in-progress phase */}
                    <div className="relative w-full mt-3">
                      {status === 'in-progress' ? (
                        <>
                          {/* Green progress portion */}
                          <div 
                            className="absolute top-0 left-0 h-0.5 bg-success rounded-l-full"
                            style={{ 
                              width: progressWidth === '2px' ? '2px' : `calc(${progressWidth} - 0.5mm)` 
                            }}
                            data-testid={`progress-overlay-${phase.name.toLowerCase()}`}
                          />
                          {/* 0.5mm transparent gap - no color */}
                          {/* Blue remainder portion */}
                          <div 
                            className="absolute top-0 h-0.5 rounded-r-full bg-blue-400 dark:bg-blue-500"
                            style={{ 
                              left: progressWidth === '2px' ? 'calc(2px + 0.5mm)' : `calc(${progressWidth} + 0.5mm)`,
                              right: 0
                            }}
                            data-testid={`line-${phase.name.toLowerCase()}`}
                          />
                        </>
                      ) : (
                        /* Base line for complete/to-complete phases */
                        <div 
                          className={`h-0.5 w-full ${lineColor} rounded-full`}
                          data-testid={`line-${phase.name.toLowerCase()}`} 
                        />
                      )}
                    </div>
                    
                    {/* Phase name, dates, and status */}
                    <div className="flex flex-col items-center mt-2 space-y-1">
                      <span className={`text-sm text-center ${textColor}`}>
                        {phase.name}
                      </span>
                      <span className="text-xs text-muted-foreground text-center whitespace-nowrap">
                        {phase.start && phase.end && `${formatDate(phase.start)} - ${formatDate(phase.end)}`}
                      </span>
                      {badge}
                    </div>
                  </div>

                  {/* End circle for this phase */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-6 w-6 rounded-full border-4 border-background z-10 ${getCircleColor(phaseIndex + 1)}`}
                      style={getCircleStyle(phaseIndex + 1)}
                      data-testid={`circle-${phaseIndex + 1}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
