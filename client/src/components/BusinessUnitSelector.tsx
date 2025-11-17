import { Building, Check, ChevronsUpDown } from "lucide-react";
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
import { useBusinessUnit } from "@/contexts/BusinessUnitContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useTerminology } from "@/contexts/TerminologyContext";

export function BusinessUnitSelector() {
  const [open, setOpen] = useState(false);
  const { selectedBusinessUnit, setSelectedBusinessUnit, businessUnits, isLoading } = useBusinessUnit();
  const { selectedCompany } = useCompany();
  const { terminology } = useTerminology();

  if (!selectedCompany) {
    return (
      <Button
        variant="outline"
        className="w-[168px] justify-between"
        disabled
        data-testid="button-bu-selector"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs font-medium">Select company first</span>
        </div>
      </Button>
    );
  }

  if (isLoading) {
    return (
      <Button
        variant="outline"
        className="w-[168px] justify-between"
        disabled
        data-testid="button-bu-selector"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs font-medium">Loading...</span>
        </div>
      </Button>
    );
  }

  const displayText = selectedBusinessUnit === "all" 
    ? `All ${terminology.businessUnit}` 
    : selectedBusinessUnit 
      ? (typeof selectedBusinessUnit === 'object' ? selectedBusinessUnit.name : "Select")
      : `Select ${terminology.businessUnit}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[168px] justify-between"
          data-testid="button-bu-selector"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs font-bold">{displayText}</span>
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
          <CommandInput placeholder={`Search ${terminology.businessUnit.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No {terminology.businessUnit.toLowerCase()} found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => {
                  setSelectedBusinessUnit("all");
                  setOpen(false);
                }}
                data-testid="bu-option-all"
              >
                <Check
                  className={`mr-2 h-4 w-4 ${
                    selectedBusinessUnit === "all" ? "opacity-100" : "opacity-0"
                  }`}
                />
                All {terminology.businessUnit}
              </CommandItem>
              {businessUnits.map((bu) => (
                <CommandItem
                  key={bu.id}
                  value={bu.name}
                  onSelect={() => {
                    setSelectedBusinessUnit(bu);
                    setOpen(false);
                  }}
                  data-testid={`bu-option-${bu.id}`}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      selectedBusinessUnit !== "all" && 
                      typeof selectedBusinessUnit === 'object' && 
                      selectedBusinessUnit?.id === bu.id 
                        ? "opacity-100" 
                        : "opacity-0"
                    }`}
                  />
                  {bu.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
