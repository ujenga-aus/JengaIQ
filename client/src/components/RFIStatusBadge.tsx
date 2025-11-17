import { Badge } from "@/components/ui/badge";

type RFIStatus = "Open" | "Awaiting Info" | "Responded" | "Closed";

interface RFIStatusBadgeProps {
  status: RFIStatus;
}

const statusVariants = {
  Open: "primary" as const,
  "Awaiting Info": "warning" as const,
  Responded: "success" as const,
  Closed: "secondary" as const,
};

export function RFIStatusBadge({ status }: RFIStatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status]} data-testid={`badge-rfi-status-${status.toLowerCase().replace(' ', '-')}`}>
      {status}
    </Badge>
  );
}
