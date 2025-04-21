import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Bookmark } from "@shared/types";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { useEffect, useState } from "react";

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
      className={`p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? "bg-primary-50 border-primary" 
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
      onClick={onClick}
    >
      <h3 className="font-medium mb-1 line-clamp-1">{bookmark.title}</h3>
      <p className="text-xs text-gray-500 mb-2 truncate">{bookmark.url}</p>
      <div className="flex flex-wrap gap-1">
        {allTags.slice(0, 3).map((tag, i) => (
          <Badge key={i} variant="outline" className="text-xs">
            {tag}
          </Badge>
        ))}
        {allTags.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{allTags.length - 3}
          </Badge>
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
}

export function SidebarPanel({ 
  bookmarks, 
  selectedBookmark, 
  onSelectBookmark, 
  onCloseDetail,
  isLoading 
}: SidebarPanelProps) {
  
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
      <div className="h-16 p-4 border-b border-gray-200 flex items-center">
        <div className="flex w-full items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Bookmarks</h2>
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
          <div className="flex flex-col space-y-3">
            {bookmarks.map(bookmark => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                isSelected={selectedBookmark ? selectedBookmark.id === bookmark.id : false}
                onClick={() => onSelectBookmark(bookmark.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}