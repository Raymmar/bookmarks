import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Trash2, Clock, FileText, SquareStack } from "lucide-react";
import { Bookmark } from "@shared/types";
import { formatDate, truncateText } from "@/lib/utils";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { Tag as TagType } from "@shared/types";

interface BookmarkCardProps {
  bookmark: Bookmark;
  onEdit?: (bookmark: Bookmark) => void;
  onDelete?: (id: string) => void;
}

export function BookmarkCard({ bookmark: initialBookmark, onEdit, onDelete }: BookmarkCardProps) {
  const [bookmark, setBookmark] = useState<Bookmark>(initialBookmark);
  const [tags, setTags] = useState<TagType[]>([]);
  const [isRecentlyUpdated, setIsRecentlyUpdated] = useState(false);
  
  // Update internal bookmark state when props change
  useEffect(() => {
    setBookmark(initialBookmark);
  }, [initialBookmark]);
  
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
  
  // Listen for custom bookmark update events
  useEffect(() => {
    const handleBookmarkUpdate = (e: Event) => {
      try {
        const event = e as CustomEvent<{bookmarkId: string, updatedFields: Partial<Bookmark>, updatedBookmark: Bookmark}>;
        const { bookmarkId, updatedFields, updatedBookmark } = event.detail;
        
        // Only update if this is the bookmark we're displaying
        if (bookmarkId === bookmark.id) {
          console.log(`BookmarkCard: Received update for bookmark ${bookmarkId}:`, updatedFields);
          
          // Update the local bookmark state with the changes
          setBookmark(updatedBookmark);
          
          // Show visual feedback for recent update
          setIsRecentlyUpdated(true);
          
          // Reset the highlight after a few seconds
          setTimeout(() => {
            setIsRecentlyUpdated(false);
          }, 5000);
        }
      } catch (error) {
        console.error("Error handling bookmark update event:", error);
      }
    };
    
    // Add event listener
    document.addEventListener('bookmarkUpdated', handleBookmarkUpdate);
    
    // Clean up
    return () => {
      document.removeEventListener('bookmarkUpdated', handleBookmarkUpdate);
    };
  }, [bookmark.id]);
  return (
    <Card className={`bg-white rounded-lg overflow-hidden hover:shadow-md transition-all duration-500 ${
      isRecentlyUpdated 
        ? 'shadow-md border-2 border-blue-300' 
        : 'shadow-sm border border-gray-200'
    }`}>
      <CardContent className={`p-4 ${isRecentlyUpdated ? 'bg-blue-50' : ''} transition-colors duration-500`}>
        <div className="flex justify-between items-start mb-3">
          <h3 className={`font-medium text-base line-clamp-1 transition-colors duration-500 ${
            isRecentlyUpdated ? 'text-blue-700' : ''
          }`}>
            {bookmark.title}
            {isRecentlyUpdated && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                Updated
              </span>
            )}
          </h3>
          <div className="flex space-x-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-gray-400 hover:text-gray-600"
              onClick={() => onEdit && onEdit(bookmark)}
            >
              <Pencil className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-gray-400 hover:text-gray-600"
              onClick={() => onDelete && onDelete(bookmark.id)}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        <div className="text-sm text-gray-600 mb-3 line-clamp-2">
          {truncateText(bookmark.description || "", 120)}
        </div>
        
        <div className="flex items-center text-xs text-gray-500 mb-3">
          <Clock className="h-4 w-4 mr-1" />
          Saved {formatDate(bookmark.date_saved)}
        </div>
        
        <div className="flex flex-wrap gap-1 mb-3">
          {/* Get tag names from normalized tags */}
          {tags.slice(0, 3).map((tag, index) => (
            <Badge key={index} variant="outline" className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200">
              {tag.name}
            </Badge>
          ))}
          {tags.length > 3 && (
            <Badge variant="outline" className="bg-gray-100 text-gray-800 hover:bg-gray-200">
              +{tags.length - 3} more
            </Badge>
          )}
        </div>
        
        <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
          <div className="flex items-center text-xs text-gray-500">
            <SquareStack className="h-4 w-4 mr-1" />
            <span>{bookmark.highlights?.length || 0} highlights</span>
          </div>
          <div className="flex items-center text-xs text-gray-500">
            <FileText className="h-4 w-4 mr-1" />
            <span>{bookmark.notes?.length || 0} note{bookmark.notes?.length !== 1 ? 's' : ''}</span>
          </div>
          <Link href={`/bookmark/${bookmark.id}`} className="text-primary text-xs font-medium">
            Open
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
