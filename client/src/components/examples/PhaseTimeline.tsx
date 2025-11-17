import { PhaseTimeline } from '../PhaseTimeline'

export default function PhaseTimelineExample() {
  return (
    <div className="p-4">
      <PhaseTimeline
        tenderStart="Jan 2024"
        tenderEnd="Mar 2024"
        deliveryStart="Apr 2024"
        deliveryEnd="Dec 2024"
        closeoutStart="Jan 2025"
        closeoutEnd="Mar 2025"
        currentPhase="Delivery"
      />
    </div>
  )
}
