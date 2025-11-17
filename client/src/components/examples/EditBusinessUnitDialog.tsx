import { EditBusinessUnitDialog } from '../EditBusinessUnitDialog'

export default function EditBusinessUnitDialogExample() {
  return (
    <div className="p-4">
      <EditBusinessUnitDialog
        id="1"
        name="Construction Division"
        abn="12 345 678 901"
        notes="Handles all building and construction projects"
      />
    </div>
  )
}
