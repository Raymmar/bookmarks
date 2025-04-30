import { Bookmark } from "@shared/types";

interface BookmarkGridProps {
  bookmarks: Bookmark[];
  selectedBookmarkId: string | null;
  onSelectBookmark: (id: string) => void;
  isLoading: boolean;
  columns: number;
}

export function BookmarkGrid({
  bookmarks,
  selectedBookmarkId,
  onSelectBookmark,
  isLoading,
  columns = 2,
}: BookmarkGridProps) {
  // Generate the grid styles based on the number of columns
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: '0.5rem',
  };

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