import { useState, useEffect, useRef } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  // State for form values
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  // Ref to track initialization
  const initialized = useRef(false);
  
  const { 
    updateCollection, 
    addTagToCollection, 
    removeTagFromCollection, 
    processTaggedBookmarks 
  } = useCollectionMutations();
  
  // Reset the form when the dialog opens with a collection
  useEffect(() => {
    if (collection && open) {
      setName(collection.name);
      setDescription(collection.description || "");
      setIsPublic(collection.is_public);
      initialized.current = false;
    }
  }, [collection, open]);
  
  // Fetch tags for this collection when dialog is open
  const { 
    data: collectionTags = [],
    refetch: refetchCollectionTags,
  } = useQuery<Tag[]>({
    queryKey: ["/api/collections", collection?.id, "tags"],
    queryFn: async () => {
      if (!collection?.id) return [];
      const tags = await apiRequest('GET', `/api/collections/${collection.id}/tags`);
      return tags;
    },
    enabled: !!collection?.id && open,
  });
  
  // Update selected tags when collection tags change, but only once
  useEffect(() => {
    if (open && collection && collectionTags.length > 0 && !initialized.current) {
      // Extract tag names
      const tagNames = collectionTags.map(tag => tag.name);
      setSelectedTags(tagNames);
      initialized.current = true;
    }
  }, [collectionTags, collection, open]);
  
  // Helper function to sync the collection's tags with selected tags
  const syncCollectionTags = async () => {
    if (!collection) return;
    
    try {
      // Get all available tags
      const allTags = await apiRequest('GET', '/api/tags');
      const tagMap = new Map(allTags.map((tag: Tag) => [tag.name.toLowerCase(), tag.id]));
      
      // Get existing tag names (lowercase for case-insensitive comparison)
      const existingTagNames = collectionTags.map(tag => tag.name.toLowerCase());
      
      // Add new tags that aren't already in the collection
      for (const tagName of selectedTags) {
        const normalizedTagName = tagName.toLowerCase().trim();
        
        // Skip if tag is already in the collection
        if (existingTagNames.includes(normalizedTagName)) continue;
        
        // Find tag ID or create new tag if needed
        let tagId = tagMap.get(normalizedTagName);
        
        if (!tagId) {
          // Create the tag if it doesn't exist
          const newTag = await apiRequest('POST', '/api/tags', { name: tagName });
          tagId = newTag.id;
        }
        
        // Add tag to collection
        await addTagToCollection.mutateAsync({ 
          collectionId: collection.id, 
          tagId,
          tagName
        });
      }
      
      // Remove tags that were unselected
      for (const tag of collectionTags) {
        const normalizedTagName = tag.name.toLowerCase().trim();
        
        // If this tag is no longer in selected tags, remove it
        if (!selectedTags.some(t => t.toLowerCase().trim() === normalizedTagName)) {
          await removeTagFromCollection.mutateAsync({ 
            collectionId: collection.id, 
            tagId: tag.id 
          });
        }
      }
      
      // Refresh collection tags
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
        auto_add_tagged: true
      });
      
      // Update tags
      await syncCollectionTags();
      
      // Process tagged bookmarks
      await processTaggedBookmarks.mutateAsync(collection.id);
      
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