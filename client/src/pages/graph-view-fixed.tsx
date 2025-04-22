import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ForceDirectedGraph } from "@/components/force-directed-graph-unpinned";
import { SidebarPanel } from "@/components/sidebar-panel";
import { FilterControls } from "@/components/filter-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, LayoutGrid, Network, SearchX, ChevronUp, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bookmark } from "@shared/types";

// Tag interfaces
interface Tag {
  id: string;
  name: string;
  type: string;
  count: number;
  created_at: string;
}

// Interface for bookmarks with associated tags
interface BookmarkWithTags extends Bookmark {
  tags: Tag[];
}

export default function GraphView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [insightLevel, setInsightLevel] = useState(1);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [tagMode, setTagMode] = useState<"any" | "all">("any");
  const [viewMode, setViewMode] = useState<"grid" | "graph">("graph");
  const [sortOrder, setSortOrder] = useState("newest");
  const [dateRange, setDateRange] = useState("all");
  const [sources, setSources] = useState<string[]>(["extension", "web", "import"]);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<string[]>(["bookmark", "domain", "tag"]);
  // Drawer state with localStorage persistence
  const [tagDrawerOpen, setTagDrawerOpen] = useState<boolean>(() => {
    // Initialize from localStorage or default to closed
    const saved = localStorage.getItem('tagDrawerOpen');
    return saved ? JSON.parse(saved) : false;
  });
  // Number of popular tags to show when drawer is closed
  const [popularTagCount] = useState<number>(10);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Fetch bookmarks
  const { data: bookmarks = [], isLoading: isLoadingBookmarks } = useQuery<Bookmark[]>({
    queryKey: ["/api/bookmarks"],
  });

  // Fetch tags
  const { data: tags = [], isLoading: isLoadingTags } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  // Fetch bookmark-tag associations for each bookmark
  const { data: bookmarksWithTags = [], isLoading: isLoadingBookmarkTags, refetch: refetchBookmarkTags } = useQuery<BookmarkWithTags[]>({
    queryKey: ["/api/bookmarks-with-tags"],
    enabled: !isLoadingBookmarks && !isLoadingTags,
    queryFn: async () => {
      // Create a map to store tags for each bookmark
      const bookmarkTagsMap = new Map<string, Tag[]>();
      
      // For each bookmark, fetch its tags
      for (const bookmark of bookmarks) {
        try {
          const response = await fetch(`/api/bookmarks/${bookmark.id}/tags`);
          if (response.ok) {
            const bookmarkTags = await response.json();
            bookmarkTagsMap.set(bookmark.id, bookmarkTags);
          }
        } catch (error) {
          console.error(`Error fetching tags for bookmark ${bookmark.id}:`, error);
          bookmarkTagsMap.set(bookmark.id, []);
        }
      }
      
      // Combine bookmarks with their tags
      return bookmarks.map(bookmark => ({
        ...bookmark,
        tags: bookmarkTagsMap.get(bookmark.id) || []
      }));
    }
  });
  
  // Listen for tag changes to refresh the data
  useEffect(() => {
    const handleTagChanged = (event: CustomEvent) => {
      console.log("Graph view detected tag change event, refreshing data");
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
      
      // Explicitly refetch the bookmarks with tags
      refetchBookmarkTags();
    };
    
    // Add event listener
    document.addEventListener('tagChanged', handleTagChanged as EventListener);
    
    // Clean up
    return () => {
      document.removeEventListener('tagChanged', handleTagChanged as EventListener);
    };
  }, [queryClient, refetchBookmarkTags]);
  
  // Combined loading state
  const isLoading = isLoadingBookmarks || isLoadingTags || isLoadingBookmarkTags;
  
  const selectedBookmark = bookmarks.find(b => b.id === selectedBookmarkId);
  
  // Paste event handler for URLs
  const handlePasteEvent = useCallback(async (event: ClipboardEvent) => {
    // Get clipboard text content
    const clipboardText = event.clipboardData?.getData('text/plain');
    
    if (!clipboardText) return;
    
    // Simple URL validation - check if it looks like a URL
    const urlRegex = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;
    if (!urlRegex.test(clipboardText)) return;
    
    // Get the auto-extract setting
    let autoExtract = true; // Default to true if setting doesn't exist
    
    try {
      const response = await fetch('/api/settings/auto_extract_on_paste');
      if (response.ok) {
        const setting = await response.json();
        autoExtract = setting.value === 'true';
      }
    } catch (error) {
      console.error('Error fetching auto-extract setting:', error);
    }
    
    // Prepare the bookmark data
    const bookmarkData = {
      url: clipboardText,
      title: clipboardText, // Will be replaced by server-side extraction
      description: '',
      source: 'web',
      autoExtract: autoExtract,
      insightDepth: 1
    };
    
    try {
      toast({
        title: "Creating bookmark",
        description: "Processing URL pasted from clipboard...",
      });
      
      // Create the bookmark
      const response = await apiRequest('POST', '/api/bookmarks', bookmarkData);
      
      // Refresh the bookmarks list
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
      
      // Select the newly created bookmark
      setTimeout(() => {
        setSelectedBookmarkId(response.id);
        
        // Center on the new bookmark node
        const nodeId = `bookmark-${response.id}`;
        const event = new CustomEvent('selectGraphNode', { 
          detail: { nodeId: nodeId, source: 'clipboardPaste' } 
        });
        document.dispatchEvent(event);
      }, 500); // Give time for the query cache to update
      
      toast({
        title: "Bookmark created",
        description: "URL from clipboard has been added to your bookmarks.",
      });
    } catch (error) {
      toast({
        title: "Error creating bookmark",
        description: error instanceof Error ? error.message : "Failed to add URL from clipboard",
        variant: "destructive",
      });
    }
  }, [queryClient, toast]);
  
  // Add event listener for paste events
  useEffect(() => {
    document.addEventListener('paste', handlePasteEvent);
    
    return () => {
      document.removeEventListener('paste', handlePasteEvent);
    };
  }, [handlePasteEvent]);
  
  // When a bookmark is selected, center it in the graph
  const handleSelectBookmark = (id: string) => {
    setSelectedBookmarkId(id);
    
    // Use a small delay to ensure the graph has updated
    setTimeout(() => {
      // Format the node ID to match how it's stored in the graph component
      const nodeId = `bookmark-${id}`;
      
      // Use custom event to notify the graph component to select and center this node
      // Adding a source parameter to track where the selection came from (for debugging)
      const event = new CustomEvent('selectGraphNode', { 
        detail: { nodeId: nodeId, source: 'bookmarkSelection' } 
      });
      document.dispatchEvent(event);
      
      console.log(`Dispatched selectGraphNode event for node ${nodeId}`);
    }, 100);
  };
  
  // Extract all unique tags from the normalized tags system
  const allTags = tags.map(tag => tag.name).sort();
  
  // Get tags sorted by usage count for popular tags feature
  const tagsByCount = [...tags].sort((a, b) => b.count - a.count);
  
  // Get bookmark tags using the bookmarksWithTags data
  const bookmarkTagsMap = new Map<string, string[]>();
  bookmarksWithTags.forEach(bookmark => {
    bookmarkTagsMap.set(bookmark.id, bookmark.tags.map(tag => tag.name));
  });
  
  // Create a map of bookmarks with tags by ID for easier access
  const bookmarksWithTagsMap = new Map<string, BookmarkWithTags>();
  bookmarksWithTags.forEach(bookmark => {
    bookmarksWithTagsMap.set(bookmark.id, bookmark);
  });
  
  // Filter bookmarks based on search query, selected tags, and domain
  const filteredBookmarkIds = bookmarks.filter(bookmark => {
    // Get this bookmark's tags from our map
    const bookmarkTags = bookmarkTagsMap.get(bookmark.id) || [];
    // Note: system_tags is being phased out in favor of the normalized tag system
    const bookmarkSystemTags: string[] = [];
    const allBookmarkTags = [...bookmarkTags, ...bookmarkSystemTags];
    
    // Search query filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        bookmark.title.toLowerCase().includes(searchLower) ||
        bookmark.description?.toLowerCase().includes(searchLower) ||
        bookmark.url.toLowerCase().includes(searchLower) ||
        allBookmarkTags.some(tag => tag.toLowerCase().includes(searchLower));
      
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
    
    // Domain filter
    if (selectedDomain) {
      try {
        const url = new URL(bookmark.url);
        if (url.hostname !== selectedDomain) {
          return false;
        }
      } catch (e) {
        // If URL parsing fails, just check if the domain appears in the URL
        if (!bookmark.url.includes(selectedDomain)) {
          return false;
        }
      }
    }
    
    // Tag filter
    if (selectedTags.length === 0) return true;
    
    if (tagMode === "any") {
      return selectedTags.some(tag => allBookmarkTags.includes(tag));
    } else {
      return selectedTags.every(tag => allBookmarkTags.includes(tag));
    }
  }).map(bookmark => bookmark.id);
  
  // Filter bookmarksWithTags based on the filtered bookmark IDs
  const filteredBookmarks = bookmarksWithTags.filter(bookmark => 
    filteredBookmarkIds.includes(bookmark.id)
  );
  
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
      // Removing a tag
      setSelectedTags(selectedTags.filter(t => t !== tag));
      
      // Only clear focus if we're removing the last selected tag
      if (selectedTags.length === 1 && viewMode === "graph") {
        // Signal graph to zoom out to show all nodes
        // Only do this when the last tag is removed
        setSelectedBookmarkId(null);
        setTimeout(() => {
          const event = new CustomEvent('centerFullGraph', { 
            detail: { source: 'tagFilter' } 
          });
          document.dispatchEvent(event);
        }, 150);
      }
    } else {
      // Adding a new tag
      setSelectedTags([...selectedTags, tag]);
      
      // Only focus on tag node when it's newly selected and in graph view
      if (viewMode === "graph") {
        // Find the tag node ID format that matches our graph component
        const tagNodeId = `tag-${tag}`;
        
        // Clear any selected bookmark - important to do this first
        setSelectedBookmarkId(null);
        
        // Use a longer delay to ensure the graph has fully updated with filtered nodes
        // This prevents the "bouncing" effect caused by rapid zoom transitions
        setTimeout(() => {
          // Use custom event to notify the graph component to select this tag
          const event = new CustomEvent('selectGraphNode', { 
            detail: { nodeId: tagNodeId, source: 'tagFilter' } 
          });
          document.dispatchEvent(event);
        }, 300); // Longer delay for smoother transitions
      }
    }
  };
  
  const handleDomainSelection = (domain: string) => {
    const isDomainSelected = selectedDomain === domain;
    
    if (isDomainSelected) {
      // Remove the domain filter
      setSelectedDomain(null);
      
      // Zoom out to show all nodes
      setTimeout(() => {
        const event = new CustomEvent('centerFullGraph', { 
          detail: { source: 'domainFilter' } 
        });
        document.dispatchEvent(event);
      }, 150);
    } else {
      // Set the domain filter
      setSelectedDomain(domain);
      
      // Focus on the domain node
      if (viewMode === "graph") {
        const domainNodeId = `domain-${domain}`;
        
        // Clear any selected bookmark
        setSelectedBookmarkId(null);
        
        setTimeout(() => {
          const event = new CustomEvent('selectGraphNode', { 
            detail: { nodeId: domainNodeId, source: 'domainFilter' } 
          });
          document.dispatchEvent(event);
        }, 300);
      }
    }
  };
  
  const handleTagClick = (tag: string) => {
    toggleTagSelection(tag);
  };
  
  // Function to toggle the tag drawer open/closed state
  const toggleTagDrawer = () => {
    const newState = !tagDrawerOpen;
    setTagDrawerOpen(newState);
    // Save state to localStorage
    localStorage.setItem('tagDrawerOpen', JSON.stringify(newState));
  };
  
  // Get popular tags by using our sorted tagsByCount list
  const popularTags = tagsByCount
    .slice(0, popularTagCount)
    .map(tag => tag.name);
  
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
        {/* Header section removed as it's no longer necessary */}
        
        {/* Search and filters section - without tags */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 w-full">
          {/* Search input and filter row */}
          <div className="flex items-center gap-2">
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
              visibleNodeTypes={visibleNodeTypes}
              onVisibleNodeTypesChange={setVisibleNodeTypes}
            />
          </div>
        </div>
        
        {/* Content section */}
        <div className="flex-1 bg-gray-50 p-4 overflow-hidden w-full">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-lg font-semibold text-gray-500">Loading bookmarks...</p>
            </div>
          ) : (
            <div className="h-full flex">
              {/* Left side - visualization or grid */}
              <div className="flex-1 mr-2 relative overflow-hidden h-full">
                {/* View toggle buttons */}
                <div className="absolute top-0 right-0 z-10 bg-white rounded-bl-lg shadow-md p-1">
                  <div className="inline-flex items-center border border-gray-200 rounded-md">
                    <button
                      className={`px-3 py-1.5 flex items-center gap-2 transition ${
                        viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-gray-50"
                      }`}
                      onClick={() => setViewMode("grid")}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      <span className="text-xs">Grid</span>
                    </button>
                    <button
                      className={`px-3 py-1.5 flex items-center gap-2 transition ${
                        viewMode === "graph" ? "bg-primary text-primary-foreground" : "hover:bg-gray-50"
                      }`}
                      onClick={() => setViewMode("graph")}
                    >
                      <Network className="h-4 w-4" />
                      <span className="text-xs">Graph</span>
                    </button>
                  </div>
                </div>
                
                {/* Show graph or grid based on current viewMode */}
                {viewMode === "graph" ? (
                  <ForceDirectedGraph
                    bookmarks={bookmarks}
                    tags={tags}
                    bookmarksByTagMap={bookmarkTagsMap}
                    selectedTags={selectedTags}
                    selectedBookmarkId={selectedBookmarkId}
                    onSelectBookmark={handleSelectBookmark}
                    onSelectTag={toggleTagSelection}
                    onSelectDomain={handleDomainSelection}
                    selectedDomain={selectedDomain}
                    visibleNodeTypes={visibleNodeTypes}
                  />
                ) : (
                  <div className="h-full overflow-y-auto p-2">
                    {filteredBookmarkIds.length === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-lg font-semibold text-gray-500">No bookmarks found</p>
                          <p className="text-sm text-gray-400 mt-2">Try adjusting your search or filters</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sortedBookmarks.map(bookmark => (
                          <div 
                            key={bookmark.id}
                            className={`bg-white border rounded-lg shadow-sm p-4 cursor-pointer hover:shadow-md transition ${
                              selectedBookmarkId === bookmark.id ? "ring-2 ring-primary" : ""
                            }`}
                            onClick={() => setSelectedBookmarkId(bookmark.id)}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-medium text-sm line-clamp-2">{bookmark.title}</h3>
                            </div>
                            <p className="text-xs text-gray-500 mb-3 line-clamp-2">{bookmark.url}</p>
                            
                            {bookmark.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {bookmark.tags.slice(0, 3).map(tag => (
                                  <Badge 
                                    key={tag.id} 
                                    variant={selectedTags.includes(tag.name) ? "default" : "outline"}
                                    className="text-xs cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTagClick(tag.name);
                                    }}
                                  >
                                    {tag.name}
                                  </Badge>
                                ))}
                                {bookmark.tags.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{bookmark.tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Right side - detail panel */}
              <SidebarPanel
                selectedBookmarkId={selectedBookmarkId}
                onClose={() => setSelectedBookmarkId(null)}
                onDeleteBookmark={handleDeleteBookmark}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Side panel for tags */}
      <div 
        className={`border-l shadow-inner bg-white transition-all duration-200 overflow-y-auto ${
          tagDrawerOpen ? "w-80" : "w-12"
        }`}
      >
        {/* Toggle button */}
        <button
          className="flex w-full items-center py-3 px-2 border-b hover:bg-gray-50/80"
          onClick={toggleTagDrawer}
        >
          <span className={`flex-1 font-medium ml-2 ${tagDrawerOpen ? "" : "sr-only"}`}>Tags</span>
          {tagDrawerOpen ? (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-gray-400" />
          )}
        </button>
        
        {/* Tag list */}
        <div className={`p-3 ${tagDrawerOpen ? "" : "sr-only"}`}>
          {/* Filter input */}
          <div className="relative mb-3">
            <Input
              type="text"
              placeholder="Filter tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-4 py-1 text-sm h-8"
            />
            <Search className="h-4 w-4 text-gray-400 absolute left-2 top-2" />
          </div>
          
          {/* Tag list */}
          <div className="space-y-1.5">
            {tags
              .filter(tag => searchQuery === "" || tag.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .sort((a, b) => {
                // Prioritize selected tags
                const aSelected = selectedTags.includes(a.name);
                const bSelected = selectedTags.includes(b.name);
                
                if (aSelected && !bSelected) return -1;
                if (!aSelected && bSelected) return 1;
                
                // Then sort by count
                return b.count - a.count;
              })
              .map(tag => (
                <div 
                  key={tag.id} 
                  className={`flex items-center justify-between py-1 px-2 text-sm rounded-md cursor-pointer ${
                    selectedTags.includes(tag.name) ? "bg-primary/10 text-primary" : "hover:bg-gray-100"
                  }`} 
                  onClick={() => toggleTagSelection(tag.name)}
                >
                  <span className="truncate">{tag.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {tag.count}
                  </Badge>
                </div>
              ))}
          </div>
        </div>
        
        {/* Collapsed view - only show when drawer is collapsed */}
        {!tagDrawerOpen && (
          <div className="p-0.5">
            {/* Show only popular tags in vertical list */}
            {popularTags.map(tag => (
              <div 
                key={tag} 
                className={`mb-1 p-1 text-xs rounded-sm cursor-pointer text-center truncate ${
                  selectedTags.includes(tag) ? "bg-primary/10 text-primary" : "hover:bg-gray-100"
                }`}
                onClick={() => toggleTagSelection(tag)}
                title={tag}
              >
                {tag.substring(0, 1).toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}