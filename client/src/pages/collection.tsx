import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { BookmarkGrid } from "@/components/responsive-bookmark-grid";
import { BookmarkListView } from "@/components/bookmark-list-view";
import { ViewModeSwitcher } from "@/components/view-mode-switcher";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, Filter, Bookmark, X, Loader2, FolderOpen } from "lucide-react";
import { usePaginatedBookmarks } from "@/hooks/use-paginated-bookmarks";
import { useCollections } from "@/hooks/use-collection-queries";
import { Bookmark as BookmarkType } from "@shared/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { createUrlSlug } from "@/lib/utils";

export default function CollectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get the collection slug from the URL
  const [, params] = useRoute<{ name: string }>("/collection/:name");
  const collectionSlug = params?.name || "";
  
  // Get all collections to find the one matching the URL slug
  const { data: collections = [], isLoading: collectionsLoading } = useCollections();
  
  // Find the collection by comparing the URL slug to the slug version of each collection name
  const collection = collections.find(
    c => createUrlSlug(c.name) === collectionSlug
  );
  
  // State for the selected bookmark
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  
  // State for view mode (list or grid)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    const savedViewMode = localStorage.getItem('bookmarkCollectionViewMode');
    return (savedViewMode === 'list' || savedViewMode === 'grid') ? savedViewMode : 'list';
  });
  
  // State for sorting
  const [sortOrder, setSortOrder] = useState<string>(() => {
    const savedSort = localStorage.getItem('bookmarkCollectionSortOrder');
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
    collection?.id || null
  );
  
  // Fetch the selected bookmark's details using the consolidated endpoint
  const { data: detailsData, isLoading: isLoadingBookmark } = useQuery({
    queryKey: ['/api/bookmarks/details', selectedBookmarkId],
    queryFn: async () => {
      if (!selectedBookmarkId) return null;
      const response = await fetch(`/api/bookmarks/${selectedBookmarkId}/details`);
      if (!response.ok) {
        throw new Error('Failed to fetch bookmark details');
      }
      return response.json();
    },
    enabled: !!selectedBookmarkId,
    staleTime: 60 * 1000, // Cache is fresh for 1 minute
  });
  
  // Extract the bookmark from the detailed data
  const selectedBookmark = detailsData?.bookmark;
  
  // Save view mode preference in local storage
  const handleViewModeChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('bookmarkCollectionViewMode', mode);
  };
  
  // Save sort preference in local storage
  const handleSortChange = (value: string) => {
    setSortOrder(value);
    localStorage.setItem('bookmarkCollectionSortOrder', value);
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
        rootMargin: '200px 0px' // Start loading more content before user fully reaches the bottom
      }
    );
    
    const currentLoaderRef = loaderRef.current;
    if (currentLoaderRef) {
      observer.observe(currentLoaderRef);
    }
    
    return () => {
      if (currentLoaderRef) {
        observer.unobserve(currentLoaderRef);
      }
    };
  }, [hasNextPage, isLoading, isFetchingNextPage, loadMoreBookmarks]);
  
  // State for tracking deleted bookmarks
  const [deletedBookmarkIds, setDeletedBookmarkIds] = useState<Set<string>>(new Set());

  // Listen for bookmark deletion events with true optimistic UI updates
  useEffect(() => {
    const handleBookmarkDeleted = (e: Event) => {
      // Cast to CustomEvent with the expected detail type
      const event = e as CustomEvent<{bookmarkId: string}>;
      const deletedId = event.detail?.bookmarkId;
      
      if (deletedId) {
        console.log(`Bookmark deleted event received in collection view for ID: ${deletedId}`);
        
        // If the deleted bookmark is the currently selected one, clear selection
        if (deletedId === selectedBookmarkId) {
          setSelectedBookmarkId(null);
        }
        
        // Add to our local set of deleted IDs - this filters the UI immediately
        setDeletedBookmarkIds(prev => {
          const newSet = new Set(prev);
          newSet.add(deletedId);
          return newSet; 
        });
        
        // Update the React Query cache optimistically - use the correct query key for collections
        const queryKey = ['/api/bookmarks', { collectionId: collection?.id }];
        queryClient.setQueryData(queryKey, (oldData: any) => {
          if (Array.isArray(oldData)) {
            return oldData.filter(b => b.id !== deletedId);
          }
          return oldData;
        });
        
        // Also update the main bookmarks query which might be used elsewhere
        queryClient.setQueryData(['/api/bookmarks'], (oldData: any) => {
          if (Array.isArray(oldData)) {
            return oldData.filter(b => b.id !== deletedId);
          }
          return oldData;
        });
        
        // Invalidate the specific bookmark endpoint to avoid stale data
        queryClient.invalidateQueries({ queryKey: ["/api/bookmarks", deletedId] });
        
        // Also refresh in the background to ensure we're in sync
        setTimeout(() => {
          refetch();
        }, 500);
      }
    };
    
    // Add event listener for bookmark deletion
    window.addEventListener('bookmarkDeleted', handleBookmarkDeleted);
    
    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('bookmarkDeleted', handleBookmarkDeleted);
    };
  }, [selectedBookmarkId, refetch, collection, queryClient]);
  
  // Filter bookmarks to exclude deleted ones
  const filteredBookmarks = bookmarks.filter(b => !deletedBookmarkIds.has(b.id));

  // Show a message if collection not found
  if (!collectionsLoading && !collection) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 p-8">
        <FolderOpen className="h-16 w-16 text-gray-300 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Collection not found</h2>
        <p className="text-gray-500 mb-4 text-center">
          The collection "{collectionSlug}" could not be found or you don't have permission to view it.
        </p>
        <Button asChild>
          <a href="/feed">Back to Feed</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-gray-50">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={70} minSize={50} className="h-full">
          <div className="flex flex-col h-full w-full">
            {/* Header with collection title and search */}
            <div className="border-b">
              <div className="flex justify-between items-center p-3">
                <div className="relative flex-1 mr-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    className="pl-9" 
                    placeholder="Search in collection..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground hover:text-foreground"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex space-x-2 flex-shrink-0">
                  <ViewModeSwitcher
                    initialViewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                  />
                  <Select
                    value={sortOrder}
                    onValueChange={handleSortChange}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Date Saved (Newest)</SelectItem>
                      <SelectItem value="oldest">Date Saved (Oldest)</SelectItem>
                      <SelectItem value="recently_updated">Recently Updated</SelectItem>
                      <SelectItem value="created_newest">Date Created (Newest)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto flex flex-col h-full">
              <div className="px-4 py-3">
                <h1 className="text-xl font-bold truncate">
                  {collection?.name || "Loading..."}
                </h1>
                {collection?.description && (
                  <p className="text-sm text-gray-500 mt-1">{collection.description}</p>
                )}
              </div>
              <div className="flex-grow">
                {viewMode === 'list' ? (
                  <BookmarkListView 
                    bookmarks={filteredBookmarks}
                    selectedBookmarkId={selectedBookmarkId}
                    onSelectBookmark={handleSelectBookmark}
                    isLoading={isLoading || collectionsLoading}
                  />
                ) : (
                  <BookmarkGrid 
                    bookmarks={filteredBookmarks}
                    selectedBookmarkId={selectedBookmarkId}
                    onSelectBookmark={handleSelectBookmark}
                    isLoading={isLoading || collectionsLoading}
                  />
                )}
              </div>
              
              {/* Footer area with loading status and intersection observer target */}
              <div className="min-h-[60px] w-full">
                {/* Loading indicator that appears after content */}
                {isFetchingNextPage && (
                  <div className="flex justify-center items-center py-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading more bookmarks...</span>
                    </div>
                  </div>
                )}
                
                {/* Intersection observer target positioned at the bottom */}
                {hasNextPage && (
                  <div 
                    ref={loaderRef} 
                    className="w-full"
                    style={{ height: '5px' }} // Small height element at the bottom of the list
                  />
                )}
              </div>
            </div>
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={30} minSize={30} className="min-w-[420px] h-full">
          {selectedBookmarkId ? (
            isLoadingBookmark ? (
              // Loading state for bookmark details
              <div className="flex flex-col h-full">
                <div className="h-16 p-4 border-b border-gray-200 flex items-center sticky top-0 bg-white z-10">
                  <div className="flex w-full items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-800">Detail View</h2>
                    <Button variant="ghost" size="icon" onClick={handleCloseDetail}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading bookmark details...</p>
                  </div>
                </div>
              </div>
            ) : (
              // Bookmark details panel
              <BookmarkDetailPanel
                bookmark={selectedBookmark}
                onClose={handleCloseDetail}
              />
            )
          ) : (
            // Empty state (only shown when no bookmark is selected)
            <div className="flex flex-col h-full w-full items-center justify-center p-6 text-center bg-gray-50 border-l">
              <Bookmark className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium mb-2">No bookmark selected</h3>
              <p className="text-sm text-gray-500 mb-4">
                Select a bookmark from the collection to view its details.
              </p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}