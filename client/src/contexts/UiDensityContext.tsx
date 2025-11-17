import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useCompany } from './CompanyContext';

export type UiDensity = 'narrow' | 'medium' | 'wide';

interface UiDensityContextType {
  density: UiDensity;
}

const UiDensityContext = createContext<UiDensityContextType | undefined>(undefined);

export function UiDensityProvider({ children }: { children: ReactNode }) {
  const { selectedCompany } = useCompany();
  const density: UiDensity = (selectedCompany?.gridRowSpacing as UiDensity) || 'narrow';
  
  useEffect(() => {
    // Apply density class to document element so CSS variables are globally accessible
    document.documentElement.classList.remove('density-narrow', 'density-medium', 'density-wide');
    document.documentElement.classList.add(`density-${density}`);
  }, [density]);
  
  return (
    <UiDensityContext.Provider value={{ density }}>
      {children}
    </UiDensityContext.Provider>
  );
}

export function useUiDensity() {
  const ctx = useContext(UiDensityContext);
  if (!ctx) throw new Error('useUiDensity must be used within UiDensityProvider');
  return ctx;
}
