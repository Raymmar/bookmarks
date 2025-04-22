import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Tag {
  id: string;
  name: string;
  type: "user" | "system";
  count: number;
}

/**
 * Hook to fetch tags associated with bookmarks in a specific collection
 */
export function useCollectionTags(collectionId: string | null) {
  return useQuery<Tag[]>({
    queryKey: ['/api/collections/tags', collectionId],
    queryFn: async () => {
      if (!collectionId) return [];
      
      try {
        // Get the bookmark IDs in this collection
        const bookmarks = await apiRequest('GET', `/api/collections/${collectionId}/bookmarks`);
        
        if (!bookmarks.length) return [];
        
        // Extract the bookmark IDs
        const bookmarkIds = bookmarks.map((bookmark: any) => bookmark.bookmark_id);
        
        // Get all the tags
        const allTags = await apiRequest('GET', '/api/tags');
        
        // Only keep tags that are used by bookmarks in this collection
        const collectionTags = allTags.filter((tag: Tag) => {
          // Check if this tag is used by any bookmark in the collection
          // We need to query each bookmark's tags
          return true; // For now, return all tags until we have a proper endpoint
        });
        
        return collectionTags;
      } catch (error) {
        console.error("Error fetching collection tags:", error);
        return [];
      }
    },
    enabled: !!collectionId,
  });
}