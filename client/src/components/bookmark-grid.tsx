import { Bookmark } from "@shared/types";
import { useEffect, useRef } from "react";

interface BookmarkGridProps {
  bookmarks: Bookmark[];
  selectedBookmarkId: string | null;
  onSelectBookmark: (id: string) => void;
  isLoading: boolean;
  columns?: number;
  // New pagination props
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function BookmarkGrid({
  bookmarks,
  selectedBookmarkId,
  onSelectBookmark,
  isLoading,
  columns = 2,
  isLoadingMore = false,
  hasMore = false,
  onLoadMore
}: BookmarkGridProps) {
  // Generate the grid styles based on the number of columns
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: '0.75rem',
  };
  
  // Reference for the load more trigger element
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // Set up intersection observer for infinite scrolling
  useEffect(() => {
    // Only set up if we have onLoadMore and there's more to load
    if (!onLoadMore || !hasMore) return;
    
    console.log("Creating IntersectionObserver for grid view infinite scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        // If our loading element is in view and we're not already loading
        const [entry] = entries;
        if (entry.isIntersecting && !isLoadingMore && hasMore) {
          console.log("Load more element intersected, triggering onLoadMore");
          onLoadMore();
        }
      },
      {
        // Increased sensitivity for more reliable triggering
        rootMargin: '200px',
        threshold: 0.1
      }
    );
    
    // Start observing the loader element
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    
    // Clean up
    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, isLoadingMore, hasMore]);

  return (
    <div className="p-3 overflow-auto h-full">
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
        <div className="relative">
          {/* Grid of bookmarks */}
          <div style={gridStyle} className="mb-8">
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
          
          {/* Loader element for intersection observer (infinite scroll) */}
          <div 
            ref={loadMoreRef} 
            className="w-full h-32 mt-4 mb-8"
            id="grid-infinite-scroll-trigger"
          >
            {/* Always show a subtle indicator (whether loading or not) to ensure the element has height */}
            <div className="text-center py-4">
              {isLoadingMore ? (
                <>
                  <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading more bookmarks...</p>
                </>
              ) : hasMore ? (
                <p className="text-gray-400 text-sm">Scroll for more bookmarks</p>
              ) : (
                <p className="text-gray-400 text-sm">No more bookmarks to load</p>
              )}
            </div>
          </div>
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