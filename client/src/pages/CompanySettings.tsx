import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Upload, Copy, Palette, Plus, GripVertical, Pencil, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useResourceTypesWebSocket } from "@/hooks/useResourceTypesWebSocket";
import type { ResourceType } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useThemeSettings } from "@/contexts/ThemeSettingsContext";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Company } from "@shared/schema";

export default function CompanySettings({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const { terminology, updateTerminology } = useTerminology();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [copyColorsDialogOpen, setCopyColorsDialogOpen] = useState(false);
  const [lingoForm, setLingoForm] = useState({
    businessUnit: terminology.businessUnit,
    rfi: terminology.rfi,
    tender: terminology.tender,
    delivery: terminology.delivery,
    defectsPeriod: terminology.defectsPeriod,
    closed: terminology.closed,
  });
  const [themeColors, setThemeColors] = useState({
    tableHeaderBg: '#f1f5f9',
    tableHeaderFg: '#0f172a',
    lockedColumnBg: '#fef3c7',
    lockedColumnFg: '#78350f',
    formBg: '#ffffff',
    formBorder: '#e2e8f0',
    formAccent: '#3b82f6',
  });
  const [aiSettings, setAiSettings] = useState({
    aiExpertPersona: '',
    aiJurisdiction: '',
    aiIndustryFocus: '',
    aiRiskTolerance: 'moderate',
    aiContractReviewModel: 'gpt-4o',
    aiLetterModel: 'gpt-4o',
  });

  // Load theme colors and AI settings from selected company
  useEffect(() => {
    if (selectedCompany) {
      setThemeColors({
        tableHeaderBg: selectedCompany.tableHeaderBg || '#f1f5f9',
        tableHeaderFg: selectedCompany.tableHeaderFg || '#0f172a',
        lockedColumnBg: selectedCompany.lockedColumnBg || '#fef3c7',
        lockedColumnFg: selectedCompany.lockedColumnFg || '#78350f',
        formBg: selectedCompany.formBg || '#ffffff',
        formBorder: selectedCompany.formBorder || '#e2e8f0',
        formAccent: selectedCompany.formAccent || '#3b82f6',
      });
      setAiSettings({
        aiExpertPersona: selectedCompany.aiExpertPersona || '',
        aiJurisdiction: selectedCompany.aiJurisdiction || '',
        aiIndustryFocus: selectedCompany.aiIndustryFocus || '',
        aiRiskTolerance: selectedCompany.aiRiskTolerance || 'moderate',
        aiContractReviewModel: selectedCompany.aiContractReviewModel || 'gpt-4o',
        aiLetterModel: selectedCompany.aiLetterModel || 'gpt-4o',
      });
    }
  }, [selectedCompany]);

  // Fetch all companies for copy functionality
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
  });

  // Mutation to save theme colors
  const saveColorsMutation = useMutation({
    mutationFn: async (colors: typeof themeColors) => {
      if (!selectedCompany) throw new Error('No company selected');
      return await apiRequest('PATCH', `/api/companies/${selectedCompany.id}`, colors);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
      toast({
        title: "Theme colors saved",
        description: "Your color preferences have been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving colors",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to save AI settings
  const saveAISettingsMutation = useMutation({
    mutationFn: async (settings: typeof aiSettings) => {
      if (!selectedCompany) throw new Error('No company selected');
      return await apiRequest('PATCH', `/api/companies/${selectedCompany.id}`, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
      toast({
        title: "AI settings saved",
        description: "Your AI configuration has been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving AI settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveTerminology = () => {
    updateTerminology(lingoForm);
    toast({
      title: "Terminology saved",
      description: "Your custom terminology has been updated throughout the app",
    });
  };

  const handleSaveThemeColors = () => {
    saveColorsMutation.mutate(themeColors);
  };

  const handleSaveAISettings = () => {
    saveAISettingsMutation.mutate(aiSettings);
  };

  const handleCopyColorsFrom = (company: Company) => {
    if (company.tableHeaderBg) {
      setThemeColors({
        tableHeaderBg: company.tableHeaderBg || '#f1f5f9',
        tableHeaderFg: company.tableHeaderFg || '#0f172a',
        lockedColumnBg: company.lockedColumnBg || '#fef3c7',
        lockedColumnFg: company.lockedColumnFg || '#78350f',
        formBg: company.formBg || '#ffffff',
        formBorder: company.formBorder || '#e2e8f0',
        formAccent: company.formAccent || '#3b82f6',
      });
      setCopyColorsDialogOpen(false);
      toast({
        title: "Colors copied",
        description: `Theme colors copied from ${company.name}. Click "Save Theme Colors" to apply.`,
      });
    }
  };
  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div>
          <h1>Company Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your company information and preferences</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Company Terminology (Lingo)</CardTitle>
          </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Customize the terminology used throughout the application to match your company's language
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lingo-business-unit">Business Unit (Plural)</Label>
              <Input 
                id="lingo-business-unit" 
                value={lingoForm.businessUnit}
                onChange={(e) => setLingoForm(prev => ({ ...prev, businessUnit: e.target.value }))}
                placeholder="e.g., Divisions, Departments, Branches"
                data-testid="input-lingo-business-unit" 
              />
              <p className="text-xs text-muted-foreground">Enter the plural form (e.g., "Business Units", "Divisions")</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lingo-rfi">RFI (Plural)</Label>
              <Input 
                id="lingo-rfi" 
                value={lingoForm.rfi}
                onChange={(e) => setLingoForm(prev => ({ ...prev, rfi: e.target.value }))}
                placeholder="e.g., RFIs, Requests, Queries"
                data-testid="input-lingo-rfi" 
              />
              <p className="text-xs text-muted-foreground">Enter the plural form (e.g., "RFIs", "Requests")</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lingo-tender">Tender</Label>
              <Input 
                id="lingo-tender" 
                value={lingoForm.tender}
                onChange={(e) => setLingoForm(prev => ({ ...prev, tender: e.target.value }))}
                placeholder="e.g., Tender, Bid, Proposal"
                data-testid="input-lingo-tender" 
              />
              <p className="text-xs text-muted-foreground">Pre-construction phase name</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lingo-delivery">Delivery</Label>
              <Input 
                id="lingo-delivery" 
                value={lingoForm.delivery}
                onChange={(e) => setLingoForm(prev => ({ ...prev, delivery: e.target.value }))}
                placeholder="e.g., Delivery, Construction, Execution"
                data-testid="input-lingo-delivery" 
              />
              <p className="text-xs text-muted-foreground">Main construction phase name</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lingo-defects-period">Defects Period</Label>
              <Input 
                id="lingo-defects-period" 
                value={lingoForm.defectsPeriod}
                onChange={(e) => setLingoForm(prev => ({ ...prev, defectsPeriod: e.target.value }))}
                placeholder="e.g., Defects Period, Warranty, Handover"
                data-testid="input-lingo-defects-period" 
              />
              <p className="text-xs text-muted-foreground">Post-completion defects phase name</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lingo-closed">Liability Period</Label>
              <Input 
                id="lingo-closed" 
                value={lingoForm.closed}
                onChange={(e) => setLingoForm(prev => ({ ...prev, closed: e.target.value }))}
                placeholder="e.g., Liability Period, Liability Dates, Final Liability"
                data-testid="input-lingo-closed" 
              />
              <p className="text-xs text-muted-foreground">Final liability phase name</p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSaveTerminology} data-testid="button-save-lingo">
              Save Terminology
            </Button>
          </div>
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-6">
            <div className="space-y-2">
              <Label>Company Logo</Label>
              <div className="h-24 w-24 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-12 w-12 text-primary" />
              </div>
              <Button variant="outline" size="sm" data-testid="button-upload-logo">
                <Upload className="h-4 w-4 mr-2" />
                Upload Logo
              </Button>
            </div>

            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company Name</Label>
                <Input id="company-name" defaultValue="Construction Co." data-testid="input-company-name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-abn">ABN (Optional)</Label>
                <Input id="company-abn" placeholder="e.g., 12 345 678 901" data-testid="input-company-abn" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="primary-contact">Primary Contact</Label>
            <Input id="primary-contact" placeholder="Contact person name" data-testid="input-primary-contact" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-address">Address</Label>
            <Textarea 
              id="company-address" 
              placeholder="Company address..." 
              rows={3}
              data-testid="textarea-company-address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Default Timezone</Label>
            <Select defaultValue="brisbane">
              <SelectTrigger id="timezone" data-testid="select-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brisbane">Australia/Brisbane</SelectItem>
                <SelectItem value="sydney">Australia/Sydney</SelectItem>
                <SelectItem value="melbourne">Australia/Melbourne</SelectItem>
                <SelectItem value="perth">Australia/Perth</SelectItem>
                <SelectItem value="adelaide">Australia/Adelaide</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button data-testid="button-save-company-settings">
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Contract Review Settings</CardTitle>
          </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Customize how AI analyzes your contracts. The AI will combine these settings with base quality controls for optimal results.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-contract-review-model">Contract Review AI Model</Label>
                <Select 
                  value={aiSettings.aiContractReviewModel} 
                  onValueChange={(value) => setAiSettings(prev => ({ ...prev, aiContractReviewModel: value }))}
                >
                  <SelectTrigger id="ai-contract-review-model" data-testid="select-ai-contract-review-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">OpenAI GPT-4o</SelectItem>
                    <SelectItem value="claude-sonnet-4">Anthropic Claude Sonnet 4</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  AI model for contract analysis and summaries
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-letter-model">Letter AI Model</Label>
                <Select 
                  value={aiSettings.aiLetterModel} 
                  onValueChange={(value) => setAiSettings(prev => ({ ...prev, aiLetterModel: value }))}
                >
                  <SelectTrigger id="ai-letter-model" data-testid="select-ai-letter-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">OpenAI GPT-4o</SelectItem>
                    <SelectItem value="claude-sonnet-4">Anthropic Claude Sonnet 4</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  AI model for letter drafting and analysis
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-expert-persona">Expert Persona (Optional)</Label>
              <Input 
                id="ai-expert-persona" 
                placeholder='e.g., "Infrastructure lawyer with 30 years experience in Australia"'
                value={aiSettings.aiExpertPersona}
                onChange={(e) => setAiSettings(prev => ({ ...prev, aiExpertPersona: e.target.value }))}
                data-testid="input-ai-expert-persona" 
              />
              <p className="text-xs text-muted-foreground">
                Define the expert perspective the AI should adopt when analyzing contracts
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-jurisdiction">Jurisdiction (Optional)</Label>
                <Input 
                  id="ai-jurisdiction" 
                  placeholder='e.g., "Australian law, NSW specific"'
                  value={aiSettings.aiJurisdiction}
                  onChange={(e) => setAiSettings(prev => ({ ...prev, aiJurisdiction: e.target.value }))}
                  data-testid="input-ai-jurisdiction" 
                />
                <p className="text-xs text-muted-foreground">Legal jurisdiction for analysis</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-industry-focus">Industry Focus (Optional)</Label>
                <Input 
                  id="ai-industry-focus" 
                  placeholder='e.g., "Construction, Mining, Infrastructure"'
                  value={aiSettings.aiIndustryFocus}
                  onChange={(e) => setAiSettings(prev => ({ ...prev, aiIndustryFocus: e.target.value }))}
                  data-testid="input-ai-industry-focus" 
                />
                <p className="text-xs text-muted-foreground">Industry context for analysis</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-risk-tolerance">Risk Tolerance</Label>
              <Select 
                value={aiSettings.aiRiskTolerance} 
                onValueChange={(value) => setAiSettings(prev => ({ ...prev, aiRiskTolerance: value }))}
              >
                <SelectTrigger id="ai-risk-tolerance" data-testid="select-ai-risk-tolerance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative - Flag all deviations from baseline</SelectItem>
                  <SelectItem value="moderate">Moderate - Balanced approach to risk assessment</SelectItem>
                  <SelectItem value="aggressive">Aggressive - Accept reasonable commercial risk</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How strictly the AI should evaluate contract terms against your baseline
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button 
              onClick={handleSaveAISettings}
              disabled={saveAISettingsMutation.isPending}
              data-testid="button-save-ai-settings"
            >
              {saveAISettingsMutation.isPending ? 'Saving...' : 'Save AI Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Theme Colors
              </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Customize colors for tables, forms, and locked columns throughout the application
            </p>
          </div>
          <Dialog open={copyColorsDialogOpen} onOpenChange={setCopyColorsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-copy-colors">
                <Copy className="h-4 w-4 mr-2" />
                Copy from Company
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Copy Theme Colors</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Select a company to copy their theme colors
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {companies.map((company) => (
                    <Button
                      key={company.id}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleCopyColorsFrom(company)}
                      data-testid={`button-copy-from-${company.id}`}
                    >
                      {company.name}
                    </Button>
                  ))}
                  {companies.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No other companies available
                    </p>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Table Header Colors */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Table Headers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="table-header-bg">Header Background</Label>
                <div className="flex gap-2">
                  <Input
                    id="table-header-bg"
                    type="color"
                    value={themeColors.tableHeaderBg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, tableHeaderBg: e.target.value }))}
                    className="w-20 h-10 cursor-pointer"
                    data-testid="color-table-header-bg"
                  />
                  <Input
                    type="text"
                    value={themeColors.tableHeaderBg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, tableHeaderBg: e.target.value }))}
                    className="flex-1 font-mono text-sm"
                    data-testid="input-table-header-bg"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="table-header-fg">Header Text</Label>
                <div className="flex gap-2">
                  <Input
                    id="table-header-fg"
                    type="color"
                    value={themeColors.tableHeaderFg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, tableHeaderFg: e.target.value }))}
                    className="w-20 h-10 cursor-pointer"
                    data-testid="color-table-header-fg"
                  />
                  <Input
                    type="text"
                    value={themeColors.tableHeaderFg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, tableHeaderFg: e.target.value }))}
                    className="flex-1 font-mono text-sm"
                    data-testid="input-table-header-fg"
                  />
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="p-2 rounded border">
              <div 
                className="px-3 py-2 rounded text-sm font-semibold"
                style={{ backgroundColor: themeColors.tableHeaderBg, color: themeColors.tableHeaderFg }}
              >
                Table Header Preview
              </div>
            </div>
          </div>

          {/* Locked Column Colors */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Locked/Read-Only Columns</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="locked-column-bg">Background</Label>
                <div className="flex gap-2">
                  <Input
                    id="locked-column-bg"
                    type="color"
                    value={themeColors.lockedColumnBg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, lockedColumnBg: e.target.value }))}
                    className="w-20 h-10 cursor-pointer"
                    data-testid="color-locked-column-bg"
                  />
                  <Input
                    type="text"
                    value={themeColors.lockedColumnBg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, lockedColumnBg: e.target.value }))}
                    className="flex-1 font-mono text-sm"
                    data-testid="input-locked-column-bg"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="locked-column-fg">Text</Label>
                <div className="flex gap-2">
                  <Input
                    id="locked-column-fg"
                    type="color"
                    value={themeColors.lockedColumnFg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, lockedColumnFg: e.target.value }))}
                    className="w-20 h-10 cursor-pointer"
                    data-testid="color-locked-column-fg"
                  />
                  <Input
                    type="text"
                    value={themeColors.lockedColumnFg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, lockedColumnFg: e.target.value }))}
                    className="flex-1 font-mono text-sm"
                    data-testid="input-locked-column-fg"
                  />
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="p-2 rounded border">
              <div 
                className="px-3 py-2 rounded text-sm"
                style={{ backgroundColor: themeColors.lockedColumnBg, color: themeColors.lockedColumnFg }}
              >
                Locked Column Preview
              </div>
            </div>
          </div>

          {/* Form Colors */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Forms & Desktop</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="form-bg">Background</Label>
                <div className="flex gap-2">
                  <Input
                    id="form-bg"
                    type="color"
                    value={themeColors.formBg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, formBg: e.target.value }))}
                    className="w-20 h-10 cursor-pointer"
                    data-testid="color-form-bg"
                  />
                  <Input
                    type="text"
                    value={themeColors.formBg}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, formBg: e.target.value }))}
                    className="flex-1 font-mono text-sm"
                    data-testid="input-form-bg"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="form-border">Border</Label>
                <div className="flex gap-2">
                  <Input
                    id="form-border"
                    type="color"
                    value={themeColors.formBorder}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, formBorder: e.target.value }))}
                    className="w-20 h-10 cursor-pointer"
                    data-testid="color-form-border"
                  />
                  <Input
                    type="text"
                    value={themeColors.formBorder}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, formBorder: e.target.value }))}
                    className="flex-1 font-mono text-sm"
                    data-testid="input-form-border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="form-accent">Accent</Label>
                <div className="flex gap-2">
                  <Input
                    id="form-accent"
                    type="color"
                    value={themeColors.formAccent}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, formAccent: e.target.value }))}
                    className="w-20 h-10 cursor-pointer"
                    data-testid="color-form-accent"
                  />
                  <Input
                    type="text"
                    value={themeColors.formAccent}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, formAccent: e.target.value }))}
                    className="flex-1 font-mono text-sm"
                    data-testid="input-form-accent"
                  />
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="p-4 rounded border">
              <div 
                className="p-4 rounded border-2"
                style={{ 
                  backgroundColor: themeColors.formBg, 
                  borderColor: themeColors.formBorder 
                }}
              >
                <div className="space-y-2">
                  <div className="text-sm font-medium">Form Preview</div>
                  <div 
                    className="px-4 py-2 rounded text-sm text-white font-medium"
                    style={{ backgroundColor: themeColors.formAccent }}
                  >
                    Primary Action Button
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSaveThemeColors} data-testid="button-save-theme-colors">
              Save Theme Colors
            </Button>
          </div>
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle>Layout Preferences</CardTitle>
          </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Customize the layout and spacing preferences for tables and grids across the application
          </p>

          <RowDensitySettings />
        </CardContent>
      </Card>

        <ResourceTypesManagement companyId={selectedCompany?.id} />
      </div>

    </div>
  );
}

