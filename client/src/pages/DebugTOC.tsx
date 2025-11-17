import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { parseTOC, isClauseNumber, CLAUSE_NUMBER_PATTERN } from "@/lib/tocParser";

export default function DebugTOC() {
  const [testText, setTestText] = useState(
    `The Contractor warrants that prior to the Execution Date of this Agreement*, it has reviewed and checked the tender documents.
(a) The Contractor confirms that it identified and disclosed any significant risks or included within them.
(b) restrictions on the Contractor's ability to perform the Works.
(c) any provisions that could materially impact the Contractor's obligations or the Principal's rights under this Agreement.`
  );
  
  const [revisionId, setRevisionId] = useState("");
  
  // Fetch TOC data
  const { data: tocData, isLoading } = useQuery<{ tocText: string } | null>({
    queryKey: revisionId ? [`/api/contract-review/revisions/${revisionId}/toc-chunk`] : [],
    enabled: !!revisionId,
    retry: false,
  });
  
  const clauseMap = tocData?.tocText ? parseTOC(tocData.tocText) : new Map();
  
  // Find all clause references in test text
  const findReferences = (text: string) => {
    const referencePattern = new RegExp(`(?<![A-Za-z0-9])(${CLAUSE_NUMBER_PATTERN})(?![A-Za-z0-9])`, 'g');
    const found: Array<{
      match: string;
      isValid: boolean;
      inTOC: boolean;
      heading?: string;
    }> = [];
    
    let match;
    while ((match = referencePattern.exec(text)) !== null) {
      const clauseNum = match[1];
      found.push({
        match: clauseNum,
        isValid: isClauseNumber(clauseNum),
        inTOC: clauseMap.has(clauseNum),
        heading: clauseMap.get(clauseNum),
      });
    }
    
    return found;
  };
  
  const references = findReferences(testText);
  
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">TOC Debug Tool</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>1. Load TOC Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Revision ID:
            </label>
            <input
              type="text"
              value={revisionId}
              onChange={(e) => setRevisionId(e.target.value)}
              placeholder="Enter revision ID"
              className="w-full p-2 border rounded"
              data-testid="input-revision-id"
            />
          </div>
          
          {isLoading && <p>Loading TOC...</p>}
          
          {tocData && (
            <div className="space-y-2">
              <p className="font-medium text-green-600">TOC Loaded: {clauseMap.size} clauses found</p>
              <details>
                <summary className="cursor-pointer text-sm text-blue-600">Show all clauses in TOC</summary>
                <div className="mt-2 p-3 bg-muted rounded max-h-60 overflow-auto">
                  {Array.from(clauseMap.entries()).map(([num, heading]) => (
                    <div key={num} className="text-xs font-mono">
                      <span className="font-bold">{num}</span> - {heading}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>2. Test Clause Detection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Test Text (paste AI-generated text here):
            </label>
            <Textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              rows={8}
              data-testid="textarea-test-text"
            />
          </div>
          
          <div className="space-y-2">
            <p className="font-medium">Detected Clause References:</p>
            {references.length === 0 && (
              <p className="text-sm text-muted-foreground">No clause references detected</p>
            )}
            {references.length > 0 && (
              <div className="space-y-1">
                {references.map((ref, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded border text-sm ${
                      ref.inTOC
                        ? "bg-green-50 dark:bg-green-950 border-green-300"
                        : "bg-red-50 dark:bg-red-950 border-red-300"
                    }`}
                  >
                    <div className="font-mono font-bold">{ref.match}</div>
                    <div className="text-xs space-y-1 mt-1">
                      <div>Valid pattern: {ref.isValid ? "✓" : "✗"}</div>
                      <div>In TOC: {ref.inTOC ? "✓" : "✗"}</div>
                      {ref.heading && <div>Heading: {ref.heading}</div>}
                      {!ref.inTOC && <div className="text-red-600 font-medium">⚠️ Will NOT show tooltip</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>3. Regex Pattern Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto">
            {CLAUSE_NUMBER_PATTERN}
          </div>
          <p className="text-sm mt-2 text-muted-foreground">
            This pattern matches clause numbers including: numeric (1, 1.2, 1.2.3), 
            with letters (1A, 2.1B), parenthetical (25.1(a), 3.4(b)(ii)), 
            roman numerals (I, II.1), and prefixes (GC-1.2, A-1).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
