import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ForceDirectedGraph } from "@/components/force-directed-graph";
import { SidebarPanel } from "@/components/sidebar-panel";
import { FilterControls } from "@/components/filter-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, LayoutGrid, Network, SearchX } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bookmark } from "@shared/types";

export default function GraphView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [insightLevel, setInsightLevel] = useState(1);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<"any" | "all">("any");
  const [viewMode, setViewMode] = useState<"grid" | "graph">("graph");
  const [sortOrder, setSortOrder] = useState("newest");
  const [dateRange, setDateRange] = useState("all");
  const [sources, setSources] = useState<string[]>(["extension", "web", "import"]);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: bookmarks = [], isLoading } = useQuery<Bookmark[]>({
    queryKey: ["/api/bookmarks"],
  });
  
  const selectedBookmark = bookmarks.find(b => b.id === selectedBookmarkId);
  
  // When a bookmark is selected, center it in the graph
  const handleSelectBookmark = (id: string) => {
    setSelectedBookmarkId(id);
    
    // Find the bookmark node ID format that matches our graph component
    const bookmarkNodeId = `bookmark-${id}`;
    
    // Use a small delay to ensure the graph has updated
    setTimeout(() => {
      // Use custom event to notify the graph component to select and center this node
      const event = new CustomEvent('selectGraphNode', { 
        detail: { nodeId: bookmarkNodeId } 
      });
      document.dispatchEvent(event);
    }, 100);
  };
  
  // Extract all unique tags from bookmarks
  const allTags = Array.from(
    new Set(
      bookmarks.flatMap(bookmark => 
        [...bookmark.user_tags, ...bookmark.system_tags]
      )
    )
  ).sort();
  
  // Filter bookmarks based on search query and selected tags
  const filteredBookmarks = bookmarks.filter(bookmark => {
    // Search query filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        bookmark.title.toLowerCase().includes(searchLower) ||
        bookmark.description?.toLowerCase().includes(searchLower) ||
        bookmark.url.toLowerCase().includes(searchLower) ||
        bookmark.user_tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
        bookmark.system_tags.some(tag => tag.toLowerCase().includes(searchLower));
      
      if (!matchesSearch) return false;
    }
    
    // Source filter
    if (!sources.includes(bookmark.source)) {
      return false;
    }
    
    // Date filter
    if (dateRange !== "all") {
      const now = new Date();
      const bookmarkDate = new Date(bookmark.date_saved);
      const timeDiff = now.getTime() - bookmarkDate.getTime();
      const daysDiff = timeDiff / (1000 * 3600 * 24);
      
      if (dateRange === "week" && daysDiff > 7) return false;
      if (dateRange === "month" && daysDiff > 30) return false;
      if (dateRange === "quarter" && daysDiff > 90) return false;
    }
    
    // Tag filter
    if (selectedTags.length === 0) return true;
    
    const bookmarkTags = [...bookmark.user_tags, ...bookmark.system_tags];
    
    if (tagMode === "any") {
      return selectedTags.some(tag => bookmarkTags.includes(tag));
    } else {
      return selectedTags.every(tag => bookmarkTags.includes(tag));
    }
  });
  
  // Sort bookmarks
  const sortedBookmarks = [...filteredBookmarks].sort((a, b) => {
    if (sortOrder === "newest") {
      return new Date(b.date_saved).getTime() - new Date(a.date_saved).getTime();
    } else if (sortOrder === "oldest") {
      return new Date(a.date_saved).getTime() - new Date(b.date_saved).getTime();
    }
    return 0;
  });
  
  const toggleTagSelection = (tag: string) => {
    const isCurrentlySelected = selectedTags.includes(tag);
    
    // Update the tag selection first
    if (isCurrentlySelected) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
      
      // Only focus on tag node when it's newly selected and in graph view
      if (viewMode === "graph") {
        // Find the tag node ID format that matches our graph component
        const tagNodeId = `tag-${tag}`;
        // Clear any selected bookmark
        setSelectedBookmarkId(null);
        
        // Use a longer delay to ensure the graph has fully updated with filtered nodes
        // This prevents the "bouncing" effect caused by rapid zoom transitions
        setTimeout(() => {
          // Use custom event to notify the graph component to select this tag
          const event = new CustomEvent('selectGraphNode', { 
            detail: { nodeId: tagNodeId } 
          });
          document.dispatchEvent(event);
        }, 300); // Longer delay for smoother transitions
      }
    }
  };
  
  const handleDeleteBookmark = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/bookmarks/${id}`, undefined);
      
      toast({
        title: "Bookmark deleted",
        description: "Your bookmark was successfully deleted",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      
      if (selectedBookmarkId === id) {
        setSelectedBookmarkId(null);
      }
    } catch (error) {
      toast({
        title: "Error deleting bookmark",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  };
  
  return (
    <div className="flex flex-1 h-full w-full">
      {/* Main content column */}
      <div className="flex-1 flex flex-col h-full w-full">
        {/* Header section */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 h-16 flex items-center px-4">
          <div className="flex w-full items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Explore</h2>
            
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2">
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === "graph" ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => setViewMode("graph")}
                >
                  <Network className="h-4 w-4 mr-2" />
                  Graph
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Search, filters and tags section */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 w-full">
          {/* Search input and filter row */}
          <div className="flex items-center mb-3 gap-2">
            <div className="relative flex-1">
              <Input
                type="text"
                placeholder="Search bookmarks, content, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 h-10 w-full"
              />
              <SearchX className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              {searchQuery && (
                <X 
                  className="h-4 w-4 text-gray-400 absolute right-3 top-3 cursor-pointer" 
                  onClick={() => setSearchQuery("")}
                />
              )}
            </div>
            
            <FilterControls
              tags={allTags}
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              sources={sources}
              onSourcesChange={setSources}
              tagMode={tagMode}
              onTagModeChange={setTagMode}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
            />
          </div>
          
          {/* Tags display */}
          <div className="flex flex-wrap gap-1 mt-2">
            {allTags.map(tag => (
              <Badge 
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleTagSelection(tag)}
              >
                {tag}
                {selectedTags.includes(tag) && (
                  <X 
                    className="h-3 w-3 ml-1" 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTagSelection(tag);
                    }}
                  />
                )}
              </Badge>
            ))}
          </div>
        </div>
        
        {/* Content section */}
        <div className="flex-1 bg-gray-50 p-4 overflow-hidden w-full">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading graph data...</p>
              </div>
            </div>
          ) : filteredBookmarks.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="bg-white p-8 rounded-lg shadow text-center max-w-md">
                <SearchX className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No bookmarks found</h3>
                <p className="text-gray-500">
                  {searchQuery
                    ? "Try using different search terms or filters"
                    : selectedTags.length > 0
                      ? "Try selecting different tags or changing the match mode"
                      : "Add some bookmarks to see them in the explorer"}
                </p>
              </div>
            </div>
          ) : (
            // Always show graph in the main content area - removed the viewMode === "graph" conditional
            <div className="h-full border border-gray-200 rounded-lg overflow-hidden bg-white">
              <ForceDirectedGraph
                bookmarks={filteredBookmarks}
                insightLevel={insightLevel}
                onNodeClick={handleSelectBookmark}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Right Sidebar Panel - Now always show it on larger screens */}
      <div className="hidden lg:block w-80 border-l border-gray-200 bg-white overflow-y-auto h-full flex-shrink-0">
        <SidebarPanel
          bookmarks={sortedBookmarks}
          selectedBookmark={selectedBookmark}
          onSelectBookmark={handleSelectBookmark}
          onCloseDetail={() => setSelectedBookmarkId(null)}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