function RowDensitySettings() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const currentDensity = selectedCompany?.gridRowSpacing || 'narrow';

  const saveGridRowSpacingMutation = useMutation({
    mutationFn: async (density: 'narrow' | 'medium' | 'wide') => {
      if (!selectedCompany) throw new Error('No company selected');
      return await apiRequest('PATCH', `/api/companies/${selectedCompany.id}`, {
        gridRowSpacing: density,
      });
    },
    onSuccess: async () => {
      // Force refetch to ensure selectedCompany gets updated before showing toast
      await queryClient.refetchQueries({ 
        queryKey: ['/api/companies'],
        type: 'active'
      });
      toast({
        title: "Grid row spacing updated",
        description: "The spacing has been applied to all tables and grids",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating spacing",
        description: error instanceof Error ? error.message : "Failed to update",
        variant: "destructive",
      });
    },
  });

  const handleDensityChange = (density: 'narrow' | 'medium' | 'wide') => {
    saveGridRowSpacingMutation.mutate(density);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="row-density">Grid Row Spacing</Label>
        <Select 
          value={currentDensity} 
          onValueChange={(value) => handleDensityChange(value as 'narrow' | 'medium' | 'wide')}
          disabled={saveGridRowSpacingMutation.isPending}
        >
          <SelectTrigger id="row-density" data-testid="select-row-density">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="narrow" data-testid="option-density-narrow">
              Narrow (Compact)
            </SelectItem>
            <SelectItem value="medium" data-testid="option-density-medium">
              Medium (Balanced)
            </SelectItem>
            <SelectItem value="wide" data-testid="option-density-wide">
              Wide (Spacious)
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Controls the vertical spacing in all tables and grids throughout the application
        </p>
      </div>
    </div>
  );
}

