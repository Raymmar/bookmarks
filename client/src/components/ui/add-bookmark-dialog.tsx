import { useState, useEffect } from "react";
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

  // Fetch the latest tags directly when dialog opens
  const fetchLatestTags = async () => {
    try {
      // Immediately refetch to ensure we have the latest tags
      await queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      await queryClient.refetchQueries({ queryKey: ["/api/tags"] });
    } catch (error) {
      console.error("Error fetching latest tags:", error);
    }
  };
  
  // Fetch tags when dialog opens
  useEffect(() => {
    if (open) {
      fetchLatestTags();
    }
  }, [open]);

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
      // Check if the URL already exists as a bookmark
      const urlCheckResult = await apiRequest("POST", "/api/url/normalize", { url });
      
      if (urlCheckResult.exists) {
        toast({
          title: "URL already exists",
          description: "This URL has already been bookmarked",
          variant: "default",
        });
        
        // Close dialog
        onOpenChange(false);
        setIsSubmitting(false);
        return;
      }
      
      // Create a temporary optimistic bookmark entry
      const tempTitle = url.split("/").pop() || url;
      const tempId = `temp-${Date.now()}`;
      const optimisticBookmark = {
        id: tempId,
        url,
        title: tempTitle,
        description: notes ? notes.substring(0, 100) : "",
        content_html: "",
        date_saved: new Date().toISOString(),
        system_tags: [],
        user_tags: selectedTags,
        thumbnail_url: null,
        source: "web",
        reading_time: 0
      };
      
      // Update the cache optimistically
      queryClient.setQueryData(["/api/bookmarks"], (oldData: any) => {
        // If we have existing data, add our new bookmark to it
        if (Array.isArray(oldData)) {
          return [optimisticBookmark, ...oldData];
        }
        // If we don't have data yet, create an array with just our new bookmark
        return [optimisticBookmark];
      });
      
      // Create the bookmark using the centralized bookmark service API
      // The bookmark service will handle tag creation, association, metadata extraction, etc.
      const bookmark = await apiRequest("POST", "/api/bookmarks", {
        url,
        title: tempTitle, 
        description: notes ? notes.substring(0, 100) : "", 
        notes,
        tags: selectedTags,
        autoExtract,
        insightDepth: autoExtract ? insightDepth : null,
        source: "web"
      });
      
      console.log("Created bookmark:", bookmark);
      
      // Refresh tags and bookmarks data
      await queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      
      toast({
        title: "Bookmark added",
        description: autoExtract 
          ? "Your bookmark was successfully added. AI processing will continue in the background." 
          : "Your bookmark was successfully added with all associated data",
      });
      
      // If auto-extract is enabled, show a separate toast with helpful information
      if (autoExtract) {
        setTimeout(() => {
          toast({
            title: "AI Processing in Progress",
            description: "We're analyzing this page in the background. Check back in a few minutes to see AI-generated tags and insights.",
            duration: 8000 // Show this message a bit longer
          });
        }, 1000);
      }

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
