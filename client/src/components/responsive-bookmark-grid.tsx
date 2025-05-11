import { Bookmark } from "@shared/types";
import { useState, useEffect, useRef, RefObject } from "react";
import Masonry from "react-masonry-css";
import { Loader2 } from "lucide-react";
import { BookmarkCard } from "./bookmark-card";

interface BookmarkGridProps {
  bookmarks: Bookmark[];
  selectedBookmarkId: string | null;
  onSelectBookmark: (id: string) => void;
  isLoading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  loaderRef?: RefObject<HTMLDivElement>;
}

export function BookmarkGrid({
  bookmarks,
  selectedBookmarkId,
  onSelectBookmark,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  loaderRef
}: BookmarkGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [breakpointCols, setBreakpointCols] = useState(2);
  
  // Constants for minimum and maximum card widths (in pixels)
  const MIN_CARD_WIDTH = 270;
  const MAX_CARD_WIDTH = 360;
  const GRID_GAP = 12; // 0.75rem = 12px
  
  // Effect to calculate optimal number of columns based on container width
  useEffect(() => {
    const calculateColumns = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      
      // Calculate how many columns can fit
      const maxPossibleColumns = Math.floor((containerWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP));
      
      // Ensure at least 1 column, at most 5 columns
      // Using a higher max column count for better space utilization
      const columns = Math.max(1, Math.min(5, maxPossibleColumns));
      
      setBreakpointCols(columns);
    };
    
    // Calculate on mount
    calculateColumns();
    
    // Recalculate when window is resized
    window.addEventListener('resize', calculateColumns);
    
    // Create a ResizeObserver to watch for container width changes
    // This handles when the user drags the panel divider
    const resizeObserver = new ResizeObserver(calculateColumns);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', calculateColumns);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="p-3 overflow-auto h-full flex-1 w-full" ref={containerRef}>
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
        <div className="flex flex-col">
          <Masonry
            breakpointCols={breakpointCols}
            className="masonry-grid w-full h-full"
            columnClassName="masonry-grid-column"
          >
            {bookmarks.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                isSelected={selectedBookmarkId === bookmark.id}
                onClick={() => onSelectBookmark(bookmark.id)}
              />
            ))}
          </Masonry>
          
          {/* Loading indicator that appears after content */}
          {isFetchingNextPage && (
            <div className="flex justify-center items-center py-4 mt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading more bookmarks...</span>
              </div>
            </div>
          )}
          
          {/* Invisible element for intersection observer */}
          {hasNextPage && (
            <div 
              ref={loaderRef} 
              className="w-full mt-6"
              style={{ height: '20px', opacity: 0 }} // Almost invisible but still detectable by intersection observer
            />
          )}
        </div>
      )}
    </div>
  );
}

