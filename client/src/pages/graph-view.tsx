import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ForceDirectedGraph } from "@/components/force-directed-graph";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { BookmarkCard } from "@/components/bookmark-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, LayoutGrid, Network, SearchX, List } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bookmark } from "@shared/types";

export default function GraphView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [insightLevel, setInsightLevel] = useState(1);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<"any" | "all">("any");
  const [viewMode, setViewMode] = useState<"grid" | "graph">("graph");
  const [sortOrder, setSortOrder] = useState("newest");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: bookmarks = [], isLoading } = useQuery<Bookmark[]>({
    queryKey: ["/api/bookmarks"],
  });
  
  const selectedBookmark = bookmarks.find(b => b.id === selectedBookmarkId);
  
  // Extract all unique tags from bookmarks
  const allTags = Array.from(
    new Set(
      bookmarks.flatMap(bookmark => 
        [...bookmark.user_tags, ...bookmark.system_tags]
      )
    )
  ).sort();
  
  // Filter bookmarks based on search query and selected tags
  const filteredBookmarks = bookmarks.filter(bookmark => {
    // Search query filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        bookmark.title.toLowerCase().includes(searchLower) ||
        bookmark.description?.toLowerCase().includes(searchLower) ||
        bookmark.url.toLowerCase().includes(searchLower) ||
        bookmark.user_tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
        bookmark.system_tags.some(tag => tag.toLowerCase().includes(searchLower));
      
      if (!matchesSearch) return false;
    }
    
    // Tag filter
    if (selectedTags.length === 0) return true;
    
    const bookmarkTags = [...bookmark.user_tags, ...bookmark.system_tags];
    
    if (tagMode === "any") {
      return selectedTags.some(tag => bookmarkTags.includes(tag));
    } else {
      return selectedTags.every(tag => bookmarkTags.includes(tag));
    }
  });
  
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
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };
  
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
    <div className="flex flex-1 h-full">
      <div className="flex-1 flex flex-col h-full">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 h-16 flex items-center">
          <div className="flex w-full items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Explore</h2>
            
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2">
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === "graph" ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => setViewMode("graph")}
                >
                  <Network className="h-4 w-4 mr-2" />
                  Graph
                </Button>
              </div>
              
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
        </div>
        
        {/* Search, filters and tags section */}
        <div className="bg-white border-b border-gray-200 p-4">
          {/* Search input */}
          <div className="mb-3">
            <div className="relative flex-1 max-w-full">
              <Input
                type="text"
                placeholder="Search bookmarks, content, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full"
              />
              <SearchX className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              {searchQuery && (
                <X 
                  className="h-4 w-4 text-gray-400 absolute right-3 top-3 cursor-pointer" 
                  onClick={() => setSearchQuery("")}
                />
              )}
            </div>
          </div>
          
          {/* Sort options */}
          <div className="flex justify-between items-center">
            <div className="text-sm font-medium text-gray-600">Filter by tags:</div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">Match:</span>
                <Select value={tagMode} onValueChange={(value) => setTagMode(value as "any" | "all")}>
                  <SelectTrigger className="h-7 text-xs w-24">
                    <SelectValue placeholder="Match mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any tag</SelectItem>
                    <SelectItem value="all">All tags</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="relative">
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-7 text-xs w-32">
                    <SelectValue placeholder="Sort order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Tags filter */}
          <div className="mt-2">
            <div className="flex flex-wrap gap-1">
              {allTags.map(tag => (
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
            </div>
          </div>
        </div>
        
        <div className="flex-1 bg-gray-50 p-4 pb-20 overflow-hidden">
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
                    : selectedTags.length > 0
                      ? "Try selecting different tags or changing the match mode"
                      : "Add some bookmarks to see them in the explorer"}
                </p>
              </div>
            </div>
          ) : viewMode === "graph" ? (
            <div className="h-full border border-gray-200 rounded-lg overflow-hidden bg-white">
              <ForceDirectedGraph
                bookmarks={filteredBookmarks}
                insightLevel={insightLevel}
                onNodeClick={setSelectedBookmarkId}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              {filteredBookmarks.map(bookmark => (
                <div 
                  key={bookmark.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedBookmarkId === bookmark.id 
                      ? "bg-primary-50 border-primary" 
                      : "bg-white border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setSelectedBookmarkId(bookmark.id)}
                >
                  <h3 className="font-medium mb-1 line-clamp-1">{bookmark.title}</h3>
                  <p className="text-xs text-gray-500 mb-2">{bookmark.url}</p>
                  <div className="flex flex-wrap gap-1">
                    {bookmark.user_tags.concat(bookmark.system_tags).slice(0, 3).map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {bookmark.user_tags.concat(bookmark.system_tags).length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{bookmark.user_tags.concat(bookmark.system_tags).length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Detail Panel */}
      <div className="hidden lg:block w-80 border-l border-gray-200 bg-white overflow-y-auto h-full">
        <BookmarkDetailPanel 
          bookmark={selectedBookmark} 
          onClose={() => setSelectedBookmarkId(null)} 
        />
      </div>
    </div>
  );
}
