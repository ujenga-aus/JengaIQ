import { createContext, useContext, ReactNode } from "react";

interface AuthUser {
  id: string;
  username: string;
  name: string;
}

interface AuthContextType {
  currentUser: AuthUser | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// TODO: Replace with real authentication provider
// Using mock user for development until auth system is implemented
const MOCK_USER: AuthUser = {
  id: "fd80592e-22b0-423d-a9e1-d46d8a4d354d", // John Doe's user account ID
  username: "john.doe",
  name: "John Doe",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ currentUser: MOCK_USER }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
