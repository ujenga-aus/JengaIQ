import { MetricCard } from '../MetricCard'
import { FileText } from 'lucide-react'

export default function MetricCardExample() {
  return (
    <div className="p-4 max-w-xs">
      <MetricCard
        title="Total Projects"
        value={24}
        icon={FileText}
        trend={{ value: "+12% from last month", positive: true }}
      />
    </div>
  )
}
