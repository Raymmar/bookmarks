import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash/debounce';

const PREFETCH_DELAY = 300; // ms to wait before prefetching on hover

/**
 * Hook that provides prefetching capabilities for bookmark details
 * It uses React Query's built-in caching and prefetching features
 * to load bookmark details ahead of time when a user hovers over a bookmark card
 */
export function useBookmarkPrefetch() {
  const queryClient = useQueryClient();
  const activePrefetchRef = useRef<string | null>(null);
  
  // Create a debounced prefetch function to avoid excessive API calls
  const prefetchBookmarkDetails = useCallback(
    debounce((bookmarkId: string) => {
      // Skip if it's the currently active prefetch
      if (activePrefetchRef.current === bookmarkId) return;
      
      console.log(`Prefetching details for bookmark ${bookmarkId}`);
      activePrefetchRef.current = bookmarkId;
      
      // Use the consolidated endpoint to fetch all bookmark details at once
      queryClient.prefetchQuery({
        queryKey: ['/api/bookmarks/details', bookmarkId],
        queryFn: async () => {
          const response = await fetch(`/api/bookmarks/${bookmarkId}/details`);
          if (!response.ok) {
            throw new Error('Failed to prefetch bookmark details');
          }
          return response.json();
        },
        staleTime: 60 * 1000, // Cache is fresh for 1 minute
      });
    }, PREFETCH_DELAY),
    [queryClient]
  );
  
  // Function to cancel prefetch if user moves away quickly
  const cancelPrefetch = useCallback(() => {
    prefetchBookmarkDetails.cancel();
    activePrefetchRef.current = null;
  }, [prefetchBookmarkDetails]);
  
  // Function to force immediate prefetch without debounce
  const forcePrefetch = useCallback((bookmarkId: string) => {
    // Cancel any pending prefetch
    prefetchBookmarkDetails.cancel();
    
    // Skip if it's the currently active prefetch
    if (activePrefetchRef.current === bookmarkId) return;
    
    console.log(`Force prefetching details for bookmark ${bookmarkId}`);
    activePrefetchRef.current = bookmarkId;
    
    // Immediately prefetch without debounce
    queryClient.prefetchQuery({
      queryKey: ['/api/bookmarks/details', bookmarkId],
      queryFn: async () => {
        const response = await fetch(`/api/bookmarks/${bookmarkId}/details`);
        if (!response.ok) {
          throw new Error('Failed to prefetch bookmark details');
        }
        return response.json();
      },
      staleTime: 60 * 1000, // Cache is fresh for 1 minute
    });
  }, [queryClient]);
  
  // Helper to check if a bookmark's details are already in the cache
  const isBookmarkDetailsCached = useCallback(
    (bookmarkId: string): boolean => {
      return queryClient.getQueryData(['/api/bookmarks/details', bookmarkId]) !== undefined;
    },
    [queryClient]
  );
  
  return {
    prefetchBookmarkDetails,
    cancelPrefetch,
    forcePrefetch,
    isBookmarkDetailsCached,
  };
}