import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, RefreshCw, Brain, AlertCircle, Loader2, FolderIcon, Twitter, Heart, MessagesSquare, Repeat, Quote, Share2, ExternalLink, LockIcon } from "lucide-react";
import { Bookmark, Highlight, Note, Tag as TagType } from "@shared/types";
import { formatDate } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
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

// Use the imported Tag type

interface BookmarkDetailPanelProps {
  bookmark?: Bookmark;
  onClose: () => void;
}

export function BookmarkDetailPanel({ bookmark: initialBookmark, onClose }: BookmarkDetailPanelProps) {
  const [bookmark, setBookmark] = useState<Bookmark | undefined>(initialBookmark);
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
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const summaryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  
  // Cleanup timeout on unmount or when bookmark changes
  useEffect(() => {
    return () => {
      if (summaryTimeoutRef.current) {
        clearTimeout(summaryTimeoutRef.current);
      }
    };
  }, [bookmark?.id]);
  
  // Function to handle debounced saving of summary data
  const debounceSummaryUpdate = (summaryText: string) => {
    // Clear any existing timeout
    if (summaryTimeoutRef.current) {
      clearTimeout(summaryTimeoutRef.current);
    }
    
    // Only schedule API call if we have a bookmark with insights to update
    if (bookmark?.insights) {
      const bookmarkInsights = bookmark.insights; // Create a reference for type safety
      
      // Set a new timeout for the API call
      summaryTimeoutRef.current = setTimeout(() => {
        setIsSavingSummary(true);
        
        // Prepare the updated insights object
        const updatedInsights = {
          id: bookmarkInsights.id,
          bookmark_id: bookmarkInsights.bookmark_id,
          summary: summaryText,
          sentiment: bookmarkInsights.sentiment,
          depth_level: bookmarkInsights.depth_level,
          related_links: bookmarkInsights.related_links
        };
        
        // Call the update function
        handleUpdateBookmark({ insights: updatedInsights })
          .finally(() => {
            setIsSavingSummary(false);
          });
      }, 1500); // 1.5 second debounce
    }
  };
  
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

  if (!bookmark) {
    return (
      <>
        <div className="h-16 p-4 border-b border-gray-200 flex items-center sticky top-0 bg-white z-10">
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
        return;
      } catch (error) {
        console.error("Error removing from collections:", error);
        toast({
          title: "Collection update failed",
          description: "There was an error updating collections. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Check if bookmark is already in the selected collection
    const isInCollection = bookmarkCollections.some(c => c.id === collectionId);
    
    try {
      if (isInCollection) {
        // Remove bookmark from collection
        await removeBookmarkFromCollection.mutateAsync({
          collectionId,
          bookmarkId: bookmark.id
        });
        
        toast({
          title: "Removed from collection",
          description: "Bookmark has been removed from the collection",
        });
      } else {
        // Add bookmark to collection
        await addBookmarkToCollection.mutateAsync({
          collectionId,
          bookmarkId: bookmark.id
        });
        
        toast({
          title: "Added to collection",
          description: "Bookmark has been added to the collection",
        });
      }
    } catch (error) {
      console.error("Error managing collection:", error);
      toast({
        title: "Collection update failed",
        description: "There was an error updating collections. Please try again.",
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
        description: "Please log in to add tags to bookmarks",
        variant: "destructive",
      });
      return;
    }
    
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
      
      // Invalidate ALL related queries to ensure UI consistency across components
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/tags`] });
      
      // Dispatch a custom event to notify the graph of the tag change
      const event = new CustomEvent('tagChanged', { 
        detail: { 
          bookmarkId: bookmark.id,
          tagId: tagId,
          action: 'add'
        } 
      });
      document.dispatchEvent(event);
      
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
    
    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to create and add tags",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmittingTag(true);
    
    try {
      // Create the new tag
      const newTag = await apiRequest<TagType>("POST", "/api/tags", {
        name: newTagText.trim(),
        type: "user"
      });
      
      // Optimistically update the UI
      setTags(prev => [...prev, newTag]);
      setAllTags(prev => [...prev, newTag]); // Update the local cache of all tags
      
      // Add tag to bookmark
      await apiRequest("POST", `/api/bookmarks/${bookmark.id}/tags/${newTag.id}`, {});
      
      toast({
        title: "Tag added",
        description: `New tag "${newTag.name}" has been created and added to the bookmark`,
      });
      
      // Invalidate ALL related queries to ensure UI consistency across components
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/tags`] });
      
      // Dispatch a custom event to notify the graph of the tag change
      const event = new CustomEvent('tagChanged', { 
        detail: { 
          bookmarkId: bookmark.id,
          tagId: newTag.id,
          action: 'add',
          tagName: newTag.name
        } 
      });
      document.dispatchEvent(event);
      
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
  
  // Handle updating bookmark fields
  const handleUpdateBookmark = async (updateData: Partial<Bookmark>) => {
    if (!bookmark) return;

    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to update bookmark information",
        variant: "destructive",
      });
      // Revert any visual changes
      if (initialBookmark) {
        setBookmark(initialBookmark);
      }
      return;
    }
    
    try {
      // Immediately set the updated_at timestamp to the current time for optimistic updates
      const now = new Date().toISOString();
      
      // Create the optimistically updated bookmark with current timestamp
      // Type-safe conversion: Convert the ISO string to a Date object for state update
      const optimisticBookmark = {
        ...bookmark,
        ...updateData,
        updated_at: new Date(now) // Use Date object for local state to match Bookmark type
      };
      
      // Store a reference to optimistic bookmark to use after API call completes
      const optimisticBookmarkRef = { ...optimisticBookmark };
      
      // Update the local state with optimistic data immediately
      setBookmark(optimisticBookmark);
      
      // Get current bookmarks from the cache
      const currentBookmarks = queryClient.getQueryData<Bookmark[]>(["/api/bookmarks"]) || [];
      
      // Get current localStorage sort setting
      const sortOrder = localStorage.getItem('bookmarkSortOrder') || 'newest';
      
      // Check if we need to reorder (only for "recently_updated" sort)
      if (sortOrder === 'recently_updated') {
        // For recently_updated sort, create a new sorted list with the updated bookmark at the top
        const filteredBookmarks = currentBookmarks.filter(b => b.id !== bookmark.id);
        // Cast optimisticBookmark as Bookmark to ensure proper typing
        const sortedBookmarks = [optimisticBookmark as Bookmark, ...filteredBookmarks];
        
        // Update the cache with the reordered list in a single operation
        queryClient.setQueryData<Bookmark[]>(["/api/bookmarks"], sortedBookmarks);
      } else {
        // For other sort orders, just update the bookmark in the current list without resorting
        queryClient.setQueryData<Bookmark[]>(["/api/bookmarks"], 
          (oldBookmarks = []) => oldBookmarks.map(b => 
            b.id === bookmark.id ? optimisticBookmark : b
          )
        );
      }
      
      // Make API request to update the bookmark
      await apiRequest(
        "PATCH", 
        `/api/bookmarks/${bookmark.id}`, 
        updateData
      );
      
      // Important: Don't set bookmark state directly from server response
      // Instead, keep the optimistic update we already made
      // This prevents the UI flicker when server data arrives
      
      // Only update tags/refs in background without affecting current display
      if (sortOrder !== 'recently_updated') {
        // Use a longer delay to ensure user's editing experience is complete
        setTimeout(() => {
          // Instead of invalidating, use setQueryData to update cache without triggering refetch
          queryClient.setQueryData([`/api/bookmarks/${bookmark.id}`], optimisticBookmarkRef);
        }, 2000);
      }
      
      // Dispatch a custom event to inform other components about the update
      const event = new CustomEvent('bookmarkUpdated', { 
        detail: { 
          bookmarkId: bookmark.id,
          updatedBookmark: optimisticBookmarkRef
        } 
      });
      document.dispatchEvent(event);
      
      // Show success toast
      toast({
        title: "Bookmark updated",
        description: "Your bookmark has been updated successfully",
        variant: "default",
      });
    } catch (error) {
      console.error("Error updating bookmark:", error);
      
      // Show error toast
      toast({
        title: "Update failed",
        description: "There was a problem updating your bookmark. Please try again.",
        variant: "destructive",
      });
      
      // Revert to original data if it exists
      if (initialBookmark) {
        setBookmark(initialBookmark);
      }
      
      // Invalidate queries to refresh the data from server
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    }
  };

  // Remove a tag from the bookmark
  const handleRemoveTag = async (tagId: string) => {
    if (!bookmark) return;
    
    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to remove tags from bookmarks",
        variant: "destructive",
      });
      return;
    }
    
    // Find the tag to remove
    const tagToRemove = tags.find(tag => tag.id === tagId);
    if (!tagToRemove) return;
    
    // Optimistically update the UI
    setTags(prev => prev.filter(tag => tag.id !== tagId));
    
    try {
      // Make the API request using fetch directly to better handle empty responses
      const response = await fetch(`/api/bookmarks/${bookmark.id}/tags/${tagId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      toast({
        title: "Tag removed",
        description: `Tag "${tagToRemove.name}" has been removed from the bookmark`,
      });
      
      // Invalidate ALL related queries to ensure UI consistency across components
      // This ensures the graph, sidebar, and detail panel all update correctly
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/tags`] });
      
      // Dispatch a custom event to notify the graph of the tag change
      const event = new CustomEvent('tagChanged', { 
        detail: { 
          bookmarkId: bookmark.id,
          tagId: tagId,
          action: 'remove',
          tagName: tagToRemove.name
        } 
      });
      document.dispatchEvent(event);
      
      console.log(`Tag ${tagToRemove.name} (${tagId}) successfully removed from bookmark ${bookmark.id}`);
      
    } catch (error) {
      console.error("Error removing tag:", error);
      
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
    
    // Check if user is logged in
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to add notes to bookmarks",
        variant: "destructive",
      });
      // Clear the note input and close the form
      setNewNote("");
      setIsAddingNote(false);
      return;
    }
    
    setIsSubmitting(true);
    
    // Create a temporary ID for the optimistic update
    const tempId = `temp-${Date.now()}`;
    
    // Create an optimistic note
    const optimisticNote: Note = {
      id: tempId,
      bookmark_id: bookmark.id,
      text: newNote.trim(),
      timestamp: new Date().toISOString() as any // Type cast to handle expected Date type
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
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/notes`] });
      
      // Dispatch a custom event for potential event listeners
      const event = new CustomEvent('noteAdded', { 
        detail: { 
          bookmarkId: bookmark.id,
          noteId: createdNote.id,
          text: createdNote.text
        } 
      });
      document.dispatchEvent(event);
      
      console.log(`Note "${createdNote.text.substring(0, 30)}..." successfully added to bookmark ${bookmark.id}`);
      
      setNewNote("");
      setIsAddingNote(false);
      
    } catch (error) {
      console.error("Error adding note:", error);
      
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
      <div className="h-16 p-4 border-b border-gray-200 flex items-center sticky top-0 bg-white z-10">
        <div className="flex w-full items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Detail View</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      <div className="p-4 overflow-auto">
        <div className="mb-4">
          <div
            className="font-medium text-base mb-1 border-b border-transparent hover:border-gray-300 focus-within:border-primary cursor-text"
            onClick={(e) => {
              // Make sure the click was directly on the div and not on a child element
              if (e.currentTarget === e.target) {
                const inputElement = e.currentTarget.querySelector('input');
                if (inputElement) inputElement.focus();
              }
            }}
          >
            <input
              type="text"
              value={bookmark.title}
              className="w-full bg-transparent focus:outline-none font-medium"
              onChange={(e) => {
                setBookmark(prev => prev ? { ...prev, title: e.target.value } : prev);
              }}
              onBlur={(e) => {
                if (initialBookmark && e.target.value !== initialBookmark.title) {
                  // Only make API call if title has changed
                  handleUpdateBookmark({ title: e.target.value });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
          </div>
          <a 
            href={bookmark.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-sm text-blue-600 hover:underline block truncate"
          >
            {bookmark.url}
          </a>
        </div>
        
        {/* Twitter Card for X.com bookmarks */}
        {bookmark.source === 'x' && (
          <div className="mb-4 mt-4 bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            {/* Tweet author info */}
            {bookmark.author_username && (
              <div className="flex items-start mb-3">
                {/* We've removed the Twitter bird icon placeholder avatar as requested */}
                <div>
                  <div className="font-bold">{bookmark.author_name || 'Twitter User'}</div>
                  <div className="text-gray-500 text-sm">@{bookmark.author_username}</div>
                </div>
                <div className="ml-auto">
                  <a 
                    href={`https://twitter.com/${bookmark.author_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            )}
            
            {/* Tweet content */}
            <div className="mb-4 text-gray-800">
              {bookmark.description}
            </div>
            
            {/* Tweet media (if any) */}
            {bookmark.media_urls && bookmark.media_urls.length > 0 && (
              <div className="mb-4 grid grid-cols-1 gap-2">
                {bookmark.media_urls
                  .filter(url => 
                    // Only include Twitter/X media URLs (skip local paths and other URLs)
                    url.includes('pbs.twimg.com')
                  )
                  .map((url, index) => (
                    <a 
                      key={index} 
                      href={url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-gray-200 hover:border-primary"
                    >
                      {/* Render the image directly for Twitter/X media URLs */}
                      <img 
                        src={url} 
                        alt={`Media from ${bookmark.title}`}
                        className="w-full h-auto object-cover"
                        loading="lazy"
                        onError={(e) => {
                          // If image fails to load, show fallback message
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.parentElement?.classList.add('bg-gray-50', 'p-3', 'text-sm', 'text-gray-500');
                          target.parentElement!.innerHTML = 'Media unavailable';
                        }}
                      />
                    </a>
                  ))}
              </div>
            )}
            
            {/* Tweet stats - more compact design to prevent overflow */}
            <div className="border-t border-gray-100 pt-3 text-xs">
              {/* Engagement stats in a more compact format */}
              <div className="flex flex-wrap justify-items-stretch gap-4 text-gray-500">
                {bookmark.like_count !== undefined && (
                  <span className="inline-flex items-center whitespace-nowrap">
                    <Heart className="h-3 w-3 mr-2" />
                    {bookmark.like_count}
                  </span>
                )}
                {bookmark.repost_count !== undefined && (
                  <span className="inline-flex items-center whitespace-nowrap">
                    <Repeat className="h-3 w-3 mr-1" />
                    {bookmark.repost_count}
                  </span>
                )}
                {bookmark.reply_count !== undefined && (
                  <span className="inline-flex items-center whitespace-nowrap">
                    <MessagesSquare className="h-3 w-3 mr-1" />
                    {bookmark.reply_count}
                  </span>
                )}
                {bookmark.quote_count !== undefined && (
                  <span className="inline-flex items-center whitespace-nowrap">
                    <Quote className="h-3 w-3 mr-1" />
                    {bookmark.quote_count}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* AI Insights Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 w-full">
            <h4 className="text-sm font-medium text-gray-700">AI Insights</h4>
            {/* AI Processing Status & Trigger Button */}
            {aiProcessingStatus === 'pending' && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs font-medium"
                onClick={handleTriggerAiProcessing}
                disabled={isProcessingAi}
              >
                <Brain className="h-3.5 w-3.5 mr-1" />
                Analyze Content
              </Button>
            )}
            {aiProcessingStatus === 'processing' && (
              <div className="flex items-center text-xs text-amber-600">
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Processing...
              </div>
            )}
            {aiProcessingStatus === 'completed' && bookmark.insights?.summary && (
              <div className="flex items-center text-xs text-green-600">
                <RefreshCw 
                  className="h-3.5 w-3.5 mr-1 cursor-pointer hover:text-primary" 
                  onClick={handleTriggerAiProcessing}
                />
                <span title="Re-analyze content">Analysis Complete</span>
              </div>
            )}
            {aiProcessingStatus === 'completed' && !bookmark.insights?.summary && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs font-medium"
                onClick={handleTriggerAiProcessing}
                disabled={isProcessingAi}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Re-analyze
              </Button>
            )}
            {aiProcessingStatus === 'failed' && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs text-destructive font-medium"
                onClick={handleTriggerAiProcessing}
                disabled={isProcessingAi}
              >
                <AlertCircle className="h-3.5 w-3.5 mr-1" />
                Retry Analysis
              </Button>
            )}
          </div>
          
          {bookmark.insights?.summary ? (
            <div>
              <h5 className="text-xs font-medium text-gray-600 mb-1">Summary</h5>
              <div
                className="text-sm text-gray-600 mb-3 border-b border-transparent hover:border-gray-300 focus-within:border-primary cursor-text"
                onClick={(e) => {
                  // Make sure the click was directly on the div and not on a child element
                  if (e.currentTarget === e.target) {
                    const textareaElement = e.currentTarget.querySelector('textarea');
                    if (textareaElement) textareaElement.focus();
                  }
                }}
              >
                <div className="relative">
                  <textarea
                    value={bookmark.insights.summary}
                    className="w-full bg-transparent focus:outline-none resize-none overflow-hidden pr-8"
                    rows={Math.max(3, bookmark.insights.summary.split('\n').length)}
                    onChange={(e) => {
                      // Update the UI immediately for a responsive experience
                      setBookmark(prev => {
                        if (!prev) return prev;
                        return { 
                          ...prev,
                          insights: prev.insights ? {
                            ...prev.insights,
                            summary: e.target.value
                          } : undefined
                        } as Bookmark;
                      });
                      
                      // Trigger the debounced save
                      debounceSummaryUpdate(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      // Allow multiline text by only handling Ctrl+Enter
                      if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  {isSavingSummary && (
                    <div className="absolute right-1 top-1 text-xs text-muted-foreground animate-pulse">
                      Saving...
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              {aiProcessingStatus === 'pending' && "AI hasn't analyzed this content yet. Click 'Analyze Content' to start."}
              {aiProcessingStatus === 'processing' && "AI is currently analyzing this content..."}
              {aiProcessingStatus === 'completed' && "No insights available. Try re-analyzing the content."}
              {aiProcessingStatus === 'failed' && "AI analysis failed. Please try again."}
            </div>
          )}
        </div>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Tags</h4>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs text-primary font-medium"
              onClick={() => {
                if (!user) {
                  toast({
                    title: "Authentication required",
                    description: "Please log in to add tags to bookmarks",
                    variant: "destructive",
                  });
                  return;
                }
                setIsAddingTag(true);
              }}
              title={!user ? "Login required to add tags" : "Add tags"}
            >
              {!user && (
                <span className="inline-flex items-center">
                  <LockIcon className="h-3 w-3 mr-1" />
                </span>
              )}
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
                  onClick={() => {
                    if (!user) {
                      toast({
                        title: "Authentication required",
                        description: "Please log in to remove tags from bookmarks",
                        variant: "destructive",
                      });
                      return;
                    }
                    handleRemoveTag(tag.id);
                  }}
                  title={!user ? "Login required to remove tags" : "Remove tag"}
                >
                  <X className="h-2 w-2" />
                </Button>
              </Badge>
            ))}
            
            {tags.length === 0 && (
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
              onClick={() => {
                if (!user) {
                  toast({
                    title: "Authentication required",
                    description: "Please log in to add notes to bookmarks",
                    variant: "destructive",
                  });
                  return;
                }
                setIsAddingNote(true);
              }}
              title={!user ? "Login required to add notes" : "Add note"}
            >
              {!user && (
                <span className="inline-flex items-center">
                  <LockIcon className="h-3 w-3 mr-1" />
                </span>
              )}
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
        
        {/* Collections Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Collection</h4>
            <div className="flex items-center">
              {!user && (
                <span title="Login required to manage collections">
                  <LockIcon className="h-3 w-3 mr-1 text-gray-500" />
                </span>
              )}
              <FolderIcon className="h-3.5 w-3.5 mr-2 text-gray-500" />
            </div>
          </div>
          <div className="mb-2">
            <Select 
              onValueChange={handleCollectionChange}
              disabled={!user}
            >
              <SelectTrigger className="w-full" title={!user ? "Login required to manage collections" : ""}>
                <SelectValue placeholder={bookmarkCollections.length > 0 
                  ? `${bookmarkCollections.length} collection${bookmarkCollections.length !== 1 ? 's' : ''}` 
                  : !user ? "Login to manage collections" : "Select a collection"} 
                />
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
        

      </div>
    </>
  );
}
