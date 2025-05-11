import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { BookmarkGrid } from "@/components/responsive-bookmark-grid";
import { BookmarkListView } from "@/components/bookmark-list-view";
import { ViewModeSwitcher } from "@/components/view-mode-switcher";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, Filter, Bookmark, X, Loader2, ArrowLeft } from "lucide-react";
import { usePaginatedBookmarks } from "@/hooks/use-paginated-bookmarks";
import { useCollections } from "@/hooks/use-collection-queries";
import { Bookmark as BookmarkType } from "@shared/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

// This component will display bookmarks from a specific collection
export default function CollectionPage() {
  // Get collection name from URL path
  const params = useParams<{ name: string }>();
  const collectionName = params.name;
  const [, setLocation] = useLocation();
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
  
  // State for the collection ID
  const [collectionId, setCollectionId] = useState<string | null>(null);
  
  // Ref for infinite scroll
  const loaderRef = useRef<HTMLDivElement>(null);
  
  // Fetch collections to find the collection ID from the name
  const { data: collections = [], isLoading: isLoadingCollections } = useCollections();
  
  // Find the collection ID based on the collection name in the URL
  useEffect(() => {
    if (collections.length > 0 && collectionName) {
      // Decode URI component in case the name was URL-encoded
      const decodedName = decodeURIComponent(collectionName);
      
      // Find collection that matches the name (case-insensitive)
      const collection = collections.find(col => 
        col.name.toLowerCase() === decodedName.toLowerCase()
      );
      
      if (collection) {
        setCollectionId(collection.id);
      } else {
        // If collection not found, show error and redirect to feed
        toast({
          title: "Collection not found",
          description: `No collection found with name "${decodedName}"`,
          variant: "destructive"
        });
        setLocation("/feed");
      }
    }
  }, [collections, collectionName, toast, setLocation]);
  
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
    sortOrder as 'newest' | 'oldest' | 'recently_updated' | 'created_newest', 
    debouncedSearchQuery,
    collectionId // Pass the collection ID to filter bookmarks
  );
  
  // Function to handle bookmark selection
  const handleSelectBookmark = (id: string) => {
    setSelectedBookmarkId(id === selectedBookmarkId ? null : id);
  };
  
  // Function to handle view mode change
  const handleViewModeChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('bookmarkFeedViewMode', mode);
  };
  
  // Function to handle sort order change
  const handleSortChange = (value: string) => {
    setSortOrder(value);
    localStorage.setItem('bookmarkFeedSortOrder', value);
  };
  
  // Handle clearing the search input
  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };
  
  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (!loaderRef.current || isLoading) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          loadMoreBookmarks();
        }
      },
      { threshold: 0.1 }
    );
    
    observer.observe(loaderRef.current);
    
    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current);
      }
    };
  }, [isLoading, hasNextPage, isFetchingNextPage, loadMoreBookmarks]);
  
  // Handle bookmark details panel close
  const handleDetailsClose = useCallback(() => {
    setSelectedBookmarkId(null);
  }, []);
  
  // Get the collection object for the current collection ID
  const collection = collections.find(col => col.id === collectionId);
  
  // Handle navigation back to feed
  const handleBackToFeed = () => {
    setLocation("/feed");
  };
  
  return (
    <ResizablePanelGroup direction="horizontal" className="min-h-[calc(100vh-65px)]">
      {/* Main content panel */}
      <ResizablePanel defaultSize={selectedBookmarkId ? 60 : 100} minSize={30} className="flex flex-col">
        {/* Header */}
        <div className="border-b p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleBackToFeed}
                className="hover:bg-slate-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold">
                {collection ? collection.name : 'Loading collection...'}
              </h1>
            </div>
            {collection && collection.description && (
              <p className="text-muted-foreground">{collection.description}</p>
            )}
            {/* Search and filters */}
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search all bookmarks..."
                  className="pl-8 pr-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1.5 h-7 w-7"
                    onClick={handleClearSearch}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ViewModeSwitcher
                  onViewModeChange={handleViewModeChange}
                  initialViewMode={viewMode}
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
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto flex flex-col h-full">
          <div className="flex-grow">
            {viewMode === 'list' ? (
              <BookmarkListView 
                bookmarks={bookmarks}
                selectedBookmarkId={selectedBookmarkId}
                onSelectBookmark={handleSelectBookmark}
                isLoading={isLoading || isLoadingCollections}
              />
            ) : (
              <BookmarkGrid 
                bookmarks={bookmarks}
                selectedBookmarkId={selectedBookmarkId}
                onSelectBookmark={handleSelectBookmark}
                isLoading={isLoading || isLoadingCollections}
              />
            )}
          </div>
          
          {/* Infinite scroll loader */}
          {hasNextPage && (
            <div ref={loaderRef} className="flex justify-center py-4">
              {isFetchingNextPage ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading more...</span>
                </div>
              ) : (
                <div className="h-10" />
              )}
            </div>
          )}
        </div>
      </ResizablePanel>
      
      {/* Bookmark detail panel - only render if a bookmark is selected */}
      {selectedBookmarkId && (
        <>
          <ResizableHandle />
          <ResizablePanel defaultSize={40} minSize={25} maxSize={60}>
            <BookmarkDetailPanel
              bookmarkId={selectedBookmarkId}
              onClose={handleDetailsClose}
              onUpdate={refetch}
            />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}