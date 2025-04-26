import { Bookmark } from "@shared/types";
import { useState, useEffect, useRef } from "react";

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
  const [columns, setColumns] = useState(2);
  
  // Constants for minimum and maximum card widths (in pixels)
  const MIN_CARD_WIDTH = 360;
  const MAX_CARD_WIDTH = 480;
  const GRID_GAP = 8; // 0.5rem = 8px
  
  // Effect to calculate columns based on container width
  useEffect(() => {
    const calculateColumns = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      
      // Calculate how many cards can fit based on min/max constraints
      // Subtract gap space from available width before calculating
      const availableWidth = containerWidth - GRID_GAP;
      
      // Calculate ideal columns based on minimum width
      const maxPossibleColumns = Math.floor(availableWidth / MIN_CARD_WIDTH);
      
      // Ensure at least 1 column, at most 4 columns
      const idealColumns = Math.max(1, Math.min(4, maxPossibleColumns));
      
      // If the resulting card width would be too large, add another column
      const cardWidth = availableWidth / idealColumns;
      if (cardWidth > MAX_CARD_WIDTH && idealColumns < 4) {
        setColumns(idealColumns + 1);
      } else {
        setColumns(idealColumns);
      }
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
  
  // Generate the grid styles based on the auto-calculated columns
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: '0.5rem',
  };

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
        <div style={gridStyle}>
          {bookmarks.map((bookmark) => {
            return (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                isSelected={selectedBookmarkId === bookmark.id}
                onClick={() => onSelectBookmark(bookmark.id)}
              />
            );
          })}
        </div>
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
  return (
    <div 
      className={`cursor-pointer bg-white overflow-hidden border border-gray-200 rounded-md hover:shadow-md transition-shadow ${
        isSelected
          ? "ring-2 ring-primary" 
          : ""
      }`}
      onClick={onClick}
    >
      {/* Media section */}
      {bookmark.media_urls && bookmark.media_urls.length > 0 && (
        <div className="overflow-hidden">
          {bookmark.media_urls
            .filter(url => 
              // Only include Twitter/X media URLs (skip local paths and other URLs)
              url.includes('pbs.twimg.com')
            )
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
        </div>
      )}
      
      {/* Title section */}
      <div className="p-3">
        <h3 className="text-sm font-medium line-clamp-2 mb-1">{bookmark.title}</h3>
        {bookmark.url && (
          <p className="text-xs text-gray-500 truncate">
            {new URL(bookmark.url).hostname.replace(/^www\./, '')}
          </p>
        )}
      </div>
    </div>
  );
}