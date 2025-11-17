import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Settings2, FileSpreadsheet, AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { GanttChart } from './GanttChart';
import { ProgramManagementDialog } from './ProgramManagementDialog';

interface InsightDetail {
  type: string;
  severity: "info" | "warn" | "error";
  message: string;
  ref?: Record<string, unknown>;
}

interface ScheduleInsights {
  score: number;
  summary: string;
  details: {
    openEnds: InsightDetail[];
    longDurations: InsightDetail[];
    hardConstraints: InsightDetail[];
    missingLogic: InsightDetail[];
    criticalPathAnalysis: InsightDetail[];
  };
}

interface Program {
  id: string;
  projectId: string;
  name: string;
  fileKey: string;
  fileSize: number;
  dataDate: string | null;
  isContractBaseline: boolean;
  isBaselineApproved: boolean;
  comments: string | null;
  xerData: any;
  insights: ScheduleInsights | null;
  uploadedByUserId: string;
  uploadedAt: string;
}

interface ProgramsTabProps {
  projectId: string;
}

export function ProgramsTab({ projectId }: ProgramsTabProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadIsContractBaseline, setUploadIsContractBaseline] = useState(false);
  const [uploadComments, setUploadComments] = useState('');

  // Fetch programs for this project
  const { data: programs = [], isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ['/api/projects', projectId, 'programs'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/programs`);
      if (!response.ok) throw new Error('Failed to fetch programs');
      return response.json();
    }
  });

  // Auto-select program with latest data date when programs load
  useEffect(() => {
    if (programs.length > 0 && !selectedProgramId) {
      // Programs are already sorted by dataDate descending, so select the first one
      setSelectedProgramId(programs[0].id);
    }
    // Only run when programs change, not when selectedProgramId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs]);

  // Upload program mutation
  const uploadProgramMutation = useMutation<Program, Error, FormData>({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest('POST', `/api/projects/${projectId}/programs/upload`, formData);
      return response.json();
    },
    onSuccess: (newProgram: Program) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'programs'] });
      toast({ title: 'Success', description: 'Program uploaded successfully' });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadName('');
      setUploadIsContractBaseline(false);
      setUploadComments('');
      // Auto-select the newly uploaded program
      setSelectedProgramId(newProgram.id);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadName(file.name.replace('.xer', ''));
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({ title: 'Error', description: 'Please select a file', variant: 'destructive' });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('name', uploadName);
    formData.append('isContractBaseline', uploadIsContractBaseline.toString());
    formData.append('isBaselineApproved', 'false');
    formData.append('comments', uploadComments);

    uploadProgramMutation.mutate(formData);
  };

  const selectedProgram = programs.find(p => p.id === selectedProgramId);

  return (
    <div className="space-y-4">
      {/* Header with upload and management buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Program:</Label>
          <Select value={selectedProgramId || ''} onValueChange={setSelectedProgramId}>
            <SelectTrigger className="w-[300px]" data-testid="select-program">
              <SelectValue placeholder="Select a program to view" />
            </SelectTrigger>
            <SelectContent>
              {programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.name}
                  {program.isContractBaseline && (
                    <Badge variant="default" className="ml-2">Contract Baseline</Badge>
                  )}
                  {program.isBaselineApproved && !program.isContractBaseline && (
                    <Badge variant="secondary" className="ml-2">Baseline</Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-upload-program">
                <Upload className="h-4 w-4 mr-2" />
                Upload XER
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Program (XER File)</DialogTitle>
                <DialogDescription>
                  Upload a Primavera P6 XER file to view the schedule in Gantt chart format
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="file-upload">XER File</Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".xer"
                    onChange={handleFileSelect}
                    data-testid="input-program-file"
                  />
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="program-name">Program Name</Label>
                  <Input
                    id="program-name"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="Enter program name"
                    data-testid="input-program-name"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="contract-baseline"
                    checked={uploadIsContractBaseline}
                    onChange={(e) => setUploadIsContractBaseline(e.target.checked)}
                    data-testid="checkbox-contract-baseline"
                  />
                  <Label htmlFor="contract-baseline">Set as Contract Baseline</Label>
                </div>

                <div>
                  <Label htmlFor="upload-comments">Comments</Label>
                  <Textarea
                    id="upload-comments"
                    value={uploadComments}
                    onChange={(e) => setUploadComments(e.target.value)}
                    placeholder="Add notes about this program"
                    data-testid="textarea-upload-comments"
                  />
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploadProgramMutation.isPending}
                  data-testid="button-upload-submit"
                >
                  {uploadProgramMutation.isPending ? 'Uploading...' : 'Upload Program'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <ProgramManagementDialog projectId={projectId} programs={programs} />
        </div>
      </div>

      {/* Gantt Chart */}
      {selectedProgram ? (
        <GanttChart program={selectedProgram} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {programs.length === 0
                ? 'No programs uploaded. Upload an XER file to get started.'
                : 'Select a program to view the Gantt chart'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
