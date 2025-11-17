import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BusinessUnit } from "@shared/schema";
import { useCompany } from "./CompanyContext";

interface BusinessUnitContextType {
  selectedBusinessUnit: BusinessUnit | "all" | null;
  setSelectedBusinessUnit: (businessUnit: BusinessUnit | "all" | null) => void;
  businessUnits: BusinessUnit[];
  isLoading: boolean;
}

const BusinessUnitContext = createContext<BusinessUnitContextType | undefined>(undefined);

const STORAGE_KEY = 'selectedBusinessUnitId';

export function BusinessUnitProvider({ children }: { children: ReactNode }) {
  const { selectedCompany } = useCompany();
  const [selectedBusinessUnit, setSelectedBusinessUnitState] = useState<BusinessUnit | "all" | null>("all");
  const prevCompanyIdRef = useRef<string | undefined>();

  const { data: businessUnits = [], isLoading } = useQuery<BusinessUnit[]>({
    queryKey: ["/api/business-units", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const response = await fetch(`/api/business-units?companyId=${selectedCompany.id}`);
      if (!response.ok) throw new Error('Failed to fetch business units');
      return response.json();
    },
    enabled: !!selectedCompany?.id,
  });

  // Initialize from localStorage or default to "all"
  useEffect(() => {
    if (isLoading || !selectedCompany) return;

    const storedValue = localStorage.getItem(STORAGE_KEY);
    
    if (storedValue === "all") {
      setSelectedBusinessUnitState("all");
    } else if (storedValue) {
      // Validate stored ID exists in current business units
      const matchedUnit = businessUnits.find(bu => bu.id === storedValue);
      if (matchedUnit) {
        setSelectedBusinessUnitState(matchedUnit);
      } else {
        // Invalid stored ID - clear and default to "all"
        localStorage.removeItem(STORAGE_KEY);
        setSelectedBusinessUnitState("all");
        localStorage.setItem(STORAGE_KEY, "all");
      }
    } else {
      // No stored value - default to "all"
      setSelectedBusinessUnitState("all");
      localStorage.setItem(STORAGE_KEY, "all");
    }
  }, [businessUnits, isLoading, selectedCompany]);

  // Clear selection and localStorage when company changes (not on initial mount)
  useEffect(() => {
    const currentCompanyId = selectedCompany?.id;
    
    // Only clear if company ID actually changed (not on initial mount)
    if (prevCompanyIdRef.current !== undefined && prevCompanyIdRef.current !== currentCompanyId) {
      localStorage.removeItem(STORAGE_KEY);
      setSelectedBusinessUnitState("all");
      localStorage.setItem(STORAGE_KEY, "all");
    }
    
    // Update ref for next comparison
    prevCompanyIdRef.current = currentCompanyId;
  }, [selectedCompany?.id]);

  // Setter with localStorage persistence
  const setSelectedBusinessUnit = useCallback((businessUnit: BusinessUnit | "all" | null) => {
    setSelectedBusinessUnitState(businessUnit);
    
    if (businessUnit === "all") {
      localStorage.setItem(STORAGE_KEY, "all");
    } else if (businessUnit && typeof businessUnit === 'object') {
      localStorage.setItem(STORAGE_KEY, businessUnit.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <BusinessUnitContext.Provider
      value={{
        selectedBusinessUnit,
        setSelectedBusinessUnit,
        businessUnits,
        isLoading,
      }}
    >
      {children}
    </BusinessUnitContext.Provider>
  );
}

export function useBusinessUnit() {
  const context = useContext(BusinessUnitContext);
  if (context === undefined) {
    throw new Error("useBusinessUnit must be used within a BusinessUnitProvider");
  }
  return context;
}
