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
  // Function to fix X.com image URLs
  const fixTwitterImageUrl = (url: string): string => {
    // If it's already a pbs.twimg.com URL, return it as is
    if (url.includes('pbs.twimg.com')) {
      return url;
    }
    
    // Try to extract the image ID from the URL
    const twitterImgRegex = /https?:\/\/(pbs\.)?twimg\.com\/media\/([A-Za-z0-9_-]+)\.\w+(\?.+)?/;
    const match = url.match(twitterImgRegex);
    
    if (match && match[2]) {
      // Rebuild the URL to use pbs.twimg.com with format=jpg to ensure compatibility
      return `https://pbs.twimg.com/media/${match[2]}?format=jpg&name=large`;
    }
    
    // Return the original URL if we couldn't transform it
    return url;
  };
  
  // Check if the bookmark has media (from X.com, screenshots, etc.)
  const hasMedia = (bookmark.media_urls && bookmark.media_urls.length > 0) || (bookmark.screenshots && bookmark.screenshots.length > 0);
  
  // Function to get the first available media URL with proper formatting
  const getMediaUrl = () => {
    if (bookmark.media_urls && bookmark.media_urls.length > 0) {
      return fixTwitterImageUrl(bookmark.media_urls[0]);
    }
    if (bookmark.screenshots && bookmark.screenshots.length > 0) {
      return bookmark.screenshots[0].image_url;
    }
    return null;
  };
  
  const mediaUrl = getMediaUrl();
  
  return (
    <div 
      className={`rounded-lg border cursor-pointer transition-all duration-300 ease-in-out overflow-hidden shadow-sm hover:shadow-md ${
        isSelected
          ? "bg-primary-50 border-primary" 
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
      onClick={onClick}
    >
      {/* Media section (if available) */}
      {mediaUrl && (
        <div className="w-full overflow-hidden">
          <img 
            src={mediaUrl} 
            alt=""
            className="w-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Hide the image if it fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      
      {/* Content section - minimized for grid view */}
      <div className="p-2">
        <h3 className="text-sm font-medium line-clamp-1">{bookmark.title}</h3>
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
          <div className="masonry-grid">
            {bookmarks.map((bookmark) => {
              // Type assertion to ensure TypeScript recognizes bookmark properties
              const typedBookmark = bookmark as unknown as {
                id: string;
                media_urls?: string[];
                screenshots?: Array<{image_url: string}>;
              };
              
              return (
                <div key={typedBookmark.id}>
                  <BookmarkCard
                    bookmark={bookmark}
                    isSelected={selectedBookmark ? 
                      (selectedBookmark as unknown as {id: string}).id === typedBookmark.id : false}
                    onClick={() => onSelectBookmark(typedBookmark.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}