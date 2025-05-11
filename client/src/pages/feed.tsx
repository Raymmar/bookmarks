import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { BookmarkGrid } from "@/components/responsive-bookmark-grid";
import { BookmarkListView } from "@/components/bookmark-list-view";
import { ViewModeSwitcher } from "@/components/view-mode-switcher";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, Filter, Bookmark, X } from "lucide-react";
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
  
  // Debounce search input to prevent too many requests
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    
    return () => clearTimeout(timerId);
  }, [searchQuery]);
  
  // Fetch paginated bookmarks
  const {
    bookmarks,
    isLoading,
    page,
    totalPages,
    setPage,
    hasNextPage,
    hasPreviousPage,
    goToNextPage,
    goToPreviousPage
  } = usePaginatedBookmarks(50, sortOrder as 'newest' | 'oldest' | 'recently_updated');
  
  // Filter bookmarks by search query
  const filteredBookmarks = debouncedSearchQuery
    ? bookmarks.filter(bookmark => 
        bookmark.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        (bookmark.description && bookmark.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase())) ||
        bookmark.url.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      )
    : bookmarks;
  
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
  
  // Restore selected bookmark when component mounts
  useEffect(() => {
    const lastSelectedId = sessionStorage.getItem('lastSelectedBookmarkId');
    if (lastSelectedId) {
      setSelectedBookmarkId(lastSelectedId);
    }
  }, []);

  return (
    <div className="h-full bg-gray-50">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={70} minSize={50}>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b">
              <h1 className="text-xl font-semibold">Recent Bookmarks</h1>
              <div className="flex space-x-2">
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
            
            {/* Search */}
            <div className="flex items-center p-4 border-b">
              <div className="relative flex-1">
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
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto">
              {viewMode === 'list' ? (
                <BookmarkListView 
                  bookmarks={filteredBookmarks}
                  selectedBookmarkId={selectedBookmarkId}
                  onSelectBookmark={handleSelectBookmark}
                  isLoading={isLoading}
                />
              ) : (
                <BookmarkGrid 
                  bookmarks={filteredBookmarks}
                  selectedBookmarkId={selectedBookmarkId}
                  onSelectBookmark={handleSelectBookmark}
                  isLoading={isLoading}
                />
              )}
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center p-4 border-t">
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPreviousPage}
                    disabled={!hasPreviousPage}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center space-x-1">
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNextPage}
                    disabled={!hasNextPage}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={30} minSize={25}>
          {selectedBookmarkId && selectedBookmark ? (
            <BookmarkDetailPanel
              bookmark={selectedBookmark}
              onClose={handleCloseDetail}
            />
          ) : (
            <div className="flex flex-col h-full items-center justify-center p-6 text-center bg-gray-50 border-l">
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