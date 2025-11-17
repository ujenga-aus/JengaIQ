import { RFIStatusBadge } from '../RFIStatusBadge'

export default function RFIStatusBadgeExample() {
  return (
    <div className="p-4 flex gap-2 flex-wrap">
      <RFIStatusBadge status="Open" />
      <RFIStatusBadge status="Awaiting Info" />
      <RFIStatusBadge status="Responded" />
      <RFIStatusBadge status="Closed" />
    </div>
  )
}
