import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { TerminologyProvider } from "@/contexts/TerminologyContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { ThemeSettingsProvider } from "@/contexts/ThemeSettingsContext";
import { BusinessUnitProvider } from "@/contexts/BusinessUnitContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { SetupModeProvider } from "@/contexts/SetupModeContext";
import { UiDensityProvider } from "@/contexts/UiDensityContext";
import { useCompanyStyles } from "@/hooks/useCompanyStyles";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import SelectedProjectDetail from "@/pages/SelectedProjectDetail";
import RFIs from "@/pages/RFIs";
import RFIDetail from "@/pages/RFIDetail";
import Companies from "@/pages/Companies";
import CompanyDetail from "@/pages/CompanyDetail";
import BusinessUnitDetail from "@/pages/BusinessUnitDetail";
import RiskRegister from "@/pages/RiskRegister";
import EDiscovery from "@/pages/eDiscovery";
import NotFound from "@/pages/not-found";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/projects" component={Projects as any} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/proj" component={SelectedProjectDetail} />
      <Route path="/rfis" component={RFIs} />
      <Route path="/rfis/:id" component={RFIDetail} />
      <Route path="/risks" component={RiskRegister} />
      <Route path="/risk-register" component={RiskRegister} />
      <Route path="/ediscovery" component={EDiscovery} />
      <Route path="/companies" component={Companies as any} />
      <Route path="/companies/:id" component={CompanyDetail} />
      <Route path="/business-units/:id" component={BusinessUnitDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function CompanyStylesInjector() {
  // Inject company-specific table header colors into DOM
  useCompanyStyles();
  return null;
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  // Always mount providers to prevent context resets
  // Conditionally render Landing vs authenticated layout INSIDE providers
  return (
    <CompanyProvider>
      <UiDensityProvider>
        <CompanyStylesInjector />
        <ThemeSettingsProvider>
          <BusinessUnitProvider>
            <ProjectProvider>
              <TerminologyProvider>
                <SetupModeProvider>
                  {isLoading || !isAuthenticated ? (
                    <Landing />
                  ) : (
                    <div className="flex flex-col h-screen w-full">
                      <AppHeader />
                      <main className="flex-1 overflow-auto p-6">
                        <AuthenticatedRouter />
                      </main>
                    </div>
                  )}
                </SetupModeProvider>
              </TerminologyProvider>
            </ProjectProvider>
          </BusinessUnitProvider>
        </ThemeSettingsProvider>
      </UiDensityProvider>
    </CompanyProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
