import { Bookmark } from "@shared/types";
import { useState, useEffect, useRef } from "react";
import Masonry from "react-masonry-css";

interface BookmarkGridProps {
  bookmarks: Bookmark[];
  selectedBookmarkId: string | null;
  onSelectBookmark: (id: string) => void;
  isLoading: boolean;
}

export function BookmarkGrid({
  bookmarks,
  selectedBookmarkId,
  onSelectBookmark,
  isLoading,
}: BookmarkGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [breakpointCols, setBreakpointCols] = useState(2);
  
  // Constants for minimum and maximum card widths (in pixels)
  const MIN_CARD_WIDTH = 300;
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
    <div className="p-3 overflow-auto h-full" ref={containerRef}>
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
        <Masonry
          breakpointCols={breakpointCols}
          className="masonry-grid"
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
      )}
    </div>
  );
}

interface BookmarkCardProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onClick: () => void;
}

function BookmarkCard({ bookmark, isSelected, onClick }: BookmarkCardProps) {
  const hasImage = bookmark.media_urls && 
                  bookmark.media_urls.length > 0 && 
                  bookmark.media_urls.some(url => url.includes('pbs.twimg.com'));

  return (
    <div 
      className={`cursor-pointer bg-white overflow-hidden border border-gray-200 rounded-xl hover:shadow-md transition-all mb-4 inline-block w-full break-inside-avoid ${
        isSelected
          ? "ring-2 ring-primary" 
          : ""
      } ${hasImage ? 'group' : ''}`}
      onClick={onClick}
    >
      {/* Media section */}
      {hasImage && (
        <div className="overflow-hidden relative">
          {bookmark.media_urls
            ?.filter(url => url.includes('pbs.twimg.com'))
            .slice(0, 1) // Only show the first image in the card
            .map((url, index) => (
              <div 
                key={index}
                className="overflow-hidden"
              >
                <img 
                  src={url} 
                  alt=""
                  className="w-full h-auto object-cover"
                  loading="lazy"
                  onError={(e) => {
                    // If image fails to load, hide it
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            ))}
          
          {/* Overlay title for image cards - shows on hover */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent h-3/5 flex flex-col justify-end text-white">
            <h3 className="text-sm font-medium line-clamp-2">{bookmark.title}</h3>
          </div>
        </div>
      )}
      
      {/* Title section for cards without images */}
      {!hasImage && (
        <div className="p-3">
          <h3 className="text-sm font-medium line-clamp-3">{bookmark.title}</h3>
        </div>
      )}
    </div>
  );
}