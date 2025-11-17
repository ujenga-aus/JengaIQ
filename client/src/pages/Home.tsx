import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 data-testid="text-welcome">Welcome, {user.givenName}!</h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-email">
          {user.email}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Welcome to uJenga. Your account has been created successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            To get started, you'll need to be invited to a company by an administrator.
            Once you're added to a company, you'll be able to:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Access projects and business units</li>
            <li>Manage RFIs (Requests for Information)</li>
            <li>Perform contract reviews with AI assistance</li>
            <li>Collaborate with your team members</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            If you believe you should have access but don't see any companies, 
            please contact your system administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
