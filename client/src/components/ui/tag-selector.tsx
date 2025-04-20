import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
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
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  
  // Fetch all tags from the server
  const { data: tags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: getQueryFn({ on401: "returnNull" })
  });
  
  // Update filtered tags when search text, tags, or selectedTags change
  useEffect(() => {
    // Avoid processing if tags aren't loaded yet
    if (!tags || tags.length === 0) {
      setFilteredTags([]);
      return;
    }
    
    if (newTagText.trim() === "") {
      // Show top 10 most used tags that aren't already selected
      setFilteredTags(
        tags
          .filter(tag => !selectedTags.includes(tag.name))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      );
    } else {
      // Filter tags by name
      setFilteredTags(
        tags
          .filter(tag => 
            tag.name.toLowerCase().includes(newTagText.toLowerCase()) && 
            !selectedTags.includes(tag.name)
          )
          .slice(0, 10)
      );
    }
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
      // Create new tag
      try {
        const newTag = await apiRequest("POST", "/api/tags", {
          name: newTagText.trim(),
          type: "user"
        });
        
        onTagsChange([...selectedTags, newTag.name]);
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
      
      {/* Tag input and suggestions */}
      <div className="flex gap-2">
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
          className="flex-1"
        />
        <Button 
          type="button" 
          variant="outline" 
          size="icon" 
          onClick={handleNewTagSubmit}
          disabled={newTagText.trim() === ""}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Tag suggestions */}
      {newTagText.trim() !== "" || filteredTags.length > 0 ? (
        <div className="mt-2">
          <div className="text-xs text-gray-500 mb-1">
            {newTagText.trim() !== "" ? "Add new or select existing tag:" : "Suggested tags:"}
          </div>
          <div className="flex flex-wrap gap-1">
            {newTagText.trim() !== "" && !tags.some(t => t.name.toLowerCase() === newTagText.toLowerCase()) && (
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
      ) : null}
    </div>
  );
}