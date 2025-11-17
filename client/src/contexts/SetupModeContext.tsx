import { createContext, useContext, useState, ReactNode } from 'react';

interface SetupModeContextType {
  isSetupMode: boolean;
  enterSetupMode: () => void;
  exitSetupMode: () => void;
}

const SetupModeContext = createContext<SetupModeContextType | undefined>(undefined);

export function SetupModeProvider({ children }: { children: ReactNode }) {
  const [isSetupMode, setIsSetupMode] = useState(false);

  const enterSetupMode = () => {
    setIsSetupMode(true);
  };

  const exitSetupMode = () => {
    setIsSetupMode(false);
  };

  return (
    <SetupModeContext.Provider value={{ isSetupMode, enterSetupMode, exitSetupMode }}>
      {children}
    </SetupModeContext.Provider>
  );
}

export function useSetupMode() {
  const context = useContext(SetupModeContext);
  if (context === undefined) {
    throw new Error('useSetupMode must be used within a SetupModeProvider');
  }
  return context;
}
