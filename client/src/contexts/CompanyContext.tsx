import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Company } from "@shared/schema";
import { usePersistedSelection } from "@/hooks/usePersistedSelection";

interface CompanyContextType {
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  companies: Company[];
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { 
    selectedItem: selectedCompany, 
    setSelectedItem: setSelectedCompany,
  } = usePersistedSelection({
    storageKey: 'selectedCompanyId',
    items: companies,
    isLoading,
    getId: (company) => company.id,
    autoSelectFirst: true,
  });

  return (
    <CompanyContext.Provider
      value={{
        selectedCompany,
        setSelectedCompany,
        companies,
        isLoading,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
