import { Bookmark } from "@shared/types";
import { CalendarIcon, Clock, Link2 } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface BookmarkListViewProps {
  bookmarks: Bookmark[];
  selectedBookmarkId: string | null;
  onSelectBookmark: (id: string) => void;
  isLoading: boolean;
}

export function BookmarkListView({
  bookmarks,
  selectedBookmarkId,
  onSelectBookmark,
  isLoading,
}: BookmarkListViewProps) {
  return (
    <div className="p-3 overflow-auto h-full flex-1 w-full">
      {isLoading ? (
        <div className="flex items-center justify-center h-full min-h-[200px] w-full">
          <div className="text-center">
            <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading bookmarks...</p>
          </div>
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="flex items-center justify-center h-full min-h-[200px] w-full">
          <div className="text-center py-8 text-gray-500">
            No bookmarks found. Try adjusting your filters.
          </div>
        </div>
      ) : (
        <div className="space-y-4 w-full">
          {bookmarks.map((bookmark) => (
            <BookmarkListItem
              key={bookmark.id}
              bookmark={bookmark}
              isSelected={selectedBookmarkId === bookmark.id}
              onClick={() => onSelectBookmark(bookmark.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface BookmarkListItemProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onClick: () => void;
}

function BookmarkListItem({ bookmark, isSelected, onClick }: BookmarkListItemProps) {
  // Format date to a readable format
  const formatDate = (date: string | Date) => {
    try {
      return format(new Date(date), 'MMM d, yyyy');
    } catch (error) {
      return 'Unknown date';
    }
  };

  // Extract domain from URL
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return 'Unknown domain';
    }
  };
  
  // Setup prefetching on hover
  const [isPrefetching, setIsPrefetching] = useState(false);
  const hoverDelayRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();
  
  // Handle mouse enter/hover
  const handleMouseEnter = useCallback(() => {
    // Set a delay before prefetching to avoid unnecessary API calls for quick cursor movements
    hoverDelayRef.current = setTimeout(() => {
      // Only prefetch if we're not already doing so
      if (!isPrefetching) {
        setIsPrefetching(true);
        
        // Start prefetching the bookmark details - this is the main consolidated endpoint
        queryClient.prefetchQuery({
          queryKey: [`/api/bookmarks/${bookmark.id}/details`],
          staleTime: 60000, // 1 minute stale time for prefetched data
        });
        
        // Also prefetch the basic bookmark data as a fallback
        queryClient.prefetchQuery({
          queryKey: [`/api/bookmarks/${bookmark.id}`],
          staleTime: 60000,
        });
        
        console.log(`Prefetching details for bookmark ${bookmark.id} (list view)`);
      }
    }, 300); // 300ms delay - only prefetch if the user hovers for at least this long
  }, [bookmark.id, isPrefetching, queryClient]);
  
  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    // Clear the timeout if the user moves away before the delay completes
    if (hoverDelayRef.current) {
      clearTimeout(hoverDelayRef.current);
      hoverDelayRef.current = null;
    }
    
    // Reset prefetching state
    setIsPrefetching(false);
  }, []);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (hoverDelayRef.current) {
        clearTimeout(hoverDelayRef.current);
      }
    };
  }, []);

  return (
    <div 
      className={`cursor-pointer bg-white overflow-hidden border border-gray-200 rounded-xl hover:shadow-md transition-all p-4 ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <h3 className="font-medium text-base mb-2 line-clamp-2">{bookmark.title}</h3>
      
      {bookmark.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{bookmark.description}</p>
      )}
      
      <div className="flex items-center text-xs text-gray-500 space-x-4">
        <div className="flex items-center">
          <Link2 className="w-3.5 h-3.5 mr-1" />
          <span>{getDomain(bookmark.url)}</span>
        </div>
        
        <div className="flex items-center">
          <CalendarIcon className="w-3.5 h-3.5 mr-1" />
          <span>Saved {formatDate(bookmark.date_saved)}</span>
        </div>
        
        {bookmark.created_at && (
          <div className="flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1" />
            <span>Created {formatDate(bookmark.created_at)}</span>
          </div>
        )}
      </div>
    </div>
  );
}