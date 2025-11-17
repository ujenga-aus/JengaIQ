interface RiskOpportunityMatrixProps {
  type: "risk" | "opportunity";
  consequenceLevel?: number | null; // 1-6
  likelihood?: number | null; // 1-5 (Almost Certain, Likely, Possible, Unlikely, Rare)
}

// Matrix color mappings based on the standard risk matrix
// Rows are consequence levels (6 = highest, 1 = lowest)
// Columns are likelihood levels (1 = Rare, 2 = Unlikely, 3 = Possible, 4 = Likely, 5 = Almost Certain)
const RISK_MATRIX_COLORS = [
  // Level 6 (highest consequence)
  ["bg-red-600 text-white", "bg-red-600 text-white", "bg-red-600 text-white", "bg-red-600 text-white", "bg-red-600 text-white"],
  // Level 5
  ["bg-orange-500 text-white", "bg-red-600 text-white", "bg-red-600 text-white", "bg-red-600 text-white", "bg-red-600 text-white"],
  // Level 4
  ["bg-yellow-400 text-black", "bg-orange-500 text-white", "bg-orange-500 text-white", "bg-red-600 text-white", "bg-red-600 text-white"],
  // Level 3
  ["bg-green-500 text-white", "bg-yellow-400 text-black", "bg-orange-500 text-white", "bg-orange-500 text-white", "bg-red-600 text-white"],
  // Level 2
  ["bg-blue-500 text-white", "bg-green-500 text-white", "bg-yellow-400 text-black", "bg-yellow-400 text-black", "bg-orange-500 text-white"],
  // Level 1 (lowest consequence)
  ["bg-blue-500 text-white", "bg-blue-500 text-white", "bg-green-500 text-white", "bg-yellow-400 text-black", "bg-yellow-400 text-black"],
];

const OPPORTUNITY_MATRIX_COLORS = [
  // Level 6 (highest consequence/benefit)
  ["bg-blue-600 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white"],
  // Level 5
  ["bg-blue-500 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white"],
  // Level 4
  ["bg-cyan-400 text-black", "bg-blue-500 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white"],
  // Level 3
  ["bg-green-500 text-white", "bg-cyan-400 text-black", "bg-blue-500 text-white", "bg-blue-600 text-white", "bg-blue-600 text-white"],
  // Level 2
  ["bg-yellow-400 text-black", "bg-green-500 text-white", "bg-cyan-400 text-black", "bg-blue-500 text-white", "bg-blue-600 text-white"],
  // Level 1 (lowest consequence/benefit)
  ["bg-yellow-400 text-black", "bg-yellow-400 text-black", "bg-green-500 text-white", "bg-cyan-400 text-black", "bg-blue-500 text-white"],
];

const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const LIKELIHOOD_CODES = ["1", "2", "3", "4", "5"];

export function RiskOpportunityMatrix({ type, consequenceLevel, likelihood }: RiskOpportunityMatrixProps) {
  const colorMatrix = type === "risk" ? RISK_MATRIX_COLORS : OPPORTUNITY_MATRIX_COLORS;
  const title = type === "risk" ? "Risk Matrix" : "Opportunity Matrix";
  
  // Convert likelihood percentage to level (1-5)
  // Assuming: 1-20% = Rare (1), 21-40% = Unlikely (2), 41-60% = Possible (3), 61-80% = Likely (4), 81-100% = Almost Certain (5)
  const getLikelihoodLevel = (likelihoodValue: number | null | undefined): number | null => {
    if (likelihoodValue == null) return null;
    if (likelihoodValue <= 20) return 1;
    if (likelihoodValue <= 40) return 2;
    if (likelihoodValue <= 60) return 3;
    if (likelihoodValue <= 80) return 4;
    return 5;
  };

  const likelihoodLevel = getLikelihoodLevel(likelihood);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted">
              <th className="border p-1 text-center font-semibold min-w-[60px]">
                Consequence
              </th>
              {LIKELIHOOD_LABELS.map((label, idx) => (
                <th key={idx} className="border p-1 text-center font-semibold min-w-[70px]">
                  <div>{label}</div>
                  <div className="text-[10px] text-muted-foreground">({LIKELIHOOD_CODES[idx]})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[6, 5, 4, 3, 2, 1].map((level, rowIdx) => (
              <tr key={level}>
                <td className="border p-2 text-center font-semibold bg-muted">
                  Level {level}
                </td>
                {[1, 2, 3, 4, 5].map((likCol) => {
                  const colorClass = colorMatrix[rowIdx][likCol - 1];
                  const isSelected = consequenceLevel === level && likelihoodLevel === likCol;
                  
                  return (
                    <td
                      key={likCol}
                      className={`border p-2 text-center ${colorClass} ${
                        isSelected ? "ring-4 ring-primary ring-inset" : ""
                      }`}
                      data-testid={`matrix-cell-${type}-${level}-${likCol}`}
                    >
                      {isSelected && (
                        <div className="font-bold text-lg">●</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
