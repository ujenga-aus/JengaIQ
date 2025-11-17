import { ContractReviewCard } from '../ContractReviewCard'

export default function ContractReviewCardExample() {
  return (
    <div className="p-4 max-w-md">
      <ContractReviewCard
        id="1"
        fileName="Client_Contract_v3.pdf"
        uploadedDate="10 Jan 25"
        uploadedBy="Sarah Wilson"
        riskLevel="medium"
        compliantClauses={24}
        partialClauses={8}
        gapClauses={3}
      />
    </div>
  )
}
