import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, ChevronDown, Clock, CalendarPlus } from "lucide-react";
import { Bookmark } from "@shared/types";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { useEffect, useState } from "react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Tag interface
interface Tag {
  id: string;
  name: string;
  type: string;
  count: number;
  created_at: string;
}

interface BookmarkCardProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onClick: () => void;
}

function BookmarkCard({ bookmark, isSelected, onClick }: BookmarkCardProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  
  // Fetch tags for this bookmark
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await fetch(`/api/bookmarks/${bookmark.id}/tags`);
        if (response.ok) {
          const bookmarkTags = await response.json();
          setTags(bookmarkTags);
        }
      } catch (error) {
        console.error("Error fetching tags for bookmark:", error);
      }
    };
    
    fetchTags();
  }, [bookmark.id]);
  
  // Prepare tag names for display
  const tagNames = tags.map(tag => tag.name);
  const systemTags = bookmark.system_tags || [];
  const allTags = [...tagNames, ...systemTags];
  
  return (
    <div 
      className={`p-3 rounded-lg border cursor-pointer transition-all duration-300 ease-in-out ${
        isSelected
          ? "bg-primary-50 border-primary" 
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
      onClick={onClick}
    >
      <h3 className="font-medium mb-1 line-clamp-1">{bookmark.title}</h3>
      <p className="text-xs text-gray-500 truncate">{bookmark.url}</p>
    </div>
  );
}

interface SidebarPanelProps {
  bookmarks: Bookmark[];
  selectedBookmark?: Bookmark;
  onSelectBookmark: (bookmarkId: string) => void;
  onCloseDetail: () => void;
  isLoading: boolean;
  sortOrder?: string;
  onSortChange?: (value: string) => void;
}

export function SidebarPanel({ 
  bookmarks, 
  selectedBookmark, 
  onSelectBookmark, 
  onCloseDetail,
  isLoading,
  sortOrder = "newest",
  onSortChange
}: SidebarPanelProps) {
  
  // Listen for bookmark update events
  useEffect(() => {
    const handleBookmarkUpdated = (e: Event) => {
      // Cast to CustomEvent with the expected detail type
      const event = e as CustomEvent<{bookmarkId: string; updatedBookmark: Bookmark}>;
      
      // If we're using "recently_updated" sort, the bookmark list will be 
      // automatically updated through the optimistic update in the parent component
      console.log(`Bookmark updated event received in sidebar for bookmark: ${event.detail?.bookmarkId}`);
    };
    
    // Add event listener for the custom event
    window.addEventListener('bookmarkUpdated', handleBookmarkUpdated);
    
    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('bookmarkUpdated', handleBookmarkUpdated);
    };
  }, []);

  // If a bookmark is selected, show the detail panel
  if (selectedBookmark) {
    return (
      <BookmarkDetailPanel 
        bookmark={selectedBookmark} 
        onClose={onCloseDetail} 
      />
    );
  }
  
  // Otherwise, show the list of bookmarks
  return (
    <>
      <div className="border-b border-gray-200">
        <div className="p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Bookmarks</h2>
        </div>
        
        {/* Sorting controls */}
        <div className="pb-3 px-4">
          <Select
            value={sortOrder}
            onValueChange={(value) => onSortChange?.(value)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">
                <div className="flex items-center">
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  <span>Date Added (Newest)</span>
                </div>
              </SelectItem>
              <SelectItem value="oldest">
                <div className="flex items-center">
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  <span>Date Added (Oldest)</span>
                </div>
              </SelectItem>
              <SelectItem value="recently_updated">
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>Recently Updated</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="p-4 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading bookmarks...</p>
            </div>
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No bookmarks found. Try adjusting your filters.
          </div>
        ) : (
          <div className="flex flex-col space-y-3 transition-all">
            {bookmarks.map(bookmark => (
              <div key={bookmark.id} className="transition-all duration-300 ease-in-out">
                <BookmarkCard
                  bookmark={bookmark}
                  isSelected={selectedBookmark ? selectedBookmark.id === bookmark.id : false}
                  onClick={() => onSelectBookmark(bookmark.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}