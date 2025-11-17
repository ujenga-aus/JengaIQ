import { createContext, useContext, ReactNode, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCompany } from "./CompanyContext";
import type { CompanyThemeSettings } from "@shared/schema";

interface ThemeSettingsContextType {
  themeSettings: CompanyThemeSettings | null;
  isLoading: boolean;
  updateRowDensity: (density: 'narrow' | 'medium' | 'wide') => Promise<void>;
  isUpdating: boolean;
}

const ThemeSettingsContext = createContext<ThemeSettingsContextType | undefined>(undefined);

export function ThemeSettingsProvider({ children }: { children: ReactNode }) {
  const { selectedCompany } = useCompany();

  const { data: themeSettings = null, isLoading } = useQuery<CompanyThemeSettings | null>({
    queryKey: ['/api/companies', selectedCompany?.id, 'theme-settings'],
    enabled: !!selectedCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (density: 'narrow' | 'medium' | 'wide') => {
      if (!selectedCompany?.id) throw new Error("No company selected");
      
      const response = await apiRequest(
        'PATCH',
        `/api/companies/${selectedCompany.id}/theme-settings`,
        { rowDensity: density }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/companies', selectedCompany?.id, 'theme-settings'] 
      });
    },
  });

  useEffect(() => {
    if (themeSettings?.rowDensity) {
      const densityClass = `density-${themeSettings.rowDensity}`;
      
      document.documentElement.classList.remove('density-narrow', 'density-medium', 'density-wide');
      document.documentElement.classList.add(densityClass);
    } else {
      document.documentElement.classList.remove('density-narrow', 'density-medium', 'density-wide');
      document.documentElement.classList.add('density-wide');
    }
  }, [themeSettings?.rowDensity]);

  const updateRowDensity = async (density: 'narrow' | 'medium' | 'wide') => {
    await mutation.mutateAsync(density);
  };

  return (
    <ThemeSettingsContext.Provider
      value={{
        themeSettings,
        isLoading,
        updateRowDensity,
        isUpdating: mutation.isPending,
      }}
    >
      {children}
    </ThemeSettingsContext.Provider>
  );
}

export function useThemeSettings() {
  const context = useContext(ThemeSettingsContext);
  if (context === undefined) {
    throw new Error("useThemeSettings must be used within a ThemeSettingsProvider");
  }
  return context;
}
