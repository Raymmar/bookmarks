import { useState, useEffect, useCallback } from "react";
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
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: bookmarks = [], isLoading } = useQuery<Bookmark[]>({
    queryKey: ["/api/bookmarks"],
  });

  const { data: activities = [], isLoading: isActivitiesLoading } = useQuery({
    queryKey: ["/api/activities"],
  });

  const selectedBookmark = bookmarks.find(b => b.id === selectedBookmarkId);

  // Listen for bookmark update events and track recently updated bookmarks
  useEffect(() => {
    const handleBookmarkUpdate = (event: Event) => {
      try {
        const customEvent = event as CustomEvent<{bookmarkId: string, updatedFields: Partial<Bookmark>, updatedBookmark: Bookmark}>;
        const { bookmarkId } = customEvent.detail;
        
        console.log(`Home: Received bookmark update event for ${bookmarkId}`);
        
        // Add this bookmark to the recently updated list (at the beginning)
        setRecentlyUpdatedIds(prev => {
          // Remove the id if it already exists in the list to avoid duplicates
          const filteredIds = prev.filter(id => id !== bookmarkId);
          // Add the id to the beginning of the list
          return [bookmarkId, ...filteredIds];
        });
      } catch (error) {
        console.error("Error handling bookmark update event in home:", error);
      }
    };
    
    // Add event listener
    document.addEventListener('bookmarkUpdated', handleBookmarkUpdate);
    
    // Clean up on unmount
    return () => {
      document.removeEventListener('bookmarkUpdated', handleBookmarkUpdate);
    };
  }, []);

  const filteredBookmarks = bookmarks.filter(bookmark => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    return (
      bookmark.title.toLowerCase().includes(searchLower) ||
      bookmark.description?.toLowerCase().includes(searchLower) ||
      bookmark.url.toLowerCase().includes(searchLower) ||
      (bookmark.user_tags?.some(tag => tag.toLowerCase().includes(searchLower)) || false) ||
      (bookmark.system_tags?.some(tag => tag.toLowerCase().includes(searchLower)) || false)
    );
  });

  // Create a sorting function that prioritizes recently updated bookmarks
  const sortedBookmarks = [...filteredBookmarks].sort((a, b) => {
    // First, prioritize recently updated bookmarks
    const aRecentIndex = recentlyUpdatedIds.indexOf(a.id);
    const bRecentIndex = recentlyUpdatedIds.indexOf(b.id);
    
    // If both are in the recently updated list, sort by their position in that list
    if (aRecentIndex !== -1 && bRecentIndex !== -1) {
      return aRecentIndex - bRecentIndex;
    }
    
    // If only one is in the recently updated list, it comes first
    if (aRecentIndex !== -1) return -1;
    if (bRecentIndex !== -1) return 1;
    
    // Otherwise, fall back to the selected sort order
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
                </div>
              </TabsContent>
            </Tabs>
            

          </>
        )}
      </div>
    </div>
  );
}
