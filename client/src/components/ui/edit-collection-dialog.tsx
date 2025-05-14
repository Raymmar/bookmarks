import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useCollectionMutations } from "@/hooks/use-collection-queries";
import { TagSelector } from "@/components/ui/tag-selector";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";


interface EditCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: {
    id: string;
    name: string;
    description: string | null;
    is_public: boolean;
  } | null;
  onCollectionUpdated?: () => void;
}

interface Tag {
  id: string;
  name: string;
  type: "user" | "system";
  count: number;
}

export function EditCollectionDialog({ 
  open, 
  onOpenChange,
  collection,
  onCollectionUpdated 
}: EditCollectionDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { 
    updateCollection, 
    addTagToCollection, 
    removeTagFromCollection, 
    processTaggedBookmarks 
  } = useCollectionMutations();
  
  // Fetch tags for this collection
  const { 
    data: collectionTags = [],
    refetch: refetchCollectionTags,
    isLoading: isLoadingTags,
    isError: isTagsError,
    error: tagsError
  } = useQuery<Tag[]>({
    queryKey: ["/api/collections", collection?.id, "tags"],
    queryFn: async () => {
      if (!collection?.id) return [];
      try {
        console.log(`Fetching tags for collection ${collection.id}`);
        const tags = await apiRequest('GET', `/api/collections/${collection.id}/tags`);
        console.log('Retrieved tags:', tags);
        return tags;
      } catch (error) {
        console.error('Error fetching collection tags:', error);
        throw error;
      }
    },
    enabled: !!collection?.id && open,
  });
  
  // Initialize form when dialog opens/collection changes
  useEffect(() => {
    if (collection && open) {
      // Initialize form fields from collection data
      setName(collection.name);
      setDescription(collection.description || "");
      setIsPublic(collection.is_public);
      
      // Reset selected tags to clear any previous state
      setSelectedTags([]);
      
      // Force refetch of collection tags when modal opens
      if (collection.id) {
        console.log("Explicitly refetching tags for collection", collection.id);
        // Invalidate query cache before refetching
        queryClient.invalidateQueries({ queryKey: ["/api/collections", collection.id, "tags"] });
        refetchCollectionTags();
      }
    }
  }, [collection, open, refetchCollectionTags]);
  
  // Handle loading collection tags
  useEffect(() => {
    console.log("Collection tags updated:", collectionTags);
    
    if (collectionTags && Array.isArray(collectionTags)) {
      // Only update if we have valid tag objects with the proper structure
      const validTags = collectionTags.filter(tag => 
        tag && 
        typeof tag === 'object' &&
        'id' in tag && 
        'name' in tag && 
        'type' in tag
      );
      
      if (validTags.length > 0) {
        console.log("Setting selected tags from valid collection tags:", validTags);
        setSelectedTags(validTags.map(tag => tag.name));
      } else if (collectionTags.length > 0 && validTags.length === 0) {
        console.warn("Received collection tags but none were valid:", collectionTags);
      }
    }
  }, [collectionTags]);

  // Helper function to sync collection tags
  const syncCollectionTags = async () => {
    if (!collection) return;
    
    try {
      // Get the IDs of the selected tags
      const tagsResponse = await apiRequest('GET', '/api/tags');
      const allTags = tagsResponse;
      
      // Map of tag names to tag IDs
      const tagMap = new Map(allTags.map((tag: Tag) => [tag.name.toLowerCase(), tag.id]));
      
      // Get the existing tags for this collection, filtering out invalid objects
      const validCollectionTags = collectionTags.filter(tag => 
        tag && typeof tag === 'object' && 'name' in tag && typeof tag.name === 'string'
      );
      const existingTags = validCollectionTags.map(tag => tag.name.toLowerCase());
      
      // Create any new tags that don't exist yet
      for (const tagName of selectedTags) {
        const normalizedTagName = tagName.toLowerCase().trim();
        
        // Skip if this tag is already in the collection
        if (existingTags.includes(normalizedTagName)) continue;
        
        // Check if the tag already exists in our database
        let tagId = tagMap.get(normalizedTagName);
        
        if (!tagId) {
          // Create the tag if it doesn't exist
          const newTag = await apiRequest('POST', '/api/tags', { name: tagName });
          tagId = newTag.id;
        }
        
        // Add the tag to the collection using our mutation hook with optimistic updates
        await addTagToCollection.mutateAsync({ 
          collectionId: collection.id, 
          tagId: tagId,
          tagName: tagName // Include tag name for optimistic updates
        });
      }
      
      // Remove tags that were unselected, only processing valid tag objects
      for (const tag of validCollectionTags) {
        if (!tag || typeof tag !== 'object' || !tag.id || !tag.name) {
          console.log("Skipping invalid tag object:", tag);
          continue;
        }
        
        const normalizedTagName = tag.name.toLowerCase().trim();
        
        // If this tag is no longer in the selected tags, remove it
        if (!selectedTags.some(t => t.toLowerCase().trim() === normalizedTagName)) {
          try {
            await removeTagFromCollection.mutateAsync({ 
              collectionId: collection.id, 
              tagId: tag.id 
            });
          } catch (error) {
            console.error(`Error removing tag ${tag.id} from collection ${collection.id}:`, error);
            // Continue processing other tags even if one fails
          }
        }
      }
      
      // Refresh the collection tags
      refetchCollectionTags();
      
    } catch (error) {
      console.error("Error syncing collection tags:", error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!collection) return;
    
    if (!name) {
      toast({
        title: "Collection name is required",
        description: "Please enter a name for your collection",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Update the collection basic details
      const updatedCollection = await updateCollection.mutateAsync({
        id: collection.id,
        name,
        description,
        is_public: isPublic,
        // Always set auto_add_tagged to true
        auto_add_tagged: true
      });
      
      console.log("Collection updated successfully:", updatedCollection);
      
      try {
        // Try to update the collection tags
        await syncCollectionTags();
      } catch (tagError) {
        // Log the error but continue with the update process
        console.error('Error syncing collection tags:', tagError);
      }
      
      // Always process tagged bookmarks - auto-add is always enabled
      try {
        console.log("Processing tagged bookmarks for collection", collection.id);
        await processTaggedBookmarks.mutateAsync(collection.id);
      } catch (processError) {
        // Log the error but continue
        console.error('Error processing tagged bookmarks:', processError);
      }
      
      toast({
        title: "Collection updated",
        description: "Your collection has been updated successfully",
      });
      
      if (onCollectionUpdated) {
        onCollectionUpdated();
      }
      
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating collection:', error);
      toast({
        title: "Error updating collection",
        description: "There was an error updating your collection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };



  if (!collection) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Collection</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="My Research Collection"
            />
          </div>
          
          <div>
            <Label htmlFor="description">Description <span className="text-gray-400 text-xs">(Optional)</span></Label>
            <Textarea
              id="description"
              placeholder="A brief description of this collection"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label className="mb-1 block">Tags</Label>
            <TagSelector 
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
            />
            <p className="text-xs text-muted-foreground mt-1">Add tags to organize your collection</p>
          </div>
          
          <div className="mt-2 p-3 bg-muted/30 rounded-md border border-muted">
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-primary flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <div className="space-y-1">
                <p className="text-sm font-medium">Auto-organization is enabled</p>
                <p className="text-xs text-muted-foreground">
                  Bookmarks with matching tags will be automatically added to this collection.
                  When you add or remove tags, the system will update your collection immediately.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 pt-2">
            <Switch 
              id="is-public" 
              checked={isPublic} 
              onCheckedChange={setIsPublic}
            />
            <Label htmlFor="is-public" className="text-sm">
              Make collection public
            </Label>
          </div>
        </div>
        <DialogFooter className="flex justify-end gap-2">
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
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}