function SubcontractTemplatesCard({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['/api/subcontract-templates', companyId],
    queryFn: async () => {
      const response = await fetch(`/api/subcontract-templates?companyId=${companyId}`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/subcontract-templates/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subcontract-templates'] });
      toast({
        title: "Template deleted",
        description: "The subcontract template has been removed",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      if (!templateTitle) {
        const nameWithoutExt = file.name.replace(/\.pdf$/i, '');
        setTemplateTitle(nameWithoutExt);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !templateTitle.trim()) {
      toast({
        title: "Missing information",
        description: "Please select a file and enter a title",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', templateTitle.trim());
    formData.append('companyId', companyId);

    try {
      const response = await fetch('/api/subcontract-templates/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/subcontract-templates'] });
      toast({
        title: "Template uploaded",
        description: "The subcontract template is now available",
      });
      
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setTemplateTitle('');
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Subcontract Templates</CardTitle>
            <Button onClick={() => setUploadDialogOpen(true)} size="sm" data-testid="button-upload-template">
              <Upload className="h-4 w-4 mr-2" />
              Upload Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No subcontract templates yet. Click "Upload Template" to add one.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template: any) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                  data-testid={`template-row-${template.id}`}
                >
                  <div className="flex-1">
                    <div className="font-medium">{template.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {template.definedNamesList && template.definedNamesList.length > 0
                        ? `${template.definedNamesList.length} defined names`
                        : 'No defined names'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete template "${template.title}"?`)) {
                        deleteMutation.mutate(template.id);
                      }
                    }}
                    data-testid={`button-delete-${template.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent data-testid="dialog-upload-template">
          <DialogHeader>
            <DialogTitle>Upload Subcontract Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-title">Template Title</Label>
              <Input
                id="template-title"
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                placeholder="e.g., Standard Subcontract Agreement"
                data-testid="input-template-title"
              />
            </div>
            <div>
              <Label htmlFor="template-file">PDF File</Label>
              <Input
                id="template-file"
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                data-testid="input-template-file"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                setSelectedFile(null);
                setTemplateTitle('');
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !templateTitle.trim() || isUploading}
              data-testid="button-upload"
            >
              {isUploading ? "Uploading..." : "Upload Template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SortableResourceTypeItemProps {
  resourceType: ResourceType;
  onEdit: (resourceType: ResourceType) => void;
  onDelete: (resourceType: ResourceType) => void;
}

function SortableResourceTypeItem({ resourceType, onEdit, onDelete }: SortableResourceTypeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: resourceType.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        paddingTop: 'var(--row-py)',
        paddingBottom: 'var(--row-py)',
      }}
      className="flex items-center gap-3 bg-card border rounded-md hover-elevate px-3"
      data-testid={`resource-type-row-${resourceType.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        data-testid={`drag-handle-${resourceType.id}`}
      >
        <GripVertical className="h-5 w-5" />
      </div>
      
      <div className="flex-1 grid grid-cols-[80px_1fr] gap-3 items-center">
        <div className="font-mono text-lg font-bold text-primary" data-testid={`resource-code-${resourceType.id}`}>
          {resourceType.resourceCode}
        </div>
        <div className="text-sm" data-testid={`resource-description-${resourceType.id}`}>
          {resourceType.resourceDescription}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onEdit(resourceType)}
          data-testid={`button-edit-${resourceType.id}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(resourceType)}
          data-testid={`button-delete-${resourceType.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ResourceTypesManagement({ companyId }: { companyId?: string }) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingResourceType, setEditingResourceType] = useState<ResourceType | null>(null);
  const [formData, setFormData] = useState({
    resourceCode: "",
    resourceDescription: ""
  });

  useResourceTypesWebSocket(companyId || null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: resourceTypes = [], isLoading } = useQuery<ResourceType[]>({
    queryKey: ['/api/companies', companyId, 'resource-types'],
    enabled: !!companyId,
  });

  const createResourceTypeMutation = useMutation({
    mutationFn: async (data: { resourceCode: string; resourceDescription: string }) => {
      return await apiRequest('POST', `/api/companies/${companyId}/resource-types`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'resource-types'] });
      setIsCreateDialogOpen(false);
      setFormData({ resourceCode: "", resourceDescription: "" });
      toast({
        title: "Success",
        description: "Resource type created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create resource type",
        variant: "destructive",
      });
    },
  });

  const updateResourceTypeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ResourceType> }) => {
      return await apiRequest('PATCH', `/api/resource-types/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'resource-types'] });
      setIsEditDialogOpen(false);
      setEditingResourceType(null);
      setFormData({ resourceCode: "", resourceDescription: "" });
      toast({
        title: "Success",
        description: "Resource type updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update resource type",
        variant: "destructive",
      });
    },
  });

  const deleteResourceTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/resource-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'resource-types'] });
      toast({
        title: "Success",
        description: "Resource type deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete resource type",
        variant: "destructive",
      });
    },
  });

  const reorderResourceTypesMutation = useMutation({
    mutationFn: async (resourceTypeIds: string[]) => {
      return await apiRequest('POST', `/api/companies/${companyId}/resource-types/reorder`, { resourceTypeIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId, 'resource-types'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error reordering resource types",
        description: error.message || "Failed to reorder",
        variant: "destructive",
      });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = resourceTypes.findIndex((t) => t.id === active.id);
      const newIndex = resourceTypes.findIndex((t) => t.id === over.id);

      const newOrder = arrayMove(resourceTypes, oldIndex, newIndex);
      
      queryClient.setQueryData(
        ['/api/companies', companyId, 'resource-types'],
        newOrder
      );

      reorderResourceTypesMutation.mutate(newOrder.map((t) => t.id));
    }
  };

  const handleCreate = () => {
    if (!formData.resourceCode || !formData.resourceDescription) {
      toast({
        title: "Validation error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (formData.resourceCode.length !== 1 || !/[A-Z]/.test(formData.resourceCode)) {
      toast({
        title: "Validation error",
        description: "Resource code must be a single capital letter (A-Z)",
        variant: "destructive",
      });
      return;
    }

    createResourceTypeMutation.mutate(formData);
  };

  const handleEdit = () => {
    if (!editingResourceType) return;

    if (!formData.resourceCode || !formData.resourceDescription) {
      toast({
        title: "Validation error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (formData.resourceCode.length !== 1 || !/[A-Z]/.test(formData.resourceCode)) {
      toast({
        title: "Validation error",
        description: "Resource code must be a single capital letter (A-Z)",
        variant: "destructive",
      });
      return;
    }

    updateResourceTypeMutation.mutate({
      id: editingResourceType.id,
      data: {
        resourceCode: formData.resourceCode,
        resourceDescription: formData.resourceDescription,
      },
    });
  };

  const openEditDialog = (resourceType: ResourceType) => {
    setEditingResourceType(resourceType);
    setFormData({
      resourceCode: resourceType.resourceCode,
      resourceDescription: resourceType.resourceDescription,
    });
    setIsEditDialogOpen(true);
  };

  const openCreateDialog = () => {
    setFormData({ resourceCode: "", resourceDescription: "" });
    setIsCreateDialogOpen(true);
  };

  if (!companyId) {
    return null;
  }

  return (
    <>
      <SubcontractTemplatesCard companyId={companyId} />
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Resource Types Management</CardTitle>
            <Button onClick={openCreateDialog} size="sm" data-testid="button-create-resource-type">
              <Plus className="h-4 w-4 mr-2" />
              Add Resource Type
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading resource types...</div>
          ) : resourceTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No resource types yet. Click "Add Resource Type" to create one.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={resourceTypes.map(t => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {resourceTypes.map((resourceType) => (
                    <SortableResourceTypeItem
                      key={resourceType.id}
                      resourceType={resourceType}
                      onEdit={openEditDialog}
                      onDelete={(resourceType) => {
                        if (confirm(`Delete resource type "${resourceType.resourceCode}" - ${resourceType.resourceDescription}?`)) {
                          deleteResourceTypeMutation.mutate(resourceType.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-resource-type">
          <DialogHeader>
            <DialogTitle>Add New Resource Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="create-code">Resource Code (Single Capital Letter)</Label>
              <Input
                id="create-code"
                value={formData.resourceCode}
                onChange={(e) => setFormData({ ...formData, resourceCode: e.target.value.toUpperCase() })}
                placeholder="A"
                maxLength={1}
                className="font-mono"
                data-testid="input-resource-code"
              />
            </div>
            <div>
              <Label htmlFor="create-description">Resource Description</Label>
              <Textarea
                id="create-description"
                value={formData.resourceDescription}
                onChange={(e) => setFormData({ ...formData, resourceDescription: e.target.value })}
                placeholder="Enter resource type description"
                rows={3}
                data-testid="input-resource-description"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createResourceTypeMutation.isPending} data-testid="button-save">
              {createResourceTypeMutation.isPending ? "Creating..." : "Create Resource Type"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-resource-type">
          <DialogHeader>
            <DialogTitle>Edit Resource Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-code">Resource Code (Single Capital Letter)</Label>
              <Input
                id="edit-code"
                value={formData.resourceCode}
                onChange={(e) => setFormData({ ...formData, resourceCode: e.target.value.toUpperCase() })}
                placeholder="A"
                maxLength={1}
                className="font-mono"
                data-testid="input-edit-resource-code"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Resource Description</Label>
              <Textarea
                id="edit-description"
                value={formData.resourceDescription}
                onChange={(e) => setFormData({ ...formData, resourceDescription: e.target.value })}
                placeholder="Enter resource type description"
                rows={3}
                data-testid="input-edit-resource-description"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateResourceTypeMutation.isPending} data-testid="button-save-edit">
              {updateResourceTypeMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
