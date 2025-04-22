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
                    : selectedTags.length > 0 || selectedDomain
                      ? `Try ${selectedTags.length > 0 && selectedDomain ? "removing some filters" : selectedTags.length > 0 ? "selecting different tags" : "choosing a different domain"}`
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
                onTagClick={handleTagClick}
                onDomainClick={handleDomainSelection}
                selectedBookmarkId={selectedBookmarkId}
                visibleNodeTypes={visibleNodeTypes}
              />
            </div>
          )}
        </div>
        
        {/* Filters display at the bottom of the graph area */}
        <div className="relative flex flex-col w-full bg-white border-t border-gray-200 px-4 py-2">
          {/* Absolute positioned close button when drawer is open - positioned relative to parent with padding */}
          {tagDrawerOpen && (
            <button
              onClick={toggleTagDrawer}
              aria-label="Close tag drawer"
              className="absolute top-0 right-0 bg-gray-100 hover:bg-gray-200 flex items-center justify-center p-1 z-10"
            >
              <ChevronDown className="h-4 w-4 text-gray-700" />
            </button>
          )}
          
          {/* Bookmark filter indicator if a bookmark is selected */}
          {selectedBookmarkId && (
            <div className="mb-2 flex items-center">
              <span className="text-sm text-gray-600 mr-2">Focused on:</span>
              <Badge 
                variant="default"
                className="cursor-pointer bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  setSelectedBookmarkId(null);
                  
                  // Trigger zoom-out when clicking the badge
                  setTimeout(() => {
                    const event = new CustomEvent('centerFullGraph', { 
                      detail: { source: 'closeBookmarkFilter' } 
                    });
                    document.dispatchEvent(event);
                  }, 50);
                }}
              >
                {selectedBookmark?.title || 'Bookmark'}
                <X 
                  className="h-3 w-3 ml-1" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBookmarkId(null);
                    
                    // Trigger zoom-out when clicking the X
                    setTimeout(() => {
                      const event = new CustomEvent('centerFullGraph', { 
                        detail: { source: 'closeBookmarkFilter' } 
                      });
                      document.dispatchEvent(event);
                    }, 50);
                  }}
                />
              </Badge>
            </div>
          )}
          
          {/* Domain filter indicator if selected */}
          {selectedDomain && (
            <div className="mb-2 flex items-center">
              <span className="text-sm text-gray-600 mr-2">Domain:</span>
              <Badge 
                variant="default"
                className="cursor-pointer bg-green-600 hover:bg-green-700"
                onClick={() => handleDomainSelection(selectedDomain)}
              >
                {selectedDomain}
                <X 
                  className="h-3 w-3 ml-1" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDomainSelection(selectedDomain);
                  }}
                />
              </Badge>
            </div>
          )}
          
          {/* Selected tag filters indicator when drawer is closed */}
          {!tagDrawerOpen && selectedTags.length > 0 && (
            <div className="mb-2 flex items-center flex-wrap gap-1">
              <span className="text-sm text-gray-600 mr-1">Tags:</span>
              {selectedTags.map(tag => (
                <Badge 
                  key={`selected-${tag}`}
                  variant="default"
                  className="cursor-pointer bg-primary hover:bg-primary/90"
                  onClick={() => toggleTagSelection(tag)}
                >
                  {tag}
                  <X 
                    className="h-3 w-3 ml-1" 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTagSelection(tag);
                    }}
                  />
                </Badge>
              ))}
              
              {/* Clear All button when multiple tags are selected */}
              {selectedTags.length > 1 && (
                <Badge 
                  variant="secondary"
                  className="cursor-pointer bg-gray-100 hover:bg-gray-200 flex items-center ml-1"
                  onClick={() => setSelectedTags([])}
                >
                  Clear All <X className="h-3 w-3 ml-1" />
                </Badge>
              )}
            </div>
          )}
          
          {/* Tags drawer - minimal version */}
          <div className="flex flex-wrap gap-1 items-center">
            {/* Tags display - either popular tags or all tags, but not showing tags that are already selected when drawer is closed */}
            {(tagDrawerOpen 
              ? allTags 
              // When drawer is closed, filter out selected tags from the popular tags
              : popularTags.filter(tag => !selectedTags.includes(tag))
            ).map(tag => (
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
            
            {/* Clear All button when drawer is open and tags are selected */}
            {tagDrawerOpen && selectedTags.length > 0 && (
              <Badge 
                variant="secondary"
                className="cursor-pointer bg-gray-100 hover:bg-gray-200 flex items-center"
                onClick={() => setSelectedTags([])}
              >
                Clear All <X className="h-3 w-3 ml-1" />
              </Badge>
            )}
            
            {/* Show "more" badge when drawer is closed */}
            {!tagDrawerOpen && (
              (() => {
                // Calculate remaining non-selected tags for display
                const remainingTagsCount = allTags.filter(tag => !selectedTags.includes(tag)).length - 
                                           popularTags.filter(tag => !selectedTags.includes(tag)).length;
                
                if (remainingTagsCount > 0) {
                  return (
                    <Badge 
                      variant="secondary"
                      className="cursor-pointer bg-gray-100 hover:bg-gray-200 flex items-center"
                      onClick={toggleTagDrawer}
                    >
                      +{remainingTagsCount} <ChevronUp className="h-3 w-3 ml-1" />
                    </Badge>
                  );
                }
                return null;
              })()
            )}
          </div>
        </div>
      </div>
      
      {/* Right Sidebar Panel - Now always show it on larger screens */}
      <div className="hidden lg:block w-80 border-l border-gray-200 bg-white overflow-y-auto h-full flex-shrink-0">
        <SidebarPanel
          bookmarks={sortedBookmarks}
          selectedBookmark={selectedBookmark}
          onSelectBookmark={handleSelectBookmark}
          onCloseDetail={() => {
            setSelectedBookmarkId(null);
            
            // Only trigger zoom-out when explicitly closing detail view
            // with no new selection being made
            setTimeout(() => {
              // This event will be handled by the graph component to reset view
              const event = new CustomEvent('centerFullGraph', { 
                detail: { source: 'closeDetail' } 
              });
              document.dispatchEvent(event);
            }, 50);
          }}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
