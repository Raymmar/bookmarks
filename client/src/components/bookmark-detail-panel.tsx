import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, RefreshCw } from "lucide-react";
import { Bookmark, Highlight, Note } from "@shared/types";
import { formatDate } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

// Tag interface
interface Tag {
  id: string;
  name: string;
  type: string;
  count: number;
  created_at: string;
}

interface BookmarkDetailPanelProps {
  bookmark?: Bookmark;
  onClose: () => void;
}

export function BookmarkDetailPanel({ bookmark, onClose }: BookmarkDetailPanelProps) {
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTagText, setNewTagText] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isSubmittingTag, setIsSubmittingTag] = useState(false);
  const [optimisticNotes, setOptimisticNotes] = useState<Note[]>([]);
  const { toast } = useToast();
  
  // Fetch all available tags for selection
  const { data: availableTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    staleTime: 10000, // 10 seconds before considering data stale
  });
  
  // Set all tags when the query data changes
  useEffect(() => {
    if (availableTags.length > 0) {
      setAllTags(availableTags);
    }
  }, [availableTags]);
  
  // Fetch tags for this bookmark
  useEffect(() => {
    if (bookmark) {
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
    }
  }, [bookmark?.id]);
  
  // Set optimistic notes when bookmark changes
  useEffect(() => {
    if (bookmark && bookmark.notes) {
      setOptimisticNotes(bookmark.notes);
    } else {
      setOptimisticNotes([]);
    }
  }, [bookmark]);

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
  
  // Filter tags that aren't already added to this bookmark
  const filteredTags = allTags.filter(tag => 
    !tags.some(existingTag => existingTag.id === tag.id)
  );
  
  // Adding a tag to the bookmark
  const handleAddTag = async (tagId: string) => {
    if (!bookmark) return;
    
    setIsSubmittingTag(true);
    
    try {
      // Find the tag to add from all available tags
      const tagToAdd = allTags.find(tag => tag.id === tagId);
      if (!tagToAdd) return;
      
      // Optimistically update the UI
      setTags(prev => [...prev, tagToAdd]);
      
      // Make the API request
      await apiRequest("POST", `/api/bookmarks/${bookmark.id}/tags/${tagId}`, {});
      
      toast({
        title: "Tag added",
        description: `Tag "${tagToAdd.name}" has been added to the bookmark`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/tags`] });
      
    } catch (error) {
      // Revert the optimistic update on error
      setTags(prev => prev.filter(tag => tag.id !== tagId));
      
      toast({
        title: "Error adding tag",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingTag(false);
    }
  };
  
  // Creating a new tag and adding it to the bookmark
  const handleCreateAndAddTag = async () => {
    if (!newTagText.trim() || !bookmark) return;
    
    setIsSubmittingTag(true);
    
    try {
      // Create the new tag
      const newTag = await apiRequest<Tag>("POST", "/api/tags", {
        name: newTagText.trim(),
        type: "user"
      });
      
      // Optimistically update the UI
      setTags(prev => [...prev, newTag]);
      
      // Add tag to bookmark
      await apiRequest("POST", `/api/bookmarks/${bookmark.id}/tags/${newTag.id}`, {});
      
      toast({
        title: "Tag added",
        description: `New tag "${newTag.name}" has been created and added to the bookmark`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/tags`] });
      
      // Reset the input
      setNewTagText("");
      setIsAddingTag(false);
      
    } catch (error) {
      toast({
        title: "Error creating tag",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingTag(false);
    }
  };
  
  // Remove a tag from the bookmark
  const handleRemoveTag = async (tagId: string) => {
    if (!bookmark) return;
    
    // Find the tag to remove
    const tagToRemove = tags.find(tag => tag.id === tagId);
    if (!tagToRemove) return;
    
    // Optimistically update the UI
    setTags(prev => prev.filter(tag => tag.id !== tagId));
    
    try {
      // Make the API request
      await apiRequest("DELETE", `/api/bookmarks/${bookmark.id}/tags/${tagId}`, {});
      
      toast({
        title: "Tag removed",
        description: `Tag "${tagToRemove.name}" has been removed from the bookmark`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/tags`] });
      
    } catch (error) {
      // Revert the optimistic update on error
      if (tagToRemove) {
        setTags(prev => [...prev, tagToRemove]);
      }
      
      toast({
        title: "Error removing tag",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !bookmark) return;
    
    setIsSubmitting(true);
    
    // Create a temporary ID for the optimistic update
    const tempId = `temp-${Date.now()}`;
    
    // Create an optimistic note
    const optimisticNote: Note = {
      id: tempId,
      bookmark_id: bookmark.id,
      text: newNote.trim(),
      timestamp: new Date().toISOString()
    };
    
    // Optimistically update the UI
    setOptimisticNotes(prev => [optimisticNote, ...prev]);
    
    try {
      // Make the API request
      const createdNote = await apiRequest<Note>("POST", `/api/bookmarks/${bookmark.id}/notes`, {
        text: newNote.trim(),
      });
      
      // Update the optimistic note with the real data
      setOptimisticNotes(prev => 
        prev.map(note => note.id === tempId ? createdNote : note)
      );
      
      toast({
        title: "Note added",
        description: "Your note was successfully added to the bookmark",
      });
      
      setNewNote("");
      setIsAddingNote(false);
      
    } catch (error) {
      // Remove the optimistic note on error
      setOptimisticNotes(prev => prev.filter(note => note.id !== tempId));
      
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
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Tags</h4>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs text-primary font-medium"
              onClick={() => setIsAddingTag(true)}
            >
              + Add Tag
            </Button>
          </div>
          
          {isAddingTag && (
            <div className="mb-3">
              <div className="relative mb-2">
                <Input
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  placeholder="Type to add or find tags"
                  className="pr-8"
                />
                {newTagText.trim() !== "" && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => setNewTagText("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              
              {/* Show matching tags or option to create new tag */}
              {newTagText.trim() !== "" && (
                <div className="border rounded p-2 mb-2 max-h-32 overflow-y-auto">
                  {!allTags.some(tag => tag.name.toLowerCase() === newTagText.trim().toLowerCase()) && (
                    <div 
                      className="flex items-center gap-1 p-1 hover:bg-gray-100 rounded cursor-pointer"
                      onClick={handleCreateAndAddTag}
                    >
                      <Plus className="h-3 w-3 text-primary" />
                      <span className="text-sm">Create new tag "<span className="font-semibold">{newTagText.trim()}</span>"</span>
                    </div>
                  )}
                  
                  {filteredTags
                    .filter(tag => tag.name.toLowerCase().includes(newTagText.toLowerCase()))
                    .slice(0, 5)
                    .map(tag => (
                    <div 
                      key={tag.id}
                      className="flex items-center justify-between p-1 hover:bg-gray-100 rounded cursor-pointer"
                      onClick={() => handleAddTag(tag.id)}
                    >
                      <span className="text-sm">{tag.name}</span>
                      <span className="text-xs text-gray-500">Used {tag.count} times</span>
                    </div>
                  ))}
                  
                  {filteredTags.filter(tag => tag.name.toLowerCase().includes(newTagText.toLowerCase())).length === 0 && 
                   allTags.some(tag => tag.name.toLowerCase() === newTagText.trim().toLowerCase()) && (
                    <div className="text-sm text-gray-500 p-1">
                      This tag is already added to this bookmark
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setIsAddingTag(false);
                    setNewTagText("");
                  }}
                  disabled={isSubmittingTag}
                >
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    setIsAddingTag(false);
                    setNewTagText("");
                  }}
                  disabled={isSubmittingTag}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap gap-1">
            {/* User-added tags with remove capability */}
            {tags.map(tag => (
              <Badge 
                key={tag.id} 
                variant="outline" 
                className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200 pl-2 pr-1 py-1 flex items-center gap-1"
              >
                {tag.name}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-indigo-200 rounded-full"
                  onClick={() => handleRemoveTag(tag.id)}
                >
                  <X className="h-2 w-2" />
                </Button>
              </Badge>
            ))}
            
            {/* System tags without remove capability */}
            {(bookmark.system_tags || []).map((tag, index) => (
              <Badge 
                key={`system-${index}`} 
                variant="outline" 
                className="bg-blue-100 text-blue-800 hover:bg-blue-200"
              >
                {tag}
              </Badge>
            ))}
            
            {tags.length === 0 && (!bookmark.system_tags || bookmark.system_tags.length === 0) && (
              <div className="text-sm text-gray-500 italic">No tags</div>
            )}
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
          
          {optimisticNotes.length > 0 ? (
            <div className="space-y-3">
              {optimisticNotes.map((note: Note, index: number) => (
                <div 
                  key={note.id} 
                  className={`p-3 rounded-md ${
                    note.id.startsWith('temp-') 
                      ? 'bg-blue-50 border border-blue-100' 
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <p className="text-sm text-gray-800">{note.text}</p>
                    {note.id.startsWith('temp-') && (
                      <div className="ml-2 flex-shrink-0">
                        <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Added {formatDate(note.timestamp)}
                    {note.id.startsWith('temp-') && ' (saving...)'}
                  </p>
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
