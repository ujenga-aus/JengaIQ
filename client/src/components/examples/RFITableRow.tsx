import { RFITableRow } from '../RFITableRow'

export default function RFITableRowExample() {
  return (
    <div className="p-4">
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th className="py-3 px-4 text-left text-sm font-medium">Number</th>
              <th className="py-3 px-4 text-left text-sm font-medium">Title</th>
              <th className="py-3 px-4 text-left text-sm font-medium">To</th>
              <th className="py-3 px-4 text-left text-sm font-medium">Status</th>
              <th className="py-3 px-4 text-left text-sm font-medium">Required Date</th>
              <th className="py-3 px-4 text-left text-sm font-medium">Days Open</th>
              <th className="py-3 px-4 text-left text-sm font-medium">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            <RFITableRow
              id="1"
              number="PROJ-001-RFI-0001"
              title="Clarification on structural steel specifications"
              to="ABC Engineering"
              status="Open"
              requiredDate="15 Jan 25"
              daysOpen={3}
              isOverdue={false}
              lastActivity="2 hours ago"
            />
          </tbody>
        </table>
      </div>
    </div>
  )
}
