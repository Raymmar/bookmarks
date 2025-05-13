import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ForceDirectedGraph } from "@/components/force-directed-graph-unpinned";
import { FilterControls } from "@/components/filter-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Command, 
  CommandEmpty, 
  CommandGroup, 
  CommandInput, 
  CommandItem 
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons";
import { X, LayoutGrid, Network, Search, ChevronUp, ChevronDown, BookmarkPlus, SearchX } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Bookmark } from "@shared/types";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { BookmarkGrid } from "@/components/responsive-bookmark-grid";
import { useCollectionBookmarksForGraph, useMultiCollectionBookmarksForGraph } from "@/hooks/use-collection-queries";

// Define interfaces for the Graph View
interface Tag {
  id: string;
  name: string;
  type: string;
  count: number;
  created_at: string;
}

interface BookmarkWithTags extends Bookmark {
  tags: Tag[];
}

interface NodeType {
  type: string;
  label: string;
  color: string;
}

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  clusterCount: number;
}

export default function GraphView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // State for progressive loading
  const [loadLimit, setLoadLimit] = useState<number | null>(() => {
    // Get saved preference from localStorage or default to limit=25
    const savedLimit = localStorage.getItem('bookmarkLoadLimit');
    
    if (!savedLimit) return 25; // Default value
    if (savedLimit === 'all') return null; // "Show All" setting
    
    // Try to parse as number
    const numValue = parseInt(savedLimit);
    return !isNaN(numValue) ? numValue : 25; // Fallback to default if not a valid number
  });

  // Update localStorage when load limit changes
  useEffect(() => {
    if (loadLimit !== null) {
      localStorage.setItem('bookmarkLoadLimit', loadLimit.toString());
    } else {
      // For 'Show All' option, store a special value
      localStorage.setItem('bookmarkLoadLimit', 'all');
    }
    
    // Invalidate the bookmarks query when the limit changes to trigger a refetch
    queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
  }, [loadLimit, queryClient]);
  
  // Fetch bookmarks with pagination based on the loadLimit
  const { data: bookmarksData = { bookmarks: [], total: 0 }, isLoading: isLoadingBookmarks } = useQuery<{ bookmarks: Bookmark[], total: number }>({
    queryKey: ["/api/bookmarks", loadLimit],
    queryFn: async () => {
      // Build query params
      const params = new URLSearchParams();
      if (loadLimit !== null) {
        params.append('limit', loadLimit.toString());
      }
      
      // Make request
      const response = await fetch(`/api/bookmarks?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch bookmarks');
      }
      
      const bookmarks = await response.json();
      // Get total count from header if available
      const totalHeader = response.headers.get('X-Total-Count');
      const total = totalHeader ? parseInt(totalHeader, 10) : bookmarks.length;
      
      return { bookmarks, total };
    }
  });
  
  // Extract bookmarks from the response
  const bookmarks = bookmarksData.bookmarks;

  // State for multiple collection selection initialized from localStorage
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(() => {
    // Initialize from localStorage if available
    const savedIds = localStorage.getItem('selectedCollectionIds');
    try {
      return savedIds ? JSON.parse(savedIds) : [];
    } catch (e) {
      console.error('Failed to parse saved collection IDs:', e);
      return [];
    }
  });
  
  // Save selected collection IDs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('selectedCollectionIds', JSON.stringify(selectedCollectionIds));
  }, [selectedCollectionIds]);
  
  // State for rendering preferences
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [showTags, setShowTags] = useState(() => {
    const saved = localStorage.getItem('graphShowTags');
    return saved ? saved === 'true' : true;
  });
  
  const [showSystemTags, setShowSystemTags] = useState(() => {
    const saved = localStorage.getItem('graphShowSystemTags');
    return saved ? saved === 'true' : false;
  });
  
  const [showBookmarkDetails, setShowBookmarkDetails] = useState(() => {
    const saved = localStorage.getItem('graphShowBookmarkDetails');
    return saved ? saved === 'true' : true;
  });
  
  const [showTagPanel, setShowTagPanel] = useState(() => {
    const saved = localStorage.getItem('graphShowTagPanel');
    return saved ? saved === 'true' : true;
  });
  
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(() => {
    const saved = localStorage.getItem('selectedCollection');
    return saved || null;
  });
  
  const [showCollectionPanel, setShowCollectionPanel] = useState(() => {
    const saved = localStorage.getItem('graphShowCollectionPanel');
    return saved ? saved === 'true' : true;
  });
  
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [popularTagCount, setPopularTagCount] = useState<number>(() => {
    const saved = localStorage.getItem('popularTagCount');
    return saved ? parseInt(saved) : 20;
  });
  
  const [graphStats, setGraphStats] = useState<GraphStats>({
    nodeCount: 0,
    edgeCount: 0,
    clusterCount: 0
  });
  
  // State for sort order in collection panels
  const [sortOrder, setSortOrder] = useState(() => {
    const saved = localStorage.getItem('bookmarkSortOrder');
    return saved || 'newest';
  });
  
  // Save preferences whenever they change
  useEffect(() => {
    localStorage.setItem('graphShowTags', String(showTags));
    localStorage.setItem('graphShowSystemTags', String(showSystemTags));
    localStorage.setItem('graphShowBookmarkDetails', String(showBookmarkDetails));
    localStorage.setItem('graphShowTagPanel', String(showTagPanel));
    localStorage.setItem('graphShowCollectionPanel', String(showCollectionPanel));
    localStorage.setItem('popularTagCount', String(popularTagCount));
    
    if (selectedCollection) {
      localStorage.setItem('selectedCollection', selectedCollection);
    } else {
      localStorage.removeItem('selectedCollection');
    }
  }, [
    showTags, 
    showSystemTags, 
    showBookmarkDetails, 
    showTagPanel,
    selectedCollection,
    showCollectionPanel,
    popularTagCount
  ]);
  
  // Selected collection ID (single collection)
  const selectedCollectionId = selectedCollection;
  
  // Reset multi-collection selection when switching to a single collection
  useEffect(() => {
    if (selectedCollectionId) {
      setSelectedCollectionIds([]);
    }
  }, [selectedCollectionId]);
  
  // Fetch bookmarks by single collection
  const { 
    data: singleCollectionBookmarks = [], 
    isLoading: isLoadingSingleCollection 
  } = useCollectionBookmarksForGraph(selectedCollectionId);
  
  // Fetch bookmarks by multiple collections
  const {
    data: multiCollectionBookmarks = [],
    isLoading: isLoadingMultiCollections
  } = useMultiCollectionBookmarksForGraph(selectedCollectionIds.length > 1 ? selectedCollectionIds : []);
  
  // Determine which bookmarks to use: multi-collection, single collection, or all bookmarks
  const collectionBookmarks = 
    selectedCollectionIds.length > 1 ? multiCollectionBookmarks : 
    selectedCollectionId ? singleCollectionBookmarks : [];

  // Fetch tags
  const { data: tags = [], isLoading: isLoadingTags } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  // Simple query for bookmark tags
  const { 
    data: bookmarksWithTags = [], 
    isLoading: isLoadingBookmarkTags, 
    refetch: refetchBookmarkTags 
  } = useQuery<BookmarkWithTags[]>({
    queryKey: ["/api/bookmarks-with-tags"],
    enabled: !isLoadingBookmarks && !isLoadingTags,
  });
  
  // State for node types
  const nodeTypes: NodeType[] = [
    { type: 'bookmark', label: 'Bookmarks', color: '#3B82F6' },  // blue-500
    { type: 'tag', label: 'Tags', color: '#10B981' },           // emerald-500
    { type: 'domain', label: 'Domains', color: '#F59E0B' }       // amber-500
  ];
  
  // State for visible node types from localStorage
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem('bookmarkVisibleNodeTypes');
    try {
      return saved ? JSON.parse(saved) : nodeTypes.map(nt => nt.type);
    } catch (e) {
      console.error('Failed to parse saved node types:', e);
      return nodeTypes.map(nt => nt.type);
    }
  });
  
  // Combined loading state
  const isLoading = isLoadingBookmarks || isLoadingTags || isLoadingBookmarkTags || 
                  isLoadingSingleCollection || isLoadingMultiCollections;
  
  const getSelectedBookmark = () => {
    return bookmarks.find(b => b.id === selectedBookmarkId);
  };
  
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
  
  // Filter tags based on type
  const userTags = tags.filter(tag => tag.type === "user");
  const systemTags = tags.filter(tag => tag.type === "system");
  
  // Separate user and system tag names
  const userTagNames = userTags.map(tag => tag.name).sort();
  const systemTagNames = systemTags.map(tag => tag.name).sort();
  
  // All tags combined based on the showSystemTags toggle
  const allTags = showSystemTags 
    ? [...userTagNames, ...systemTagNames].sort()
    : [...userTagNames].sort();
  
  // Get tags sorted by usage count for popular tags feature
  const tagsByCount = showSystemTags
    ? [...tags].sort((a, b) => b.count - a.count)
    : [...userTags].sort((a, b) => b.count - a.count);
  
  // Get all tags names for easier access
  const allTagNames = tagsByCount.map(tag => tag.name);

  // Determine which bookmarks to use based on whether collections are selected
  const fullBookmarks = selectedCollectionIds.length > 1 ? multiCollectionBookmarks : 
                       selectedCollectionId ? singleCollectionBookmarks : bookmarks;
  
  // Get total bookmarks count for display in UI
  const totalBookmarksCount = bookmarksData.total;
  
  // Use bookmarks directly instead of applying the limit in the client, since
  // the limit is now applied on the server side
  const activeBookmarks = useMemo(() => {
    return fullBookmarks;
  }, [fullBookmarks]);
  
  // Get bookmark tags using the bookmarksWithTags data
  const bookmarkTagsMap = new Map<string, string[]>();
  bookmarksWithTags.forEach(bookmark => {
    bookmarkTagsMap.set(bookmark.id, bookmark.tags.map(tag => tag.name));
  });
  
  // Get popular tags by using our sorted tagsByCount list
  const popularTags = tagsByCount
    .slice(0, popularTagCount)
    .map(tag => tag.name);
  
  // Event handler for tag select/deselect in the graph
  const handleTagChanged = (event: CustomEvent) => {
    setSelectedTag(event.detail.tagName);
  };
  
  // Event handler for bookmark select/deselect in the graph
  const handleShowBookmarkDetail = (e: Event) => {
    const event = e as CustomEvent;
    if (event.detail && event.detail.bookmarkId) {
      setSelectedBookmarkId(event.detail.bookmarkId);
    }
  };
  
  // Event handler for collection select in the graph
  const handleFilterByCollection = (e: Event) => {
    const event = e as CustomEvent;
    if (event.detail && event.detail.collectionId) {
      setSelectedCollection(event.detail.collectionId);
    }
  };
  
  // Listen for events from the graph component
  useEffect(() => {
    document.addEventListener('tagChanged', handleTagChanged as EventListener);
    document.addEventListener('showBookmarkDetail', handleShowBookmarkDetail as EventListener);
    document.addEventListener('filterByCollection', handleFilterByCollection as EventListener);
    
    return () => {
      document.removeEventListener('tagChanged', handleTagChanged as EventListener);
      document.removeEventListener('showBookmarkDetail', handleShowBookmarkDetail as EventListener);
      document.removeEventListener('filterByCollection', handleFilterByCollection as EventListener);
    };
  }, []);
  
  // Update graph stats whenever the data changes
  const handleGraphStats = (stats: GraphStats) => {
    setGraphStats(stats);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header section */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Network className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Knowledge Graph</h1>
            
            {/* Graph stats */}
            <div className="text-sm text-gray-500 ml-4">
              {isLoading ? (
                <span>Loading stats...</span>
              ) : (
                <span>
                  {graphStats.nodeCount} nodes • {graphStats.edgeCount} connections • {graphStats.clusterCount} clusters
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Add new bookmark button */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setModalOpen(true)}
            >
              <BookmarkPlus className="h-4 w-4 mr-2" />
              Add Bookmark
            </Button>
            
            {/* Graph controls */}
            <div className="flex items-center space-x-2">
              <FilterControls 
                onToggleTags={() => {
                  setShowTags(!showTags);
                }}
                showTags={showTags}
                onToggleSystemTags={() => {
                  setShowSystemTags(!showSystemTags);
                }}
                showSystemTags={showSystemTags}
                onToggleBookmarkDetails={() => {
                  setShowBookmarkDetails(!showBookmarkDetails);
                }}
                showBookmarkDetails={showBookmarkDetails}
                onToggleTagPanel={() => {
                  setShowTagPanel(!showTagPanel);
                }}
                showTagPanel={showTagPanel}
                onToggleCollectionPanel={() => {
                  setShowCollectionPanel(!showCollectionPanel);
                }}
                showCollectionPanel={showCollectionPanel}
                onPopularTagCountChange={(count) => {
                  setPopularTagCount(count);
                  localStorage.setItem('popularTagCount', count.toString());
                }}
                popularTagCount={popularTagCount}
                onSearch={(term) => {
                  setSearchTerm(term);
                }}
                sortOrder={sortOrder}
                onSortOrderChange={(value) => {
                  // Persist sort order to localStorage
                  localStorage.setItem('bookmarkSortOrder', value);
                  setSortOrder(value);
                }}
                visibleNodeTypes={visibleNodeTypes}
                onVisibleNodeTypesChange={(nodeTypes) => {
                  // Persist node types to localStorage
                  localStorage.setItem('bookmarkVisibleNodeTypes', JSON.stringify(nodeTypes));
                  setVisibleNodeTypes(nodeTypes);
                }}
              />
              
              {/* Load limit controls with combobox allowing custom values */}
              <div className="flex items-center">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-[160px] h-9 justify-between"
                    >
                      {loadLimit === null ? `Show All (${totalBookmarksCount})` : `Show ${loadLimit}`}
                      <ChevronDown className="h-4 w-4 ml-1 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Enter a number..."
                        onValueChange={(value) => {
                          // Allow only numbers in the input
                          const numValue = value.replace(/\D/g, '');
                          if (numValue && !isNaN(Number(numValue))) {
                            setLoadLimit(Number(numValue));
                          }
                        }} 
                      />
                      <CommandEmpty>Enter a custom limit or choose below</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => setLoadLimit(25)}
                          className="cursor-pointer"
                        >
                          <CheckIcon
                            className={`mr-2 h-4 w-4 ${
                              loadLimit === 25 ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          <span>25</span>
                        </CommandItem>
                        <CommandItem
                          onSelect={() => setLoadLimit(50)}
                          className="cursor-pointer"
                        >
                          <CheckIcon
                            className={`mr-2 h-4 w-4 ${
                              loadLimit === 50 ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          <span>50</span>
                        </CommandItem>
                        <CommandItem
                          onSelect={() => setLoadLimit(75)}
                          className="cursor-pointer"
                        >
                          <CheckIcon
                            className={`mr-2 h-4 w-4 ${
                              loadLimit === 75 ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          <span>75</span>
                        </CommandItem>
                        <CommandItem
                          onSelect={() => setLoadLimit(100)}
                          className="cursor-pointer"
                        >
                          <CheckIcon
                            className={`mr-2 h-4 w-4 ${
                              loadLimit === 100 ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          <span>100 (Maximum)</span>
                        </CommandItem>
                        <CommandItem
                          onSelect={() => {
                            // Increase the limit by 25, but cap it at 100
                            if (loadLimit === null) {
                              setLoadLimit(25);
                            } else {
                              const newLimit = Math.min(loadLimit + 25, 100);
                              setLoadLimit(newLimit);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <span>Load More (+25)</span>
                        </CommandItem>
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      </div>
        
      {/* Content section */}
      <div className="flex-1 bg-gray-50 overflow-hidden w-full">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading graph data...</p>
            </div>
          </div>
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            className="min-h-[600px] h-full rounded-lg bg-white"
          >
            {/* Main graph panel */}
            <ResizablePanel defaultSize={60} minSize={40}>
              <div className="h-full overflow-hidden">
                <ForceDirectedGraph
                  bookmarks={activeBookmarks}
                  bookmarkTags={bookmarkTagsMap}
                  allTags={allTags}
                  popularTags={popularTags}
                  showTags={showTags}
                  selectedTag={selectedTag}
                  selectedBookmarkId={selectedBookmarkId}
                  onSelectBookmark={handleSelectBookmark}
                  searchTerm={searchTerm}
                  visibleNodeTypes={visibleNodeTypes}
                  onGraphStatsUpdate={handleGraphStats}
                />
              </div>
            </ResizablePanel>
            
            {/* Right sidebar for details */}
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40}>
              <div className="h-full overflow-hidden flex flex-col">
                {selectedBookmarkId ? (
                  <BookmarkDetailPanel 
                    bookmarkId={selectedBookmarkId}
                    onClose={() => setSelectedBookmarkId(null)}
                    onTagsUpdated={() => {
                      // Refresh bookmark tags data
                      refetchBookmarkTags();
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center p-8 max-w-md">
                      <Network className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <h3 className="text-lg font-medium mb-2">Graph Visualization</h3>
                      <p className="text-sm text-gray-500 mb-4">
                        Explore your knowledge connections. Click on any node to view details about bookmarks, tags, and domains.
                      </p>
                      <p className="text-sm text-gray-400">
                        Currently showing {activeBookmarks.length} of {totalBookmarksCount} bookmarks.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      
      {/* Add bookmark dialog */}
      <AddBookmarkDialog
        open={modalOpen}
        onOpenChange={(open) => setModalOpen(open)}
        onBookmarkAdded={(bookmark) => {
          toast({
            title: "Bookmark Added",
            description: "The bookmark was successfully added.",
          });
          // Refresh data
          queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
        }}
      />
    </div>
  );
}