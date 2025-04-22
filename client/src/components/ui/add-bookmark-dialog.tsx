import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TagSelector } from "@/components/ui/tag-selector";
import { useBookmarkMutations } from "@/hooks/use-bookmark-mutations";
import { useCollections, useCollectionMutations } from "@/hooks/use-collection-queries";
import { CreateCollectionDialog } from "./create-collection-dialog";

interface AddBookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookmarkAdded?: () => void;
}

export function AddBookmarkDialog({ open, onOpenChange, onBookmarkAdded }: AddBookmarkDialogProps) {
  const [url, setUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [collectionId, setCollectionId] = useState("none");
  const [showNewCollectionDialog, setShowNewCollectionDialog] = useState(false);
  const [autoExtract, setAutoExtract] = useState(true);
  const [insightDepth, setInsightDepth] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Fetch collections 
  const { data: collections = [], isLoading: collectionsLoading } = useCollections();
  const { addBookmarkToCollection } = useCollectionMutations();

  // Fetch the latest tags and collections when dialog opens
  const fetchLatestData = async () => {
    try {
      // Immediately refetch to ensure we have the latest data
      await queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      await queryClient.refetchQueries({ queryKey: ["/api/tags"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      await queryClient.refetchQueries({ queryKey: ["/api/collections"] });
    } catch (error) {
      console.error("Error fetching latest data:", error);
    }
  };
  
  // Fetch data when dialog opens
  useEffect(() => {
    if (open) {
      fetchLatestData();
    }
  }, [open]);

  // Use our bookmark mutation hook for optimistic updates
  const { createBookmark } = useBookmarkMutations();

  const handleSubmit = async () => {
    if (!url) {
      toast({
        title: "URL is required",
        description: "Please enter a valid URL to bookmark",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Import the API request function directly to avoid TypeScript errors
      const { apiRequest } = await import('@/lib/queryClient');
      
      // Check if the URL already exists as a bookmark
      const urlCheckResult = await apiRequest("POST", "/api/url/normalize", { url });
      let bookmarkId: string;
      
      if (urlCheckResult.exists && urlCheckResult.existingForUser) {
        // URL exists for this user - update it with new info
        try {
          // Get existing bookmark
          const existingBookmark = await apiRequest("GET", `/api/bookmarks/${urlCheckResult.existingBookmarkId}`);
          bookmarkId = existingBookmark.id;
          
          // Update the bookmark with new information
          // Include a note about updating the bookmark in the description field if it's empty
          const descriptionToSend = notes 
            ? notes 
            : (existingBookmark.description || "Updated bookmark");
          
          // Prepare what's being updated for the log message
          const updatedInfo = [];
          if (notes) updatedInfo.push("notes");
          if (selectedTags.length > 0) updatedInfo.push("tags");
          
          await apiRequest("PATCH", `/api/bookmarks/${urlCheckResult.existingBookmarkId}`, {
            description: descriptionToSend,
            tags: selectedTags.length > 0 ? selectedTags : existingBookmark.user_tags,
          });
          
          // If notes are provided, add them as a new note to the bookmark
          if (notes && notes.trim()) {
            try {
              await apiRequest("POST", `/api/bookmarks/${urlCheckResult.existingBookmarkId}/notes`, {
                text: notes,
                type: "user"
              });
              
              // Make sure to invalidate the notes query to refresh the data
              queryClient.invalidateQueries({ 
                queryKey: [`/api/bookmarks/${urlCheckResult.existingBookmarkId}/notes`] 
              });
              
              console.log("Added new note to existing bookmark:", urlCheckResult.existingBookmarkId);
            } catch (error) {
              console.error("Error adding note to existing bookmark:", error);
            }
          }
          
          // Invalidate queries to refresh the data
          queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
          queryClient.invalidateQueries({ queryKey: [`/api/bookmarks/${urlCheckResult.existingBookmarkId}/tags`] });
          
          // Show success message with details about what was updated
          toast({
            title: "Bookmark updated",
            description: `Your existing bookmark has been updated with ${
              notes ? 'new notes' : ''
            }${notes && selectedTags.length > 0 ? ' and ' : ''}${
              selectedTags.length > 0 ? 'new tags' : ''
            }`,
            variant: "default",
          });
        } catch (error) {
          console.error("Error updating existing bookmark:", error);
          // Continue to regular bookmark creation as fallback
          bookmarkId = "";
        }
      } else if (urlCheckResult.exists) {
        // URL exists but not for this user - inform them
        toast({
          title: "URL already exists",
          description: "This URL has already been bookmarked by someone else",
          variant: "default",
        });
        bookmarkId = "";
      } else {
        // URL doesn't exist, create a new bookmark
        const result = await createBookmark.mutateAsync({
          url,
          title: url.split("/").pop() || url, 
          description: notes ? notes.substring(0, 100) : "", 
          notes,
          tags: selectedTags,
          autoExtract,
          insightDepth: autoExtract ? insightDepth : null,
          source: "web"
        });
        
        bookmarkId = result.id;
      }
      
      // If a collection was selected and we have a bookmark ID, add it to the collection
      if (collectionId && collectionId !== "none" && bookmarkId) {
        try {
          await addBookmarkToCollection.mutateAsync({
            collectionId,
            bookmarkId
          });
          
          toast({
            title: "Bookmark added to collection",
            description: "The bookmark was successfully added to the selected collection",
            variant: "default",
          });
        } catch (error) {
          console.error("Error adding bookmark to collection:", error);
          toast({
            title: "Error adding to collection",
            description: "The bookmark was created but could not be added to the collection",
            variant: "destructive",
          });
        }
      }
      
      // Reset form
      setUrl("");
      setSelectedTags([]);
      setNotes("");
      setCollectionId("none");
      setAutoExtract(true);
      setInsightDepth("1");
      
      // Close dialog
      onOpenChange(false);
      
      // Notify parent
      if (onBookmarkAdded) {
        onBookmarkAdded();
      }
      
      // If we have a bookmark ID, dispatch an event to show it in detail view
      if (bookmarkId) {
        const showBookmarkEvent = new CustomEvent('showBookmarkDetail', { 
          detail: { bookmarkId } 
        });
        window.dispatchEvent(showBookmarkEvent);
        document.dispatchEvent(showBookmarkEvent);
      }
    } catch (error) {
      toast({
        title: "Error adding bookmark",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCollectionChange = (value: string) => {
    if (value === "new") {
      setShowNewCollectionDialog(true);
    } else {
      setCollectionId(value);
    }
  };

  const handleCollectionCreated = (newCollectionId: string) => {
    setCollectionId(newCollectionId);
    setShowNewCollectionDialog(false);
    // Refresh collections
    queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Bookmark</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1"
              />
            </div>
            
            <div>
              <TagSelector 
                selectedTags={selectedTags}
                onTagsChange={setSelectedTags}
              />
            </div>
            
            <div>
              <Label htmlFor="notes">Notes <span className="text-gray-400 text-xs">(Optional)</span></Label>
              <Textarea
                id="notes"
                placeholder="Add your thoughts about this bookmark"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="collection">Collection <span className="text-gray-400 text-xs">(Optional)</span></Label>
              <Select value={collectionId} onValueChange={handleCollectionChange}>
                <SelectTrigger id="collection" className="mt-1">
                  <SelectValue placeholder="Select a collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">Not in a collection</SelectItem>
                    {collections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name} {collection.is_public ? "(Public)" : "(Private)"}
                      </SelectItem>
                    ))}
                    <SelectItem value="new" className="text-blue-500 font-medium">
                      + Create New Collection
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="auto-extract" 
                  checked={autoExtract} 
                  onCheckedChange={(checked) => setAutoExtract(checked as boolean)}
                />
                <Label htmlFor="auto-extract" className="text-sm">
                  Auto-extract insights
                </Label>
              </div>
              
              <Select value={insightDepth} onValueChange={setInsightDepth} disabled={!autoExtract}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Insight depth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="1">L1: On-page only</SelectItem>
                    <SelectItem value="2">L2: One-click away</SelectItem>
                    <SelectItem value="3">L3: Multi-layered</SelectItem>
                    <SelectItem value="4">L4: Research sweep</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Adding..." : "Add Bookmark"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* New Collection Dialog */}
      <CreateCollectionDialog 
        open={showNewCollectionDialog}
        onOpenChange={setShowNewCollectionDialog}
        onCollectionCreated={handleCollectionCreated}
      />
    </>
  );
}
