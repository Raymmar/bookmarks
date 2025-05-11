import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, RefreshCw, Brain, AlertCircle, Loader2, FolderIcon, Twitter, Heart, MessagesSquare, Repeat, Quote, Share2, ExternalLink, LockIcon, Bookmark } from "lucide-react";
import { Bookmark as BookmarkType, Highlight, Note, Tag as TagType } from "@shared/types";
import { formatDate } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  useBookmarkCollections, 
  useCollections, 
  useCollectionMutations 
} from "@/hooks/use-collection-queries";

interface BookmarkDetailPanelProps {
  bookmark?: BookmarkType;
  onClose: () => void;
}

export function BookmarkDetailPanel({ bookmark: initialBookmark, onClose }: BookmarkDetailPanelProps) {
  const [bookmark, setBookmark] = useState<BookmarkType | undefined>(initialBookmark);
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tags, setTags] = useState<TagType[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [newTagText, setNewTagText] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isSubmittingTag, setIsSubmittingTag] = useState(false);
  const [optimisticNotes, setOptimisticNotes] = useState<Note[]>([]);
  const [aiProcessingStatus, setAiProcessingStatus] = useState<"pending" | "processing" | "completed" | "failed">("pending");
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Collection related hooks and state
  const { data: bookmarkCollections = [] } = useBookmarkCollections(bookmark?.id || "");
  const { data: allCollections = [] } = useCollections();
  const { addBookmarkToCollection, removeBookmarkFromCollection } = useCollectionMutations();
  
  // Fetch all available tags for selection
  const { data: availableTags = [] } = useQuery<TagType[]>({
    queryKey: ["/api/tags"],
    staleTime: 10000, // 10 seconds before considering data stale
  });
  
  // Set all tags when the query data changes
  useEffect(() => {
    if (availableTags.length > 0) {
      setAllTags(availableTags);
    }
  }, [availableTags]);
  
  // Update bookmark state when the prop changes
  useEffect(() => {
    setBookmark(initialBookmark);
  }, [initialBookmark]);
  
  // Listen for the custom showBookmarkDetail event
  useEffect(() => {
    const handleShowBookmarkDetail = async (e: Event) => {
      try {
        // Need to cast to access the detail property
        const event = e as CustomEvent<{bookmarkId: string}>;
        const bookmarkId = event.detail?.bookmarkId;
        if (!bookmarkId) return;
        
        console.log(`Custom event received to show bookmark: ${bookmarkId}`);
        
        // Fetch the updated bookmark
        const { apiRequest } = await import('@/lib/queryClient');
        const updatedBookmark = await apiRequest("GET", `/api/bookmarks/${bookmarkId}`);
        
        if (updatedBookmark) {
          // Update the bookmark state with the latest data
          setBookmark(updatedBookmark);
          
          // Fetch the tags for this bookmark
          const fetchedTags = await apiRequest("GET", `/api/bookmarks/${bookmarkId}/tags`);
          setTags(fetchedTags || []);
          
          // Fetch and update notes if available
          const notes = await apiRequest("GET", `/api/bookmarks/${bookmarkId}/notes`);
          if (notes && notes.length > 0) {
            setOptimisticNotes(notes);
          }
          
          toast({
            title: "Bookmark updated",
            description: "The bookmark has been updated with your new information",
            variant: "default",
          });
        }
      } catch (error) {
        console.error("Error handling showBookmarkDetail event:", error);
      }
    };
    
    // Add event listener for the custom event
    window.addEventListener('showBookmarkDetail', handleShowBookmarkDetail);
    
    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('showBookmarkDetail', handleShowBookmarkDetail);
    };
  }, [toast]);
  
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
  
  // Fetch notes whenever the bookmark ID changes
  useEffect(() => {
    if (bookmark) {
      const fetchNotes = async () => {
        try {
          const notes = await apiRequest("GET", `/api/bookmarks/${bookmark.id}/notes`);
          if (notes && notes.length > 0) {
            setOptimisticNotes(notes);
          } else if (bookmark.notes) {
            // Fallback to notes from the bookmark object if API call returns empty
            setOptimisticNotes(bookmark.notes);
          } else {
            setOptimisticNotes([]);
          }
        } catch (error) {
          console.error("Error fetching notes for bookmark:", error);
          // Fallback to notes from the bookmark object if API call fails
          if (bookmark.notes) {
            setOptimisticNotes(bookmark.notes);
          } else {
            setOptimisticNotes([]);
          }
        }
      };
      
      fetchNotes();
    } else {
      setOptimisticNotes([]);
    }
  }, [bookmark?.id]);
  
  // Check AI processing status
  useEffect(() => {
    if (bookmark) {
      // Set initial status based on bookmark data
      if (bookmark.ai_processing_status) {
        setAiProcessingStatus(bookmark.ai_processing_status as any);
      } else {
        // Check if we have insights or system-generated tags
        const hasInsights = bookmark.insights && Object.keys(bookmark.insights).length > 0;
        const hasSystemTags = tags.some(tag => tag.type === 'system');
        
        if (hasInsights || hasSystemTags) {
          setAiProcessingStatus('completed');
        } else {
          setAiProcessingStatus('pending');
        }
      }
      
      // Fetch the current processing status
      const checkProcessingStatus = async () => {
        try {
          const response = await fetch(`/api/bookmarks/${bookmark.id}/processing-status`);
          if (response.ok) {
            const statusData = await response.json();
            
            if (statusData.aiProcessingComplete) {
              setAiProcessingStatus('completed');
            }
          }
        } catch (error) {
          console.error("Error checking AI processing status:", error);
        }
      };
      
      checkProcessingStatus();
    }
  }, [bookmark, tags]);
  
  // Trigger AI processing for the bookmark
  const handleTriggerAiProcessing = async () => {
    if (!bookmark) return;
    
    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to use AI analysis features",
        variant: "destructive",
      });
      return;
    }
    
    setIsProcessingAi(true);
    setAiProcessingStatus('processing');
    
    // Store these references for cleanup
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    // Function to clean up timers
    const cleanupTimers = () => {
      if (pollingInterval) clearInterval(pollingInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
    
    try {
      // Start the AI processing
      const processResponse = await apiRequest("POST", `/api/bookmarks/${bookmark.id}/process`, {
        insightDepth: 2 // Request deeper insights
      });
      
      console.log("AI processing initiated with response:", processResponse);
      
      toast({
        title: "AI processing started",
        description: "The AI analysis has been triggered and will run in the background",
      });
      
      // Function to update the UI with new insights and tags
      const updateUIWithResults = async () => {
        try {
          // Clean up the timers first
          cleanupTimers();
          
          // Update the status
          setAiProcessingStatus('completed');
          setIsProcessingAi(false);
          
          // Refresh bookmark data and fetch insights
          queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
          queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/tags`] });
          
          // Fetch the updated insights
          const insightsResponse = await fetch(`/api/bookmarks/${bookmark.id}/insights`);
          let insightsData = null;
          if (insightsResponse.ok) {
            insightsData = await insightsResponse.json();
            console.log("Fetched insights data:", insightsData);
          }
          
          // Fetch the updated tags
          const tagsResponse = await fetch(`/api/bookmarks/${bookmark.id}/tags`);
          let tagsData = null;
          if (tagsResponse.ok) {
            tagsData = await tagsResponse.json();
            console.log("Fetched tags data:", tagsData);
            // Update the tags directly in state
            setTags(tagsData);
          }
          
          // Update the bookmark with new insights if available
          if (bookmark && insightsData) {
            // Create a new bookmark object with the updated insights
            const updatedBookmark = {
              ...bookmark,
              insights: insightsData,
              ai_processing_status: 'completed' as any
            };
            // Update the bookmark ref
            setBookmark(updatedBookmark);
          }
          
          console.log("Optimistically updated bookmark with insights and tags from AI processing");
          
          // Notify the graph about the new tags for immediate visual updates
          if (tagsData && Array.isArray(tagsData)) {
            tagsData.forEach(tag => {
              // Dispatch a custom event for each tag to update the graph
              const event = new CustomEvent('tagChanged', { 
                detail: { 
                  bookmarkId: bookmark.id,
                  tagId: tag.id,
                  tagName: tag.name,
                  action: 'add'
                } 
              });
              document.dispatchEvent(event);
            });
          }
          
          toast({
            title: "AI processing complete",
            description: "The bookmark has been analyzed and insights are now available",
          });
        } catch (error) {
          console.error("Error updating UI with AI processing results:", error);
          setAiProcessingStatus('failed');
          setIsProcessingAi(false);
          
          toast({
            title: "Error updating results",
            description: "There was an error fetching the results. Please try again.",
            variant: "destructive"
          });
        }
      };
      
      // Poll for status updates
      pollingInterval = setInterval(async () => {
        try {
          if (!bookmark) {
            cleanupTimers();
            return;
          }
          
          console.log("Checking AI processing status...");
          const response = await fetch(`/api/bookmarks/${bookmark.id}/processing-status`);
          
          if (response.ok) {
            const statusData = await response.json();
            console.log("Processing status response:", statusData);
            
            if (statusData.aiProcessingComplete) {
              // If processing is complete, update the UI
              updateUIWithResults();
            }
          }
        } catch (error) {
          console.error("Error checking processing status:", error);
        }
      }, 5000); // Check every 5 seconds
      
      // Set timeout to prevent endless polling (timeout after 120 seconds)
      timeoutId = setTimeout(() => {
        console.log("AI processing timeout reached");
        cleanupTimers();
        
        // Check current status (using state reference rather than closure reference)
        if (document.getElementById(`ai-processing-${bookmark.id}`)) {
          setAiProcessingStatus('failed');
          setIsProcessingAi(false);
          
          toast({
            title: "AI processing taking longer than expected",
            description: "Processing continues in the background. Check back later or refresh the page.",
            variant: "default"
          });
        }
      }, 120000); // Extended to 2 minutes for larger images
      
    } catch (error) {
      console.error("Error triggering AI processing:", error);
      setAiProcessingStatus('failed');
      setIsProcessingAi(false);
      
      toast({
        title: "Error processing bookmark",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Filter tags that aren't already added to this bookmark
  const filteredTags = allTags.filter(tag => 
    !tags.some(existingTag => existingTag.id === tag.id)
  );
  
  // Handle collection selection changes
  const handleCollectionChange = async (collectionId: string) => {
    if (!bookmark) return;
    
    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to manage collections",
        variant: "destructive",
      });
      return;
    }
    
    // Special case: "remove" action for removing from collection
    if (collectionId === "remove") {
      try {
        // Get the collections this bookmark is in
        if (bookmarkCollections.length > 0) {
          // Remove from all collections
          for (const collection of bookmarkCollections) {
            await removeBookmarkFromCollection.mutateAsync({
              collectionId: collection.id,
              bookmarkId: bookmark.id
            });
          }
          
          toast({
            title: "Removed from collections",
            description: "Bookmark has been removed from all collections",
          });
        }
      } catch (error) {
        console.error("Error removing bookmark from collections:", error);
        toast({
          title: "Error removing from collections",
          description: "There was an error removing the bookmark from collections",
          variant: "destructive",
        });
      }
      return;
    }
    
    try {
      // Add to the selected collection
      await addBookmarkToCollection.mutateAsync({
        collectionId,
        bookmarkId: bookmark.id
      });
      
      toast({
        title: "Added to collection",
        description: `The bookmark has been added to the collection`,
      });
    } catch (error) {
      console.error("Error adding bookmark to collection:", error);
      toast({
        title: "Error adding to collection",
        description: "There was an error adding the bookmark to the collection",
        variant: "destructive",
      });
    }
  };
  
  // Adding a tag to the bookmark
  const handleAddTag = async (tagId: string) => {
    if (!bookmark) return;
    
    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to add tags",
        variant: "destructive",
      });
      return;
    }
    
    const tagToAdd = allTags.find(tag => tag.id === tagId);
    if (!tagToAdd) return;
    
    try {
      // First make the API call to add the tag
      await apiRequest("POST", `/api/bookmarks/${bookmark.id}/tags`, { tagId });
      
      // Optimistically update the UI
      setTags(prevTags => [...prevTags, tagToAdd]);
      
      // Show success message
      toast({
        title: "Tag added",
        description: `The tag "${tagToAdd.name}" has been added to the bookmark`,
      });
      
      // Dispatch a custom event for the graph view to update
      const event = new CustomEvent('tagChanged', { 
        detail: { 
          bookmarkId: bookmark.id, 
          tagId: tagToAdd.id,
          tagName: tagToAdd.name,
          action: 'add'
        } 
      });
      document.dispatchEvent(event);
      
    } catch (error) {
      console.error("Error adding tag:", error);
      toast({
        title: "Error adding tag",
        description: "There was an error adding the tag to the bookmark",
        variant: "destructive",
      });
    }
  };
  
  // Creating a new tag and adding it to the bookmark
  const handleCreateAndAddTag = async () => {
    if (!newTagText.trim() || !bookmark) return;
    
    setIsSubmittingTag(true);
    
    try {
      // First create the tag
      const newTag = await apiRequest("POST", "/api/tags", { 
        name: newTagText.trim(),
        type: "user"
      });
      
      if (newTag) {
        // Then add it to the bookmark
        await apiRequest("POST", `/api/bookmarks/${bookmark.id}/tags`, { tagId: newTag.id });
        
        // Update our state
        setTags(prevTags => [...prevTags, newTag]);
        setAllTags(prevTags => [...prevTags, newTag]);
        
        // Reset the input
        setNewTagText("");
        setIsAddingTag(false);
        
        // Show success toast
        toast({
          title: "Tag created and added",
          description: `The tag "${newTag.name}" has been created and added to the bookmark`,
        });
        
        // Dispatch a custom event for the graph view to update
        const event = new CustomEvent('tagChanged', { 
          detail: { 
            bookmarkId: bookmark.id, 
            tagId: newTag.id,
            tagName: newTag.name,
            action: 'add'
          } 
        });
        document.dispatchEvent(event);
      }
    } catch (error) {
      console.error("Error creating and adding tag:", error);
      toast({
        title: "Error creating tag",
        description: "There was an error creating and adding the tag",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingTag(false);
    }
  };
  
  // Handle updating bookmark fields
  const handleUpdateBookmark = async (updateData: Partial<BookmarkType>) => {
    if (!bookmark) return;

    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to update bookmarks",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Optimistically update the UI
      setBookmark(prevBookmark => {
        if (!prevBookmark) return undefined;
        return { ...prevBookmark, ...updateData };
      });
      
      // Make the API call
      const updatedBookmark = await apiRequest(
        "PATCH", 
        `/api/bookmarks/${bookmark.id}`, 
        updateData
      );
      
      // Update with the result from the server
      if (updatedBookmark) {
        setBookmark(updatedBookmark);
        
        toast({
          title: "Bookmark updated",
          description: "The bookmark has been updated successfully",
        });
      }
    } catch (error) {
      console.error("Error updating bookmark:", error);
      
      // Revert optimistic update if there was an error
      toast({
        title: "Error updating bookmark",
        description: "There was an error updating the bookmark",
        variant: "destructive",
      });
    }
  };

  // Remove a tag from the bookmark
  const handleRemoveTag = async (tagId: string) => {
    if (!bookmark) return;
    
    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to remove tags",
        variant: "destructive",
      });
      return;
    }
    
    const tagToRemove = tags.find(tag => tag.id === tagId);
    if (!tagToRemove) return;
    
    try {
      // First make the API call to remove the tag
      await apiRequest("DELETE", `/api/bookmarks/${bookmark.id}/tags/${tagId}`);
      
      // Optimistically update the UI
      setTags(prevTags => prevTags.filter(tag => tag.id !== tagId));
      
      // Show success message
      toast({
        title: "Tag removed",
        description: `The tag "${tagToRemove.name}" has been removed from the bookmark`,
      });
      
      // Dispatch a custom event for the graph view to update
      const event = new CustomEvent('tagChanged', { 
        detail: { 
          bookmarkId: bookmark.id, 
          tagId: tagToRemove.id,
          tagName: tagToRemove.name,
          action: 'remove'
        } 
      });
      document.dispatchEvent(event);
      
    } catch (error) {
      console.error("Error removing tag:", error);
      toast({
        title: "Error removing tag",
        description: "There was an error removing the tag from the bookmark",
        variant: "destructive",
      });
    }
  };
  
  // Add a note to the bookmark
  const handleAddNote = async () => {
    if (!newNote.trim() || !bookmark) return;
    
    setIsSubmitting(true);
    
    try {
      // Create a temporary optimistic note
      const optimisticNote: Note = {
        id: `temp-${Date.now()}`,
        bookmark_id: bookmark.id,
        content: newNote,
        created_at: new Date(),
        updated_at: new Date(),
        user_id: user?.id || null
      };
      
      // Optimistically add to the notes array
      setOptimisticNotes(prev => [optimisticNote, ...prev]);
      
      // Clear the input
      setNewNote("");
      setIsAddingNote(false);
      
      // Make the API call
      const createdNote = await apiRequest("POST", `/api/bookmarks/${bookmark.id}/notes`, {
        content: newNote
      });
      
      if (createdNote) {
        // Replace the optimistic note with the real one
        setOptimisticNotes(prev => 
          prev.map(note => 
            note.id === optimisticNote.id ? createdNote : note
          )
        );
        
        toast({
          title: "Note added",
          description: "Your note has been added to the bookmark",
        });
      }
    } catch (error) {
      console.error("Error adding note:", error);
      
      // Remove the optimistic note on error
      setOptimisticNotes(prev => 
        prev.filter(note => !note.id.startsWith('temp-'))
      );
      
      toast({
        title: "Error adding note",
        description: "There was an error adding your note",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-16 p-4 border-b border-gray-200 flex items-center sticky top-0 bg-white z-10 flex-shrink-0">
        <div className="flex w-full items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Detail View</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      {!bookmark ? (
        <div className="flex flex-col h-full items-center justify-center p-6 text-center bg-gray-50">
          <Bookmark className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium mb-2">No bookmark selected</h3>
          <p className="text-sm text-gray-500 mb-4">
            Select a bookmark from the list to view its details.
          </p>
        </div>
      ) : (
        <div className="p-4 overflow-y-auto flex-grow">
          <div className="mb-4">
            <div
              className="font-medium text-base mb-1 border-b border-transparent hover:border-gray-300 focus-within:border-primary cursor-text"
              onClick={(e) => {
                // Make sure the click was directly on the div and not on a child element
                if (e.target === e.currentTarget) {
                  // Create a contenteditable span and focus it
                  const span = document.createElement('span');
                  span.contentEditable = 'true';
                  span.textContent = bookmark.title;
                  span.className = 'outline-none block w-full';
                  span.onblur = () => {
                    // When the user clicks away, update the bookmark title
                    if (span.textContent !== bookmark.title) {
                      handleUpdateBookmark({ title: span.textContent || bookmark.title });
                    }
                    // Replace the span with the text content
                    e.currentTarget.textContent = span.textContent;
                  };
                  span.onkeydown = (e) => {
                    // Submit on Enter
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      span.blur();
                    }
                  };
                  
                  // Clear the div and append the span
                  e.currentTarget.textContent = '';
                  e.currentTarget.appendChild(span);
                  span.focus();
                }
              }}
            >
              {bookmark.title}
            </div>
            
            <div className="text-blue-600 hover:underline text-sm mb-2">
              <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="flex items-center">
                {bookmark.url.length > 50 ? `${bookmark.url.substring(0, 50)}...` : bookmark.url}
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </div>
            
            <div className="text-sm text-gray-500 mb-4">
              Saved on {formatDate(bookmark.date_saved)}
            </div>
          </div>
          
          {/* Tags section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Tags</h3>
              <div className="flex space-x-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs px-2" 
                  onClick={() => setIsAddingTag(!isAddingTag)}
                >
                  <Plus className="h-3 w-3 mr-1" /> New Tag
                </Button>
              </div>
            </div>
            
            {isAddingTag && (
              <div className="mb-2 flex items-center">
                <Input
                  type="text"
                  placeholder="Enter tag name..."
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  className="mr-2 h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateAndAddTag();
                    }
                  }}
                />
                <Button 
                  size="sm"
                  className="h-8"
                  onClick={handleCreateAndAddTag}
                  disabled={isSubmittingTag || !newTagText.trim()}
                >
                  {isSubmittingTag ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            )}
            
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <Badge 
                  key={tag.id} 
                  variant={tag.type === 'system' ? "outline" : "default"}
                  className="flex items-center gap-1 group"
                >
                  {tag.name}
                  {tag.type !== 'system' && (
                    <button
                      onClick={() => handleRemoveTag(tag.id)}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove tag"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              
              {tags.length === 0 && (
                <span className="text-sm text-gray-500">No tags yet</span>
              )}
            </div>
            
            {filteredTags.length > 0 && (
              <Select onValueChange={handleAddTag}>
                <SelectTrigger className="w-full h-8 text-sm">
                  <SelectValue placeholder="Add existing tag..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredTags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          
          {/* AI Insights Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">AI Insights</h3>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={handleTriggerAiProcessing}
                disabled={isProcessingAi || aiProcessingStatus === 'processing'}
              >
                {isProcessingAi || aiProcessingStatus === 'processing' ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing...
                  </>
                ) : aiProcessingStatus === 'completed' ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" /> Refresh Analysis
                  </>
                ) : (
                  <>
                    <Brain className="h-3 w-3 mr-1" /> Analyze Content
                  </>
                )}
              </Button>
            </div>
            
            {aiProcessingStatus === 'processing' && (
              <div className="bg-blue-50 p-3 rounded-md flex items-center mb-2">
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin mr-2" />
                <span className="text-sm text-blue-700">
                  AI is processing this bookmark. This may take a minute...
                </span>
              </div>
            )}
            
            {aiProcessingStatus === 'failed' && (
              <div className="bg-red-50 p-3 rounded-md flex items-center mb-2">
                <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                <span className="text-sm text-red-700">
                  There was an error processing this bookmark. Please try again.
                </span>
              </div>
            )}
            
            {aiProcessingStatus === 'completed' && bookmark.insights?.summary && (
              <div className="border rounded-md p-3 mb-3 bg-gray-50">
                <h4 className="text-sm font-medium mb-1">Summary</h4>
                <p className="text-sm text-gray-700">{bookmark.insights.summary}</p>
              </div>
            )}
            
            {aiProcessingStatus === 'completed' && !bookmark.insights?.summary && (
              <div className="border rounded-md p-3 mb-3 bg-gray-50">
                <h4 className="text-sm font-medium mb-1">No Insights Available</h4>
                <p className="text-sm text-gray-700">
                  We couldn't generate insights for this bookmark. This can happen with very short content or private pages.
                </p>
              </div>
            )}
            
            {aiProcessingStatus === 'pending' && (
              <div className="border border-dashed rounded-md p-3 mb-3 bg-gray-50 text-center">
                <p className="text-sm text-gray-500 mb-2">No AI analysis yet</p>
                <p className="text-xs text-gray-400">
                  Click "Analyze Content" to generate AI insights for this bookmark
                </p>
              </div>
            )}
          </div>
          
          {/* Highlights section */}
          {bookmark.highlights && bookmark.highlights.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Highlights</h3>
              {bookmark.highlights.map((highlight: Highlight, index: number) => (
                <div key={highlight.id || index} className="border-l-2 border-yellow-400 pl-3 py-1 mb-2 bg-yellow-50 rounded-r-md">
                  <p className="text-sm italic">{highlight.text}</p>
                </div>
              ))}
            </div>
          )}
          
          {/* Notes section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Notes</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs px-2" 
                onClick={() => setIsAddingNote(!isAddingNote)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Note
              </Button>
            </div>
            
            {isAddingNote && (
              <div className="mb-3">
                <Textarea
                  placeholder="Enter your note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="mb-2"
                  rows={3}
                />
                <Button 
                  size="sm"
                  onClick={handleAddNote}
                  disabled={isSubmitting || !newNote.trim()}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  Save Note
                </Button>
              </div>
            )}
            
            {optimisticNotes.map((note: Note, index: number) => (
              <div key={note.id || index} className="border-l-2 border-primary pl-3 py-1 mb-2 bg-primary/5 rounded-r-md">
                <p className="text-sm">{note.content}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDate(note.created_at)}
                </p>
              </div>
            ))}
            
            {optimisticNotes.length === 0 && (
              <p className="text-sm text-gray-500">No notes yet</p>
            )}
          </div>
          
          {/* Collections section */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Collections</h3>
            
            <Select onValueChange={handleCollectionChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Add to collection..." />
              </SelectTrigger>
              <SelectContent>
                {/* Option to remove from all collections */}
                {bookmarkCollections.length > 0 && (
                  <SelectItem 
                    key="remove" 
                    value="remove"
                    className="text-red-500 border-b"
                  >
                    Remove from all collections
                  </SelectItem>
                )}
                
                {allCollections.map((collection) => (
                  <SelectItem 
                    key={collection.id} 
                    value={collection.id}
                    className={bookmarkCollections.some(c => c.id === collection.id) ? "bg-primary/10" : ""}
                  >
                    {collection.name} {bookmarkCollections.some(c => c.id === collection.id) && "✓"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}