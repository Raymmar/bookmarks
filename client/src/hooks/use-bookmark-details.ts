import { useQuery } from '@tanstack/react-query';
import { Bookmark, Note, Tag } from '@shared/types';

// Type for bookmark details response
export interface BookmarkDetailsResponse {
  bookmark: Bookmark;
  notes: Note[];
  tags: Tag[];
  collections: any[]; // Using any for now, can be typed more specifically later
  processingStatus: string;
}

/**
 * Custom hook for loading bookmark details efficiently
 * 
 * Uses the consolidated endpoint to fetch all bookmark data in a single request
 * Includes proper caching and error handling
 */
export function useBookmarkDetails(bookmarkId: string | null) {
  const { data, isLoading, isError, error, refetch } = useQuery<BookmarkDetailsResponse>({
    queryKey: [`/api/bookmarks/${bookmarkId}/details`],
    enabled: !!bookmarkId, // Only run the query if we have a bookmarkId
    staleTime: 30000, // 30 seconds stale time
    refetchOnWindowFocus: false, // Don't refetch on window focus as it's distracting
  });

  return {
    bookmarkDetails: data,
    isLoading,
    isError,
    error,
    refetch,
    // Convenience getters for the most commonly used data
    bookmark: data?.bookmark,
    notes: data?.notes || [],
    tags: data?.tags || [],
    collections: data?.collections || [],
    processingStatus: data?.processingStatus || 'pending'
  };
}