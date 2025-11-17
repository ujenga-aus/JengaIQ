import { ProjectCard } from '../ProjectCard'

export default function ProjectCardExample() {
  return (
    <div className="p-4 max-w-sm">
      <ProjectCard
        id="1"
        projectCode="PROJ-2024-001"
        name="Sydney Metro Expansion"
        client="Transport NSW"
        location="Sydney CBD"
        phase="Delivery"
        status="Active"
        openRfis={12}
        overdueRfis={3}
        phaseEndDate="Mar 2025"
      />
    </div>
  )
}
