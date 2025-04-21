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
import { v4 as uuidv4 } from "uuid";

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
      // Generate a temporary ID for optimistic update
      const tempId = uuidv4();
      const tempDate = new Date().toISOString();
      const title = url.split("/").pop() || url; // Generate a simple title from URL for now
      const description = notes ? notes.substring(0, 100) : ""; // Use part of notes as description
      
      // Create optimistic bookmark object for the cache
      const optimisticBookmark = {
        id: tempId,
        url,
        title,
        description,
        date_saved: tempDate,
        user_tags: [],
        system_tags: [],
        source: "web",
        // Add empty arrays for relationships
        notes: [],
        highlights: [],
        screenshots: [],
        // Add empty insight object
        insights: {
          id: uuidv4(),
          bookmark_id: tempId,
          summary: "",
          depth_level: parseInt(insightDepth),
          related_links: []
        },
        // Add optimistic tags
        tags: selectedTags.map(tagName => ({
          id: `temp-tag-${tagName}`,
          name: tagName,
          type: "user",
          count: 1,
          created_at: tempDate
        }))
      };

      // Optimistically update the query cache
      queryClient.setQueryData(["/api/bookmarks"], (oldData: any) => {
        return [...(oldData || []), {
          id: tempId,
          url,
          title,
          description,
          date_saved: tempDate,
          user_tags: [],
          system_tags: [],
          source: "web"
        }];
      });

      // Update the bookmarks-with-tags cache optimistically
      queryClient.setQueryData(["/api/bookmarks-with-tags"], (oldData: any) => {
        return [...(oldData || []), optimisticBookmark];
      });
      
      // First, create any new tags that don't already exist
      const tagPromises = selectedTags.map(async (tagName) => {
        try {
          // Try to find existing tag first
          const tagsResp = await apiRequest("GET", "/api/tags");
          const existingTag = tagsResp.find((tag) => 
            tag.name.toLowerCase() === tagName.toLowerCase()
          );
          
          if (existingTag) {
            return existingTag.id;
          } else {
            // Create new tag
            const newTag = await apiRequest("POST", "/api/tags", {
              name: tagName,
              type: "user"
            });
            return newTag.id;
          }
        } catch (error) {
          console.error("Error processing tag:", tagName, error);
          return null;
        }
      });
      
      const tagIds = (await Promise.all(tagPromises)).filter(Boolean);
      
      // Create the bookmark
      const bookmark = await apiRequest("POST", "/api/bookmarks", {
        url,
        title, 
        description,
        user_tags: [], // Tags are now managed through the tag relation tables
        system_tags: [],
        source: "web"
      });
      
      // Add tag relations
      await Promise.all(tagIds.map(tagId => 
        apiRequest("POST", `/api/bookmarks/${bookmark.id}/tags/${tagId}`, {})
      ));
      
      // Update all related queries
      await queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      
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
      // If there's an error, invalidate the queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
      
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
