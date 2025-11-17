import { createContext, useContext, useMemo, useState, ReactNode } from "react";

export type BoqRow = {
  id: string;
  level: number | null;
  hasChildren?: boolean;
};

type ViewMode =
  | { kind: "all" }
  | { kind: "closed" }
  | { kind: "depth"; max: number };

type BoqViewCtx = {
  mode: ViewMode;
  setAll: () => void;
  setClosed: () => void;
  setDepth: (max: number) => void;
  visibleRows: (rows: BoqRow[]) => BoqRow[];
};

const BoqViewContext = createContext<BoqViewCtx | null>(null);

function inferHasChildren(rows: BoqRow[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    // Only items with levels can have children
    if (cur.level === null || cur.level === 0) {
      map[cur.id] = false;
      continue;
    }
    
    const next = rows[i + 1];
    const hasChild = next ? (next.level !== null && next.level !== 0 && next.level > cur.level) : false;
    map[cur.id] = hasChild;
  }
  return map;
}

export function BoqViewProvider({ 
  children, 
  revisionKey 
}: { 
  children: ReactNode;
  revisionKey: string;
}) {
  // Persist view mode per revision using a map
  const [modeMap, setModeMap] = useState<Map<string, ViewMode>>(new Map());
  
  // Get mode for current revision (default to "all")
  const mode = modeMap.get(revisionKey) ?? { kind: "all" };
  
  // Update mode for current revision
  const updateMode = (newMode: ViewMode) => {
    setModeMap(prev => {
      const next = new Map(prev);
      next.set(revisionKey, newMode);
      return next;
    });
  };

  const value: BoqViewCtx = useMemo(() => {
    const setAll = () => updateMode({ kind: "all" });
    const setClosed = () => updateMode({ kind: "closed" });
    const setDepth = (max: number) => updateMode({ kind: "depth", max });

    const visibleRows = (rows: BoqRow[]) => {
      switch (mode.kind) {
        case "all":
          return rows;
        case "closed": {
          const inferred = inferHasChildren(rows);
          return rows.filter((r) => r.hasChildren ?? inferred[r.id]);
        }
        case "depth":
          return rows.filter((r) => r.level !== null && r.level <= mode.max);
      }
    };

    return { mode, setAll, setClosed, setDepth, visibleRows };
  }, [mode]);

  return <BoqViewContext.Provider value={value}>{children}</BoqViewContext.Provider>;
}

export function useBoqView() {
  const ctx = useContext(BoqViewContext);
  if (!ctx) throw new Error("useBoqView must be used within BoqViewProvider");
  return ctx;
}
