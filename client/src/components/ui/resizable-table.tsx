import { useState, useEffect, useMemo, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Id = string;

export type ResizableColumn<T> = {
  id: Id;
  header: ReactNode;
  accessor: (row: T) => ReactNode;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
};

export type ResizableTableProps<T> = {
  tableId: string;
  columns: ResizableColumn<T>[];
  data: T[];
  className?: string;
  persist?: boolean;
  tableClassName?: string;
  emptyMessage?: string;
};

type DragState = {
  colId: Id;
  startX: number;
  startWidth: number;
};

const STORAGE_PREFIX = "colwidths:";

export function ResizableTable<T>({
  tableId,
  columns,
  data,
  className,
  persist = true,
  tableClassName,
  emptyMessage = "No rows",
}: ResizableTableProps<T>) {
  const storageKey = `${STORAGE_PREFIX}${tableId}`;
  const defaultWidths = useMemo<Record<Id, number>>(() => {
    const m: Record<Id, number> = {};
    for (const c of columns) {
      if (typeof c.width === "number") m[c.id] = c.width;
    }
    return m;
  }, [columns]);

  const [widths, setWidths] = useState<Record<Id, number>>(() => {
    if (!persist) return defaultWidths;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<Id, number>;
        return { ...defaultWidths, ...parsed };
      }
    } catch {}
    return defaultWidths;
  });

  useEffect(() => {
    if (!persist) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {}
  }, [persist, storageKey, widths]);

  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const delta = e.clientX - drag.startX;
      const col = columns.find((c) => c.id === drag.colId)!;
      const min = col.minWidth ?? 80;
      const max = col.maxWidth ?? 800;
      const next = Math.min(max, Math.max(min, drag.startWidth + delta));
      setWidths((w) => ({ ...w, [drag.colId]: next }));
    };

    const onUp = () => setDrag(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
  }, [drag, columns]);

  return (
    <div className={cn("w-full overflow-auto", className)}>
      <table className={cn("w-full table-fixed border-separate border-spacing-0", tableClassName)}>
        <colgroup>
          {columns.map((c) => (
            <col
              key={c.id}
              style={{
                width: `${widths[c.id] ?? c.width ?? 180}px`,
              }}
            />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-muted/40">
            {columns.map((c, i) => (
              <th
                key={c.id}
                scope="col"
                className={cn(
                  "relative select-none whitespace-nowrap border-b py-2 pl-3 pr-3 text-left text-sm font-semibold text-foreground",
                  c.headerClassName,
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{c.header}</span>
                </div>
                <button
                  aria-label={`Resize column ${i + 1}`}
                  onMouseDown={(e) => {
                    const th = e.currentTarget.parentElement as HTMLTableCellElement | null;
                    if (!th) return;
                    const computedWidth = th.getBoundingClientRect().width;
                    setDrag({
                      colId: c.id,
                      startX: e.clientX,
                      startWidth: computedWidth,
                    });
                  }}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 outline-none"
                  data-testid={`resize-handle-${c.id}`}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="border-b px-3 py-6 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={cn(
                  "hover:bg-muted/20",
                  rIdx % 2 === 1 ? "bg-muted/10" : "",
                )}
              >
                {columns.map((c, cIdx) => (
                  <td
                    key={c.id}
                    className={cn(
                      "border-b px-3 py-2 align-top text-sm text-foreground",
                      c.cellClassName,
                      cIdx === 0 ? "font-medium" : "",
                    )}
                  >
                    <div className="truncate">{c.accessor(row)}</div>
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
