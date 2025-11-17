import { RFIStatusBadge } from "./RFIStatusBadge";
import { AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

type RFIStatus = "Open" | "Awaiting Info" | "Responded" | "Closed";

interface RFITableRowProps {
  id: string;
  number: string;
  title: string;
  to: string;
  status: RFIStatus;
  requiredDate: string;
  daysOpen: number;
  isOverdue?: boolean;
  lastActivity: string;
}

export function RFITableRow({
  id,
  number,
  title,
  to,
  status,
  requiredDate,
  daysOpen,
  isOverdue,
  lastActivity,
}: RFITableRowProps) {
  const [, setLocation] = useLocation();

  const cellStyle = { paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' };
  
  return (
    <tr 
      className="border-b hover-elevate cursor-pointer" 
      data-testid={`row-rfi-${id}`}
      onClick={() => setLocation(`/rfis/${id}`)}
    >
      <td className="px-4" style={cellStyle}>
        <span className="font-mono text-sm font-medium">{number}</span>
      </td>
      <td className="px-4" style={cellStyle}>
        <div className="flex items-center gap-2">
          {isOverdue && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
          <span className="font-medium">{title}</span>
        </div>
      </td>
      <td className="px-4 text-sm text-muted-foreground" style={cellStyle}>{to}</td>
      <td className="px-4" style={cellStyle}>
        <RFIStatusBadge status={status} />
      </td>
      <td className="px-4 text-sm" style={cellStyle}>
        <span className={isOverdue ? 'text-destructive font-medium' : ''}>
          {requiredDate}
        </span>
      </td>
      <td className="px-4 text-sm text-muted-foreground" style={cellStyle}>{daysOpen}d</td>
      <td className="px-4 text-sm text-muted-foreground" style={cellStyle}>{lastActivity}</td>
    </tr>
  );
}
