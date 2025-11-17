import { FolderKanban, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState, useMemo } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { useBusinessUnit } from "@/contexts/BusinessUnitContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useSetupMode } from "@/contexts/SetupModeContext";
import { useLocation } from "wouter";

export function ProjectSelector() {
  const [open, setOpen] = useState(false);
  const { selectedProject, setSelectedProject, projects, isLoading } = useProject();
  const { selectedBusinessUnit } = useBusinessUnit();
  const { terminology } = useTerminology();
  const { isSetupMode } = useSetupMode();
  const [location, setLocation] = useLocation();

  // Filter projects by selected business unit and sort alphabetically
  const filteredProjects = useMemo(() => {
    const filtered = !selectedBusinessUnit || selectedBusinessUnit === "all"
      ? projects
      : projects.filter(p => p.businessUnitId === selectedBusinessUnit.id);
    
    // Clone array before sorting to avoid mutating the original
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, selectedBusinessUnit]);

  if (isLoading) {
    return (
      <Button
        variant="outline"
        className="w-[168px] justify-between"
        disabled
        data-testid="button-project-selector"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderKanban className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs font-medium">Loading...</span>
        </div>
      </Button>
    );
  }

  const displayText = selectedProject && typeof selectedProject === 'object'
    ? selectedProject.name
    : "Select Project";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-[168px] justify-between ${isSetupMode ? "opacity-50" : ""}`}
          disabled={isSetupMode}
          data-testid="button-project-selector"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FolderKanban className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs font-bold">{displayText}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[168px] p-0" aria-describedby="project-selector-description">
        <Command
          filter={(value, search) => {
            const searchLower = search.toLowerCase().trim();
            const valueLower = value.toLowerCase();
            
            // Empty search shows all items
            if (!searchLower) return 1;
            
            // Check if any word in the value starts with the search term
            const words = valueLower.split(/\s+/);
            const hasMatch = words.some(word => word.startsWith(searchLower));
            
            return hasMatch ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search projects..." aria-label="Search projects" />
          <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup aria-label="Project options">
              {filteredProjects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  onSelect={() => {
                    setSelectedProject(project);
                    setOpen(false);
                    
                    // If on any project detail page, navigate to the new project
                    const projectRouteMatch = location.match(/^\/projects\/([^\/]+)/);
                    if (projectRouteMatch) {
                      const currentProjectId = projectRouteMatch[1];
                      
                      // Only navigate if selecting a different project
                      if (currentProjectId !== project.id) {
                        // Extract current tab from URL search params
                        const urlParams = new URLSearchParams(window.location.search);
                        const currentTab = urlParams.get('tab');
                        
                        // Navigate to new project with the same tab (if exists)
                        if (currentTab) {
                          setLocation(`/projects/${project.id}?tab=${currentTab}`);
                        } else {
                          setLocation(`/projects/${project.id}`);
                        }
                      }
                    }
                  }}
                  data-testid={`project-option-${project.id}`}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      typeof selectedProject === 'object' && 
                      selectedProject?.id === project.id 
                        ? "opacity-100" 
                        : "opacity-0"
                    }`}
                  />
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
