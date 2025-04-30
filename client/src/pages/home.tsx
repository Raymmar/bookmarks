import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCard } from "@/components/bookmark-card";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { ForceDirectedGraph } from "@/components/force-directed-graph";
import { ActivityFeed } from "@/components/activity-feed";
import { SearchX, Grid, List, Network, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCollections } from "@/hooks/use-collection-queries";
import { Bookmark } from "@shared/types";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<string>(() => {
    const savedViewMode = localStorage.getItem('bookmarkViewMode');
    return savedViewMode || "cards";
  });
  const [sortOrder, setSortOrder] = useState<string>(() => {
    const savedSort = localStorage.getItem('bookmarkSortOrder');
    return savedSort || "newest";
  });
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [insightLevel, setInsightLevel] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 25; // Number of bookmarks to load per batch
  const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Initial bookmarks query with pagination metadata
  const { data: initialBookmarksData, isLoading } = useQuery({
    queryKey: ["/api/bookmarks", { page: currentPage, pageSize, includeTotal: true }],
    queryFn: async ({ queryKey }) => {
      // Extract parameters from queryKey to ensure they match
      const [_, params] = queryKey;
      const { page, pageSize, includeTotal } = params as { page: number, pageSize: number, includeTotal: boolean };
      
      // Use the extracted parameters to build the URL
      const data = await apiRequest(
        'GET', 
        `/api/bookmarks?page=${page}&pageSize=${pageSize}&includeTotal=${includeTotal}`
      );
      return data;
    }
  });

  // Effect to update our state with the initial bookmarks
  useEffect(() => {
    if (initialBookmarksData) {
      // Handle both response formats (array or pagination object)
      if (Array.isArray(initialBookmarksData)) {
        setAllBookmarks(initialBookmarksData);
        // If we got fewer items than the page size, there are no more
        setHasMore(initialBookmarksData.length >= pageSize);
      } else if (initialBookmarksData.data && Array.isArray(initialBookmarksData.data)) {
        setAllBookmarks(initialBookmarksData.data);
        const pagination = initialBookmarksData.pagination;
        if (pagination) {
          // Use hasNextPage from the server if available
          if (typeof pagination.hasNextPage === 'boolean') {
            setHasMore(pagination.hasNextPage);
          } else if (pagination.totalPages) {
            setHasMore(currentPage < pagination.totalPages);
          }
        }
      } else {
        console.error("Unexpected response format for initial bookmarks:", initialBookmarksData);
      }
    }
  }, [initialBookmarksData, currentPage, pageSize]);

  // Function to load more bookmarks
  const loadMoreBookmarks = async () => {
    if (isLoadingMore || !hasMore) return;
    
    try {
      setIsLoadingMore(true);
      const nextPage = currentPage + 1;
      const nextPageData = await apiRequest('GET', `/api/bookmarks?page=${nextPage}&pageSize=${pageSize}&includeTotal=true`);
      
      // Handle the response based on its format (regular array or pagination object)
      let newBookmarks: Bookmark[] = [];
      
      if (Array.isArray(nextPageData)) {
        // The API returned a plain array of bookmarks
        newBookmarks = nextPageData;
        
        // Check if we've reached the end (fewer items than pageSize)
        if (newBookmarks.length < pageSize) {
          setHasMore(false);
        }
      } else if (nextPageData.data && Array.isArray(nextPageData.data)) {
        // The API returned a pagination object
        newBookmarks = nextPageData.data;
        
        // Check pagination metadata
        if (nextPageData.pagination) {
          // Use hasNextPage from the server if available
          if (typeof nextPageData.pagination.hasNextPage === 'boolean') {
            setHasMore(nextPageData.pagination.hasNextPage);
          } else if (nextPageData.pagination.totalPages) {
            setHasMore(nextPage < nextPageData.pagination.totalPages);
          }
        }
      } else {
        console.error("Unexpected response format:", nextPageData);
        throw new Error("Unexpected response format");
      }
      
      // Add the new bookmarks to our state
      setAllBookmarks(prev => [...prev, ...newBookmarks]);
      setCurrentPage(nextPage);
      
    } catch (error) {
      console.error("Error loading more bookmarks:", error);
      toast({
        title: "Error",
        description: "Failed to load more bookmarks. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Effect to implement infinite scrolling
  useEffect(() => {
    const handleScroll = () => {
      // Check if user has scrolled to the bottom of the page
      if (
        window.innerHeight + document.documentElement.scrollTop >= 
        document.documentElement.offsetHeight - 500 && 
        hasMore && 
        !isLoadingMore
      ) {
        loadMoreBookmarks();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, isLoadingMore]);

  const { data: activities = [], isLoading: isActivitiesLoading } = useQuery({
    queryKey: ["/api/activities"],
  });

  const selectedBookmark = allBookmarks.find(b => b.id === selectedBookmarkId);

  const filteredBookmarks = allBookmarks.filter(bookmark => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    return (
      bookmark.title.toLowerCase().includes(searchLower) ||
      bookmark.description?.toLowerCase().includes(searchLower) ||
      bookmark.url.toLowerCase().includes(searchLower) ||
      (bookmark as any).user_tags?.some((tag: string) => tag.toLowerCase().includes(searchLower)) ||
      (bookmark as any).system_tags?.some((tag: string) => tag.toLowerCase().includes(searchLower))
    );
  });

  const sortedBookmarks = [...filteredBookmarks].sort((a, b) => {
    if (sortOrder === "newest") {
      // Sort by date saved (bookmark creation date)
      return new Date(b.date_saved).getTime() - new Date(a.date_saved).getTime();
    } else if (sortOrder === "oldest") {
      // Sort by date saved (bookmark creation date)
      return new Date(a.date_saved).getTime() - new Date(b.date_saved).getTime();
    } else if (sortOrder === "created_newest") {
      // Sort by creation date (content creation date)
      const aDate = a.created_at ? new Date(a.created_at).getTime() : new Date(a.date_saved).getTime();
      const bDate = b.created_at ? new Date(b.created_at).getTime() : new Date(b.date_saved).getTime();
      return bDate - aDate;
    } else if (sortOrder === "created_oldest") {
      // Sort by creation date (content creation date)
      const aDate = a.created_at ? new Date(a.created_at).getTime() : new Date(a.date_saved).getTime();
      const bDate = b.created_at ? new Date(b.created_at).getTime() : new Date(b.date_saved).getTime();
      return aDate - bDate;
    } else if (sortOrder === "updated_newest") {
      // Sort by updated_at timestamp
      const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : new Date(a.date_saved).getTime();
      const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : new Date(b.date_saved).getTime();
      return bUpdated - aUpdated;
    }
    return 0;
  });

  const handleDeleteBookmark = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/bookmarks/${id}`, undefined);
      
      toast({
        title: "Bookmark deleted",
        description: "Your bookmark was successfully deleted",
      });
      
      // Invalidate all bookmark queries (including paginated ones)
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          query.queryKey[0] === "/api/bookmarks" 
      });
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
    <div className="flex-1 flex flex-col">
      {/* Search & Controls */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
          <div className="relative flex-1 max-w-2xl">
            <Input
              type="text"
              placeholder="Search bookmarks, content, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2"
            />
            <SearchX className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Select value={viewMode} onValueChange={(value) => {
                // Persist view mode to localStorage
                localStorage.setItem('bookmarkViewMode', value);
                setViewMode(value);
              }}>
                <SelectTrigger className="pl-3 pr-8 py-2">
                  <SelectValue placeholder="View mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cards">
                    <span className="flex items-center">
                      <Grid className="h-4 w-4 mr-2" />
                      Cards
                    </span>
                  </SelectItem>
                  <SelectItem value="list">
                    <span className="flex items-center">
                      <List className="h-4 w-4 mr-2" />
                      List
                    </span>
                  </SelectItem>
                  <SelectItem value="graph">
                    <span className="flex items-center">
                      <Network className="h-4 w-4 mr-2" />
                      Graph
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="relative">
              <Select value={sortOrder} onValueChange={(value) => {
                // Persist sort order to localStorage
                localStorage.setItem('bookmarkSortOrder', value);
                setSortOrder(value);
              }}>
                <SelectTrigger className="pl-3 pr-8 py-2">
                  <SelectValue placeholder="Sort order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Sort: Newest Saved</SelectItem>
                  <SelectItem value="oldest">Sort: Oldest Saved</SelectItem>
                  <SelectItem value="created_newest">Sort: Newest Created</SelectItem>
                  <SelectItem value="created_oldest">Sort: Oldest Created</SelectItem>
                  <SelectItem value="updated_newest">Sort: Recently Updated</SelectItem>
                  <SelectItem value="relevant">Sort: Most Relevant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-4 pb-20 bg-gray-50 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading bookmarks...</p>
          </div>
        ) : sortedBookmarks.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <SearchX className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No bookmarks found</h3>
            <p className="text-gray-500">
              {searchQuery 
                ? "Try using different search terms or filters" 
                : "Start by adding your first bookmark"}
            </p>
          </div>
        ) : (
          <>
            <Tabs value={viewMode} onValueChange={(value) => {
              // Persist view mode to localStorage
              localStorage.setItem('bookmarkViewMode', value);
              setViewMode(value);
            }} className="space-y-4">
              <div className="hidden">
                <TabsList>
                  <TabsTrigger value="cards">Cards</TabsTrigger>
                  <TabsTrigger value="list">List</TabsTrigger>
                  <TabsTrigger value="graph">Graph</TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="cards" className="space-y-8 mt-0">
                {/* Card View */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Bookmarks</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedBookmarks.map((bookmark) => (
                      <BookmarkCard
                        key={bookmark.id}
                        bookmark={bookmark}
                        onEdit={() => setSelectedBookmarkId(bookmark.id)}
                        onDelete={handleDeleteBookmark}
                      />
                    ))}
                  </div>
                  
                  {/* Loading indicator for more bookmarks */}
                  {isLoadingMore && (
                    <div className="mt-8 p-4 text-center">
                      <div className="h-6 w-6 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
                      <p className="mt-2 text-sm text-gray-600">Loading more bookmarks...</p>
                    </div>
                  )}
                  
                  {/* Load more button if needed */}
                  {hasMore && !isLoadingMore && (
                    <div className="mt-8 text-center">
                      <Button 
                        variant="outline" 
                        onClick={loadMoreBookmarks}
                        className="mx-auto"
                      >
                        Load More Bookmarks
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="list" className="space-y-8 mt-0">
                {/* List View */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Bookmarks List</h2>
                  
                  <div className="space-y-2">
                    {sortedBookmarks.map((bookmark) => (
                      <div key={bookmark.id} className="bg-white p-3 rounded-lg border border-gray-200 flex justify-between items-center">
                        <div>
                          <h3 className="font-medium">{bookmark.title}</h3>
                          <p className="text-sm text-gray-500 truncate">{bookmark.url}</p>
                        </div>
                        <div className="flex space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedBookmarkId(bookmark.id)}
                          >
                            View
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDeleteBookmark(bookmark.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    {/* Loading indicator for more bookmarks */}
                    {isLoadingMore && (
                      <div className="mt-8 p-4 text-center">
                        <div className="h-6 w-6 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
                        <p className="mt-2 text-sm text-gray-600">Loading more bookmarks...</p>
                      </div>
                    )}
                    
                    {/* Load more button if needed */}
                    {hasMore && !isLoadingMore && (
                      <div className="mt-8 text-center">
                        <Button 
                          variant="outline" 
                          onClick={loadMoreBookmarks}
                          className="mx-auto"
                        >
                          Load More Bookmarks
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="graph" className="space-y-8 mt-0">
                {/* Graph View */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Knowledge Graph</h2>
                    <div className="flex items-center space-x-3">
                      <Select value={String(insightLevel)} onValueChange={(value) => setInsightLevel(parseInt(value))}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Insight depth" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">L1: On-page content</SelectItem>
                          <SelectItem value="2">L2: One-click away</SelectItem>
                          <SelectItem value="3">L3: Multi-layered</SelectItem>
                          <SelectItem value="4">L4: Research sweep</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="h-80 border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <ForceDirectedGraph 
                      bookmarks={sortedBookmarks} 
                      insightLevel={insightLevel}
                      onNodeClick={(id) => setSelectedBookmarkId(id)}
                    />
                  </div>
                  
                  {/* Loading indicator for more bookmarks */}
                  {isLoadingMore && (
                    <div className="mt-8 p-4 text-center">
                      <div className="h-6 w-6 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
                      <p className="mt-2 text-sm text-gray-600">Loading more bookmarks...</p>
                    </div>
                  )}
                  
                  {/* Load more button if needed */}
                  {hasMore && !isLoadingMore && (
                    <div className="mt-8 text-center">
                      <Button 
                        variant="outline" 
                        onClick={loadMoreBookmarks}
                        className="mx-auto"
                      >
                        Load More Bookmarks
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            

          </>
        )}
      </div>
    </div>
  );
}
