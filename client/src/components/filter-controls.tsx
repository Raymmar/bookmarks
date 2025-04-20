import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterControlsProps {
  tags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  dateRange: string;
  onDateRangeChange: (dateRange: string) => void;
  sources: string[];
  onSourcesChange: (sources: string[]) => void;
  tagMode: "any" | "all";
  onTagModeChange: (mode: "any" | "all") => void;
  sortOrder: string;
  onSortOrderChange: (sortOrder: string) => void;
  className?: string;
}

export function FilterControls({
  tags,
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
  className
}: FilterControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };
  
  const handleSourceToggle = (source: string, checked: boolean) => {
    if (checked) {
      onSourcesChange([...sources, source]);
    } else {
      onSourcesChange(sources.filter(s => s !== source));
    }
  };
  
  const filtersActive = selectedTags.length > 0 || dateRange !== "all" || sources.length < 3;
  
  return (
    <div className={cn("flex items-center", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "flex items-center h-10 gap-1 px-3",
              filtersActive && "bg-primary/10 border-primary/20"
            )}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {filtersActive && (
              <Badge className="h-5 flex items-center justify-center px-1 ml-1 bg-primary text-white">
                {selectedTags.length + (dateRange !== "all" ? 1 : 0) + (sources.length < 3 ? 1 : 0)}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-4" align="start">
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-medium text-gray-700 mb-2">Sort By</h3>
              <Select value={sortOrder} onValueChange={onSortOrderChange}>
                <SelectTrigger className="w-full text-xs h-8">
                  <SelectValue placeholder="Sort order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          
            <div>
              <h3 className="text-xs font-medium text-gray-700 mb-2">Date Range</h3>
              <Select
                value={dateRange}
                onValueChange={onDateRangeChange}
              >
                <SelectTrigger className="w-full text-xs h-8">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="week">Past Week</SelectItem>
                  <SelectItem value="month">Past Month</SelectItem>
                  <SelectItem value="quarter">Past 3 Months</SelectItem>
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <h3 className="text-xs font-medium text-gray-700 mb-2">Source</h3>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-source-extension"
                    checked={sources.includes("extension")}
                    onCheckedChange={(checked) => {
                      handleSourceToggle("extension", checked as boolean);
                    }}
                  />
                  <label htmlFor="filter-source-extension" className="text-xs">Extension</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-source-web"
                    checked={sources.includes("web")}
                    onCheckedChange={(checked) => {
                      handleSourceToggle("web", checked as boolean);
                    }}
                  />
                  <label htmlFor="filter-source-web" className="text-xs">Web App</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-source-import"
                    checked={sources.includes("import")}
                    onCheckedChange={(checked) => {
                      handleSourceToggle("import", checked as boolean);
                    }}
                  />
                  <label htmlFor="filter-source-import" className="text-xs">Import</label>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-xs font-medium text-gray-700 mb-2">Tag Match</h3>
              <Select value={tagMode} onValueChange={(value) => onTagModeChange(value as "any" | "all")}>
                <SelectTrigger className="w-full text-xs h-8">
                  <SelectValue placeholder="Match mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any tag (OR)</SelectItem>
                  <SelectItem value="all">All tags (AND)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2"
                onClick={() => {
                  onTagsChange([]);
                  onDateRangeChange("all");
                  onSourcesChange(["extension", "web", "import"]);
                }}
              >
                Clear all filters
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      
      <div className="flex flex-wrap gap-1 ml-2">
        {selectedTags.map((tag) => (
          <Badge
            key={tag}
            variant="default"
            className="px-2 py-1 h-7 flex items-center"
          >
            {tag}
            <X
              className="h-3 w-3 ml-1 cursor-pointer"
              onClick={() => handleTagToggle(tag)}
            />
          </Badge>
        ))}
      </div>
    </div>
  );
}