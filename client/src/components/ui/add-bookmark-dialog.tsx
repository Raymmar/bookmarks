import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TagSelector } from "@/components/ui/tag-selector";

interface AddBookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookmarkAdded?: () => void;
}

export function AddBookmarkDialog({ open, onOpenChange, onBookmarkAdded }: AddBookmarkDialogProps) {
  const [url, setUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [collection, setCollection] = useState("none");
  const [autoExtract, setAutoExtract] = useState(true);
  const [insightDepth, setInsightDepth] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

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
      // Get all existing tags first
      const existingTags = await apiRequest("GET", "/api/tags");
      console.log("Existing tags:", existingTags);
      
      // Process each selected tag - create new ones if needed and get their IDs
      const tagIdsPromises = selectedTags.map(async (tagName) => {
        // Check if tag already exists (case-insensitive comparison)
        const existingTag = existingTags.find(tag => 
          tag.name.toLowerCase() === tagName.toLowerCase()
        );
        
        if (existingTag) {
          console.log(`Using existing tag: ${existingTag.name} (${existingTag.id})`);
          return existingTag.id;
        } else {
          try {
            // Create a new tag
            console.log(`Creating new tag: ${tagName}`);
            const newTag = await apiRequest("POST", "/api/tags", {
              name: tagName,
              type: "user"
            });
            console.log(`Created new tag:`, newTag);
            return newTag.id;
          } catch (error) {
            console.error(`Failed to create tag: ${tagName}`, error);
            return null;
          }
        }
      });
      
      // Wait for all tag processing to complete and filter out any failures
      const tagIds = (await Promise.all(tagIdsPromises)).filter(Boolean);
      console.log("Tag IDs to associate with bookmark:", tagIds);
      
      // Create the bookmark
      const bookmark = await apiRequest("POST", "/api/bookmarks", {
        url,
        title: url.split("/").pop() || url, // Generate a simple title from URL for now
        description: notes ? notes.substring(0, 100) : "", // Use part of notes as description
        user_tags: [], // Tags are now managed through the tag relation tables
        system_tags: [],
        source: "web"
      });
      console.log("Created bookmark:", bookmark);
      
      // Add tag relations
      const tagAssociationPromises = tagIds.map(tagId => {
        console.log(`Associating tag ${tagId} with bookmark ${bookmark.id}`);
        return apiRequest("POST", `/api/bookmarks/${bookmark.id}/tags/${tagId}`, {});
      });
      
      await Promise.all(tagAssociationPromises);
      console.log("Tag associations complete");
      
      // Update tag counts
      await queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      
      toast({
        title: "Bookmark added",
        description: "Your bookmark was successfully added",
      });

      // Reset form
      setUrl("");
      setSelectedTags([]);
      setNotes("");
      setCollection("none");
      setAutoExtract(true);
      setInsightDepth("1");
      
      // Close dialog
      onOpenChange(false);
      
      // Notify parent
      if (onBookmarkAdded) {
        onBookmarkAdded();
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

  return (
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
            <Select value={collection} onValueChange={setCollection}>
              <SelectTrigger id="collection" className="mt-1">
                <SelectValue placeholder="Select a collection" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">Select a collection</SelectItem>
                  <SelectItem value="Research Project">Research Project</SelectItem>
                  <SelectItem value="Web Development">Web Development</SelectItem>
                  <SelectItem value="Machine Learning">Machine Learning</SelectItem>
                  <SelectItem value="new">+ Create New Collection</SelectItem>
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
  );
}
