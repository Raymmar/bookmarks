import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { BookmarkGrid } from "@/components/responsive-bookmark-grid";
import { BookmarkListView } from "@/components/bookmark-list-view";
import { ViewModeSwitcher } from "@/components/view-mode-switcher";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, Filter, Bookmark, X, Loader2 } from "lucide-react";
import { usePaginatedBookmarks } from "@/hooks/use-paginated-bookmarks";
import { Bookmark as BookmarkType } from "@shared/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function Feed() {
  const { user } = useAuth();
  const { toast } = useToast();
  
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
  } = usePaginatedBookmarks(50, sortOrder as 'newest' | 'oldest' | 'recently_updated', debouncedSearchQuery);
  
  // Use bookmarks directly as they are now filtered on the server
  const filteredBookmarks = bookmarks;
  
  // Fetch the selected bookmark's details
  const { data: selectedBookmark } = useQuery<BookmarkType>({
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

  return (
    <div className="h-full w-full bg-gray-50">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={70} minSize={50} className="h-full">
          <div className="flex flex-col h-full w-full">
            {/* Header with integrated search */}
            <div className="flex justify-between items-center p-3 border-b">
              <div className="relative flex-1 mr-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  className="pl-9" 
                  placeholder="Search bookmarks..." 
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
                  onViewModeChange={setViewMode}
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
            
            {/* Content */}
            <div className="flex-1 overflow-auto flex flex-col h-full">
              {viewMode === 'list' ? (
                <BookmarkListView 
                  bookmarks={filteredBookmarks}
                  selectedBookmarkId={selectedBookmarkId}
                  onSelectBookmark={handleSelectBookmark}
                  isLoading={isLoading}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  loaderRef={loaderRef}
                />
              ) : (
                <BookmarkGrid 
                  bookmarks={filteredBookmarks}
                  selectedBookmarkId={selectedBookmarkId}
                  onSelectBookmark={handleSelectBookmark}
                  isLoading={isLoading}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  loaderRef={loaderRef}
                />
              )}
            </div>
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={30} minSize={30} className="min-w-[420px] h-full">
          {selectedBookmarkId && selectedBookmark ? (
            <BookmarkDetailPanel
              bookmark={selectedBookmark}
              onClose={handleCloseDetail}
            />
          ) : (
            <div className="flex flex-col h-full w-full items-center justify-center p-6 text-center bg-gray-50 border-l">
              <Bookmark className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium mb-2">No bookmark selected</h3>
              <p className="text-sm text-gray-500 mb-4">
                Select a bookmark from the list to view its details.
              </p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}