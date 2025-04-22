import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCollectionCreated?: (collectionId: string) => void;
}

export function CreateCollectionDialog({ 
  open, 
  onOpenChange,
  onCollectionCreated 
}: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
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
      // Import the API request function directly
      const { apiRequest } = await import('@/lib/queryClient');
      
      // Create the collection
      const collection = await apiRequest("POST", "/api/collections", {
        name,
        description: description || "",
        is_public: isPublic
      });
      
      // Reset form
      setName("");
      setDescription("");
      setIsPublic(false);
      
      // Close dialog
      onOpenChange(false);
      
      // Show success message
      toast({
        title: "Collection created",
        description: `'${collection.name}' has been successfully created`,
      });
      
      // Invalidate collections query to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      
      // Notify parent component of the newly created collection
      if (onCollectionCreated) {
        onCollectionCreated(collection.id);
      }
    } catch (error) {
      toast({
        title: "Error creating collection",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Collection</DialogTitle>
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
            {isSubmitting ? "Creating..." : "Create Collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}