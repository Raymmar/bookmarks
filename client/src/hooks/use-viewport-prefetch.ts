import { useEffect, useRef } from 'react';
import { Bookmark } from '@shared/types';
import { useBookmarkPrefetch } from './use-bookmark-prefetch';

/**
 * Hook to monitor visible bookmark elements and prefetch their details
 * This ensures that when a user is scrolling through bookmarks,
 * the ones they're likely to interact with already have their details loaded
 */
export function useViewportPrefetch(bookmarks: Bookmark[], containerRef: React.RefObject<HTMLElement>) {
  const { forcePrefetch } = useBookmarkPrefetch();
  const prefetchedIds = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!bookmarks.length || !containerRef.current) return;
    
    // Function to check which bookmarks are in the viewport
    const checkVisibleBookmarks = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      
      // Get all bookmark cards in the container
      const bookmarkElements = containerRef.current?.querySelectorAll('[data-bookmark-id]');
      if (!bookmarkElements || bookmarkElements.length === 0) return;
      
      // Number of bookmarks to prefetch (limit to avoid excessive API calls)
      const PREFETCH_LIMIT = 5;
      let prefetchCount = 0;
      
      // Iterate through visible bookmark elements
      bookmarkElements.forEach((el) => {
        if (prefetchCount >= PREFETCH_LIMIT) return;
        
        const rect = el.getBoundingClientRect();
        const bookmarkId = el.getAttribute('data-bookmark-id');
        
        // Check if element is in or near the viewport
        const isInViewport = 
          rect.top <= containerRect.bottom + 500 && // Add 500px buffer below viewport
          rect.bottom >= containerRect.top - 500;   // Add 500px buffer above viewport
        
        // Prefetch if in viewport and not already prefetched
        if (isInViewport && bookmarkId && !prefetchedIds.current.has(bookmarkId)) {
          forcePrefetch(bookmarkId);
          prefetchedIds.current.add(bookmarkId);
          prefetchCount++;
        }
      });
    };
    
    // Run on initial render
    setTimeout(checkVisibleBookmarks, 500);
    
    // Set up scroll listener
    const handleScroll = () => {
      requestAnimationFrame(checkVisibleBookmarks);
    };
    
    containerRef.current.addEventListener('scroll', handleScroll);
    
    // Clean up
    return () => {
      containerRef.current?.removeEventListener('scroll', handleScroll);
    };
  }, [bookmarks, containerRef, forcePrefetch]);
  
  // Reset prefetched IDs when bookmarks change
  useEffect(() => {
    prefetchedIds.current.clear();
  }, [bookmarks]);
  
  return null;
}