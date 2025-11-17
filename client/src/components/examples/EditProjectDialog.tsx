import { EditProjectDialog } from '../EditProjectDialog'

export default function EditProjectDialogExample() {
  return (
    <div className="p-4">
      <EditProjectDialog
        projectCode="PROJ-2024-001"
        projectName="Sydney Metro Expansion"
        client="Transport NSW"
        location="Sydney CBD"
        status="Active"
        tenderStart="2024-01-01"
        tenderEnd="2024-03-31"
        deliveryStart="2024-04-01"
        deliveryEnd="2024-12-31"
        closeoutStart="2025-01-01"
        closeoutEnd="2025-03-31"
      />
    </div>
  )
}
