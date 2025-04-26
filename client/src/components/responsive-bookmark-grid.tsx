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
  const [columnCount, setColumnCount] = useState<1 | 2 | 3>(2); // Default to 2 columns
  
  // Determine if detail view is open
  const [isDetailViewOpen, setIsDetailViewOpen] = useState<boolean>(false);
  
  // Load preferences on component mount
  useEffect(() => {
    try {
      const savedPrefs = localStorage.getItem('gridColumnPreferences');
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        // Start with the appropriate column count based on detail view
        setColumnCount(isDetailViewOpen ? prefs.detailColumnCount : prefs.columnCount);
      }
    } catch (e) {
      console.error('Failed to load grid preferences:', e);
    }
  }, [isDetailViewOpen]);
  
  // Effect to calculate appropriate number of columns based on container width
  useEffect(() => {
    const calculateColumns = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      
      // Use simple breakpoints to determine column count
      let newColumnCount: 1 | 2 | 3;
      
      if (containerWidth < 600) {
        newColumnCount = 1;
      } else if (containerWidth < 1000) {
        newColumnCount = 2;
      } else {
        newColumnCount = 3;
      }
      
      // Only update if column count changed
      if (newColumnCount !== columnCount) {
        setColumnCount(newColumnCount);
        
        // Save this preference based on whether detail view is open
        try {
          const savedPrefs = localStorage.getItem('gridColumnPreferences');
          const prefs = savedPrefs ? JSON.parse(savedPrefs) : {
            columnCount: 2,
            detailColumnCount: 1
          };
          
          // Update the appropriate column count (normal or detail)
          if (isDetailViewOpen) {
            prefs.detailColumnCount = newColumnCount;
          } else {
            prefs.columnCount = newColumnCount;
          }
          
          localStorage.setItem('gridColumnPreferences', JSON.stringify(prefs));
        } catch (e) {
          console.error('Failed to save grid preferences:', e);
        }
      }
    };
    
    // Calculate on mount and when container width changes
    calculateColumns();
    
    // Recalculate when window is resized
    window.addEventListener('resize', calculateColumns);
    
    // Use ResizeObserver to detect container width changes from panel resizing
    const resizeObserver = new ResizeObserver(calculateColumns);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', calculateColumns);
      resizeObserver.disconnect();
    };
  }, [containerRef, columnCount, isDetailViewOpen]);
  
  // Effect to detect when detail view opens/closes
  useEffect(() => {
    const detectDetailPanel = () => {
      // Check for presence of detail panel in DOM
      const detailPanelOpen = document.querySelector('div[class*="w-1/2"][class*="border-r"]') !== null;
      
      if (detailPanelOpen !== isDetailViewOpen) {
        setIsDetailViewOpen(detailPanelOpen);
        
        // Apply saved preferences for this view mode
        try {
          const savedPrefs = localStorage.getItem('gridColumnPreferences');
          if (savedPrefs) {
            const prefs = JSON.parse(savedPrefs);
            setColumnCount(detailPanelOpen ? prefs.detailColumnCount : prefs.columnCount);
          } else {
            // Default values if no preferences saved
            setColumnCount(detailPanelOpen ? 1 : 2);
          }
        } catch (e) {
          console.error('Failed to load detail view preferences:', e);
        }
      }
    };
    
    // Run on mount and set an interval to check periodically
    detectDetailPanel();
    const intervalId = setInterval(detectDetailPanel, 500);
    
    return () => clearInterval(intervalId);
  }, [isDetailViewOpen]);

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
          breakpointCols={columnCount}
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