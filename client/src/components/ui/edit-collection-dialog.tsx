import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useCollectionMutations } from "@/hooks/use-collection-queries";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface EditCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  collectionName: string;
  collectionDescription: string;
  collectionIsPublic: boolean;
  onCollectionUpdated?: () => void;
}

export function EditCollectionDialog({ 
  open, 
  onOpenChange,
  collectionId,
  collectionName,
  collectionDescription,
  collectionIsPublic,
  onCollectionUpdated 
}: EditCollectionDialogProps) {
  const [name, setName] = useState(collectionName);
  const [description, setDescription] = useState(collectionDescription);
  const [isPublic, setIsPublic] = useState(collectionIsPublic);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { toast } = useToast();
  const { updateCollection, deleteCollection } = useCollectionMutations();

  // Reset form when the dialog opens with potentially new values
  useState(() => {
    if (open) {
      setName(collectionName);
      setDescription(collectionDescription);
      setIsPublic(collectionIsPublic);
    }
  });

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
      await updateCollection.mutateAsync({
        id: collectionId,
        name,
        description,
        is_public: isPublic
      });
      
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

  const handleDelete = async () => {
    setIsSubmitting(true);
    
    try {
      await deleteCollection.mutateAsync(collectionId);
      
      toast({
        title: "Collection deleted",
        description: "Your collection has been deleted successfully",
      });
      
      if (onCollectionUpdated) {
        onCollectionUpdated();
      }
      
      onOpenChange(false);
      setConfirmDeleteOpen(false);
    } catch (error) {
      console.error('Error deleting collection:', error);
      toast({
        title: "Error deleting collection",
        description: "There was an error deleting your collection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
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
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button 
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={isSubmitting}
              size="sm"
            >
              Delete
            </Button>
            <div className="flex gap-2">
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this collection? This action cannot be undone.
              This will only remove the collection, not the bookmarks within it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}