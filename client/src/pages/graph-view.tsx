import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ForceDirectedGraph } from "@/components/force-directed-graph-unpinned";
import { SidebarPanel } from "@/components/sidebar-panel";
import { FilterControls } from "@/components/filter-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, LayoutGrid, Network, Search, ChevronUp, ChevronDown, BookmarkPlus, SearchX } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Bookmark } from "@shared/types";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";

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
  // Add Bookmark dialog state
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);
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
  const { user } = useAuth();
  
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
  
  // Listen for showBookmarkDetail event to focus a bookmark in the graph
  useEffect(() => {
    const handleShowBookmarkDetail = (e: Event) => {
      // Cast to CustomEvent with the right detail type
      const event = e as CustomEvent<{bookmarkId: string}>;
      const bookmarkId = event.detail?.bookmarkId;
      
      if (bookmarkId) {
        console.log(`Graph view received showBookmarkDetail event for bookmark: ${bookmarkId}`);
        
        // Set the selected bookmark ID
        setSelectedBookmarkId(bookmarkId);
        
        // Use a small delay to ensure the graph has updated
        setTimeout(() => {
          // Format the node ID to match how it's stored in the graph component
          const nodeId = `bookmark-${bookmarkId}`;
          
          // Use custom event to notify the graph component to select and center this node
          const graphEvent = new CustomEvent('selectGraphNode', { 
            detail: { nodeId: nodeId, source: 'bookmarkDetailRequest' } 
          });
          document.dispatchEvent(graphEvent);
          
          console.log(`Dispatched selectGraphNode event for node ${nodeId}`);
        }, 100);
      }
    };
    
    // Add event listener
    window.addEventListener('showBookmarkDetail', handleShowBookmarkDetail);
    
    // Clean up
    return () => {
      window.removeEventListener('showBookmarkDetail', handleShowBookmarkDetail);
    };
  }, []);
  
  // Track previous auth state to detect login vs logout
  const prevUserRef = useRef<{ id: string } | null>(null);
  
  // Listen for user authentication changes and refresh bookmarks
  useEffect(() => {
    // Determine if this is a login or logout event
    const isLogin = !prevUserRef.current && user;
    const isLogout = prevUserRef.current && !user;
    
    console.log("User authentication state changed, refreshing bookmark data");
    
    // Always invalidate and refetch all related queries
    queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
    
    // If a bookmark was selected, reset the selection on authentication change
    if (selectedBookmarkId && (isLogin || isLogout)) {
      setSelectedBookmarkId(null);
    }
    
    // If there are any filters applied, reset them on authentication change
    if ((selectedTags.length > 0 || selectedDomain) && (isLogin || isLogout)) {
      setSelectedTags([]);
      setSelectedDomain(null);
    }
    
    // When a logout occurs, we need to completely reset the graph state
    if (isLogout) {
      // Force a complete refresh of the public bookmarks data
      queryClient.resetQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.resetQueries({ queryKey: ["/api/bookmarks-with-tags"] });
      queryClient.resetQueries({ queryKey: ["/api/tags"] });
      
      // Trigger a complete graph reset by dispatching a special reset event
      setTimeout(() => {
        const resetEvent = new CustomEvent('resetForceGraph', { 
          detail: { source: 'logout' } 
        });
        document.dispatchEvent(resetEvent);
        
        // After reset, center the graph (with a delay to ensure reset completes)
        setTimeout(() => {
          const centerEvent = new CustomEvent('centerFullGraph', { 
            detail: { source: 'logoutComplete' } 
          });
          document.dispatchEvent(centerEvent);
        }, 300);
      }, 150);
    } 
    // For regular login events, just center the graph
    else if (isLogin) {
      setTimeout(() => {
        const event = new CustomEvent('centerFullGraph', { 
          detail: { source: 'login' } 
        });
        document.dispatchEvent(event);
      }, 150);
    }
    
    // Explicitly refetch the bookmarks with tags
    if (!isLoadingBookmarks && !isLoadingTags) {
      refetchBookmarkTags();
    }
    
    // Update the previous user reference for the next render
    prevUserRef.current = user;
  }, [user, queryClient, refetchBookmarkTags, selectedBookmarkId, selectedTags, selectedDomain, isLoadingBookmarks, isLoadingTags]);
  
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
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
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
                <p className="text-gray-500 mb-4">
                  {searchQuery
                    ? "Try using different search terms or filters"
                    : selectedTags.length > 0 || selectedDomain
                      ? `Try ${selectedTags.length > 0 && selectedDomain ? "removing some filters" : selectedTags.length > 0 ? "selecting different tags" : "choosing a different domain"}`
                      : user 
                        ? "Create your first bookmark to begin exploring your knowledge graph"
                        : "Login to see your personalized bookmarks"}
                </p>
                {user && (!searchQuery && !selectedTags.length && !selectedDomain) && (
                  <Button 
                    onClick={() => setAddBookmarkOpen(true)}
                    className="mt-2"
                  >
                    <BookmarkPlus className="mr-2 h-4 w-4" />
                    Create Your First Bookmark
                  </Button>
                )}
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
          {/* Absolute positioned toggle button - always visible and positioned relative to parent with padding */}
          <button
            onClick={toggleTagDrawer}
            aria-label={tagDrawerOpen ? "Close tag drawer" : "Open tag drawer"}
            className={`absolute right-0 ${
              tagDrawerOpen 
                ? 'top-0 bg-gray-100 p-1 flex items-center justify-center' 
                : 'top-0 bottom-0 bg-transparent p-1 flex items-center justify-center'
            } hover:bg-gray-200 z-10`}
          >
            {(() => {
              // Calculate remaining non-selected tags count if drawer is closed
              if (!tagDrawerOpen) {
                const remainingTagsCount = allTags.filter(tag => !selectedTags.includes(tag)).length - 
                                           popularTags.filter(tag => !selectedTags.includes(tag)).length;
                if (remainingTagsCount > 0) {
                  return (
                    <div className="flex items-center">
                      <span className="text-xs mr-1 font-medium">+{remainingTagsCount}</span>
                      <ChevronUp className="h-4 w-4 text-gray-700" />
                    </div>
                  );
                }
              }
              
              // Default icons based on drawer state
              return tagDrawerOpen ? 
                <ChevronDown className="h-4 w-4 text-gray-700" /> : 
                <ChevronUp className="h-4 w-4 text-gray-700" />;
            })()}
          </button>
          
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
              {selectedTags.map((tag, index) => (
                <Badge 
                  key={`selected-${tag}-${index}`}
                  variant="default"
                  className="cursor-pointer bg-primary hover:bg-primary/90 ring-2 ring-primary shadow-sm"
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
            ).map((tag, index) => (
              <Badge 
                key={`tag-${tag}-${index}`} // Using index to ensure unique keys
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className={`cursor-pointer ${selectedTags.includes(tag) ? "ring-2 ring-primary shadow-sm" : ""}`}
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
            
            {/* Tag count badge has been moved to the toggle button */}
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

      {/* Add Bookmark Dialog */}
      <AddBookmarkDialog
        open={addBookmarkOpen}
        onOpenChange={setAddBookmarkOpen}
        onBookmarkAdded={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
          toast({
            title: "Bookmark added",
            description: "Your bookmark has been added to your graph",
          });
        }}
      />
    </div>
  );
}
