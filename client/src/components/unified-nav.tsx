import { Search, X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FilterControls } from "@/components/filter-controls";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@radix-ui/react-icons";

interface UnifiedNavProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  allTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  dateRange: string;
  onDateRangeChange: (range: string) => void;
  sources: string[];
  onSourcesChange: (sources: string[]) => void;
  tagMode: "any" | "all";
  onTagModeChange: (mode: "any" | "all") => void;
  sortOrder: string;
  onSortOrderChange: (order: string) => void;
  visibleNodeTypes: string[];
  onVisibleNodeTypesChange: (types: string[]) => void;
  loadLimit: number | null;
  setLoadLimit: (limit: number | null) => void;
  fullBookmarksLength: number;
}

export function UnifiedNav({
  searchQuery,
  onSearchChange,
  allTags,
  selectedTags,
  onTagsChange,
  dateRange,
  onDateRangeChange,
  sources,
  onSourcesChange,
  tagMode,
  onTagModeChange,
  sortOrder,
  onSortOrderChange,
  visibleNodeTypes,
  onVisibleNodeTypesChange,
  loadLimit,
  setLoadLimit,
  fullBookmarksLength,
}: UnifiedNavProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 w-full">
      {/* Search input and filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1">
          <Input
            type="text"
            placeholder="Search bookmarks, content, tags..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-4 py-2 h-10 w-full"
          />
          <Search className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
          {searchQuery && (
            <X 
              className="h-4 w-4 text-gray-400 absolute right-3 top-3 cursor-pointer" 
              onClick={() => onSearchChange("")}
            />
          )}
        </div>
        
        <FilterControls
          tags={allTags}
          selectedTags={selectedTags}
          onTagsChange={onTagsChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          sources={sources}
          onSourcesChange={onSourcesChange}
          tagMode={tagMode}
          onTagModeChange={onTagModeChange}
          sortOrder={sortOrder}
          onSortOrderChange={onSortOrderChange}
          visibleNodeTypes={visibleNodeTypes}
          onVisibleNodeTypesChange={onVisibleNodeTypesChange}
        />
        
        {/* Load limit controls with combobox allowing custom values */}
        <div className="flex items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-[160px] h-9 justify-between"
              >
                {loadLimit === null ? `Show All (${fullBookmarksLength})` : `Show ${loadLimit}`}
                <ChevronDown className="h-4 w-4 ml-1 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <Command>
                <CommandInput 
                  placeholder="Enter a number..."
                  onValueChange={(value) => {
                    // Allow only numbers in the input
                    const numValue = value.replace(/\D/g, '');
                    if (numValue && !isNaN(Number(numValue))) {
                      setLoadLimit(Number(numValue));
                    }
                  }} 
                />
                <CommandEmpty>Enter a custom limit or choose below</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => setLoadLimit(25)}
                    className="cursor-pointer"
                  >
                    <CheckIcon
                      className={`mr-2 h-4 w-4 ${
                        loadLimit === 25 ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span>25</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => setLoadLimit(50)}
                    className="cursor-pointer"
                  >
                    <CheckIcon
                      className={`mr-2 h-4 w-4 ${
                        loadLimit === 50 ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span>50</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => setLoadLimit(100)}
                    className="cursor-pointer"
                  >
                    <CheckIcon
                      className={`mr-2 h-4 w-4 ${
                        loadLimit === 100 ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span>100</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => setLoadLimit(null)}
                    className="cursor-pointer"
                  >
                    <CheckIcon
                      className={`mr-2 h-4 w-4 ${
                        loadLimit === null ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span>Show All ({fullBookmarksLength})</span>
                  </CommandItem>
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}