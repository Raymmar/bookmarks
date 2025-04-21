import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bookmark } from "@shared/types";

// Tag interface that matches the API response format
interface Tag {
  id: string;
  name: string;
  type: "user" | "system";
  count: number;
  created_at: string;
}

export interface BookmarkCreationData {
  url: string;
  title?: string;
  description?: string;
  notes?: string;
  tags?: string[];
  autoExtract?: boolean;
  insightDepth?: string | number | null;
  source?: string;
}

export function useBookmarkMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create a new bookmark with optimistic updates
  const createBookmark = useMutation({
    mutationFn: async (bookmarkData: BookmarkCreationData) => {
      return apiRequest<Bookmark>("POST", "/api/bookmarks", bookmarkData);
    },
    onMutate: async (newBookmarkData) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/bookmarks"] });
      await queryClient.cancelQueries({ queryKey: ["/api/bookmarks-with-tags"] });

      // Create a temporary optimistic bookmark
      const tempId = `temp-${Date.now()}`;
      const optimisticBookmark: Bookmark = {
        id: tempId,
        url: newBookmarkData.url,
        title: newBookmarkData.title || newBookmarkData.url.split("/").pop() || newBookmarkData.url,
        description: newBookmarkData.description || "",
        content_html: "",
        date_saved: new Date().toISOString(),
        system_tags: [],
        user_tags: newBookmarkData.tags || [],
        source: newBookmarkData.source || "web"
      };

      // Get previous bookmarks
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(["/api/bookmarks"]) || [];

      // Optimistically update the bookmarks query
      queryClient.setQueryData<Bookmark[]>(["/api/bookmarks"], (old = []) => {
        return [optimisticBookmark, ...old];
      });

      // If we have bookmark-with-tags data, update that too
      const previousBookmarksWithTags = queryClient.getQueryData<any[]>(["/api/bookmarks-with-tags"]) || [];
      
      if (previousBookmarksWithTags.length > 0) {
        queryClient.setQueryData(["/api/bookmarks-with-tags"], (old: any[] = []) => {
          const optimisticBookmarkWithTags = {
            ...optimisticBookmark,
            tags: (newBookmarkData.tags || []).map(tagName => ({
              id: `temp-tag-${Date.now()}-${tagName}`,
              name: tagName,
              type: "user",
              count: 1,
              created_at: new Date().toISOString()
            }))
          };
          return [optimisticBookmarkWithTags, ...old];
        });
      }

      // Show toast notification
      toast({
        title: "Adding bookmark...",
        description: "Your bookmark is being added",
      });

      // Return previous values for potential rollback
      return { previousBookmarks, previousBookmarksWithTags, tempId };
    },
    onError: (err, newBookmark, context: any) => {
      // Roll back to previous values on error
      if (context?.previousBookmarks) {
        queryClient.setQueryData(["/api/bookmarks"], context.previousBookmarks);
      }
      
      if (context?.previousBookmarksWithTags) {
        queryClient.setQueryData(["/api/bookmarks-with-tags"], context.previousBookmarksWithTags);
      }

      toast({
        title: "Error adding bookmark",
        description: err instanceof Error ? err.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });

      // Show success toast
      toast({
        title: "Bookmark added",
        description: variables.autoExtract 
          ? "Your bookmark was successfully added. AI processing will continue in the background." 
          : "Your bookmark was successfully added with all associated data",
      });
      
      // If auto-extract is enabled, show a separate toast with helpful information
      if (variables.autoExtract) {
        setTimeout(() => {
          toast({
            title: "AI Processing in Progress",
            description: "We're analyzing this page in the background. Check back in a few minutes to see AI-generated tags and insights.",
            duration: 8000 // Show this message a bit longer
          });
        }, 1000);
      }
    }
  });

  return {
    createBookmark
  };
}