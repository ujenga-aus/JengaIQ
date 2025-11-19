import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Plus, Trash2, Search } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface WorksheetItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  worksheetId: string;
  worksheetCode: string;
  worksheetDescription: string;
}

interface WorksheetItem {
  id: string;
  worksheetId: string;
  lq: string | null;
  description: string | null;
  formula: string | null;
  resourceRateId: string | null;
  qty: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ResourceRate {
  id: string;
  code: string;
  description: string | null;
  unit: string | null;
  tenderRate: string | null;
}

export default function WorksheetItemsDialog({
  open,
  onOpenChange,
  projectId,
  worksheetId,
  worksheetCode,
  worksheetDescription,
}: WorksheetItemsDialogProps) {
  const { toast } = useToast();
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Partial<WorksheetItem>>({
    lq: '',
    description: '',
    formula: '',
    resourceRateId: null,
    qty: '',
  });
  const [resourceSearchOpen, setResourceSearchOpen] = useState<string | null>(null);

  // Fetch worksheet items
  const { data: items = [], isLoading: itemsLoading } = useQuery<WorksheetItem[]>({
    queryKey: ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
    enabled: open && !!projectId && !!worksheetId,
  });

  // Fetch resource rates for the project
  const { data: resourceRates = [] } = useQuery<ResourceRate[]>({
    queryKey: ['/api/projects', projectId, 'resource-rates'],
    enabled: open && !!projectId,
  });

  // Create a map for quick resource lookups
  const resourceMap = useMemo(() => {
    const map = new Map<string, ResourceRate>();
    resourceRates.forEach(r => map.set(r.id, r));
    return map;
  }, [resourceRates]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<WorksheetItem>) => {
      return await apiRequest(
        'POST',
        `/api/projects/${projectId}/worksheets/${worksheetId}/items`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
      });
      setShowNewRow(false);
      setNewRowData({
        lq: '',
        description: '',
        formula: '',
        resourceRateId: null,
        qty: '',
      });
      toast({
        title: 'Item created',
        description: 'Worksheet item has been added successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create item.',
        variant: 'destructive',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: any }) => {
      const response = await apiRequest(
        'PATCH',
        `/api/projects/${projectId}/worksheets/${worksheetId}/items/${id}`,
        { [field]: value }
      );
      return await response.json() as WorksheetItem;
    },
    onSuccess: (updatedItem: WorksheetItem) => {
      queryClient.setQueryData(
        ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
        (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((item: WorksheetItem) =>
            item.id === updatedItem.id ? updatedItem : item
          );
        }
      );
      setEditingCell(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update item.',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/projects/${projectId}/worksheets/${worksheetId}/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'worksheets', worksheetId, 'items'],
      });
      toast({
        title: 'Item deleted',
        description: 'Worksheet item has been removed.',
      });
    },
  });

  const handleCellClick = (id: string, field: string) => {
    // Don't allow editing unit or tenderRate as they're derived from resourceRate
    if (field === 'unit' || field === 'tenderRate') return;
    setEditingCell({ id, field });
  };

  const handleCellBlur = (id: string, field: string, value: any) => {
    if (editingCell?.id === id && editingCell?.field === field) {
      const item = items.find(i => i.id === id);
      if (item && item[field as keyof WorksheetItem] !== value) {
        updateMutation.mutate({ id, field, value });
      } else {
        setEditingCell(null);
      }
    }
  };

  const handleNewRowSave = () => {
    if (!newRowData.description?.trim()) {
      toast({
        title: 'Validation error',
        description: 'Description is required',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      ...newRowData,
      lq: newRowData.lq || null,
      description: newRowData.description || null,
      formula: newRowData.formula || null,
      resourceRateId: newRowData.resourceRateId || null,
      qty: newRowData.qty || null,
    });
  };

  const handleResourceSelect = (itemId: string | null, resourceId: string) => {
    if (itemId === null) {
      // New row
      setNewRowData({ ...newRowData, resourceRateId: resourceId });
    } else {
      // Existing row
      updateMutation.mutate({ id: itemId, field: 'resourceRateId', value: resourceId });
    }
    setResourceSearchOpen(null);
  };

  const ResourceLookupCell = ({ itemId, currentResourceId }: { itemId: string | null; currentResourceId: string | null }) => {
    const currentResource = currentResourceId ? resourceMap.get(currentResourceId) : null;
    const cellKey = itemId || 'new';
    const isOpen = resourceSearchOpen === cellKey;

    return (
      <Popover open={isOpen} onOpenChange={(open) => setResourceSearchOpen(open ? cellKey : null)}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start font-normal h-auto py-1 px-2 hover-elevate"
            data-testid={`button-resource-lookup-${itemId || 'new'}`}
          >
            {currentResource ? (
              <span className="truncate">{currentResource.description || currentResource.code}</span>
            ) : (
              <span className="text-muted-foreground">Select resource...</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <Command>
            <CommandInput placeholder="Type to search resources..." data-testid="input-resource-search" />
            <CommandList>
              <CommandEmpty>No resources found.</CommandEmpty>
              <CommandGroup>
                {resourceRates.map((resource) => (
                  <CommandItem
                    key={resource.id}
                    value={`${resource.code} ${resource.description || ''}`}
                    onSelect={() => handleResourceSelect(itemId, resource.id)}
                    data-testid={`item-resource-${resource.code}`}
                  >
                    <div className="flex flex-col">
                      <div className="font-medium">{resource.code}</div>
                      {resource.description && (
                        <div className="text-sm text-muted-foreground">{resource.description}</div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-data-lg">
            Worksheet Items - {worksheetCode}
            {worksheetDescription && ` (${worksheetDescription})`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full">
            <thead className="bg-muted sticky top-0 z-10">
              <tr className="text-data-sm">
                <th className="text-left p-2 border-b font-medium w-24">LQ</th>
                <th className="text-left p-2 border-b font-medium flex-1">Description</th>
                <th className="text-left p-2 border-b font-medium w-32">Formula</th>
                <th className="text-left p-2 border-b font-medium w-64">Resource</th>
                <th className="text-left p-2 border-b font-medium w-24">Unit</th>
                <th className="text-left p-2 border-b font-medium w-24">QTY</th>
                <th className="text-left p-2 border-b font-medium w-32">Tender Rate</th>
                <th className="text-left p-2 border-b font-medium w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const resource = item.resourceRateId ? resourceMap.get(item.resourceRateId) : null;
                return (
                  <tr key={item.id} className="border-b hover-elevate" data-testid={`row-item-${item.id}`}>
                    <td
                      className="p-2 cursor-pointer"
                      onClick={() => handleCellClick(item.id, 'lq')}
                      data-testid={`cell-lq-${item.id}`}
                    >
                      {editingCell?.id === item.id && editingCell?.field === 'lq' ? (
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={item.lq || ''}
                          onBlur={(e) => handleCellBlur(item.id, 'lq', e.target.value || null)}
                          autoFocus
                          className="h-7 text-data"
                          data-testid={`input-lq-${item.id}`}
                        />
                      ) : (
                        <span className="text-data">{item.lq || '-'}</span>
                      )}
                    </td>
                    <td
                      className="p-2 cursor-pointer"
                      onClick={() => handleCellClick(item.id, 'description')}
                      data-testid={`cell-description-${item.id}`}
                    >
                      {editingCell?.id === item.id && editingCell?.field === 'description' ? (
                        <Input
                          defaultValue={item.description || ''}
                          onBlur={(e) => handleCellBlur(item.id, 'description', e.target.value || null)}
                          autoFocus
                          className="h-7 text-data"
                          data-testid={`input-description-${item.id}`}
                        />
                      ) : (
                        <span className="text-data">{item.description || '-'}</span>
                      )}
                    </td>
                    <td
                      className="p-2 cursor-pointer"
                      onClick={() => handleCellClick(item.id, 'formula')}
                      data-testid={`cell-formula-${item.id}`}
                    >
                      {editingCell?.id === item.id && editingCell?.field === 'formula' ? (
                        <Input
                          defaultValue={item.formula || ''}
                          onBlur={(e) => handleCellBlur(item.id, 'formula', e.target.value || null)}
                          autoFocus
                          className="h-7 text-data font-mono"
                          data-testid={`input-formula-${item.id}`}
                        />
                      ) : (
                        <span className="text-data font-mono">{item.formula || '-'}</span>
                      )}
                    </td>
                    <td className="p-2" data-testid={`cell-resource-${item.id}`}>
                      <ResourceLookupCell itemId={item.id} currentResourceId={item.resourceRateId} />
                    </td>
                    <td className="p-2 text-muted-foreground" data-testid={`cell-unit-${item.id}`}>
                      <span className="text-data">{resource?.unit || '-'}</span>
                    </td>
                    <td
                      className="p-2 cursor-pointer"
                      onClick={() => handleCellClick(item.id, 'qty')}
                      data-testid={`cell-qty-${item.id}`}
                    >
                      {editingCell?.id === item.id && editingCell?.field === 'qty' ? (
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={item.qty || ''}
                          onBlur={(e) => handleCellBlur(item.id, 'qty', e.target.value || null)}
                          autoFocus
                          className="h-7 text-data"
                          data-testid={`input-qty-${item.id}`}
                        />
                      ) : (
                        <span className="text-data">{item.qty || '-'}</span>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground" data-testid={`cell-tender-rate-${item.id}`}>
                      <span className="text-data">{resource?.tenderRate || '-'}</span>
                    </td>
                    <td className="p-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(item.id)}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {showNewRow && (
                <tr className="border-b bg-muted/50" data-testid="row-new-item">
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={newRowData.lq || ''}
                      onChange={(e) => setNewRowData({ ...newRowData, lq: e.target.value })}
                      placeholder="LQ"
                      className="h-7 text-data"
                      data-testid="input-new-lq"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={newRowData.description || ''}
                      onChange={(e) => setNewRowData({ ...newRowData, description: e.target.value })}
                      placeholder="Description *"
                      className="h-7 text-data"
                      data-testid="input-new-description"
                      autoFocus
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={newRowData.formula || ''}
                      onChange={(e) => setNewRowData({ ...newRowData, formula: e.target.value })}
                      placeholder="Formula"
                      className="h-7 text-data font-mono"
                      data-testid="input-new-formula"
                    />
                  </td>
                  <td className="p-2">
                    <ResourceLookupCell itemId={null} currentResourceId={newRowData.resourceRateId || null} />
                  </td>
                  <td className="p-2 text-muted-foreground">
                    <span className="text-data">
                      {newRowData.resourceRateId && resourceMap.get(newRowData.resourceRateId)?.unit || '-'}
                    </span>
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={newRowData.qty || ''}
                      onChange={(e) => setNewRowData({ ...newRowData, qty: e.target.value })}
                      placeholder="QTY"
                      className="h-7 text-data"
                      data-testid="input-new-qty"
                    />
                  </td>
                  <td className="p-2 text-muted-foreground">
                    <span className="text-data">
                      {newRowData.resourceRateId && resourceMap.get(newRowData.resourceRateId)?.tenderRate || '-'}
                    </span>
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowNewRow(false)}
                      data-testid="button-cancel-new"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {!itemsLoading && items.length === 0 && !showNewRow && (
            <div className="p-8 text-center text-muted-foreground">
              <p>No items yet. Click "Add Item" to get started.</p>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="flex gap-2">
            {showNewRow ? (
              <Button onClick={handleNewRowSave} disabled={createMutation.isPending} data-testid="button-save-new">
                Save Item
              </Button>
            ) : (
              <Button onClick={() => setShowNewRow(true)} data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
