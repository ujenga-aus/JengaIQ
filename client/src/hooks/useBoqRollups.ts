import { useMemo } from "react";

export type BOQItem = {
  id: string;
  level: number | null;
  quantity: number | null;
  amount: number | null;
  [key: string]: any;
};

export type RollupData = {
  subtotalQuantity: number;
  subtotalAmount: number;
  hasHiddenChildren: boolean;
};

/**
 * Compute rolled-up totals for parent rows in a BOQ.
 * Only aggregates leaf descendants (items with level === null).
 * 
 * @param allItems - All BOQ items (unfiltered)
 * @param viewFilteredIds - IDs of items visible after view filtering
 * @param visibleItemIds - IDs of items visible after collapse filtering
 */
export function useBoqRollups(
  allItems: BOQItem[] | undefined,
  viewFilteredIds: Set<string>,
  visibleItemIds: Set<string>
): Map<string, RollupData> {
  return useMemo(() => {
    const rollups = new Map<string, RollupData>();
    
    if (!allItems || allItems.length === 0) {
      return rollups;
    }

    // Initialize rollup data for all heading rows
    for (const item of allItems) {
      if (item.level !== null) {
        rollups.set(item.id, {
          subtotalQuantity: 0,
          subtotalAmount: 0,
          hasHiddenChildren: false,
        });
      }
    }

    // Single O(n) pass: track ancestor stack and accumulate upwards
    const ancestorStack: Array<{ id: string; level: number }> = [];

    for (const item of allItems) {
      if (item.level === null) {
        // Leaf item: add to all ancestors on stack
        const quantity = Number(item.quantity) || 0;
        const amount = Number(item.amount) || 0;
        const isHidden = viewFilteredIds.has(item.id) && !visibleItemIds.has(item.id);

        for (const ancestor of ancestorStack) {
          const rollupData = rollups.get(ancestor.id)!;
          rollupData.subtotalQuantity += quantity;
          rollupData.subtotalAmount += amount;
          if (isHidden) {
            rollupData.hasHiddenChildren = true;
          }
        }
      } else {
        // Heading row: manage stack
        // Pop any ancestors at same or deeper level
        while (ancestorStack.length > 0 && ancestorStack[ancestorStack.length - 1].level >= item.level) {
          ancestorStack.pop();
        }

        // Check if this heading itself is hidden
        const isHidden = viewFilteredIds.has(item.id) && !visibleItemIds.has(item.id);
        if (isHidden) {
          // Mark all ancestors as having hidden children
          for (const ancestor of ancestorStack) {
            rollups.get(ancestor.id)!.hasHiddenChildren = true;
          }
        }

        // Push this heading onto stack
        ancestorStack.push({ id: item.id, level: item.level });
      }
    }

    return rollups;
  }, [allItems, viewFilteredIds, visibleItemIds]);
}
