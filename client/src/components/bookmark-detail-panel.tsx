import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Bookmark, Highlight, Note } from "@shared/types";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BookmarkDetailPanelProps {
  bookmark?: Bookmark;
  onClose: () => void;
}

export function BookmarkDetailPanel({ bookmark, onClose }: BookmarkDetailPanelProps) {
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  if (!bookmark) {
    return (
      <>
        <div className="h-16 p-4 border-b border-gray-200 flex items-center">
          <div className="flex w-full items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Detail View</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="py-8 text-center text-gray-500">
          Select a bookmark to view details
        </div>
      </>
    );
  }

  const handleAddNote = async () => {
    if (!newNote.trim() || !bookmark) return;
    
    setIsSubmitting(true);
    
    try {
      await apiRequest("POST", `/api/bookmarks/${bookmark.id}/notes`, {
        text: newNote,
      });
      
      toast({
        title: "Note added",
        description: "Your note was successfully added to the bookmark",
      });
      
      setNewNote("");
      setIsAddingNote(false);
      
      // We would typically refetch the bookmark data here
      
    } catch (error) {
      toast({
        title: "Error adding note",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="h-16 p-4 border-b border-gray-200 flex items-center">
        <div className="flex w-full items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Detail View</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      <div className="p-4 overflow-auto">
        <div className="mb-4">
          <h3 className="font-medium text-base mb-1">{bookmark.title}</h3>
          <a 
            href={bookmark.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-sm text-blue-600 hover:underline block truncate"
          >
            {bookmark.url}
          </a>
        </div>
        
        {bookmark.insights?.summary && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Summary</h4>
            <p className="text-sm text-gray-600">
              {bookmark.insights.summary}
            </p>
          </div>
        )}
        
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Tags</h4>
          <div className="flex flex-wrap gap-1">
            {bookmark.user_tags.concat(bookmark.system_tags).map((tag, index) => (
              <Badge key={index} variant="outline" className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Highlights</h4>
            <span className="text-xs text-gray-500">
              {bookmark.highlights ? bookmark.highlights.length : 0} highlights
            </span>
          </div>
          
          {bookmark.highlights && bookmark.highlights.length > 0 ? (
            <div className="space-y-3">
              {bookmark.highlights.map((highlight: Highlight, index: number) => (
                <div key={index} className="p-3 bg-yellow-50 rounded-md border-l-2 border-yellow-300">
                  <p className="text-sm text-gray-800">{highlight.quote}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">No highlights yet</div>
          )}
        </div>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Notes</h4>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs text-primary font-medium"
              onClick={() => setIsAddingNote(true)}
            >
              + Add Note
            </Button>
          </div>
          
          {isAddingNote && (
            <div className="mb-3">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Type your note here..."
                className="mb-2"
              />
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setIsAddingNote(false);
                    setNewNote("");
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleAddNote}
                  disabled={isSubmitting || !newNote.trim()}
                >
                  {isSubmitting ? "Adding..." : "Save"}
                </Button>
              </div>
            </div>
          )}
          
          {bookmark.notes && bookmark.notes.length > 0 ? (
            <div className="space-y-3">
              {bookmark.notes.map((note: Note, index: number) => (
                <div key={index} className="p-3 bg-gray-50 rounded-md">
                  <p className="text-sm text-gray-800">{note.text}</p>
                  <p className="text-xs text-gray-500 mt-1">Added {formatDate(note.timestamp)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">No notes yet</div>
          )}
        </div>
        
        {bookmark.insights?.related_links && bookmark.insights.related_links.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">Related Bookmarks</h4>
            </div>
            
            <div className="space-y-2">
              {bookmark.insights.related_links.map((link: string, index: number) => (
                <a key={index} href={link} className="block p-2 hover:bg-gray-50 rounded" target="_blank" rel="noopener noreferrer">
                  <h5 className="text-sm font-medium text-gray-800">{link.substring(link.lastIndexOf('/') + 1)}</h5>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
