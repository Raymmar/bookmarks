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
    auto_add_tagged?: boolean;
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
  const [autoAddTagged, setAutoAddTagged] = useState(false);
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
    refetch: refetchCollectionTags
  } = useQuery<Tag[]>({
    queryKey: ["/api/collections", collection?.id, "tags"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!collection?.id && open,
  });
  
  // Initialize form or reset when dialog opens/collection changes
  // Use a single useEffect for initializing both regular fields and tags
  // with a proper reset when the collection or modal state changes
  useEffect(() => {
    if (collection && open) {
      // Initialize form fields from collection data
      setName(collection.name);
      setDescription(collection.description || "");
      setIsPublic(collection.is_public);
      setAutoAddTagged(collection.auto_add_tagged ?? false);
      
      // Initially reset the selectedTags when opening the dialog
      setSelectedTags([]);
      
      // Only set the tags when collectionTags have loaded
      // This avoids an unnecessary state update when they come in later
      if (collectionTags && Array.isArray(collectionTags) && collectionTags.length > 0) {
        console.log("Got collection tags:", collectionTags);
      }
    }
  }, [collection, open, collectionTags.length]);

  // Helper function to sync collection tags
  const syncCollectionTags = async () => {
    if (!collection) return;
    
    try {
      // Get the IDs of the selected tags
      const tagsResponse = await apiRequest('GET', '/api/tags');
      const allTags = tagsResponse;
      
      // Map of tag names to tag IDs
      const tagMap = new Map(allTags.map((tag: Tag) => [tag.name.toLowerCase(), tag.id]));
      
      // Get the existing tags for this collection
      const existingTags = collectionTags.map(tag => tag.name.toLowerCase());
      
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
        
        // Add the tag to the collection using our mutation hook
        await addTagToCollection.mutateAsync({ 
          collectionId: collection.id, 
          tagId: tagId 
        });
      }
      
      // Remove tags that were unselected
      for (const tag of collectionTags) {
        const normalizedTagName = tag.name.toLowerCase().trim();
        
        // If this tag is no longer in the selected tags, remove it
        if (!selectedTags.some(t => t.toLowerCase().trim() === normalizedTagName)) {
          await removeTagFromCollection.mutateAsync({ 
            collectionId: collection.id, 
            tagId: tag.id 
          });
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
      await updateCollection.mutateAsync({
        id: collection.id,
        name,
        description,
        is_public: isPublic,
        auto_add_tagged: autoAddTagged
      });
      
      // Update the collection tags
      await syncCollectionTags();
      
      // Process tagged bookmarks if auto-add is enabled
      if (autoAddTagged) {
        await processTaggedBookmarks.mutateAsync(collection.id);
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
          
          <div className="flex items-center space-x-2 pt-2">
            <Switch 
              id="auto-add-tagged" 
              checked={autoAddTagged} 
              onCheckedChange={setAutoAddTagged}
            />
            <div>
              <Label htmlFor="auto-add-tagged" className="text-sm">
                Auto-add bookmarks with matching tags
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically add bookmarks to this collection when they match the tags above
              </p>
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