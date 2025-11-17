import { useState, useEffect, useCallback } from 'react';

interface UsePersistedSelectionOptions<T> {
  storageKey: string;
  items: T[];
  isLoading: boolean;
  getId: (item: T) => string;
  autoSelectFirst?: boolean;
}

/**
 * Hook for managing selection state with localStorage persistence and validation
 * 
 * @param storageKey - Unique key for localStorage
 * @param items - Array of available items from the server
 * @param isLoading - Whether items are still loading
 * @param getId - Function to extract ID from an item
 * @param autoSelectFirst - Whether to auto-select first item when no persisted selection exists
 */
export function usePersistedSelection<T>({
  storageKey,
  items,
  isLoading,
  getId,
  autoSelectFirst = true,
}: UsePersistedSelectionOptions<T>) {
  const [selectedItem, setSelectedItemState] = useState<T | null>(null);

  // Initialize selection from localStorage or auto-select
  useEffect(() => {
    if (isLoading || items.length === 0) return;

    // Try to restore from localStorage
    const storedId = localStorage.getItem(storageKey);
    
    if (storedId) {
      // Validate that the stored ID exists in the current items
      const matchedItem = items.find(item => getId(item) === storedId);
      
      if (matchedItem) {
        setSelectedItemState(matchedItem);
        return;
      } else {
        // Stored ID is invalid (item was deleted or doesn't exist)
        localStorage.removeItem(storageKey);
      }
    }

    // Fall back to auto-select first item if enabled and no selection exists
    if (autoSelectFirst && !selectedItem && items.length > 0) {
      setSelectedItemState(items[0]);
      localStorage.setItem(storageKey, getId(items[0]));
    }
  }, [items, isLoading, storageKey, getId, autoSelectFirst, selectedItem]);

  // Update localStorage whenever selection changes
  const setSelectedItem = useCallback((item: T | null) => {
    setSelectedItemState(item);
    
    if (item) {
      localStorage.setItem(storageKey, getId(item));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, getId]);

  // Clear localStorage for this key
  const clearPersistedSelection = useCallback(() => {
    localStorage.removeItem(storageKey);
    setSelectedItemState(null);
  }, [storageKey]);

  return {
    selectedItem,
    setSelectedItem,
    clearPersistedSelection,
  };
}
