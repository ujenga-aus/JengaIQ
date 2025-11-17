import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompanySelector } from "./CompanySelector";
import { BusinessUnitSelector } from "./BusinessUnitSelector";
import { ProjectSelector } from "./ProjectSelector";
import { useProject } from "@/contexts/ProjectContext";
import { LogOut } from "lucide-react";
import logoImage from "@assets/uJenga Logo - Tagline - Orange_1762754244402.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const [location] = useLocation();
  const { selectedProject } = useProject();
  const [sharePointConnected, setSharePointConnected] = useState<boolean>(false);

  // Check SharePoint connection status
  useEffect(() => {
    async function checkSharePointConnection() {
      try {
        const response = await fetch('/api/sharepoint/connection-status');
        const data = await response.json();
        setSharePointConnected(data.connected || false);
      } catch (error) {
        console.error('Error checking SharePoint connection:', error);
        setSharePointConnected(false);
      }
    }
    checkSharePointConnection();
  }, []);

  return (
    <div className="border-b bg-background">
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6 min-w-0 flex-1">
          <Link href="/">
            <img 
              src={logoImage} 
              alt="uJenga" 
              className="h-8 object-contain cursor-pointer flex-shrink-0"
              data-testid="logo-home"
            />
          </Link>
          
          <div className="flex items-center gap-3 flex-shrink-0">
            <CompanySelector />
            <BusinessUnitSelector />
            <ProjectSelector />
          </div>
          
          {/* Project breadcrumb - fills empty space */}
          {selectedProject && (
            <div className="flex items-center gap-2 sm:gap-3 text-xs font-bold flex-shrink overflow-hidden">
              <div 
                className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${sharePointConnected ? 'bg-green-500' : 'bg-amber-500'}`}
                data-testid="sharepoint-global-status-indicator"
                title={sharePointConnected ? 'SharePoint Connected' : 'SharePoint Not Connected'}
              />
              <span className="text-foreground whitespace-nowrap">{selectedProject.projectCode}</span>
              <span className="text-foreground">•</span>
              <span className="text-foreground truncate">{selectedProject.client}</span>
              <span className="text-foreground">•</span>
              <span className="text-foreground truncate">{selectedProject.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                    AD
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.location.href = '/api/logout'} data-testid="button-logout">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center gap-1 px-6 border-t bg-muted/30">
        <Link href="/dashboard">
          <Button
            variant="ghost"
            size="sm"
            className={`text-sm rounded-none border-0 border-b-2 ${
              location === "/dashboard"
                ? "border-b-primary text-primary" 
                : "border-b-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-dashboard"
          >
            Dashboard
          </Button>
        </Link>
        <Link href="/proj">
          <Button
            variant="ghost"
            size="sm"
            className={`text-sm rounded-none border-0 border-b-2 ${
              location === "/proj" || location.startsWith("/proj")
                ? "border-b-primary text-primary" 
                : "border-b-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-project"
          >
            Project
          </Button>
        </Link>
        <Link href="/companies">
          <Button
            variant="ghost"
            size="sm"
            className={`text-sm rounded-none border-0 border-b-2 ${
              location === "/companies" || (location.startsWith("/companies") && !location.includes("/companies/"))
                ? "border-b-primary text-primary" 
                : "border-b-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-setup"
          >
            Setup
          </Button>
        </Link>
      </div>
    </div>
  );
}
