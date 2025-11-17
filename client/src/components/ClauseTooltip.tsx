/**
 * ClauseTooltip - Purple tooltip for displaying clause headings on hover
 */

interface ClauseTooltipProps {
  visible: boolean;
  clauseNumber: string;
  heading: string;
  x: number;
  y: number;
}

export function ClauseTooltip({ visible, clauseNumber, heading, x, y }: ClauseTooltipProps) {
  if (!visible) return null;

  return (
    <div
      role="tooltip"
      className="fixed z-[100] pointer-events-none"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px', // Offset above cursor
      }}
      data-testid="tooltip-clause-heading"
      aria-label={`Clause ${clauseNumber}: ${heading}`}
    >
      <div className="bg-purple-100 dark:bg-purple-900/90 border border-purple-300 dark:border-purple-700 rounded-md shadow-lg px-3 py-2 max-w-md">
        <div className="text-xs font-semibold text-purple-900 dark:text-purple-100 mb-1">
          Clause {clauseNumber}
        </div>
        <div className="text-sm text-purple-800 dark:text-purple-200">
          {heading}
        </div>
      </div>
      {/* Arrow pointing down - respects dark mode */}
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-purple-300 dark:border-t-purple-700"
      />
    </div>
  );
}
