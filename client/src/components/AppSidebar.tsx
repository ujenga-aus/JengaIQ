import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Building2, FolderKanban, FileText, Settings, Briefcase, LogOut, UserCog } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CompanySelector } from "./CompanySelector";
import { ProjectSelector } from "./ProjectSelector";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useSetupMode } from "@/contexts/SetupModeContext";
import logoImage from "@assets/uJenga_logo_transparent_strong_1761478919710.png";

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { terminology } = useTerminology();
  const { isSetupMode, enterSetupMode, exitSetupMode } = useSetupMode();

  const administrationMenuItems = [
    { title: "Project", url: "/proj", icon: FolderKanban },
  ];

  const handleSetupClick = (e: React.MouseEvent) => {
    if (isSetupMode) {
      // Exiting setup mode - go to dashboard
      e.preventDefault();
      exitSetupMode();
      setLocation("/");
    } else {
      // Entering setup mode - go to companies
      e.preventDefault();
      enterSetupMode();
      setLocation("/companies");
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b space-y-3">
        <img 
          src={logoImage} 
          alt="uJenga" 
          className="h-10 object-contain"
        />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              data-active={isSetupMode}
              data-inactive={!isSetupMode}
              className={!isSetupMode ? "text-muted-foreground hover:text-sidebar-foreground" : ""}
              data-testid="link-setup"
            >
              <Link href="/companies" onClick={handleSetupClick}>
                <Building2 className="h-4 w-4" />
                <span>Setup</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <CompanySelector />
        <ProjectSelector />
      </SidebarHeader>
      <SidebarContent>
        {/* Dashboard - standalone */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  data-active={location === "/" && !isSetupMode} 
                  disabled={isSetupMode}
                  className={isSetupMode ? "opacity-50 pointer-events-none" : ""}
                  data-testid="link-dashboard"
                >
                  <Link href="/">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Administration Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="font-bold text-sm">Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {administrationMenuItems.map((item) => {
                const isActive = location === item.url && !isSetupMode;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      data-active={isActive} 
                      disabled={isSetupMode}
                      className={isSetupMode ? "opacity-50 pointer-events-none" : ""}
                      data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              AD
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Admin User</p>
            <p className="text-xs text-muted-foreground truncate">admin@example.com</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0" 
            onClick={() => window.location.href = '/api/logout'}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
