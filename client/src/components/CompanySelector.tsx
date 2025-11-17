import { Building2, Check, ChevronsUpDown } from "lucide-react";
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
import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { useSetupMode } from "@/contexts/SetupModeContext";
import { queryClient } from "@/lib/queryClient";

export function CompanySelector() {
  const [open, setOpen] = useState(false);
  const { selectedCompany, setSelectedCompany, companies, isLoading } = useCompany();
  const { isSetupMode } = useSetupMode();

  if (isLoading) {
    return (
      <Button
        variant="outline"
        className="w-[168px] justify-between"
        disabled
        data-testid="button-company-selector"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs font-medium">Loading...</span>
        </div>
      </Button>
    );
  }

  if (!companies || companies.length === 0) {
    return (
      <Button
        variant="outline"
        className="w-[168px] justify-between"
        disabled
        data-testid="button-company-selector"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs font-medium">No companies</span>
        </div>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-[168px] justify-between ${isSetupMode ? "opacity-50" : ""}`}
          disabled={isSetupMode}
          data-testid="button-company-selector"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs font-bold">{selectedCompany?.name || "Select company"}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[168px] p-0">
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
          <CommandInput placeholder="Search company..." />
          <CommandList>
            <CommandEmpty>No company found.</CommandEmpty>
            <CommandGroup>
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={company.name}
                  onSelect={() => {
                    setSelectedCompany(company);
                    // Invalidate all business-units and projects queries to refetch with new company
                    queryClient.invalidateQueries({ 
                      predicate: (query) => 
                        Array.isArray(query.queryKey) && 
                        (query.queryKey[0] === "/api/business-units" || query.queryKey[0] === "/api/projects")
                    });
                    setOpen(false);
                  }}
                  data-testid={`company-option-${company.id}`}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      selectedCompany?.id === company.id ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  {company.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
