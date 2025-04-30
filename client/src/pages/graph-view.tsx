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

// Tag interfaces
interface Tag {
  id: string;
  name: string;
  type: string;
  count: number;
  created_at: string;
}

// Interface for bookmarks with associated tags
interface BookmarkWithTags extends Bookmark {
  tags: Tag[];
}

export default function GraphView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [insightLevel, setInsightLevel] = useState(1);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  // Initialize filter settings from localStorage with fallbacks
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  // Initialize selectedCollectionId from localStorage if only one collection is selected
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(() => {
    const savedCollections = localStorage.getItem('selectedCollections');
    if (savedCollections) {
      const parsed = JSON.parse(savedCollections);
      return parsed.length === 1 ? parsed[0] : null;
    }
    return null;
  });
  const [tagMode, setTagMode] = useState<"any" | "all">(() => {
    const savedTagMode = localStorage.getItem('bookmarkTagMode');
    return savedTagMode === "all" ? "all" : "any";
  });
  const [viewMode, setViewMode] = useState<"grid" | "graph">(() => {
    const savedViewMode = localStorage.getItem('bookmarkViewMode');
    return savedViewMode === "grid" ? "grid" : "graph";
  });
  // Initialize sortOrder from localStorage with fallback to "created_newest"
  // This prioritizes the actual content creation date rather than when it was saved
  const [sortOrder, setSortOrder] = useState<string>(() => {
    const savedSort = localStorage.getItem('bookmarkSortOrder');
    return savedSort ? savedSort : "created_newest";
  });
  const [dateRange, setDateRange] = useState(() => {
    const savedDateRange = localStorage.getItem('bookmarkDateRange');
    return savedDateRange || "all";
  });
  const [sources, setSources] = useState<string[]>(() => {
    const savedSources = localStorage.getItem('bookmarkSources');
    return savedSources ? JSON.parse(savedSources) : ["extension", "web", "import", "x"];
  });
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<string[]>(() => {
    const savedNodeTypes = localStorage.getItem('bookmarkVisibleNodeTypes');
    return savedNodeTypes ? JSON.parse(savedNodeTypes) : ["bookmark", "domain", "tag"];
  });
  // Add Bookmark dialog state
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);
  // Drawer state with localStorage persistence
  const [tagDrawerOpen, setTagDrawerOpen] = useState<boolean>(() => {
    // Initialize from localStorage or default to closed
    const saved = localStorage.getItem('tagDrawerOpen');
    return saved ? JSON.parse(saved) : false;
  });
  // State to toggle showing system-generated tags
  const [showSystemTags, setShowSystemTags] = useState<boolean>(() => {
    const saved = localStorage.getItem('showSystemTags');
    return saved ? JSON.parse(saved) : false;
  });
  // Container ref to measure available width for tag drawer
  const tagContainerRef = useRef<HTMLDivElement>(null);
  // State to track visible tags in closed drawer (calculated based on container width)
  const [visibleTagsCount, setVisibleTagsCount] = useState<number>(10);
  // Fallback number of popular tags to show when drawer is closed (if width calculation fails)
  const [popularTagCount] = useState<number>(10);
  
  // State for pagination
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Always fetch all bookmarks, whether a collection is selected or not
  // This ensures we have all tag relationships even when viewing collections
  const { data: bookmarks = [], isLoading: isLoadingBookmarks } = useQuery<Bookmark[]>({
    queryKey: ["/api/bookmarks"],
    // Set a lower priority when collection is selected (to avoid blocking the collection-specific query)
    meta: selectedCollectionId ? { priority: -1 } : undefined
  });
  
  // State for multiple collection selection initialized from localStorage
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(() => {
    // Initialize from localStorage if available
    const savedCollections = localStorage.getItem('selectedCollections');
    return savedCollections ? JSON.parse(savedCollections) : [];
  });
  
  // Initialize selectedCollectionId from selectedCollectionIds on first render
  useEffect(() => {
    // Only run this once on component mount
    if (selectedCollectionIds.length === 1 && !selectedCollectionId) {
      setSelectedCollectionId(selectedCollectionIds[0]);
    }
  }, []); // Empty dependency array ensures this only runs once
  
  // Update multiple collections when single collection changes
  useEffect(() => {
    if (selectedCollectionId) {
      setSelectedCollectionIds([selectedCollectionId]);
    } else if (selectedCollectionIds.length <= 1) {
      // Only clear if we're not in multi-select mode
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

  // Fetch bookmark-tag associations for both the selected collection and all bookmarks
  // This ensures we have the tag relationships even when viewing collections
  const { data: bookmarksWithTags = [], isLoading: isLoadingBookmarkTags, refetch: refetchBookmarkTags } = useQuery<BookmarkWithTags[]>({
    queryKey: ["/api/bookmarks-with-tags", selectedCollectionId, selectedCollectionIds],
    enabled: !isLoadingBookmarks && !isLoadingTags && !isLoadingSingleCollection && !isLoadingMultiCollections,
    queryFn: async () => {
      try {
        // Determine which bookmarks to display based on collection selection
        const displayBookmarks = selectedCollectionIds.length > 1 ? multiCollectionBookmarks : 
                                 selectedCollectionId ? singleCollectionBookmarks : bookmarks;
        
        // For tag relationships, we need both the displayed bookmarks and all bookmarks
        // This ensures proper tag connections in the graph
        const allBookmarkIds = bookmarks.map(bookmark => bookmark.id);
        
        if (allBookmarkIds.length === 0) {
          return [];
        }
        
        // Fetch tags for ALL bookmarks to ensure complete tag-bookmark relationships
        // Using POST instead of GET to handle large numbers of bookmark IDs
        const response = await fetch('/api/bookmarks-tags-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ids: allBookmarkIds })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch bookmark tags: ${response.statusText}`);
        }
        
        // Map of bookmarkId -> Tag[]
        const bookmarkTagsMap = await response.json();
        
        // Add the all tags to the displayed bookmarks for proper rendering
        const bookmarksWithAllTags = displayBookmarks.map(bookmark => {
          // If this bookmark is in the current view, add its tags
          return {
            ...bookmark,
            tags: bookmarkTagsMap[bookmark.id] || []
          };
        });
        
        // If we're in a collection view, also add the all-bookmarks data with their tags
        // but mark them as hidden - this ensures tag relationships are preserved
        if (selectedCollectionId || selectedCollectionIds.length > 1) {
          // Get IDs of bookmarks we're already showing
          const displayedIds = new Set(displayBookmarks.map(b => b.id));
          
          // Add non-displayed bookmarks with isHidden flag
          bookmarks.forEach(bookmark => {
            if (!displayedIds.has(bookmark.id)) {
              bookmarksWithAllTags.push({
                ...bookmark, 
                tags: bookmarkTagsMap[bookmark.id] || [],
                isHidden: true // Mark as hidden so graph can use for relationships but not display
              });
            }
          });
        }
        
        console.log(`Loaded ${displayBookmarks.length} bookmarks to display with ${bookmarksWithAllTags.length} total bookmarks for tag relationships`);
        return bookmarksWithAllTags;
      } catch (error) {
        console.error("Error fetching batch bookmark tags:", error);
        // Log more details about the error for debugging
        console.log("Detailed error info:", { 
          message: error.message, 
          stack: error.stack,
          bookmarkCount: bookmarks.length,
          selectedCollection: selectedCollectionId,
          multiCollections: selectedCollectionIds
        });
        // Return bookmarks with empty tags if the request fails
        const displayBookmarks = selectedCollectionIds.length > 1 ? multiCollectionBookmarks : 
                                selectedCollectionId ? singleCollectionBookmarks : bookmarks;
        return displayBookmarks.map(bookmark => ({
          ...bookmark,
          tags: []
        }));
      }
    }
  });
  
  // Listen for tag changes to refresh the data
  useEffect(() => {
    const handleTagChanged = (event: CustomEvent) => {
      console.log("Graph view detected tag change event, refreshing data");
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
      
      // Explicitly refetch the bookmarks with tags
      refetchBookmarkTags();
    };
    
    // Add event listener
    document.addEventListener('tagChanged', handleTagChanged as EventListener);
    
    // Clean up
    return () => {
      document.removeEventListener('tagChanged', handleTagChanged as EventListener);
    };
  }, [queryClient, refetchBookmarkTags]);
  
  // Listen for showBookmarkDetail event to focus a bookmark in the graph
  useEffect(() => {
    const handleShowBookmarkDetail = (e: Event) => {
      // Cast to CustomEvent with the right detail type
      const event = e as CustomEvent<{bookmarkId: string}>;
      const bookmarkId = event.detail?.bookmarkId;
      
      if (bookmarkId) {
        console.log(`Graph view received showBookmarkDetail event for bookmark: ${bookmarkId}`);
        
        // Set the selected bookmark ID
        setSelectedBookmarkId(bookmarkId);
        
        // Use a small delay to ensure the graph has updated
        setTimeout(() => {
          // Format the node ID to match how it's stored in the graph component
          const nodeId = `bookmark-${bookmarkId}`;
          
          // Use custom event to notify the graph component to select and center this node
          const graphEvent = new CustomEvent('selectGraphNode', { 
            detail: { nodeId: nodeId, source: 'bookmarkDetailRequest' } 
          });
          document.dispatchEvent(graphEvent);
          
          console.log(`Dispatched selectGraphNode event for node ${nodeId}`);
        }, 100);
      }
    };
    
    // Add event listener
    window.addEventListener('showBookmarkDetail', handleShowBookmarkDetail);
    
    // Clean up
    return () => {
      window.removeEventListener('showBookmarkDetail', handleShowBookmarkDetail);
    };
  }, []);
  
  // Listen for collection filter changes
  useEffect(() => {
    const handleFilterByCollection = (e: Event) => {
      // Cast to CustomEvent with the right detail type
      const event = e as CustomEvent<{
        collectionId: string | null, 
        collectionIds?: string[]
      }>;
      
      const collectionId = event.detail?.collectionId;
      const collectionIds = event.detail?.collectionIds || [];
      
      console.log(`Graph view received filterByCollection event for collection: ${collectionId || 'all'}`);
      
      if (collectionIds.length > 1) {
        console.log(`Multiple collections selected: ${collectionIds.join(', ')}`);
        // Update the selected collections for multi-collection view
        setSelectedCollectionId(null);
        setSelectedCollectionIds(collectionIds);
      } else {
        // Update the selected collection ID for single collection view
        setSelectedCollectionId(collectionId);
        setSelectedCollectionIds(collectionId ? [collectionId] : []);
      }
      
      // Reset any existing filters when changing collections
      setSelectedBookmarkId(null);
      
      // After a brief delay to let the data load, center the graph
      setTimeout(() => {
        const resetEvent = new CustomEvent('resetForceGraph', { 
          detail: { source: 'collectionChange' } 
        });
        document.dispatchEvent(resetEvent);
        
        // After reset, center the graph
        setTimeout(() => {
          const centerEvent = new CustomEvent('centerFullGraph', { 
            detail: { source: 'collectionChange' } 
          });
          document.dispatchEvent(centerEvent);
        }, 300);
      }, 150);
    };
    
    // Add event listener
    window.addEventListener('filterByCollection', handleFilterByCollection);
    
    // Clean up
    return () => {
      window.removeEventListener('filterByCollection', handleFilterByCollection);
    };
  }, []);
  
  // Track previous auth state to detect login vs logout
  const prevUserRef = useRef<{ id: string } | null>(null);
  
  // Listen for user authentication changes and refresh bookmarks
  useEffect(() => {
    // Determine if this is a login or logout event
    const isLogin = !prevUserRef.current && user;
    const isLogout = prevUserRef.current && !user;
    
    console.log("User authentication state changed, refreshing bookmark data");
    
    // Always invalidate and refetch all related queries
    queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
    
    // If a bookmark was selected, reset the selection on authentication change
    if (selectedBookmarkId && (isLogin || isLogout)) {
      setSelectedBookmarkId(null);
    }
    
    // If there are any filters applied, reset them on authentication change
    if ((selectedTags.length > 0 || selectedDomain) && (isLogin || isLogout)) {
      setSelectedTags([]);
      setSelectedDomain(null);
    }
    
    // When a logout occurs, we need to completely reset the graph state
    if (isLogout) {
      // Force a complete refresh of the public bookmarks data
      queryClient.resetQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.resetQueries({ queryKey: ["/api/bookmarks-with-tags"] });
      queryClient.resetQueries({ queryKey: ["/api/tags"] });
      
      // Trigger a complete graph reset by dispatching a special reset event
      setTimeout(() => {
        const resetEvent = new CustomEvent('resetForceGraph', { 
          detail: { source: 'logout' } 
        });
        document.dispatchEvent(resetEvent);
        
        // After reset, center the graph (with a delay to ensure reset completes)
        setTimeout(() => {
          const centerEvent = new CustomEvent('centerFullGraph', { 
            detail: { source: 'logoutComplete' } 
          });
          document.dispatchEvent(centerEvent);
        }, 300);
      }, 150);
    } 
    // For regular login events, just center the graph
    else if (isLogin) {
      setTimeout(() => {
        const event = new CustomEvent('centerFullGraph', { 
          detail: { source: 'login' } 
        });
        document.dispatchEvent(event);
      }, 150);
    }
    
    // Explicitly refetch the bookmarks with tags
    if (!isLoadingBookmarks && !isLoadingTags) {
      refetchBookmarkTags();
    }
    
    // Update the previous user reference for the next render
    prevUserRef.current = user;
  }, [user, queryClient, refetchBookmarkTags, selectedBookmarkId, selectedTags, selectedDomain, isLoadingBookmarks, isLoadingTags]);
  
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
  
  // Function to load more bookmarks
  const loadMoreBookmarks = () => {
    if (isLoadingMore || !hasMore) {
      console.log(`Not loading more: isLoadingMore=${isLoadingMore}, hasMore=${hasMore}`);
      return;
    }
    
    console.log(`Loading more bookmarks: current loadLimit=${loadLimit}, fullBookmarks.length=${fullBookmarks.length}`);
    setIsLoadingMore(true);
    try {
      // In the graph view, we're using client-side pagination with the loadLimit
      // Increase the load limit to show more bookmarks
      if (loadLimit !== null) {
        // Increase the limit by pageSize (usually 25)
        const newLimit = (loadLimit || 25) + pageSize;
        console.log(`Setting new loadLimit=${newLimit}`);
        setLoadLimit(newLimit);
        
        // Set hasMore flag based on whether there are more bookmarks to show after this load
        const moreAvailable = newLimit < fullBookmarks.length;
        console.log(`Setting hasMore=${moreAvailable} (${newLimit} < ${fullBookmarks.length})`);
        setHasMore(moreAvailable);
      }
    } catch (error) {
      console.error("Error loading more bookmarks:", error);
      toast({
        title: "Error",
        description: "Failed to load more bookmarks. Please try again.",
        variant: "destructive"
      });
    } finally {
      // Use a short delay to ensure the UI updates properly
      setTimeout(() => {
        setIsLoadingMore(false);
      }, 500);
    }
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
  }, [loadLimit]);
  
  // Determine which bookmarks to use based on whether collections are selected
  const fullBookmarks = selectedCollectionIds.length > 1 ? multiCollectionBookmarks : 
                       selectedCollectionId ? singleCollectionBookmarks : bookmarks;
  
  // Update hasMore state whenever fullBookmarks or loadLimit changes
  useEffect(() => {
    // If we're showing all bookmarks, there's nothing more to load
    if (loadLimit === null) {
      setHasMore(false);
      return;
    }
    
    // Debug bookmarks count
    console.log(`Loaded ${fullBookmarks.length} bookmarks to compare against loadLimit=${loadLimit}`);
    
    // Check if there are more bookmarks to show
    // Make sure we have more than the current load limit
    const hasMoreBookmarks = fullBookmarks.length > loadLimit;
    console.log(`Setting hasMore=${hasMoreBookmarks} based on comparison`);
    
    setHasMore(hasMoreBookmarks);
  }, [fullBookmarks, loadLimit]);
  
  // Apply load limit to bookmarks if loadLimit is set
  const activeBookmarks = useMemo(() => {
    if (loadLimit === null) {
      return fullBookmarks; // Load all bookmarks
    }
    
    // Sort by content creation date (newest first) and apply limit
    return [...fullBookmarks]
      .sort((a, b) => {
        // Use created_at if available, fallback to date_saved
        const aDate = a.created_at ? new Date(a.created_at).getTime() : new Date(a.date_saved).getTime();
        const bDate = b.created_at ? new Date(b.created_at).getTime() : new Date(b.date_saved).getTime();
        return bDate - aDate;
      })
      .slice(0, loadLimit);
  }, [fullBookmarks, loadLimit]);
  
  // Get bookmark tags using the bookmarksWithTags data
  const bookmarkTagsMap = new Map<string, string[]>();
  bookmarksWithTags.forEach(bookmark => {
    bookmarkTagsMap.set(bookmark.id, bookmark.tags.map(tag => tag.name));
  });
  
  // Create a map of bookmarks with tags by ID for easier access
  const bookmarksWithTagsMap = new Map<string, BookmarkWithTags>();
  bookmarksWithTags.forEach(bookmark => {
    bookmarksWithTagsMap.set(bookmark.id, bookmark);
  });
  
  // Filter bookmarks based on search query, selected tags, domain, and visibility
  const filteredBookmarkIds = activeBookmarks.filter(bookmark => {
    // Skip bookmarks explicitly marked as hidden (used for establishing tag relationships)
    if ((bookmark as any).isHidden) {
      return false;
    }
    
    // Get this bookmark's tags from our map using the normalized tag system
    const bookmarkTags = bookmarkTagsMap.get(bookmark.id) || [];
    // Use only normalized tags
    const allBookmarkTags = [...bookmarkTags];
    
    // Search query filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        bookmark.title.toLowerCase().includes(searchLower) ||
        bookmark.description?.toLowerCase().includes(searchLower) ||
        bookmark.url.toLowerCase().includes(searchLower) ||
        allBookmarkTags.some(tag => tag.toLowerCase().includes(searchLower));
      
      if (!matchesSearch) return false;
    }
    
    // Source filter
    if (!sources.includes(bookmark.source)) {
      return false;
    }
    
    // Date filter
    if (dateRange !== "all") {
      const now = new Date();
      const bookmarkDate = new Date(bookmark.date_saved);
      const timeDiff = now.getTime() - bookmarkDate.getTime();
      const daysDiff = timeDiff / (1000 * 3600 * 24);
      
      if (dateRange === "week" && daysDiff > 7) return false;
      if (dateRange === "month" && daysDiff > 30) return false;
      if (dateRange === "quarter" && daysDiff > 90) return false;
    }
    
    // Domain filter
    if (selectedDomain) {
      try {
        const url = new URL(bookmark.url);
        if (url.hostname !== selectedDomain) {
          return false;
        }
      } catch (e) {
        // If URL parsing fails, just check if the domain appears in the URL
        if (!bookmark.url.includes(selectedDomain)) {
          return false;
        }
      }
    }
    
    // Tag filter
    if (selectedTags.length === 0) return true;
    
    if (tagMode === "any") {
      return selectedTags.some(tag => allBookmarkTags.includes(tag));
    } else {
      return selectedTags.every(tag => allBookmarkTags.includes(tag));
    }
  }).map(bookmark => bookmark.id);
  
  // Create a combined map of all bookmarks with tags for unified filtering
  const combinedBookmarksWithTags: BookmarkWithTags[] = [];
  
  // For each bookmark ID in the filtered list, find the bookmark with its tags
  filteredBookmarkIds.forEach(id => {
    // Try to find the bookmark in the bookmarksWithTags first
    const bookmark = bookmarksWithTagsMap.get(id);
    
    if (bookmark) {
      combinedBookmarksWithTags.push(bookmark);
    } else if (selectedCollectionIds.length > 0) {
      // If not found, it might be a collection bookmark that hasn't been processed yet
      // Look for the bookmark in appropriate collection bookmarks based on selection
      const collectionBookmark = selectedCollectionIds.length > 1 
        ? multiCollectionBookmarks.find(b => b.id === id)
        : singleCollectionBookmarks.find(b => b.id === id);
      
      if (collectionBookmark) {
        // Create a temporary BookmarkWithTags object for this collection bookmark
        combinedBookmarksWithTags.push({
          ...collectionBookmark,
          tags: [] // No tags info yet, but we'll still include the bookmark
        });
      }
    }
  });
  
  // Filtered bookmarks now come from either regular bookmarks or collection bookmarks
  const filteredBookmarks = combinedBookmarksWithTags;
  
  // Sort bookmarks
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
  
  const toggleTagSelection = (tag: string) => {
    const isCurrentlySelected = selectedTags.includes(tag);
    
    // Update the tag selection first
    if (isCurrentlySelected) {
      // Removing a tag
      setSelectedTags(selectedTags.filter(t => t !== tag));
      
      // Only clear focus if we're removing the last selected tag
      if (selectedTags.length === 1 && viewMode === "graph") {
        // Signal graph to zoom out to show all nodes
        // Only do this when the last tag is removed
        setSelectedBookmarkId(null);
        setTimeout(() => {
          const event = new CustomEvent('centerFullGraph', { 
            detail: { source: 'tagFilter' } 
          });
          document.dispatchEvent(event);
        }, 150);
      }
    } else {
      // Adding a new tag
      setSelectedTags([...selectedTags, tag]);
      
      // Only focus on tag node when it's newly selected and in graph view
      if (viewMode === "graph") {
        // Find the tag node ID format that matches our graph component
        const tagNodeId = `tag-${tag}`;
        
        // Clear any selected bookmark - important to do this first
        setSelectedBookmarkId(null);
        
        // Use a longer delay to ensure the graph has fully updated with filtered nodes
        // This prevents the "bouncing" effect caused by rapid zoom transitions
        setTimeout(() => {
          // Use custom event to notify the graph component to select this tag
          const event = new CustomEvent('selectGraphNode', { 
            detail: { nodeId: tagNodeId, source: 'tagFilter' } 
          });
          document.dispatchEvent(event);
        }, 300); // Longer delay for smoother transitions
      }
    }
  };
  
  const handleDomainSelection = (domain: string) => {
    const isDomainSelected = selectedDomain === domain;
    
    if (isDomainSelected) {
      // Remove the domain filter
      setSelectedDomain(null);
      
      // Zoom out to show all nodes
      setTimeout(() => {
        const event = new CustomEvent('centerFullGraph', { 
          detail: { source: 'domainFilter' } 
        });
        document.dispatchEvent(event);
      }, 150);
    } else {
      // Set the domain filter
      setSelectedDomain(domain);
      
      // Focus on the domain node
      if (viewMode === "graph") {
        const domainNodeId = `domain-${domain}`;
        
        // Clear any selected bookmark
        setSelectedBookmarkId(null);
        
        setTimeout(() => {
          const event = new CustomEvent('selectGraphNode', { 
            detail: { nodeId: domainNodeId, source: 'domainFilter' } 
          });
          document.dispatchEvent(event);
        }, 300);
      }
    }
  };
  
  const handleTagClick = (tag: string) => {
    toggleTagSelection(tag);
  };
  
  // Function to calculate how many tags can fit in a single row
  const calculateVisibleTagCount = () => {
    if (!tagContainerRef.current) return popularTagCount;
    
    // Get container width
    const containerWidth = tagContainerRef.current.clientWidth;
    
    // Account for other elements (padding, toggle button, tag count indicator, etc.)
    const adjustedWidth = containerWidth - 30; // Add extra space to prevent overlap with tag count
    
    // Estimate average tag width (this is an approximation)
    const avgTagWidth = 100; // Increased average tag width to be more conservative
    
    // Calculate how many tags can fit in one row
    const fitCount = Math.floor(adjustedWidth / avgTagWidth);
    
    // Ensure at least one tag is shown
    return Math.max(1, fitCount);
  };

  // Recalculate visible tags when window is resized
  useEffect(() => {
    const handleResize = () => {
      setVisibleTagsCount(calculateVisibleTagCount());
    };
    
    // Calculate on initial load
    handleResize();
    
    // Add resize listener
    window.addEventListener('resize', handleResize);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [tagContainerRef.current]); // Only recalculate when container ref changes

  // Function to toggle the tag drawer open/closed state
  const toggleTagDrawer = () => {
    const newState = !tagDrawerOpen;
    setTagDrawerOpen(newState);
    // Save state to localStorage
    localStorage.setItem('tagDrawerOpen', JSON.stringify(newState));
    
    // Recalculate visible tags when drawer is toggled
    if (!newState) {
      setVisibleTagsCount(calculateVisibleTagCount());
    }
  };
  
  // Function to toggle showing system tags
  const toggleSystemTags = () => {
    const newState = !showSystemTags;
    setShowSystemTags(newState);
    // Save state to localStorage
    localStorage.setItem('showSystemTags', JSON.stringify(newState));
  };
  
  // Get popular tags by using our sorted tagsByCount list
  const popularTags = tagsByCount
    .slice(0, popularTagCount)
    .map(tag => tag.name);
  
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
  
  // Prepare the layout preferences hook here
  const layoutPreferences = (() => {
    const [preferences, setPreferences] = useState(() => {
      // Initialize from localStorage or use defaults
      const savedPrefs = localStorage.getItem('layoutPreferences');
      if (savedPrefs) {
        try {
          return JSON.parse(savedPrefs);
        } catch (e) {
          console.error('Failed to parse saved layout preferences:', e);
          return {
            gridWidth: 40, // 40% for grid, 60% for graph by default
            showDetailPanel: false, // Hidden by default
            gridWidthWithDetail: 60, // Width to use when detail is open
            gridWidthWithoutDetail: 40, // Width to use when detail is closed
            lastSetWidth: null, // Track the last width manually set by user
          };
        }
      }
      return {
        gridWidth: 40,
        showDetailPanel: false,
        gridWidthWithDetail: 60, // Width to use when detail is open
        gridWidthWithoutDetail: 40, // Width to use when detail is closed  
        lastSetWidth: null, // Track the last width manually set by user
      };
    });

    // Save preferences to localStorage whenever they change
    useEffect(() => {
      localStorage.setItem('layoutPreferences', JSON.stringify(preferences));
    }, [preferences]);

    // Update grid width
    const setGridWidth = (width: number) => {
      setPreferences((prev: any) => {
        const boundedWidth = Math.max(20, Math.min(80, width)); // Restrict between 20% and 80%
        return {
          ...prev,
          gridWidth: boundedWidth,
          lastSetWidth: boundedWidth, // Remember the last width user manually set
          // Update the appropriate state memory depending on whether detail panel is open
          ...(prev.showDetailPanel 
              ? { gridWidthWithDetail: boundedWidth } 
              : { gridWidthWithoutDetail: boundedWidth })
        };
      });
    };

    // Toggle detail panel
    const toggleDetailPanel = (show?: boolean) => {
      setPreferences((prev: any) => {
        const newShowDetailPanel = show !== undefined ? show : !prev.showDetailPanel;
        
        if (newShowDetailPanel) {
          // If we're opening the detail panel
          // Use the stored width for detail view, or fallback to last manually set width
          const preferredDetailWidth = prev.gridWidthWithDetail || prev.lastSetWidth || 60;
          return {
            ...prev,
            showDetailPanel: true,
            gridWidth: preferredDetailWidth
          };
        } else {
          // If we're closing the detail panel
          // Use the stored width for non-detail view, or fallback to last manually set width
          const preferredNormalWidth = prev.gridWidthWithoutDetail || prev.lastSetWidth || 40;
          return {
            ...prev,
            showDetailPanel: false,
            gridWidth: preferredNormalWidth
          };
        }
      });
    };

    return {
      preferences,
      setGridWidth,
      toggleDetailPanel,
    };
  })();

  // When a bookmark is selected, show the detail panel
  useEffect(() => {
    if (selectedBookmarkId) {
      layoutPreferences.toggleDetailPanel(true);
    }
  }, [selectedBookmarkId]);
  
  // When the component mounts, make sure detail panel is hidden if no bookmark is selected
  useEffect(() => {
    if (!selectedBookmarkId && layoutPreferences.preferences.showDetailPanel) {
      layoutPreferences.toggleDetailPanel(false);
    }
  }, []);

  return (
    <div className="flex flex-1 h-full w-full">
      {/* Main content column */}
      <div className="flex-1 flex flex-col h-full w-full">
        {/* Unified navigation bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 w-full">
          {/* Search input and filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1">
              <Input
                type="text"
                placeholder="Search bookmarks, content, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 h-10 w-full"
              />
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              {searchQuery && (
                <X 
                  className="h-4 w-4 text-gray-400 absolute right-3 top-3 cursor-pointer" 
                  onClick={() => setSearchQuery("")}
                />
              )}
            </div>
            
            <FilterControls
              tags={allTags}
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              dateRange={dateRange}
              onDateRangeChange={(value) => {
                // Persist date range to localStorage
                localStorage.setItem('bookmarkDateRange', value);
                setDateRange(value);
              }}
              sources={sources}
              onSourcesChange={(values) => {
                // Persist sources to localStorage
                localStorage.setItem('bookmarkSources', JSON.stringify(values));
                setSources(values);
              }}
              tagMode={tagMode}
              onTagModeChange={(value) => {
                // Persist tag mode to localStorage
                localStorage.setItem('bookmarkTagMode', value);
                setTagMode(value);
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
                    {loadLimit === null ? `Show All (${fullBookmarks.length})` : `Show ${loadLimit}`}
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
                        onSelect={() => setLoadLimit(100)}
                        className="cursor-pointer"
                      >
                        <CheckIcon
                          className={`mr-2 h-4 w-4 ${
                            loadLimit === 100 ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <span>100</span>
                      </CommandItem>
                      <CommandItem
                        onSelect={() => setLoadLimit(null)}
                        className="cursor-pointer"
                      >
                        <CheckIcon
                          className={`mr-2 h-4 w-4 ${
                            loadLimit === null ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <span>Show All ({fullBookmarks.length})</span>
                      </CommandItem>
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
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
          ) : filteredBookmarks.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="bg-white p-8 rounded-lg shadow text-center max-w-md">
                <SearchX className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No bookmarks found</h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery
                    ? "Try using different search terms or filters"
                    : selectedTags.length > 0 || selectedDomain
                      ? `Try ${selectedTags.length > 0 && selectedDomain ? "removing some filters" : selectedTags.length > 0 ? "selecting different tags" : "choosing a different domain"}`
                      : user 
                        ? "Create your first bookmark to begin exploring your knowledge graph"
                        : "Login to see your personalized bookmarks"}
                </p>
                {user && (!searchQuery && !selectedTags.length && !selectedDomain) && (
                  <Button 
                    onClick={() => setAddBookmarkOpen(true)}
                    className="mt-2"
                  >
                    <BookmarkPlus className="mr-2 h-4 w-4" />
                    Create Your First Bookmark
                  </Button>
                )}
              </div>
            </div>
          ) : (
            // Use ResizablePanelGroup for layout
            <ResizablePanelGroup 
              direction="horizontal" 
              className="h-full rounded-lg overflow-hidden"
              onLayout={(sizes) => {
                // Only handle the resize if we have two panels (sizes array has length 2)
                if (sizes.length === 2) {
                  const gridWidth = Math.round(sizes[1]);
                  layoutPreferences.setGridWidth(gridWidth);
                }
              }}
            >
              {/* Graph panel */}
              <ResizablePanel 
                defaultSize={100 - layoutPreferences.preferences.gridWidth} 
                minSize={20}
                className="h-full"
              >
                <div className="h-full border border-gray-200 overflow-hidden bg-white">
                  <ForceDirectedGraph
                    bookmarks={filteredBookmarks}
                    insightLevel={insightLevel}
                    onNodeClick={handleSelectBookmark}
                    onTagClick={handleTagClick}
                    onDomainClick={handleDomainSelection}
                    selectedBookmarkId={selectedBookmarkId}
                    visibleNodeTypes={visibleNodeTypes}
                  />
                </div>
              </ResizablePanel>
              
              {/* Resizable handle with visual indicator */}
              <ResizableHandle withHandle />
              
              {/* Grid panel */}
              <ResizablePanel 
                defaultSize={layoutPreferences.preferences.gridWidth} 
                minSize={layoutPreferences.preferences.showDetailPanel && getSelectedBookmark() ? 60 : 20}
                className="h-full"
              >
                <div className={`flex h-full w-full ${
                  // Only apply min-width when detail panel is newly opened and we don't have a user preference
                  layoutPreferences.preferences.showDetailPanel && 
                  getSelectedBookmark() && 
                  // If we don't have a lastSetWidth or specifically set gridWidthWithDetail, use 720px min-width
                  !layoutPreferences.preferences.lastSetWidth && 
                  !layoutPreferences.preferences.gridWidthWithDetail
                  ? 'min-w-[540px]' 
                  : ''
                }`}>
                  {/* Detail panel (conditionally shown on left side) */}
                  {layoutPreferences.preferences.showDetailPanel && getSelectedBookmark() && (
                    <div className="w-1/2 min-w-[270px] border-r border-gray-200 bg-white overflow-auto">
                      <BookmarkDetailPanel
                        bookmark={getSelectedBookmark()}
                        onClose={() => {
                          setSelectedBookmarkId(null);
                          layoutPreferences.toggleDetailPanel(false);
                          
                          // Only trigger zoom-out when explicitly closing detail view
                          // with no new selection being made
                          setTimeout(() => {
                            // This event will be handled by the graph component to reset view
                            const event = new CustomEvent('centerFullGraph', { 
                              detail: { source: 'closeDetail' } 
                            });
                            document.dispatchEvent(event);
                          }, 50);
                        }}
                      />
                    </div>
                  )}
                  
                  {/* Bookmark grid (always on right) */}
                  <div className={`h-full ${layoutPreferences.preferences.showDetailPanel && getSelectedBookmark() ? 'w-1/2 min-w-[270px]' : 'w-full'} overflow-hidden border border-gray-200 bg-white`}>
                    <BookmarkGrid
                      bookmarks={sortedBookmarks}
                      selectedBookmarkId={selectedBookmarkId}
                      onSelectBookmark={handleSelectBookmark}
                      isLoading={isLoading}
                      isLoadingMore={isLoadingMore}
                      hasMore={hasMore}
                      onLoadMore={loadMoreBookmarks}
                    />
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
        
        {/* Filters display at the bottom of the graph area */}
        <div className="relative flex flex-col w-full bg-white border-t border-gray-200 px-4 py-2">
          {/* Absolute positioned toggle button - always visible and positioned relative to parent with padding */}
          <button
            onClick={toggleTagDrawer}
            aria-label={tagDrawerOpen ? "Close tag drawer" : "Open tag drawer"}
            className={`absolute right-0 ${
              tagDrawerOpen 
                ? 'top-2 bg-gray-100 p-1 flex items-center justify-center z-20' 
                : 'top-0 bottom-0 bg-transparent p-1 flex items-center justify-center'
            } hover:bg-gray-200 z-10`}
          >
            {(() => {
              // Calculate hidden tags count if drawer is closed
              if (!tagDrawerOpen) {
                // All available tags excluding those that are selected
                const availableTags = allTags.filter(tag => !selectedTags.includes(tag));
                
                // Calculate how many tags are visible in the single row
                const visibleTagLimit = visibleTagsCount;
                
                // Get the exact tags that are visible in the single row (non-selected popular tags)
                const visibleNonSelectedTags = popularTags
                  .filter(tag => !selectedTags.includes(tag))
                  .slice(0, visibleTagLimit);
                
                // Get the exact tag names that are visible
                const visibleTagNames = visibleNonSelectedTags.map(tag => tag);
                
                // Calculate how many unique tags are actually hidden by counting tags that:
                // 1. Are not selected (already filtered in availableTags)
                // 2. Are not visible in the single row
                const hiddenTagsCount = availableTags
                  .filter(tag => !visibleTagNames.includes(tag))
                  .length;
                
                if (hiddenTagsCount > 0) {
                  return (
                    <div className="flex items-center">
                      <span className="text-xs mr-1 font-medium">+{hiddenTagsCount}</span>
                      <ChevronUp className="h-4 w-4 text-gray-700" />
                    </div>
                  );
                }
              }
              
              // Default icons based on drawer state
              return tagDrawerOpen ? 
                <ChevronDown className="h-4 w-4 text-gray-700" /> : 
                <ChevronUp className="h-4 w-4 text-gray-700" />;
            })()}
          </button>
          
          {/* Bookmark filter indicator if a bookmark is selected */}
          {selectedBookmarkId && (
            <div className="mb-2 flex items-center">
              <span className="text-sm text-gray-600 mr-2">Focused on:</span>
              <Badge 
                variant="default"
                className="cursor-pointer bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  setSelectedBookmarkId(null);
                  
                  // Trigger zoom-out when clicking the badge
                  setTimeout(() => {
                    const event = new CustomEvent('centerFullGraph', { 
                      detail: { source: 'closeBookmarkFilter' } 
                    });
                    document.dispatchEvent(event);
                  }, 50);
                }}
              >
                {getSelectedBookmark()?.title || 'Bookmark'}
                <X 
                  className="h-3 w-3 ml-1" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBookmarkId(null);
                    
                    // Trigger zoom-out when clicking the X
                    setTimeout(() => {
                      const event = new CustomEvent('centerFullGraph', { 
                        detail: { source: 'closeBookmarkFilter' } 
                      });
                      document.dispatchEvent(event);
                    }, 50);
                  }}
                />
              </Badge>
            </div>
          )}
          
          {/* Domain filter indicator if selected */}
          {selectedDomain && (
            <div className="mb-2 flex items-center">
              <span className="text-sm text-gray-600 mr-2">Domain:</span>
              <Badge 
                variant="default"
                className="cursor-pointer bg-green-600 hover:bg-green-700"
                onClick={() => handleDomainSelection(selectedDomain)}
              >
                {selectedDomain}
                <X 
                  className="h-3 w-3 ml-1" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDomainSelection(selectedDomain);
                  }}
                />
              </Badge>
            </div>
          )}
          
          {/* Selected tag filters indicator when drawer is closed */}
          {!tagDrawerOpen && selectedTags.length > 0 && (
            <div className="mb-2 flex items-center flex-wrap gap-1">
              <span className="text-sm text-gray-600 mr-1">Tags:</span>
              {selectedTags.map((tag, index) => {
                // Check if tag is system or user tag
                const tagObj = tags.find(t => t.name === tag);
                const isSystemTag = tagObj?.type === "system";
                
                return (
                  <Badge 
                    key={`selected-${tag}-${index}`}
                    variant="default"
                    className={`cursor-pointer ${
                      isSystemTag ? 'bg-primary hover:bg-primary/90' : 'bg-primary hover:bg-primary/90'
                    }`}
                    onClick={() => toggleTagSelection(tag)}
                  >
                    {tag}
                    <X 
                      className="h-3 w-3 ml-1" 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTagSelection(tag);
                      }}
                    />
                  </Badge>
                );
              })}
              
              {/* Clear All button when multiple tags are selected */}
              {selectedTags.length > 1 && (
                <Badge 
                  variant="secondary"
                  className="cursor-pointer bg-gray-100 hover:bg-gray-200 flex items-center ml-1"
                  onClick={() => setSelectedTags([])}
                >
                  Clear All <X className="h-3 w-3 ml-1" />
                </Badge>
              )}
            </div>
          )}
          
          {/* Tags drawer - with max height and scrolling */}
          <div 
            ref={tagContainerRef} 
            className={`flex flex-wrap gap-1 items-start ${
              tagDrawerOpen ? 'max-h-[300px] overflow-y-auto' : ''
            }`}
          >
            {/* Header with system tags toggle when drawer is open */}
            {tagDrawerOpen && (
              <div className="w-full flex justify-between items-center mb-2 sticky top-0 z-10 bg-white py-2 border-b border-gray-200 pr-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Tags</span>
                  <Badge variant="outline" className="text-xs bg-gray-50">
                    {userTagNames.length} user tag{userTagNames.length !== 1 ? 's' : ''}
                  </Badge>
                  {showSystemTags && (
                    <Badge variant="outline" className="text-xs bg-gray-50">
                      {systemTagNames.length} system tag{systemTagNames.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-gray-500">System tags</span>
                    <button 
                      onClick={toggleSystemTags}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        showSystemTags ? 'bg-primary' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          showSystemTags ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  
                  {selectedTags.length > 0 && (
                    <Badge 
                      variant="secondary"
                      className="cursor-pointer bg-gray-100 hover:bg-gray-200 flex items-center ml-2"
                      onClick={() => setSelectedTags([])}
                    >
                      Clear All <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                </div>
              </div>
            )}
            
            {/* Tags display - different behavior based on drawer state */}
            {(() => {
              // When drawer is open, show all tags with type distinction
              if (tagDrawerOpen) {
                // Get all tags from our database with their type information
                const tagsWithType = allTags.map(tagName => {
                  const tagObj = tags.find(t => t.name === tagName);
                  return {
                    name: tagName,
                    type: tagObj?.type || 'user'
                  };
                });
                
                return tagsWithType.map((tag, index) => {
                  const isSelected = selectedTags.includes(tag.name);
                  const isSystemTag = tag.type === 'system';
                  
                  return (
                    <Badge 
                      key={`tag-${tag.name}-${index}`}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer ${
                        isSelected 
                          ? 'bg-primary hover:bg-primary/90'
                          : isSystemTag ? 'text-primary border-primary/20 hover:bg-primary/5' : ''
                      }`}
                      onClick={() => toggleTagSelection(tag.name)}
                    >
                      {tag.name}
                      {isSelected && (
                        <X 
                          className="h-3 w-3 ml-1" 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTagSelection(tag.name);
                          }}
                        />
                      )}
                    </Badge>
                  );
                });
              } 
              
              // When drawer is closed, limit to calculated number of visible tags
              // Calculate how many slots we have for non-selected tags
              const visibleTagLimit = visibleTagsCount;
              // Filter popular tags that aren't already selected
              const availableTags = popularTags.filter(tag => !selectedTags.includes(tag));
              // Take only as many as will fit in one row
              const limitedTags = availableTags.slice(0, visibleTagLimit);
              
              // Return the badges for visible tags with type distinction
              return limitedTags.map((tagName, index) => {
                const tagObj = tags.find(t => t.name === tagName);
                const isSystemTag = tagObj?.type === 'system';
                
                return (
                  <Badge 
                    key={`tag-${tagName}-${index}`}
                    variant="outline"
                    className={`cursor-pointer ${
                      isSystemTag ? 'text-primary border-primary/20 hover:bg-primary/5' : ''
                    }`}
                    onClick={() => toggleTagSelection(tagName)}
                  >
                    {tagName}
                  </Badge>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Add Bookmark Dialog */}
      <AddBookmarkDialog
        open={addBookmarkOpen}
        onOpenChange={setAddBookmarkOpen}
        onBookmarkAdded={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
          toast({
            title: "Bookmark added",
            description: "Your bookmark has been added to your graph",
          });
        }}
      />
    </div>
  );
}
