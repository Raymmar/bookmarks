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
  const [viewMode, setViewMode] = useState("cards");
  const [sortOrder, setSortOrder] = useState("newest");
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [insightLevel, setInsightLevel] = useState(1);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Fetch collections
  const { data: collections = [], isLoading: collectionsLoading } = useCollections();
  
  // Listen for collection filter events from the sidebar
  useEffect(() => {
    const handleFilterByCollection = (event: any) => {
      if (event.detail && 'collectionId' in event.detail) {
        setSelectedCollectionId(event.detail.collectionId);
      }
    };
    
    window.addEventListener('filterByCollection', handleFilterByCollection);
    return () => {
      window.removeEventListener('filterByCollection', handleFilterByCollection);
    };
  }, []);

  const { data: bookmarks = [], isLoading } = useQuery<Bookmark[]>({
    queryKey: ["/api/bookmarks"],
  });

  const { data: activities = [], isLoading: isActivitiesLoading } = useQuery({
    queryKey: ["/api/activities"],
  });

  const selectedBookmark = bookmarks.find(b => b.id === selectedBookmarkId);

  // Get bookmarks in the selected collection directly from the API
  const { data: bookmarksInCollection = [], isLoading: isCollectionBookmarksLoading } = useQuery({
    queryKey: ['/api/collections/bookmarks', selectedCollectionId],
    queryFn: async () => {
      if (!selectedCollectionId) return [];
      // Get complete bookmark objects directly
      const result = await apiRequest('GET', `/api/collections/${selectedCollectionId}/bookmarks`);
      // Map the bookmark_ids to the actual bookmark objects
      const bookmarkIds = result.map((item: any) => item.bookmark_id);
      return bookmarks.filter(bookmark => bookmarkIds.includes(bookmark.id));
    },
    enabled: !!selectedCollectionId
  });
  
  // Choose which bookmarks to display based on whether a collection is selected
  const bookmarksToFilter = selectedCollectionId ? bookmarksInCollection : bookmarks;
  
  // Log for debugging
  useEffect(() => {
    if (selectedCollectionId) {
      console.log(`Filtering for collection ${selectedCollectionId}: ${bookmarksInCollection.length} bookmarks found`);
    }
  }, [selectedCollectionId, bookmarksInCollection]);
  
  // Filter bookmarks by search query
  const filteredBookmarks = bookmarksToFilter.filter(bookmark => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    return (
      bookmark.title.toLowerCase().includes(searchLower) ||
      bookmark.description?.toLowerCase().includes(searchLower) ||
      bookmark.url.toLowerCase().includes(searchLower) ||
      bookmark.user_tags?.some(tag => tag.toLowerCase().includes(searchLower)) ||
      bookmark.system_tags?.some(tag => tag.toLowerCase().includes(searchLower))
    );
  });

  const sortedBookmarks = [...filteredBookmarks].sort((a, b) => {
    if (sortOrder === "newest") {
      return new Date(b.date_saved).getTime() - new Date(a.date_saved).getTime();
    } else if (sortOrder === "oldest") {
      return new Date(a.date_saved).getTime() - new Date(b.date_saved).getTime();
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
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      
      // If we're in a collection view, also invalidate the collection bookmarks
      if (selectedCollectionId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/collections/bookmarks', selectedCollectionId] 
        });
      }
      
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
              <Select value={viewMode} onValueChange={setViewMode}>
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
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="pl-3 pr-8 py-2">
                  <SelectValue placeholder="Sort order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Sort: Newest</SelectItem>
                  <SelectItem value="oldest">Sort: Oldest</SelectItem>
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
            <Tabs value={viewMode} onValueChange={setViewMode} className="space-y-4">
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
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">
                      {selectedCollectionId 
                        ? 'Collection: ' + (collections.find(c => c.id === selectedCollectionId)?.name || 'Loading...')
                        : 'All Bookmarks'}
                    </h2>
                    
                    {/* Show clear filter button when a collection is selected */}
                    {selectedCollectionId && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setSelectedCollectionId(null);
                          // Dispatch event to clear the selection in sidebar
                          window.dispatchEvent(new CustomEvent('filterByCollection', { 
                            detail: { collectionId: null } 
                          }));
                        }}
                        className="text-xs"
                      >
                        Clear Collection Filter
                      </Button>
                    )}
                  </div>
                  
                  {selectedCollectionId && (
                    <div className="mb-4">
                      <Badge 
                        variant="outline" 
                        className="flex items-center gap-1 bg-primary/10 text-primary border-primary/30"
                      >
                        <FolderOpen className="h-3 w-3" />
                        {collections.find(c => c.id === selectedCollectionId)?.name || 'Collection'}
                        {collections.find(c => c.id === selectedCollectionId)?.is_public === false && 
                          <span className="text-xs text-gray-500">(Private)</span>
                        }
                      </Badge>
                    </div>
                  )}
                  
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
                </div>
              </TabsContent>
              
              <TabsContent value="list" className="space-y-8 mt-0">
                {/* List View */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">
                      {selectedCollectionId 
                        ? 'Collection: ' + (collections.find(c => c.id === selectedCollectionId)?.name || 'Loading...')
                        : 'All Bookmarks'}
                    </h2>
                    
                    {/* Show clear filter button when a collection is selected */}
                    {selectedCollectionId && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setSelectedCollectionId(null);
                          // Dispatch event to clear the selection in sidebar
                          window.dispatchEvent(new CustomEvent('filterByCollection', { 
                            detail: { collectionId: null } 
                          }));
                        }}
                        className="text-xs"
                      >
                        Clear Collection Filter
                      </Button>
                    )}
                  </div>
                  
                  {selectedCollectionId && (
                    <div className="mb-4">
                      <Badge 
                        variant="outline" 
                        className="flex items-center gap-1 bg-primary/10 text-primary border-primary/30"
                      >
                        <FolderOpen className="h-3 w-3" />
                        {collections.find(c => c.id === selectedCollectionId)?.name || 'Collection'}
                        {collections.find(c => c.id === selectedCollectionId)?.is_public === false && 
                          <span className="text-xs text-gray-500">(Private)</span>
                        }
                      </Badge>
                    </div>
                  )}
                  
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
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="graph" className="space-y-8 mt-0">
                {/* Graph View */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">
                      {selectedCollectionId 
                        ? 'Collection Graph: ' + (collections.find(c => c.id === selectedCollectionId)?.name || 'Loading...')
                        : 'Knowledge Graph'}
                    </h2>
                    <div className="flex items-center space-x-3">
                      {/* Show clear filter button when a collection is selected */}
                      {selectedCollectionId && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedCollectionId(null);
                            // Dispatch event to clear the selection in sidebar
                            window.dispatchEvent(new CustomEvent('filterByCollection', { 
                              detail: { collectionId: null } 
                            }));
                          }}
                          className="text-xs"
                        >
                          Show All Bookmarks
                        </Button>
                      )}
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
                  
                  {selectedCollectionId && (
                    <div className="mb-4">
                      <Badge 
                        variant="outline" 
                        className="flex items-center gap-1 bg-primary/10 text-primary border-primary/30"
                      >
                        <FolderOpen className="h-3 w-3" />
                        {collections.find(c => c.id === selectedCollectionId)?.name || 'Collection'}
                        {collections.find(c => c.id === selectedCollectionId)?.is_public === false && 
                          <span className="text-xs text-gray-500">(Private)</span>
                        }
                      </Badge>
                    </div>
                  )}
                  
                  <div className="h-80 border border-gray-200 rounded-lg overflow-hidden bg-white">
                    {/* Add a key based on the collection ID to force re-render of the graph */}
                    <ForceDirectedGraph 
                      key={`graph-${selectedCollectionId || 'all'}`}
                      bookmarks={sortedBookmarks} 
                      insightLevel={insightLevel}
                      onNodeClick={(id) => setSelectedBookmarkId(id)}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            

          </>
        )}
      </div>
    </div>
  );
}
