import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus } from "lucide-react";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

interface Tag {
  id: string;
  name: string;
  type: "user" | "system";
  count: number;
}

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  className?: string;
}

export function TagSelector({ selectedTags, onTagsChange, className }: TagSelectorProps) {
  const [newTagText, setNewTagText] = useState("");
  
  // Fetch all tags from the server - uses global defaults set in queryClient.ts
  // which includes good caching behavior for tags
  const { 
    data: allTagsData = [],
    refetch: refetchTags
  } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: getQueryFn({ on401: "returnNull" })
  });
  
  // Filter out any items that don't match the expected Tag structure
  // This ensures we only show proper tags and not collections or other items
  const tags = allTagsData.filter(tag => 
    tag && 
    typeof tag === 'object' && 
    'id' in tag && 
    'name' in tag && 
    'type' in tag && 
    (tag.type === 'user' || tag.type === 'system') &&
    'count' in tag
  );
  
  // Use useMemo instead of useEffect to prevent infinite loop
  const filteredTags = useMemo(() => {
    if (!tags || tags.length === 0 || newTagText.trim() === "") return [];
    
    // Only show tags that match the input text
    return tags
      .filter(tag => 
        tag.name.toLowerCase().includes(newTagText.toLowerCase()) && 
        !selectedTags.includes(tag.name)
      )
      .slice(0, 10);
  }, [newTagText, tags, selectedTags]);
  
  const handleNewTagSubmit = async () => {
    if (newTagText.trim() === "") return;
    
    // Check if tag already exists in the selected tags
    if (selectedTags.includes(newTagText.trim())) {
      setNewTagText("");
      return;
    }
    
    // Check if tag exists in the database
    const existingTag = tags.find(tag => tag.name.toLowerCase() === newTagText.trim().toLowerCase());
    
    if (existingTag) {
      // Use existing tag
      onTagsChange([...selectedTags, existingTag.name]);
    } else {
      // Create new tag using apiRequest
      try {
        console.log("Creating tag with text:", newTagText.trim());
        
        const tagName = newTagText.trim();
        
        // Use apiRequest for consistent error handling and response parsing
        const newTag = await apiRequest("POST", "/api/tags", {
          name: tagName,
          type: "user"
        });
        
        console.log("Created new tag:", newTag);
        
        // Invalidate tags cache and explicitly refetch
        queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
        
        // Explicitly refetch tags to ensure UI updates immediately
        await refetchTags();
        
        // Add new tag to selected tags
        onTagsChange([...selectedTags, tagName]);
      } catch (error) {
        console.error("Failed to create tag:", error);
      }
    }
    
    setNewTagText("");
  };
  
  const removeTag = (tagToRemove: string) => {
    onTagsChange(selectedTags.filter(tag => tag !== tagToRemove));
  };
  
  const addExistingTag = (tag: Tag) => {
    onTagsChange([...selectedTags, tag.name]);
    setNewTagText("");
  };
  
  return (
    <div className={className}>
      <Label htmlFor="tags">Tags <span className="text-gray-400 text-xs">(Optional)</span></Label>
      
      {/* Selected tags */}
      <div className="flex flex-wrap gap-2 mb-2 mt-1">
        {selectedTags.map(tag => (
          <Badge key={tag} className="bg-primary/20 text-primary hover:bg-primary/30 gap-1 py-1">
            {tag}
            <X 
              className="h-3 w-3 cursor-pointer" 
              onClick={() => removeTag(tag)}
            />
          </Badge>
        ))}
      </div>
      
      {/* Tag input */}
      <div className="flex">
        <Input
          id="tags"
          placeholder="Type to add or find tags"
          value={newTagText}
          onChange={e => setNewTagText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleNewTagSubmit();
            }
          }}
          className="w-full"
        />
      </div>
      
      {/* Tag suggestions - only shown when user is typing */}
      {newTagText.trim() !== "" && (
        <div className="mt-2">
          <div className="text-xs text-gray-500 mb-1">
            Add new or select existing tag:
          </div>
          <div className="flex flex-wrap gap-1">
            {/* Show option to create new tag if it doesn't already exist */}
            {!tags.some(t => t.name.toLowerCase() === newTagText.trim().toLowerCase()) && (
              <Badge 
                key="new-tag" 
                variant="outline" 
                className="cursor-pointer hover:bg-primary/10 gap-1"
                onClick={handleNewTagSubmit}
              >
                <Plus className="h-3 w-3" /> 
                {newTagText}
              </Badge>
            )}
            
            {/* Show matching existing tags */}
            {filteredTags.map(tag => (
              <Badge 
                key={tag.id} 
                variant="outline" 
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => addExistingTag(tag)}
              >
                {tag.name} ({tag.count})
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}