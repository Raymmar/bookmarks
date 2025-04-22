import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCollections } from "@/hooks/use-collection-queries";

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
  selectedCollectionId?: string | null;
  onCollectionChange?: (collectionId: string | null) => void;
  visibleNodeTypes?: string[];
  onVisibleNodeTypesChange?: (nodeTypes: string[]) => void;
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
  selectedCollectionId,
  onCollectionChange,
  visibleNodeTypes = ["bookmark", "domain", "tag"],
  onVisibleNodeTypesChange,
  className
}: FilterControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: collections = [], isLoading: collectionsLoading } = useCollections();
  
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
  
  const handleNodeTypeToggle = (nodeType: string, checked: boolean) => {
    if (!onVisibleNodeTypesChange) return;
    
    if (checked) {
      onVisibleNodeTypesChange([...visibleNodeTypes, nodeType]);
    } else {
      onVisibleNodeTypesChange(visibleNodeTypes.filter(t => t !== nodeType));
    }
  };
  
  // Count non-tag filters for the filter badge count, including node type filters
  const nodeTypesFiltered = visibleNodeTypes.length < 3; // Less than all 3 node types are visible
  const collectionFiltered = !!selectedCollectionId;
  const filtersActive = dateRange !== "all" || sources.length < 3 || nodeTypesFiltered || collectionFiltered;
  const filterCount = (dateRange !== "all" ? 1 : 0) + 
                     (sources.length < 3 ? 1 : 0) + 
                     (nodeTypesFiltered ? 1 : 0) +
                     (collectionFiltered ? 1 : 0);
  
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
            {filterCount > 0 && (
              <Badge className="h-5 flex items-center justify-center px-1 ml-1 bg-primary text-white">
                {filterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-4" align="start">
          <div className="space-y-4">
            {collections.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-700 mb-2">Collection</h3>
                <Select 
                  value={selectedCollectionId || "all"} 
                  onValueChange={(value) => {
                    if (onCollectionChange) {
                      const collectionId = value === "all" ? null : value;
                      console.log(`[Filter Controls] Collection changed to: ${collectionId || 'All Collections'}`);
                      onCollectionChange(collectionId);
                    }
                  }}
                >
                  <SelectTrigger className="w-full text-xs h-8">
                    <SelectValue placeholder="Select collection" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Collections</SelectItem>
                    {collections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name} {!collection.is_public && "(Private)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
            
            <div>
              <h3 className="text-xs font-medium text-gray-700 mb-2">Node Types</h3>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="node-type-bookmark"
                    checked={visibleNodeTypes.includes("bookmark")}
                    onCheckedChange={(checked) => {
                      handleNodeTypeToggle("bookmark", checked as boolean);
                    }}
                  />
                  <label htmlFor="node-type-bookmark" className="text-xs">Bookmarks</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="node-type-domain"
                    checked={visibleNodeTypes.includes("domain")}
                    onCheckedChange={(checked) => {
                      handleNodeTypeToggle("domain", checked as boolean);
                    }}
                  />
                  <label htmlFor="node-type-domain" className="text-xs">Domains</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="node-type-tag"
                    checked={visibleNodeTypes.includes("tag")}
                    onCheckedChange={(checked) => {
                      handleNodeTypeToggle("tag", checked as boolean);
                    }}
                  />
                  <label htmlFor="node-type-tag" className="text-xs">Tags</label>
                </div>
              </div>
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
                  if (onVisibleNodeTypesChange) {
                    onVisibleNodeTypesChange(["bookmark", "domain", "tag"]);
                  }
                  if (onCollectionChange) {
                    onCollectionChange(null);
                  }
                }}
              >
                Clear all filters
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}