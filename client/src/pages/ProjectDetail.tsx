import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhaseTimeline } from "@/components/PhaseTimeline";
import { ContractReviewCard } from "@/components/ContractReviewCard";
import { RFITableRow } from "@/components/RFITableRow";
import { CreateRFIDialog } from "@/components/CreateRFIDialog";
import { TeamMembersList } from "@/components/TeamMembersList";
import { AddTeamMembersDialog } from "@/components/AddTeamMembersDialog";
import { RFIDetailDialog } from "@/components/RFIDetailDialog";
import { ContractReviewTable } from "@/components/ContractReviewTable";
import { ImportContractDialog } from "@/components/ImportContractDialog";
import { AIUsageLogDialog } from "@/components/AIUsageLogDialog";
import { AILetterTab } from "@/components/AILetterTab";
import { ProgramsTab } from "@/components/ProgramsTab";
import { BOQTab } from "@/components/BOQTab";
import { ProjectSettingsCard } from "@/components/ProjectSettingsCard";
import { SubcontractTemplatesTab } from "@/components/SubcontractTemplatesTab";
import RiskRegister from "@/pages/RiskRegister";
import EDiscovery from "@/pages/eDiscovery";
import { RiskSummaryDashboard } from "@/components/RiskSummaryDashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, MapPin, User, Download, Clock, FileEdit, UserCheck, UserPlus, FileText, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, RFI } from "@shared/schema";
import { formatDate } from "@/lib/dateFormat";

