import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, RefreshCw, Brain, AlertCircle, Loader2 } from "lucide-react";
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

export function BookmarkDetailPanel({ bookmark: initialBookmark, onClose }: BookmarkDetailPanelProps) {
  const [bookmark, setBookmark] = useState<Bookmark | undefined>(initialBookmark);
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTagText, setNewTagText] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isSubmittingTag, setIsSubmittingTag] = useState(false);
  const [optimisticNotes, setOptimisticNotes] = useState<Note[]>([]);
  const [aiProcessingStatus, setAiProcessingStatus] = useState<"pending" | "processing" | "completed" | "failed">("pending");
  const [isProcessingAi, setIsProcessingAi] = useState(false);
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
  
  // Set optimistic notes when bookmark changes
  useEffect(() => {
    if (bookmark && bookmark.notes) {
      setOptimisticNotes(bookmark.notes);
    } else {
      setOptimisticNotes([]);
    }
  }, [bookmark]);
  
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
    
    setIsProcessingAi(true);
    setAiProcessingStatus('processing');
    
    try {
      await apiRequest("POST", `/api/bookmarks/${bookmark.id}/process`, {
        insightDepth: 2 // Request deeper insights
      });
      
      toast({
        title: "AI processing started",
        description: "The AI analysis has been triggered and will run in the background",
      });
      
      // Poll for status updates
      const checkInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/bookmarks/${bookmark.id}/processing-status`);
          if (response.ok) {
            const statusData = await response.json();
            
            if (statusData.aiProcessingComplete) {
              clearInterval(checkInterval);
              setAiProcessingStatus('completed');
              setIsProcessingAi(false);
              
              // Refresh bookmark data and fetch insights
              queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
              queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}`] });
              queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${bookmark.id}/tags`] });
              
              // Also fetch insights and tags directly to update the UI without a page refresh
              try {
                // Fetch the updated insights
                const insightsResponse = await fetch(`/api/bookmarks/${bookmark.id}/insights`);
                let insightsData = null;
                if (insightsResponse.ok) {
                  insightsData = await insightsResponse.json();
                }
                
                // Fetch the updated tags
                const tagsResponse = await fetch(`/api/bookmarks/${bookmark.id}/tags`);
                let tagsData = null;
                if (tagsResponse.ok) {
                  tagsData = await tagsResponse.json();
                  // Update the tags directly in state
                  setTags(tagsData);
                }
                
                // Update the bookmark with new insights
                if (bookmark && insightsData) {
                  // Create a new bookmark object with the updated insights
                  const updatedBookmark = {
                    ...bookmark,
                    insights: insightsData
                  };
                  // Update the bookmark ref
                  setBookmark(updatedBookmark);
                }
                
                // Log that we've updated everything optimistically
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
              } catch (error) {
                console.error("Error fetching insights or tags after processing:", error);
              }
              
              toast({
                title: "AI processing complete",
                description: "The bookmark has been analyzed and insights are now available",
              });
            }
          }
        } catch (error) {
          console.error("Error checking processing status:", error);
        }
      }, 5000); // Check every 5 seconds
      
      // Clear interval after 60 seconds (timeout)
      setTimeout(() => {
        clearInterval(checkInterval);
        if (aiProcessingStatus === 'processing') {
          setAiProcessingStatus('failed');
          setIsProcessingAi(false);
          
          toast({
            title: "AI processing timed out",
            description: "The AI analysis is taking longer than expected. Try again later.",
            variant: "destructive"
          });
        }
      }, 60000);
      
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
    
    setIsSubmittingTag(true);
    
    try {
      // Create the new tag
      const newTag = await apiRequest<Tag>("POST", "/api/tags", {
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
  
  // Remove a tag from the bookmark
  const handleRemoveTag = async (tagId: string) => {
    if (!bookmark) return;
    
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
        
        {/* AI Insights Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
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
              <p className="text-sm text-gray-600 mb-3">
                {bookmark.insights.summary}
              </p>
              
              {bookmark.insights.related_links && bookmark.insights.related_links.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-gray-600 mb-1">Related Links</h5>
                  <ul className="text-sm text-blue-600 space-y-1">
                    {bookmark.insights.related_links.map((link: string, index: number) => (
                      <li key={index}>
                        <a 
                          href={link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hover:underline truncate block"
                        >
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
