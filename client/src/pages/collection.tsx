import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BookmarkCard } from "@/components/bookmark-card";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { SearchX, Grid, List, Network } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Bookmark } from "@shared/types";
import { useCollection } from "@/hooks/use-collection-queries";
import { usePaginatedBookmarks } from "@/hooks/use-paginated-bookmarks";

export default function CollectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Get collection ID from URL
  const [match, params] = useRoute<{ collectionId: string }>("/collection/:collectionId");
  const collectionId = match ? params.collectionId : null;
  
  // Fetch collection details
  const { data: collection, isLoading: isCollectionLoading } = useCollection(collectionId || "");
  
  // State for the selected bookmark
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  
  // State for view mode (list or grid)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    const savedViewMode = localStorage.getItem('bookmarkFeedViewMode');
    return (savedViewMode === 'list' || savedViewMode === 'grid') ? savedViewMode : 'list';
  });
  
  // State for sorting
  const [sortOrder, setSortOrder] = useState<string>(() => {
    const savedSort = localStorage.getItem('bookmarkFeedSortOrder');
    return savedSort || 'newest';
  });
  
  // State for search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  
  // Ref for infinite scroll
  const loaderRef = useRef<HTMLDivElement>(null);
  
  // Debounce search input to prevent too many requests
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    
    return () => clearTimeout(timerId);
  }, [searchQuery]);
  
  // Fetch paginated bookmarks with server-side search and infinite scroll
  const {
    bookmarks,
    isLoading,
    hasNextPage,
    loadMoreBookmarks,
    isFetchingNextPage,
    totalPages,
    refetch
  } = usePaginatedBookmarks(
    50, 
    sortOrder as 'newest' | 'oldest' | 'recently_updated', 
    debouncedSearchQuery,
    collectionId // Add collection filter
  );
  
  // Use bookmarks directly as they are filtered on the server
  const filteredBookmarks = bookmarks;
  
  // Fetch the selected bookmark's details
  const { data: selectedBookmark } = useQuery<Bookmark>({
    queryKey: ['/api/bookmarks', selectedBookmarkId],
    queryFn: async () => {
      if (!selectedBookmarkId) return null;
      const data = await fetch(`/api/bookmarks/${selectedBookmarkId}`).then(res => res.json());
      return data;
    },
    enabled: !!selectedBookmarkId,
  });
  
  // Save sort preference in local storage
  const handleSortChange = (value: string) => {
    setSortOrder(value);
    localStorage.setItem('bookmarkFeedSortOrder', value);
  };
  
  // Handle selecting a bookmark (opens the detail panel)
  const handleSelectBookmark = (id: string) => {
    setSelectedBookmarkId(id);
    // Save the selected bookmark ID to session storage for persistence
    sessionStorage.setItem('lastSelectedBookmarkId', id);
  };
  
  // Handle closing the detail panel
  const handleCloseDetail = () => {
    setSelectedBookmarkId(null);
    // Remove the stored bookmark ID when deliberately closing
    sessionStorage.removeItem('lastSelectedBookmarkId');
  };
  
  // Handle viewing the collection in graph view
  const handleViewInGraph = useCallback(() => {
    if (collectionId) {
      // Dispatch event to filter the graph by collection
      const event = new CustomEvent('filterByCollection', {
        detail: { collectionId, collectionIds: [collectionId] }
      });
      window.dispatchEvent(event);
      
      // Navigate to graph view
      navigate('/graph');
    }
  }, [collectionId, navigate]);
  
  // Setup intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isLoading && !isFetchingNextPage) {
          loadMoreBookmarks();
        }
      },
      { 
        threshold: 0.1,
        rootMargin: '0px 0px 500px 0px', // Load more before reaching the end
      }
    );
    
    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }
    
    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current);
      }
    };
  }, [hasNextPage, isLoading, isFetchingNextPage, loadMoreBookmarks]);
  
  // Save view mode preference in local storage
  const toggleViewMode = () => {
    const newMode = viewMode === 'list' ? 'grid' : 'list';
    setViewMode(newMode);
    localStorage.setItem('bookmarkFeedViewMode', newMode);
  };
  
  // Check for no results
  const hasNoResults = !isLoading && filteredBookmarks.length === 0;
  
  // Restore selected bookmark from session storage on mount
  useEffect(() => {
    const savedBookmarkId = sessionStorage.getItem('lastSelectedBookmarkId');
    if (savedBookmarkId) {
      setSelectedBookmarkId(savedBookmarkId);
    }
  }, []);
  
  if (!match) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Collection Not Found</h2>
          <p className="text-gray-500 mb-4">The collection you're looking for doesn't exist.</p>
          <Button onClick={() => navigate("/")}>Return to Feed</Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header with controls */}
      <div className="flex-none px-4 py-3 sm:p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">
              {isCollectionLoading ? 'Loading collection...' : collection?.name || 'Collection'}
            </h1>
            {collection?.description && (
              <p className="text-sm text-gray-500 mt-1">{collection.description}</p>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-3 items-center">
            {/* Search input */}
            <div className="w-full flex-1 sm:max-w-md">
              <Input
                type="text"
                placeholder="Search in this collection..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            
            {/* View in Graph button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewInGraph}
                  className="flex items-center gap-1"
                >
                  <Network className="h-4 w-4" />
                  <span className="hidden sm:inline">Graph</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View in Graph</TooltipContent>
            </Tooltip>
            
            {/* Sort selector */}
            <Select value={sortOrder} onValueChange={handleSortChange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="recently_updated">Recently Updated</SelectItem>
              </SelectContent>
            </Select>
            
            {/* View mode toggle (list/grid) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={toggleViewMode}
                  title={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                >
                  {viewMode === 'list' ? <Grid className="h-4 w-4" /> : <List className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
      
      {/* Main content area */}
      <div className="flex-1 overflow-hidden p-4 sm:p-6">
        <div className="flex h-full gap-4">
          {/* Bookmarks grid/list */}
          <div className={`${selectedBookmarkId ? 'flex-1' : 'w-full'} overflow-y-auto`}>
            {isLoading ? (
              // Loading state
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, index) => (
                  <div 
                    key={index}
                    className="border border-gray-200 rounded-md p-4 h-[180px] animate-pulse"
                  >
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  </div>
                ))}
              </div>
            ) : hasNoResults ? (
              // No results state
              <div className="flex flex-col items-center justify-center h-full text-center">
                <SearchX className="h-16 w-16 text-gray-400 mb-4" />
                <h2 className="text-xl font-semibold mb-2">No bookmarks found</h2>
                <p className="text-gray-500 max-w-md">
                  {searchQuery 
                    ? `No bookmarks match "${searchQuery}" in this collection.` 
                    : "This collection doesn't have any bookmarks yet."}
                </p>
              </div>
            ) : (
              // Results view (grid or list)
              <div className={
                viewMode === 'grid' 
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10"
                  : "space-y-4 pb-10"
              }>
                {filteredBookmarks.map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    onSelect={() => handleSelectBookmark(bookmark.id)}
                    isSelected={selectedBookmarkId === bookmark.id}
                    viewMode={viewMode}
                  />
                ))}
                
                {/* Loading indicator for infinite scroll */}
                {(isFetchingNextPage || hasNextPage) && (
                  <div 
                    ref={loaderRef} 
                    className={viewMode === 'grid' ? "col-span-full" : ""}
                  >
                    <div className="flex justify-center py-4">
                      {isFetchingNextPage ? (
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <div className="h-1"></div> // Invisible element for intersection observer
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Details panel (when a bookmark is selected) */}
          {selectedBookmarkId && selectedBookmark && (
            <div className="hidden sm:block w-[400px] flex-shrink-0 border-l border-gray-200 overflow-y-auto">
              <BookmarkDetailPanel 
                bookmark={selectedBookmark} 
                onClose={handleCloseDetail} 
                onUpdate={() => refetch()}
              />
            </div>
          )}
          
          {/* Mobile details panel (opens as a modal when a bookmark is selected) */}
          {selectedBookmarkId && selectedBookmark && (
            <div className="sm:hidden fixed inset-0 z-50 bg-white overflow-y-auto">
              <BookmarkDetailPanel 
                bookmark={selectedBookmark} 
                onClose={handleCloseDetail} 
                onUpdate={() => refetch()}
                isMobile
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}