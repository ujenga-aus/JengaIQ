import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCompany } from './CompanyContext';
import { useBusinessUnit } from './BusinessUnitContext';
import type { Project } from '@shared/schema';

interface ProjectContextType {
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  projects: Project[];
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const STORAGE_KEY = 'selectedProjectId';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProjectState] = useState<Project | null>(null);
  const { selectedCompany } = useCompany();
  const { selectedBusinessUnit } = useBusinessUnit();
  const prevCompanyIdRef = useRef<string | undefined>();

  // Fetch all projects for the selected company (BU filtering happens client-side)
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects', selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      
      const response = await fetch(`/api/projects?companyId=${selectedCompany.id}`);
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    },
    enabled: !!selectedCompany,
  });

  // Initialize from localStorage with validation
  useEffect(() => {
    if (isLoading || !selectedCompany) return;

    const storedId = localStorage.getItem(STORAGE_KEY);
    
    if (storedId) {
      // Validate stored ID exists and belongs to current BU filter
      const matchedProject = projects.find(p => p.id === storedId);
      
      if (matchedProject) {
        // Check if project is valid for current business unit filter
        const isValidForBU = !selectedBusinessUnit || 
          selectedBusinessUnit === "all" || 
          (typeof selectedBusinessUnit === 'object' && matchedProject.businessUnitId === selectedBusinessUnit.id);
        
        if (isValidForBU) {
          setSelectedProjectState(matchedProject);
          return;
        }
      }
      
      // Invalid stored ID or doesn't match BU filter - clear it
      localStorage.removeItem(STORAGE_KEY);
      setSelectedProjectState(null);
    }
  }, [projects, isLoading, selectedCompany, selectedBusinessUnit]);

  // Clear selection when company changes (not on initial mount)
  useEffect(() => {
    const currentCompanyId = selectedCompany?.id;
    
    // Only clear if company ID actually changed (not on initial mount)
    if (prevCompanyIdRef.current !== undefined && prevCompanyIdRef.current !== currentCompanyId) {
      localStorage.removeItem(STORAGE_KEY);
      setSelectedProjectState(null);
    }
    
    // Update ref for next comparison
    prevCompanyIdRef.current = currentCompanyId;
  }, [selectedCompany?.id]);

  // Clear selection when business unit changes and project doesn't belong to new BU
  useEffect(() => {
    if (selectedProject && typeof selectedProject === 'object') {
      const isProjectInCurrentBU = !selectedBusinessUnit || 
        selectedBusinessUnit === "all" || 
        (typeof selectedBusinessUnit === 'object' && selectedProject.businessUnitId === selectedBusinessUnit.id);
      
      if (!isProjectInCurrentBU) {
        localStorage.removeItem(STORAGE_KEY);
        setSelectedProjectState(null);
      }
    }
  }, [selectedBusinessUnit, selectedProject]);

  // Setter with localStorage persistence
  const setSelectedProject = useCallback((project: Project | null) => {
    setSelectedProjectState(project);
    
    if (project) {
      localStorage.setItem(STORAGE_KEY, project.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <ProjectContext.Provider value={{ 
      selectedProject, 
      setSelectedProject,
      projects,
      isLoading
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
