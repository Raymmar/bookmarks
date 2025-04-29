import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons";
import { X, LayoutGrid, Search, ChevronUp, ChevronDown, BookmarkPlus, SearchX } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Bookmark } from "@shared/types";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { BookmarkGrid } from "@/components/responsive-bookmark-grid";
import { useCollectionBookmarksForGraph, useMultiCollectionBookmarksForGraph } from "@/hooks/use-collection-queries";

// Define types
type VisibleNodeType = { id: string; label: string; visible: boolean };
type SortOption = "recent" | "oldest" | "title" | "popularity";
type BookmarkWithTags = Bookmark & { tags: Tag[] };
interface Tag {
  id: string;
  name: string;
  type: string;
  count?: number;
  created_at?: string;
}

// Function component for the Bookmarks View
export default function BookmarksView() {
  // Auth and navigation state
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // UI state management
  const [isAddBookmarkOpen, setIsAddBookmarkOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("recent");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // Track window width for responsive layout
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global bookmark data 
  const { 
    data: bookmarks = [], 
    isLoading: isLoadingBookmarks,
    refetch: refetchBookmarks
  } = useQuery<Bookmark[]>({
    queryKey: ["/api/bookmarks"],
    queryFn: async () => {
      return apiRequest('GET', '/api/bookmarks');
    }
  });

  // Tags data
  const {
    data: tags = [],
    isLoading: isLoadingTags,
    refetch: refetchTags
  } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      return apiRequest('GET', '/api/tags');
    }
  });
  
  // Define collection type
  interface Collection {
    id: string;
    name: string;
    user_id: string;
    is_public: boolean;
    created_at: string;
  }

  // Collections data
  const { 
    data: collections = [], 
    isLoading: isLoadingCollections
  } = useQuery<Collection[]>({
    queryKey: ['/api/collections'],
    queryFn: async () => {
      return apiRequest('GET', '/api/collections');
    }
  });

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

  // Extract unique domains from bookmarks
  const domains = useMemo(() => {
    const uniqueDomains = new Set<string>();
    bookmarks.forEach(bookmark => {
      try {
        const url = new URL(bookmark.url);
        uniqueDomains.add(url.hostname.replace('www.', ''));
      } catch (e) {
        // Skip invalid URLs
      }
    });
    return Array.from(uniqueDomains).sort();
  }, [bookmarks]);

  // Fetch bookmark-tag associations for both the selected collection and all bookmarks
  const { data: bookmarksWithTags = [], isLoading: isLoadingBookmarkTags, refetch: refetchBookmarkTags } = useQuery<BookmarkWithTags[]>({
    queryKey: ["/api/bookmarks-with-tags", selectedCollectionId, selectedCollectionIds],
    enabled: !isLoadingBookmarks && !isLoadingTags && !isLoadingSingleCollection && !isLoadingMultiCollections,
    queryFn: async () => {
      try {
        // Determine which bookmarks to display based on collection selection
        const displayBookmarks = selectedCollectionIds.length > 1 ? multiCollectionBookmarks : 
                                 selectedCollectionId ? singleCollectionBookmarks : bookmarks;
        
        // For tag relationships, we need both the displayed bookmarks and all bookmarks
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
        
        const tagsByBookmarkId = await response.json();
        
        // Map tags to bookmarks
        return displayBookmarks.map(bookmark => ({
          ...bookmark,
          tags: tagsByBookmarkId[bookmark.id] || []
        }));
      } catch (error) {
        console.error("Error fetching bookmark-tag associations:", error);
        return [];
      }
    }
  });

  // Listen for user authentication changes and refresh bookmarks
  useEffect(() => {
    console.log("User authentication state changed, refreshing bookmark data");
    
    // Always invalidate and refetch all related queries
    queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
    
    // If a bookmark was selected, reset the selection on authentication change
    setSelectedBookmarkId(null);
    setSelectedTags([]);
    setSelectedDomain(null);
  }, [user, queryClient]);

  // Get the selected bookmark object
  const getSelectedBookmark = () => {
    if (!selectedBookmarkId) return null;
    return bookmarksWithTags.find(b => b.id === selectedBookmarkId) || null;
  };

  // Handle bookmark selection
  const handleSelectBookmark = (id: string) => {
    // If we're already viewing this bookmark, close the detail panel
    if (id === selectedBookmarkId && showDetailPanel) {
      setSelectedBookmarkId(null);
      setShowDetailPanel(false);
    } else {
      setSelectedBookmarkId(id);
      setShowDetailPanel(true);
    }
  };

  // Handle tag selection for filtering
  const handleTagClick = (tagName: string) => {
    // Toggle tag selection
    if (selectedTags.includes(tagName)) {
      setSelectedTags(selectedTags.filter(tag => tag !== tagName));
    } else {
      setSelectedTags([...selectedTags, tagName]);
    }
    
    // Clear domain and bookmark selection when changing filters
    setSelectedDomain(null);
    setSelectedBookmarkId(null);
    setShowDetailPanel(false);
  };

  // Handle domain selection for filtering
  const handleDomainSelection = (domain: string) => {
    if (selectedDomain === domain) {
      setSelectedDomain(null);
    } else {
      setSelectedDomain(domain);
    }
    
    // Clear tag and bookmark selection when changing filters
    setSelectedTags([]);
    setSelectedBookmarkId(null);
    setShowDetailPanel(false);
  };

  // Filter bookmarks based on search, tags, domain
  const filteredBookmarks = useMemo(() => {
    let result = bookmarksWithTags;
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(bookmark => {
        // Search in title
        if (bookmark.title && bookmark.title.toLowerCase().includes(query)) return true;
        
        // Search in description
        if (bookmark.description && bookmark.description.toLowerCase().includes(query)) return true;
        
        // Search in URL
        if (bookmark.url.toLowerCase().includes(query)) return true;
        
        // Search in tags
        if (bookmark.tags && bookmark.tags.some(tag => tag.name.toLowerCase().includes(query))) return true;
        
        return false;
      });
    }
    
    // Filter by selected tags
    if (selectedTags.length > 0) {
      result = result.filter(bookmark => {
        return selectedTags.every(tagName => {
          return bookmark.tags && bookmark.tags.some(tag => tag.name === tagName);
        });
      });
    }
    
    // Filter by selected domain
    if (selectedDomain) {
      result = result.filter(bookmark => {
        try {
          const url = new URL(bookmark.url);
          const domain = url.hostname.replace('www.', '');
          return domain === selectedDomain;
        } catch (e) {
          return false;
        }
      });
    }
    
    return result;
  }, [bookmarksWithTags, searchQuery, selectedTags, selectedDomain]);

  // Sort filtered bookmarks
  const sortedBookmarks = useMemo(() => {
    switch (sortOption) {
      case "recent":
        return [...filteredBookmarks].sort((a, b) => 
          new Date(b.date_saved).getTime() - new Date(a.date_saved).getTime()
        );
      case "oldest":
        return [...filteredBookmarks].sort((a, b) => 
          new Date(a.date_saved).getTime() - new Date(b.date_saved).getTime()
        );
      case "title":
        return [...filteredBookmarks].sort((a, b) => 
          (a.title || "").localeCompare(b.title || "")
        );
      case "popularity":
        // Sort by number of tags as a simple popularity metric
        return [...filteredBookmarks].sort((a, b) => 
          (b.tags?.length || 0) - (a.tags?.length || 0)
        );
      default:
        return filteredBookmarks;
    }
  }, [filteredBookmarks, sortOption]);

  // Check if we need to show the add bookmark dialog for empty state
  const showEmptyState = !isLoadingBookmarks && bookmarks.length === 0;

  // Determine if there are any active filters
  const hasActiveFilters = searchQuery.trim() !== '' || selectedTags.length > 0 || selectedDomain !== null || selectedCollectionId !== null;

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
    setSelectedDomain(null);
    setSelectedCollectionId(null);
    setSelectedCollectionIds([]);
    setSelectedBookmarkId(null);
    setShowDetailPanel(false);
  };

  return (
    <div className="w-full h-full overflow-hidden flex flex-col">
      {/* Top Control Bar */}
      <div className="p-4 border-b bg-white">
        <div className="flex flex-col lg:flex-row justify-between gap-4">
          {/* Left controls: search and button */}
          <div className="flex items-center space-x-2 flex-1">
            {/* Search bar with clear button */}
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                type="search"
                placeholder="Search bookmarks..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  className="absolute right-2.5 top-2.5"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>
            
            {/* Add bookmark button */}
            <Button onClick={() => setIsAddBookmarkOpen(true)}>
              <BookmarkPlus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
          
          {/* Right controls: filters and sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Collection filter */}
            <Select 
              value={selectedCollectionId || "all"} 
              onValueChange={(value) => setSelectedCollectionId(value === "all" ? null : value)}
            >
              <SelectTrigger className="min-w-[180px]">
                <SelectValue placeholder="All Collections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Collections</SelectItem>
                {collections.map((collection: Collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Domain filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-shrink-0">
                  {selectedDomain ? `Domain: ${selectedDomain}` : "Domain"}
                  <CaretSortIcon className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search domain..." className="h-9" />
                  <CommandEmpty>No domain found.</CommandEmpty>
                  <CommandGroup>
                    {domains.map((domain) => (
                      <CommandItem
                        key={domain}
                        onSelect={() => handleDomainSelection(domain)}
                      >
                        {domain}
                        <CheckIcon
                          className={`ml-auto h-4 w-4 ${
                            selectedDomain === domain ? "opacity-100" : "opacity-0"
                          }`}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
            
            {/* Tag filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-shrink-0">
                  {selectedTags.length ? `${selectedTags.length} Tags` : "Tags"}
                  <CaretSortIcon className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search tags..." className="h-9" />
                  <CommandEmpty>No tags found.</CommandEmpty>
                  <CommandGroup>
                    {tags.map((tag) => (
                      <CommandItem
                        key={tag.id}
                        onSelect={() => handleTagClick(tag.name)}
                      >
                        {tag.name}
                        <CheckIcon
                          className={`ml-auto h-4 w-4 ${
                            selectedTags.includes(tag.name) ? "opacity-100" : "opacity-0"
                          }`}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
            
            {/* Sort options */}
            <Select 
              value={sortOption} 
              onValueChange={(value) => setSortOption(value as SortOption)}
            >
              <SelectTrigger className="min-w-[120px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="title">By Title</SelectItem>
                <SelectItem value="popularity">Popularity</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Clear all filters button */}
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearAllFilters} className="flex-shrink-0">
                <X className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </div>
        
        {/* Active filters display (tags) */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedTags.map(tag => (
              <Badge key={tag} variant="outline" className="flex items-center gap-1">
                {tag}
                <X 
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                />
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {/* Show loading state or empty state */}
        {isLoadingBookmarks || isLoadingTags || isLoadingBookmarkTags ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading bookmarks...</p>
            </div>
          </div>
        ) : showEmptyState ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-center max-w-md p-6 rounded-lg bg-white border border-gray-200">
              <BookmarkPlus className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">No bookmarks yet</h3>
              <p className="text-gray-500 mb-4">
                Start building your knowledge graph by adding your first bookmark.
              </p>
              <Button 
                onClick={() => setIsAddBookmarkOpen(true)} 
                className="mt-2"
              >
                <BookmarkPlus className="mr-2 h-4 w-4" />
                Create Your First Bookmark
              </Button>
            </div>
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-center max-w-md p-6 rounded-lg bg-white border border-gray-200">
              <SearchX className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">No results found</h3>
              <p className="text-gray-500 mb-4">
                Try adjusting your search or filters to find what you're looking for.
              </p>
              <Button 
                onClick={clearAllFilters} 
                variant="outline"
              >
                <X className="mr-2 h-4 w-4" />
                Clear All Filters
              </Button>
            </div>
          </div>
        ) : (
          // Main content: detail panel and bookmark grid
          <div className="flex h-full">
            {/* Detail panel (conditionally shown) */}
            {showDetailPanel && getSelectedBookmark() && (
              <div className="w-1/2 min-w-[320px] max-w-[600px] border-r border-gray-200 bg-white overflow-auto">
                <BookmarkDetailPanel
                  bookmark={getSelectedBookmark() as Bookmark}
                  onClose={() => {
                    setSelectedBookmarkId(null);
                    setShowDetailPanel(false);
                  }}
                />
              </div>
            )}
            
            {/* Bookmark grid */}
            <div className={`h-full ${showDetailPanel && getSelectedBookmark() ? 'w-1/2 min-w-[270px]' : 'w-full'} overflow-hidden border border-gray-200 bg-white`}>
              <BookmarkGrid
                bookmarks={sortedBookmarks}
                selectedBookmarkId={selectedBookmarkId}
                onSelectBookmark={handleSelectBookmark}
                isLoading={isLoadingBookmarks}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Add Bookmark Dialog */}
      <AddBookmarkDialog 
        open={isAddBookmarkOpen}
        onOpenChange={setIsAddBookmarkOpen}
        onBookmarkAdded={() => {
          // Refetch all necessary data after adding a bookmark
          refetchBookmarks();
          refetchTags();
          refetchBookmarkTags();
        }}
      />
    </div>
  );
}