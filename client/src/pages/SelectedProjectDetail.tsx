import { useEffect } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { FolderKanban } from "lucide-react";

export default function SelectedProjectDetail() {
  const { selectedProject } = useProject();
  const [, setLocation] = useLocation();

  // Redirect to the project detail page if a specific project is selected
  useEffect(() => {
    if (selectedProject && selectedProject !== null) {
      setLocation(`/projects/${selectedProject.id}`);
    }
  }, [selectedProject, setLocation]);

  // Show message if no project selected or "all" is selected
  return (
    <div className="flex items-center justify-center h-full">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <FolderKanban className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1>No Project Selected</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Please select a project from the dropdown in the sidebar to view its details.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
