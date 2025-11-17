import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";
import type { QuoteCategory, Quote } from "@shared/schema";

interface CategoryWithQuotes extends QuoteCategory {
  quotes: Quote[];
}

interface QuotesData {
  categories: CategoryWithQuotes[];
  progress: {
    rowIndex: number;
    categoryIndex: number;
  } | null;
}

export function RotatingQuotes() {
  const { selectedCompany } = useCompany();
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [currentQuote, setCurrentQuote] = useState<{ text: string; category: string } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(true);
  const currentRowIndexRef = useRef(0);
  const currentCategoryIndexRef = useRef(0);

  const { data: quotesData } = useQuery<QuotesData>({
    queryKey: ["/api/quotes/rotator", selectedCompany?.id],
    queryFn: async () => {
      const params = selectedCompany?.id ? `?companyId=${selectedCompany.id}` : "";
      const response = await fetch(`/api/quotes/rotator${params}`);
      if (!response.ok) throw new Error("Failed to fetch quotes");
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  const updateBookmarkMutation = useMutation({
    mutationFn: async (params: { rowIndex: number; categoryIndex: number }) => {
      return await apiRequest("PATCH", "/api/quotes/bookmark", {
        rowIndex: params.rowIndex,
        categoryIndex: params.categoryIndex,
        companyId: selectedCompany?.id || null,
      });
    },
  });

  // Keep refs in sync with state
  useEffect(() => {
    currentRowIndexRef.current = currentRowIndex;
    currentCategoryIndexRef.current = currentCategoryIndex;
  }, [currentRowIndex, currentCategoryIndex]);

  // Initialize from saved progress (or reset to 0 if no progress)
  useEffect(() => {
    if (quotesData?.progress) {
      setCurrentRowIndex(quotesData.progress.rowIndex);
      setCurrentCategoryIndex(quotesData.progress.categoryIndex);
    } else if (quotesData?.categories) {
      // No saved progress - start from beginning
      setCurrentRowIndex(0);
      setCurrentCategoryIndex(0);
    }
  }, [quotesData?.progress, quotesData?.categories]);

  // Calculate and display the current quote
  useEffect(() => {
    if (!quotesData?.categories || quotesData.categories.length === 0) {
      return;
    }

    const categories = quotesData.categories;
    const numCategories = categories.length;

    // Find the maximum number of quotes across all categories
    const maxQuotes = Math.max(...categories.map(c => c.quotes.length));

    // If we've gone past all quotes, reset to start
    if (currentRowIndex >= maxQuotes) {
      setCurrentRowIndex(0);
      setCurrentCategoryIndex(0);
      return;
    }

    // Search for a quote at the current row, starting from current category
    let quote = null;
    let foundCategory = null;
    let foundCategoryIdx = -1;

    // Try all categories (with wraparound) to find one with a quote at this row
    for (let i = 0; i < numCategories; i++) {
      const checkIdx = (currentCategoryIndex + i) % numCategories;
      const category = categories[checkIdx];
      
      if (category.quotes[currentRowIndex]) {
        quote = category.quotes[currentRowIndex];
        foundCategory = category;
        foundCategoryIdx = checkIdx;
        break;
      }
    }

    // If no category has a quote at this row, move to next row and start from category 0
    if (!quote || !foundCategory) {
      setCurrentRowIndex(currentRowIndex + 1);
      setCurrentCategoryIndex(0);
      return;
    }

    // Sync state to the category that's actually being displayed
    if (foundCategoryIdx !== currentCategoryIndex) {
      setCurrentCategoryIndex(foundCategoryIdx);
    }

    setCurrentQuote({
      text: quote.text,
      category: foundCategory.name,
    });
  }, [currentRowIndex, currentCategoryIndex, quotesData]);

  // Rotation logic - advance every 13 seconds
  useEffect(() => {
    if (!quotesData?.categories || quotesData.categories.length === 0) {
      return;
    }

    const rotate = () => {
      if (!isVisibleRef.current) return;

      const numCategories = quotesData.categories.length;
      const nextCategoryIndex = (currentCategoryIndex + 1) % numCategories;

      // If we wrapped around to category 0, increment row
      if (nextCategoryIndex === 0) {
        setCurrentRowIndex(currentRowIndex + 1);
        setCurrentCategoryIndex(0);
      } else {
        setCurrentCategoryIndex(nextCategoryIndex);
      }
    };

    // Set up 13-second interval
    timerRef.current = setInterval(rotate, 13000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentRowIndex, currentCategoryIndex, quotesData]);

  // Save bookmark whenever state settles (after quote selection effect updates indices)
  useEffect(() => {
    if (!quotesData?.categories || !currentQuote) {
      return;
    }

    // Debounce to ensure state has settled
    const timeoutId = setTimeout(() => {
      updateBookmarkMutation.mutate({
        rowIndex: currentRowIndex,
        categoryIndex: currentCategoryIndex,
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [currentRowIndex, currentCategoryIndex, currentQuote, quotesData]);

  // Handle visibility changes - pause when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Save bookmark on unmount using refs to avoid stale closures
  useEffect(() => {
    const mutation = updateBookmarkMutation;
    return () => {
      // Use refs to get the latest values at cleanup time
      mutation.mutate({
        rowIndex: currentRowIndexRef.current,
        categoryIndex: currentCategoryIndexRef.current,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only runs on mount/unmount

  if (!currentQuote) {
    return null;
  }

  // Remove category prefix from quote text if it exists
  // Handles patterns like "Red flag:", "Clause of the Day:", etc.
  const cleanQuoteText = currentQuote.text.replace(
    new RegExp(`^${currentQuote.category}:\\s*`, 'i'),
    ''
  );

  return (
    <Card className="border-primary/20 bg-primary/5" data-testid="card-rotating-quote">
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center gap-4">
          <Lightbulb className="h-6 w-6 text-primary" />
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground" data-testid="text-category">
              — {currentQuote.category} —
            </p>
            <p className="text-lg font-medium leading-relaxed" data-testid="text-quote">
              {cleanQuoteText}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
