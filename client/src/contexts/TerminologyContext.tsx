import { createContext, useContext, useState, ReactNode } from "react";

interface Terminology {
  businessUnit: string;
  rfi: string;
  tender: string;
  delivery: string;
  defectsPeriod: string;
  closed: string;
}

const defaultTerminology: Terminology = {
  businessUnit: "Business Units",
  rfi: "RFIs",
  tender: "Tender",
  delivery: "Delivery",
  defectsPeriod: "Defects Period",
  closed: "Liability Period",
};

interface TerminologyContextType {
  terminology: Terminology;
  updateTerminology: (newTerms: Partial<Terminology>) => void;
}

const TerminologyContext = createContext<TerminologyContextType | undefined>(undefined);

export function TerminologyProvider({ children }: { children: ReactNode }) {
  const [terminology, setTerminology] = useState<Terminology>(defaultTerminology);

  const updateTerminology = (newTerms: Partial<Terminology>) => {
    setTerminology(prev => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(newTerms).map(([key, value]) => [
          key,
          value?.trim() || defaultTerminology[key as keyof Terminology]
        ])
      )
    }));
  };

  return (
    <TerminologyContext.Provider value={{ terminology, updateTerminology }}>
      {children}
    </TerminologyContext.Provider>
  );
}

export function useTerminology() {
  const context = useContext(TerminologyContext);
  if (!context) {
    throw new Error("useTerminology must be used within TerminologyProvider");
  }
  return context;
}
