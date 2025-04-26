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
  
  // Check if the bookmark has media (from X.com, screenshots, etc.)
  const hasMedia = (bookmark.media_urls && bookmark.media_urls.length > 0) || (bookmark.screenshots && bookmark.screenshots.length > 0);
  
  // Function to get the first available media URL
  const getMediaUrl = () => {
    if (bookmark.media_urls && bookmark.media_urls.length > 0) {
      return bookmark.media_urls[0];
    }
    if (bookmark.screenshots && bookmark.screenshots.length > 0) {
      return bookmark.screenshots[0].image_url;
    }
    return null;
  };
  
  const mediaUrl = getMediaUrl();
  
  return (
    <div 
      className={`rounded-lg border cursor-pointer transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${
        isSelected
          ? "bg-primary-50 border-primary" 
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
      onClick={onClick}
    >
      {/* Media section (if available) */}
      {mediaUrl && (
        <div className="relative aspect-video w-full overflow-hidden">
          <img 
            src={mediaUrl} 
            alt="Bookmark media"
            className="object-cover w-full h-full"
            onError={(e) => {
              // Hide the image if it fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      
      {/* Content section */}
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="font-medium mb-1 line-clamp-2">{bookmark.title}</h3>
        <p className="text-xs text-gray-500 truncate mb-2">{bookmark.url}</p>
        
        {/* Show up to 3 tags if available */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto">
            {allTags.slice(0, 3).map((tag, idx) => (
              <Badge 
                key={`card-tag-${idx}`} 
                variant="secondary" 
                className="text-xs px-1.5 py-0.5"
              >
                {tag}
              </Badge>
            ))}
            {allTags.length > 3 && (
              <span className="text-xs text-gray-400">+{allTags.length - 3}</span>
            )}
          </div>
        )}
      </div>
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
        {/* Sorting controls in the nav area, replacing the heading for consistent height */}
        <div className="px-4 py-3">
          <Select
            value={sortOrder}
            onValueChange={(value) => onSortChange?.(value)}
          >
            <SelectTrigger className="w-full h-10">
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