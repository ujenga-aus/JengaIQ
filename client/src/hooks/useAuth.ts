import { useQuery } from "@tanstack/react-query";
import type { Person } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, isError, error } = useQuery<Person>({
    queryKey: ["/api/auth/user"],
    retry: false,
    throwOnError: false, // Don't throw on 401 - treat as logged out state
  });

  // Treat 401 (Unauthorized) as "not authenticated" rather than an error
  // This allows the Landing page to render for logged-out users
  const is401 = isError && error instanceof Error && /^401:/.test(error.message);

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !is401,
  };
}