export default function ProjectDetail() {
  const { terminology } = useTerminology();
  const { toast } = useToast();
  const { id: projectId } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const [addTeamMembersOpen, setAddTeamMembersOpen] = useState(false);
  const [selectedRFIId, setSelectedRFIId] = useState<string | null>(null);
  const [showOverdueRFIs, setShowOverdueRFIs] = useState(false);
  const [isFirstContractDialogOpen, setIsFirstContractDialogOpen] = useState(false);
  const [aiUsageLogOpen, setAiUsageLogOpen] = useState(false);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [sharePointConnected, setSharePointConnected] = useState<boolean>(false);

  // Fetch project data
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Fetch RFIs for this project
  const { data: projectRFIs = [], isLoading: rfisLoading } = useQuery<RFI[]>({
    queryKey: ["/api/projects", projectId, "rfis"],
    enabled: !!projectId,
  });

  // Fetch contract reviews for this project
  const { data: contractReviewData, isLoading: contractReviewLoading } = useQuery<{
    revisions: any[];
    activeRevision: any;
    rows: any[];
  }>({
    queryKey: ["/api/projects", projectId, "contract-review"],
    enabled: !!projectId,
  });

  // Fetch contract templates for the business unit
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/business-units", project?.businessUnitId, "templates"],
    enabled: !!project?.businessUnitId,
  });

  // Find the active template
  const activeTemplate = templates.find((t: any) => t.isActive);

  // Calculate project statistics from real data
  const openRFIs = projectRFIs.filter(rfi => rfi.status === "open").length;
  const overdueRFIs = projectRFIs.filter(rfi => rfi.isOverdue).length;
  const overdueRFIsList = projectRFIs.filter(rfi => rfi.isOverdue);

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

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start bg-transparent border-b rounded-none p-0 h-auto">
          <TabsTrigger value="overview" data-testid="tab-overview" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">Overview</TabsTrigger>
          <TabsTrigger value="contract" data-testid="tab-contract" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">Contract</TabsTrigger>
          <TabsTrigger value="rfis" data-testid="tab-rfis" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">RFIs</TabsTrigger>
          <TabsTrigger value="risks" data-testid="tab-risks" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">Risks</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">Team</TabsTrigger>
          <TabsTrigger value="ai-letter" data-testid="tab-ai-letter" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">AI Letter</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">Programs</TabsTrigger>
          <TabsTrigger value="procurement" data-testid="tab-procurement" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">Procurement</TabsTrigger>
          <TabsTrigger value="boq" data-testid="tab-boq" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">BOQ</TabsTrigger>
          <TabsTrigger value="ediscovery" data-testid="tab-ediscovery" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">eDiscovery</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 overflow-auto">
          <div className="space-y-2 p-2">
            <PhaseTimeline
              tenderStart={project.tenderStartDate ? formatDate(project.tenderStartDate) : ""}
              tenderEnd={project.tenderEndDate ? formatDate(project.tenderEndDate) : ""}
              deliveryStart={project.deliveryStartDate ? formatDate(project.deliveryStartDate) : ""}
              deliveryEnd={project.deliveryEndDate ? formatDate(project.deliveryEndDate) : ""}
              defectsPeriodStart={project.defectsPeriodStartDate ? formatDate(project.defectsPeriodStartDate) : ""}
              defectsPeriodEnd={project.defectsPeriodEndDate ? formatDate(project.defectsPeriodEndDate) : ""}
              closedStart={project.closedStartDate ? formatDate(project.closedStartDate) : ""}
              closedEnd={project.closedEndDate ? formatDate(project.closedEndDate) : ""}
              currentPhase={project.phase as "Tender" | "Delivery" | "Defects Period" | "Closed"}
              tenderLabel={terminology.tender}
              deliveryLabel={terminology.delivery}
              defectsPeriodLabel={terminology.defectsPeriod}
              closedLabel={terminology.closed}
            />

            <RiskSummaryDashboard projectId={projectId!} />
          </div>
        </TabsContent>

        <TabsContent value="contract" className="h-[calc(100vh-200px)] flex flex-col">
          {contractReviewLoading ? (
            <p className="text-muted-foreground">Loading contract reviews...</p>
          ) : contractReviewData?.revisions && contractReviewData.revisions.length > 0 ? (
            <div className="flex-1 overflow-auto">
              <ContractReviewTable
                projectId={projectId!}
                projectName={project.name}
                templateId={contractReviewData.activeRevision?.templateId || contractReviewData.revisions[0]?.templateId}
                templateVersion=""
                templateFileName=""
                businessUnitId={project.businessUnitId || undefined}
              />
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Contract Reviews Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Upload your first contract document to create a revision.
                </p>
                {activeTemplate ? (
                  <Button 
                    onClick={() => setIsFirstContractDialogOpen(true)}
                    data-testid="button-upload-first-contract"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload First Contract
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No active template found for this business unit. Please upload a template first.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rfis" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Project RFIs</h2>
            <CreateRFIDialog />
          </div>
          {rfisLoading ? (
            <p className="text-muted-foreground">Loading RFIs...</p>
          ) : projectRFIs.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-center text-muted-foreground">No RFIs yet. Create your first RFI to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="py-3 px-4 text-left text-sm font-medium">Number</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Title</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">To</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Status</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Required Date</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Days Open</th>
                      <th className="py-3 px-4 text-left text-sm font-medium">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectRFIs.map((rfi) => {
                      const createdDate = new Date(rfi.createdAt);
                      const now = new Date();
                      const daysOpen = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                      const lastActivity = formatDate(rfi.updatedAt);
                      
                      const statusMap: Record<string, "Open" | "Awaiting Info" | "Responded" | "Closed"> = {
                        "open": "Open",
                        "answered": "Responded",
                        "closed": "Closed"
                      };
                      
                      return (
                        <RFITableRow 
                          key={rfi.id}
                          id={rfi.id}
                          number={rfi.rfiNumber}
                          title={rfi.title}
                          to={rfi.assignedTo || "N/A"}
                          status={statusMap[rfi.status] || "Open"}
                          requiredDate={rfi.dueDate ? formatDate(rfi.dueDate) : "N/A"}
                          daysOpen={daysOpen}
                          isOverdue={rfi.isOverdue}
                          lastActivity={lastActivity}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="risks" className="space-y-6">
          <RiskRegister />
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Project Team</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage team members and their roles on this project
              </p>
            </div>
            <Button onClick={() => setAddTeamMembersOpen(true)} data-testid="button-add-team-members">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Team Members
            </Button>
          </div>
          <TeamMembersList projectId={projectId || ""} />
        </TabsContent>

        <TabsContent value="ai-letter">
          <AILetterTab projectId={projectId || ""} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <ProgramsTab projectId={projectId || ""} />
        </TabsContent>

        <TabsContent value="procurement" className="space-y-6">
          <Tabs defaultValue="packages" className="space-y-4">
            <TabsList data-testid="tabs-procurement" className="w-full justify-start bg-transparent border-b rounded-none p-0 h-auto">
              <TabsTrigger value="packages" data-testid="tab-packages" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">
                Packages
              </TabsTrigger>
              <TabsTrigger value="subcontracts" data-testid="tab-subcontracts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none">
                Subcontract Templates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="packages" className="space-y-4 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Packages</CardTitle>
                  <CardDescription>
                    Manage procurement packages and work breakdown
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Packages</h3>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      The packages module is coming soon. You'll be able to create and manage 
                      procurement packages and work breakdown structures.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subcontracts" className="space-y-4 mt-0">
              <SubcontractTemplatesTab projectId={projectId || ""} project={project} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="boq" className="h-full overflow-hidden data-[state=inactive]:hidden">
          <BOQTab />
        </TabsContent>

        <TabsContent value="ediscovery" className="h-full overflow-hidden data-[state=inactive]:hidden">
          <EDiscovery />
        </TabsContent>

        <TabsContent value="settings" className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 p-2">
            {/* Project Details */}
            <ProjectSettingsCard project={project} />

            {/* System Logs & Activity */}
            <Card>
            <CardHeader>
              <CardTitle>System Logs & Activity</CardTitle>
              <p className="text-sm text-muted-foreground">
                Access detailed activity logs and AI usage tracking
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div>
                  <h4 className="font-medium">Activity Log</h4>
                  <p className="text-sm text-muted-foreground">
                    Complete audit trail of all actions performed on this project
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => setActivityLogOpen(true)}
                  data-testid="button-open-activity-log"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Log
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div>
                  <h4 className="font-medium">AI Usage Log</h4>
                  <p className="text-sm text-muted-foreground">
                    Track AI token usage and costs for contract analysis
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => setAiUsageLogOpen(true)}
                  data-testid="button-open-ai-usage-log"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  View Log
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Model Settings */}
          <Card>
            <CardHeader>
              <CardTitle>AI Model Settings</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure which AI models to use for different features
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contract-review-model">Contract Review Model</Label>
                <Select defaultValue="gpt-4o">
                  <SelectTrigger id="contract-review-model" data-testid="select-contract-review-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o (Standard - Best quality)</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster, cheaper)</SelectItem>
                    <SelectItem value="o1">O1 (Reasoning/Thinking model)</SelectItem>
                    <SelectItem value="o1-mini">O1 Mini (Cheaper reasoning)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Model used for contract analysis and AI summaries
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-letter-model">AI Letter Model</Label>
                <Select defaultValue="gpt-4o">
                  <SelectTrigger id="ai-letter-model" data-testid="select-ai-letter-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o (Standard - Best quality)</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster, cheaper)</SelectItem>
                    <SelectItem value="o1">O1 (Reasoning/Thinking model)</SelectItem>
                    <SelectItem value="o1-mini">O1 Mini (Cheaper reasoning)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Model used for letter drafting and document indexing
                </p>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button data-testid="button-save-ai-model-settings">
                  Save AI Model Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Correspondence Settings */}
          <SharePointSettingsCard projectId={projectId} />

          {/* Contract Documentation */}
          <ContractDocumentationCard projectId={projectId} project={project} sharePointConnected={sharePointConnected} />

          {/* RFI Settings */}
          <Card>
            <CardHeader>
              <CardTitle>{terminology.rfi} Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-rfi-numbering">{terminology.rfi} Numbering Format</Label>
                <Input 
                  id="project-rfi-numbering" 
                  defaultValue="{PROJECT_ID}-RFI-{NUMBER}" 
                  data-testid="input-project-rfi-numbering"
                />
                <p className="text-xs text-muted-foreground">
                  Available variables: {"{PROJECT_ID}"}, {"{NUMBER}"}, {"{YEAR}"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-sla-threshold">Default SLA (Days)</Label>
                <Input 
                  id="project-sla-threshold" 
                  type="number" 
                  defaultValue="7" 
                  data-testid="input-project-sla-threshold"
                />
                <p className="text-xs text-muted-foreground">
                  Default number of days for {terminology.rfi} response
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-rfi-start">{terminology.rfi} Starting Number</Label>
                <Input 
                  id="project-rfi-start" 
                  type="number" 
                  defaultValue="1" 
                  data-testid="input-project-rfi-start"
                />
                <p className="text-xs text-muted-foreground">
                  Next {terminology.rfi} number will start from this value
                </p>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button data-testid="button-save-project-rfi-settings">
                  Save {terminology.rfi} Settings
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>
      </Tabs>

      <AddTeamMembersDialog
        open={addTeamMembersOpen}
        onOpenChange={setAddTeamMembersOpen}
        projectId={projectId || ""}
        projectName="Sydney Metro Expansion"
      />
      
      {/* RFI Detail Dialog */}
      {selectedRFIId && (
        <RFIDetailDialog
          rfiId={selectedRFIId}
          open={!!selectedRFIId}
          onOpenChange={(open) => !open && setSelectedRFIId(null)}
        />
      )}
      
      {/* Overdue RFIs Dialog */}
      {showOverdueRFIs && overdueRFIsList.length > 0 && (
        <Dialog open={showOverdueRFIs} onOpenChange={setShowOverdueRFIs}>
          <DialogContent className="max-w-3xl" data-testid="dialog-overdue-rfis">
            <DialogHeader>
              <DialogTitle>Overdue RFIs ({overdueRFIsList.length})</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {overdueRFIsList.map((rfi) => (
                <button
                  key={rfi.id}
                  onClick={() => {
                    setShowOverdueRFIs(false);
                    setSelectedRFIId(rfi.id);
                  }}
                  className="flex items-center gap-3 text-sm w-full text-left hover-elevate active-elevate-2 rounded-md p-3 border"
                  data-testid={`button-overdue-rfi-${rfi.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium">{rfi.rfiNumber}: {rfi.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Due: {rfi.dueDate ? formatDate(rfi.dueDate) : "No due date"}
                    </p>
                  </div>
                  <Badge variant="destructive">Overdue</Badge>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Import First Contract Dialog */}
      {activeTemplate && (
        <ImportContractDialog
          open={isFirstContractDialogOpen}
          onOpenChange={setIsFirstContractDialogOpen}
          projectId={projectId || ""}
          templateId={activeTemplate.id}
          onSuccess={() => {
            queryClient.invalidateQueries({ 
              queryKey: ["/api/projects", projectId, "contract-review"] 
            });
            queryClient.invalidateQueries({ 
              queryKey: ["/api/projects", projectId, "contract-review", "revisions"] 
            });
          }}
        />
      )}

      {/* AI Usage Log Dialog */}
      <AIUsageLogDialog
        open={aiUsageLogOpen}
        onOpenChange={setAiUsageLogOpen}
        projectId={projectId || ""}
      />

      {/* Activity Log Dialog */}
      <Dialog open={activityLogOpen} onOpenChange={setActivityLogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh]" data-testid="dialog-activity-log">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Activity Log</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete audit trail of all actions performed on this project
                </p>
              </div>
              <Button variant="outline" size="sm" data-testid="button-export-activity-log">
                <Download className="h-4 w-4 mr-2" />
                Export Log
              </Button>
            </div>
          </DialogHeader>
          <div className="mt-4">
            <Card>
              <CardContent className="p-6">
                <p className="text-center text-muted-foreground">Activity logging coming soon</p>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// SharePoint Settings Card Component
function SharePointSettingsCard({ projectId }: { projectId: string | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; error?: string } | null>(null);
  const [testResult, setTestResult] = useState<{ accessible: boolean; error?: string; siteId?: string; driveId?: string } | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showUrlHelper, setShowUrlHelper] = useState(false);
  const [helperUrl, setHelperUrl] = useState("");

  // Fetch SharePoint settings for this project
  const { data: settings, isLoading: settingsLoading } = useQuery<any>({
    queryKey: ['/api/projects', projectId, 'sharepoint-settings'],
    enabled: !!projectId,
  });

  // Check SharePoint connection status on mount
  useEffect(() => {
    async function checkConnection() {
      try {
        const response = await fetch('/api/sharepoint/connection-status');
        const data = await response.json();
        setConnectionStatus(data);
      } catch (error) {
        console.error('Error checking connection:', error);
        setConnectionStatus({ connected: false, error: 'Failed to check connection status' });
      }
    }
    checkConnection();
  }, []);

  // Load settings when available
  useEffect(() => {
    if (settings) {
      setSiteUrl(settings.sharePointSiteUrl || '');
      setFolderPath(settings.correspondenceFolderPath || '');
    }
  }, [settings]);

  // Parse SharePoint URL to extract site and folder path
  const parseSharePointUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      
      // Extract site URL (everything up to and including /sites/[sitename])
      const pathParts = urlObj.pathname.split('/');
      const sitesIndex = pathParts.findIndex(part => part === 'sites');
      
      if (sitesIndex !== -1 && pathParts[sitesIndex + 1]) {
        const siteUrlParsed = `${urlObj.protocol}//${urlObj.host}/sites/${pathParts[sitesIndex + 1]}`;
        
        // Extract folder path from URL
        let folderPathParsed = '';
        
        // Check if there's an 'id' parameter (SharePoint list view URL)
        const idParam = urlObj.searchParams.get('id');
        if (idParam) {
          // URL decode the id parameter
          const decodedId = decodeURIComponent(idParam);
          // Remove the site path prefix from the folder path
          const sitePathPrefix = `/sites/${pathParts[sitesIndex + 1]}`;
          if (decodedId.startsWith(sitePathPrefix)) {
            folderPathParsed = decodedId.substring(sitePathPrefix.length);
          } else {
            folderPathParsed = decodedId;
          }
        } else {
          // Try to extract from the URL path itself
          const remainingPath = pathParts.slice(sitesIndex + 2).join('/');
          if (remainingPath && !remainingPath.includes('Forms/') && !remainingPath.includes('AllItems.aspx')) {
            folderPathParsed = '/' + remainingPath;
          }
        }
        
        return { siteUrl: siteUrlParsed, folderPath: folderPathParsed };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  };

  const handleParseUrl = () => {
    const parsed = parseSharePointUrl(helperUrl);
    if (parsed) {
      setSiteUrl(parsed.siteUrl);
      setFolderPath(parsed.folderPath);
      setHelperUrl('');
      setShowUrlHelper(false);
      toast({
        title: "URL parsed successfully",
        description: "Site URL and folder path have been extracted",
      });
    } else {
      toast({
        title: "Invalid SharePoint URL",
        description: "Could not parse the SharePoint URL. Please check the format.",
        variant: "destructive",
      });
    }
  };

  const handleTestConnection = async () => {
    if (!siteUrl || !folderPath) {
      toast({
        title: "Missing fields",
        description: "Please enter both Site URL and Folder Path",
        variant: "destructive",
      });
      return;
    }

    // Validate that folder path is not a full URL
    if (folderPath.includes('://') || folderPath.includes('.sharepoint.com')) {
      toast({
        title: "Invalid folder path",
        description: "Folder path should be a path only (e.g., /Shared Documents/Letters), not a full URL",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/sharepoint/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, folderPath }),
      });

      const data = await response.json();
      setTestResult(data);

      if (data.accessible) {
        toast({
          title: "Connection successful",
          description: "SharePoint folder is accessible",
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.error || "Could not access SharePoint folder",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast({
        title: "Test failed",
        description: "Failed to test connection",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!projectId || !siteUrl || !folderPath) {
      toast({
        title: "Missing fields",
        description: "Please enter both Site URL and Folder Path",
        variant: "destructive",
      });
      return;
    }

    // Validate that folder path is not a full URL
    if (folderPath.includes('://') || folderPath.includes('.sharepoint.com')) {
      toast({
        title: "Invalid folder path",
        description: "Folder path should be a path only (e.g., /Shared Documents/Letters), not a full URL",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/sharepoint-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sharePointSiteUrl: siteUrl,
          correspondenceFolderPath: folderPath,
          siteId: testResult?.siteId,
          driveId: testResult?.driveId,
        }),
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'sharepoint-settings'] });
        toast({
          title: "Settings saved",
          description: "SharePoint settings have been updated successfully",
        });
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Save failed",
        description: "Failed to save SharePoint settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (settingsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Correspondence Settings</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Correspondence Settings</CardTitle>
        <CardDescription>
          Configure SharePoint integration for AI-powered letter search
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
          {connectionStatus?.connected ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm">SharePoint Connected</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm">SharePoint Not Connected</span>
            </>
          )}
        </div>

        {!connectionStatus?.connected && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            Please connect SharePoint OAuth integration first. {connectionStatus?.error}
          </div>
        )}

        {/* URL Helper - Always available */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUrlHelper(!showUrlHelper)}
            className="w-full"
            data-testid="button-toggle-url-helper"
          >
            {showUrlHelper ? "Hide" : "Show"} URL Helper
          </Button>
          
          {showUrlHelper && (
            <div className="p-4 rounded-md border space-y-3 bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Paste your SharePoint folder URL here, and we'll automatically extract the Site URL and Folder Path for you.
              </p>
              <Input
                placeholder="Paste full SharePoint URL here..."
                value={helperUrl}
                onChange={(e) => setHelperUrl(e.target.value)}
                data-testid="input-url-helper"
              />
              <Button
                size="sm"
                onClick={handleParseUrl}
                disabled={!helperUrl}
                data-testid="button-parse-url"
              >
                Extract Site & Folder Path
              </Button>
            </div>
          )}
        </div>

        {/* Site URL */}
        <div className="space-y-2">
          <Label htmlFor="sharepoint-site-url">SharePoint Site URL</Label>
          <Input 
            id="sharepoint-site-url" 
            placeholder="https://yourcompany.sharepoint.com/sites/YourSite"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            disabled={!connectionStatus?.connected}
            data-testid="input-sharepoint-site-url"
          />
          <p className="text-xs text-muted-foreground">
            Full URL to your SharePoint site
          </p>
        </div>

        {/* Folder Path */}
        <div className="space-y-2">
          <Label htmlFor="sharepoint-folder-path">Correspondence Folder Path</Label>
          <Input 
            id="sharepoint-folder-path" 
            placeholder="/Shared Documents/Correspondence"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            disabled={!connectionStatus?.connected}
            data-testid="input-sharepoint-folder-path"
          />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Enter the folder path only (not the full URL)</p>
            <p className="font-mono">Examples: /Shared Documents/Letters or /Documents/Correspondence</p>
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`p-3 rounded-md ${testResult.accessible ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
            {testResult.accessible ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">Folder is accessible and ready to use</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">{testResult.error}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button 
            variant="outline"
            onClick={handleTestConnection}
            disabled={!connectionStatus?.connected || isTesting || !siteUrl || !folderPath}
            data-testid="button-test-sharepoint-connection"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
          <Button 
            onClick={handleSaveSettings}
            disabled={!connectionStatus?.connected || isSaving || !siteUrl || !folderPath}
            data-testid="button-save-sharepoint-settings"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Contract Documentation Card Component
function ContractDocumentationCard({ projectId, project, sharePointConnected }: { projectId: string | undefined; project: Project; sharePointConnected: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [contractDocPath, setContractDocPath] = useState(project.contractDocumentPath || "");
  const [contractSpecPath, setContractSpecPath] = useState(project.contractSpecificationPath || "");
  const [pstFolderPath, setPstFolderPath] = useState(project.pstFolderPath || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingDocPath, setIsTestingDocPath] = useState(false);
  const [isTestingSpecPath, setIsTestingSpecPath] = useState(false);
  const [isTestingPstPath, setIsTestingPstPath] = useState(false);
  const [docPathTestResult, setDocPathTestResult] = useState<{ accessible: boolean; error?: string } | null>(null);
  const [specPathTestResult, setSpecPathTestResult] = useState<{ accessible: boolean; error?: string } | null>(null);
  const [pstPathTestResult, setPstPathTestResult] = useState<{ accessible: boolean; error?: string } | null>(null);

  // Fetch SharePoint settings for this project to get site URL
  const { data: settings } = useQuery<any>({
    queryKey: ['/api/projects', projectId, 'sharepoint-settings'],
    enabled: !!projectId,
  });

  // Update state when project data changes
  useEffect(() => {
    setContractDocPath(project.contractDocumentPath || "");
    setContractSpecPath(project.contractSpecificationPath || "");
    setPstFolderPath(project.pstFolderPath || "");
  }, [project]);

  const handleSave = async () => {
    if (!projectId) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractDocumentPath: contractDocPath,
          contractSpecificationPath: contractSpecPath,
          pstFolderPath: pstFolderPath,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save contract documentation paths');
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      
      toast({
        title: "Success",
        description: "Contract documentation paths saved successfully",
      });
    } catch (error) {
      console.error('Error saving contract documentation paths:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save contract documentation paths",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestDocPath = async () => {
    if (!settings?.sharePointSiteUrl) {
      toast({
        title: "SharePoint not configured",
        description: "Please configure SharePoint site URL in AI Correspondence Settings first",
        variant: "destructive",
      });
      return;
    }

    if (!contractDocPath) {
      toast({
        title: "Path required",
        description: "Please enter a contract document path to test",
        variant: "destructive",
      });
      return;
    }

    setIsTestingDocPath(true);
    setDocPathTestResult(null);

    try {
      const response = await fetch('/api/sharepoint/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteUrl: settings.sharePointSiteUrl, 
          folderPath: contractDocPath 
        }),
      });

      const data = await response.json();
      setDocPathTestResult(data);

      if (data.accessible) {
        toast({
          title: "Path accessible",
          description: "Contract document path is valid and accessible",
        });
      } else {
        toast({
          title: "Path not accessible",
          description: data.error || "Could not access the contract document path",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error testing contract document path:', error);
      toast({
        title: "Test failed",
        description: "Failed to test contract document path",
        variant: "destructive",
      });
    } finally {
      setIsTestingDocPath(false);
    }
  };

  const handleTestSpecPath = async () => {
    if (!settings?.sharePointSiteUrl) {
      toast({
        title: "SharePoint not configured",
        description: "Please configure SharePoint site URL in AI Correspondence Settings first",
        variant: "destructive",
      });
      return;
    }

    if (!contractSpecPath) {
      toast({
        title: "Path required",
        description: "Please enter a specification path to test",
        variant: "destructive",
      });
      return;
    }

    setIsTestingSpecPath(true);
    setSpecPathTestResult(null);

    try {
      const response = await fetch('/api/sharepoint/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteUrl: settings.sharePointSiteUrl, 
          folderPath: contractSpecPath 
        }),
      });

      const data = await response.json();
      setSpecPathTestResult(data);

      if (data.accessible) {
        toast({
          title: "Path accessible",
          description: "Specification path is valid and accessible",
        });
      } else {
        toast({
          title: "Path not accessible",
          description: data.error || "Could not access the specification path",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error testing specification path:', error);
      toast({
        title: "Test failed",
        description: "Failed to test specification path",
        variant: "destructive",
      });
    } finally {
      setIsTestingSpecPath(false);
    }
  };

  const handleTestPstPath = async () => {
    if (!settings?.sharePointSiteUrl) {
      toast({
        title: "SharePoint not configured",
        description: "Please configure SharePoint site URL in AI Correspondence Settings first",
        variant: "destructive",
      });
      return;
    }

    if (!pstFolderPath) {
      toast({
        title: "Path required",
        description: "Please enter a PST folder path to test",
        variant: "destructive",
      });
      return;
    }

    setIsTestingPstPath(true);
    setPstPathTestResult(null);

    try {
      const response = await fetch('/api/sharepoint/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteUrl: settings.sharePointSiteUrl, 
          folderPath: pstFolderPath 
        }),
      });

      const data = await response.json();
      setPstPathTestResult(data);

      if (data.accessible) {
        toast({
          title: "Path accessible",
          description: "PST folder path is valid and accessible",
        });
      } else {
        toast({
          title: "Path not accessible",
          description: data.error || "Could not access the PST folder path",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error testing PST folder path:', error);
      toast({
        title: "Test failed",
        description: "Failed to test PST folder path",
        variant: "destructive",
      });
    } finally {
      setIsTestingPstPath(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contract Documentation</CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure SharePoint paths for contract documents and specifications used by AI features
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
          {sharePointConnected ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm">SharePoint Connected</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm">SharePoint Not Connected</span>
            </>
          )}
        </div>

        {!sharePointConnected && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            Please connect SharePoint OAuth integration first in Settings.
          </div>
        )}

        {!settings?.sharePointSiteUrl && sharePointConnected && (
          <div className="p-3 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-500 text-sm">
            Please configure SharePoint Site URL in AI Correspondence Settings above before testing paths.
          </div>
        )}

        {/* Final Contract & Schedules Path */}
        <div className="space-y-2">
          <Label htmlFor="contract-document-path">Final Contract & Schedules Path</Label>
          <div className="flex gap-2">
            <Input 
              id="contract-document-path" 
              placeholder="/Shared Documents/Contracts/Final Contract.pdf"
              value={contractDocPath}
              onChange={(e) => {
                setContractDocPath(e.target.value);
                setDocPathTestResult(null); // Clear test result on change
              }}
              data-testid="input-contract-document-path"
              className="flex-1"
            />
            <Button 
              variant="outline"
              onClick={handleTestDocPath}
              disabled={!sharePointConnected || !settings?.sharePointSiteUrl || !contractDocPath || isTestingDocPath}
              data-testid="button-test-contract-document-path"
            >
              {isTestingDocPath ? "Testing..." : "Test"}
            </Button>
          </div>
          {docPathTestResult && (
            <div className={`flex items-center gap-2 text-sm p-2 rounded ${docPathTestResult.accessible ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
              {docPathTestResult.accessible ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Path accessible</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <span>{docPathTestResult.error || "Path not accessible"}</span>
                </>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>SharePoint path to the final executed contract and schedules document</p>
            <p className="font-mono">Example: /Shared Documents/Contracts/Final Contract.pdf</p>
          </div>
        </div>

        {/* Contract Specification Path */}
        <div className="space-y-2">
          <Label htmlFor="contract-specification-path">Contract Specification Path</Label>
          <div className="flex gap-2">
            <Input 
              id="contract-specification-path" 
              placeholder="/Shared Documents/Specifications"
              value={contractSpecPath}
              onChange={(e) => {
                setContractSpecPath(e.target.value);
                setSpecPathTestResult(null); // Clear test result on change
              }}
              data-testid="input-contract-specification-path"
              className="flex-1"
            />
            <Button 
              variant="outline"
              onClick={handleTestSpecPath}
              disabled={!sharePointConnected || !settings?.sharePointSiteUrl || !contractSpecPath || isTestingSpecPath}
              data-testid="button-test-specification-path"
            >
              {isTestingSpecPath ? "Testing..." : "Test"}
            </Button>
          </div>
          {specPathTestResult && (
            <div className={`flex items-center gap-2 text-sm p-2 rounded ${specPathTestResult.accessible ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
              {specPathTestResult.accessible ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Path accessible</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <span>{specPathTestResult.error || "Path not accessible"}</span>
                </>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>SharePoint path to the contract specifications folder or document</p>
            <p className="font-mono">Example: /Shared Documents/Specifications</p>
          </div>
        </div>

        {/* PST Folder Path */}
        <div className="space-y-2">
          <Label htmlFor="pst-folder-path">PST Files Folder Path (eDiscovery)</Label>
          <div className="flex gap-2">
            <Input 
              id="pst-folder-path" 
              placeholder="/Shared Documents/Legal/eDiscovery"
              value={pstFolderPath}
              onChange={(e) => {
                setPstFolderPath(e.target.value);
                setPstPathTestResult(null); // Clear test result on change
              }}
              data-testid="input-pst-folder-path"
              className="flex-1"
            />
            <Button 
              variant="outline"
              onClick={handleTestPstPath}
              disabled={!sharePointConnected || !settings?.sharePointSiteUrl || !pstFolderPath || isTestingPstPath}
              data-testid="button-test-pst-folder-path"
            >
              {isTestingPstPath ? "Testing..." : "Test"}
            </Button>
          </div>
          {pstPathTestResult && (
            <div className={`flex items-center gap-2 text-sm p-2 rounded ${pstPathTestResult.accessible ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
              {pstPathTestResult.accessible ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Path accessible</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <span>{pstPathTestResult.error || "Path not accessible"}</span>
                </>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>SharePoint path to the folder containing PST email archive files</p>
            <p className="font-mono">Example: /Shared Documents/Legal/eDiscovery</p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button 
            onClick={handleSave}
            disabled={isSaving}
            data-testid="button-save-contract-documentation"
          >
            {isSaving ? "Saving..." : "Save Paths"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
