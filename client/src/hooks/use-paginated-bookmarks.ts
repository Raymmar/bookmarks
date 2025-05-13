import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from '@shared/types';
import { useAuth } from './use-auth';

type SortOption = 'newest' | 'oldest' | 'recently_updated' | 'created_newest';

export function usePaginatedBookmarks(
  pageSize: number = 50, 
  sortOrder: SortOption = 'newest', 
  searchQuery: string = '',
  collectionId: string | null = null
) {
  const { user } = useAuth();
  const [totalItems, setTotalItems] = useState(0);
  const allBookmarksRef = useRef<Bookmark[]>([]);

  // Function to build query parameters
  const buildQueryParams = useCallback((pageParam: number) => {
    const offset = (pageParam - 1) * pageSize;
    const params = new URLSearchParams({
      limit: pageSize.toString(),
      offset: offset.toString(),
      sort: sortOrder
    });
    
    if (user?.id) {
      params.append('user_id', user.id);
    }
    
    if (searchQuery) {
      params.append('search', searchQuery);
    }
    
    // Add collection ID if provided
    if (collectionId) {
      params.append('collection_id', collectionId);
    }
    
    return params;
  }, [pageSize, sortOrder, user?.id, searchQuery, collectionId]);

  // Use infinite query instead of regular query
  const {
    data,
    fetchNextPage,
    hasNextPage: hasMore,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
    status
  } = useInfiniteQuery({
    queryKey: ['/api/bookmarks/infinite', pageSize, sortOrder, user?.id, searchQuery, collectionId],
    queryFn: async ({ pageParam = 1 }) => {
      const queryParams = buildQueryParams(pageParam);
      const response = await fetch(`/api/bookmarks?${queryParams.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch bookmarks: ${response.statusText}`);
      }
      
      // Get total count from headers if available
      const totalCount = response.headers.get('X-Total-Count');
      if (totalCount) {
        const count = parseInt(totalCount, 10);
        setTotalItems(count);
      }
      
      const bookmarks = await response.json();
      return { bookmarks, nextPage: bookmarks.length === pageSize ? pageParam + 1 : undefined };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
  
  // Combine all pages of bookmarks into a single array
  const [bookmarks, setLocalBookmarks] = useState<Bookmark[]>([]);
  
  // Update local state when data changes
  useEffect(() => {
    const newBookmarks = data?.pages.flatMap(page => page.bookmarks) || [];
    setLocalBookmarks(newBookmarks);
    allBookmarksRef.current = newBookmarks;
  }, [data]);
  
  // Custom setter function that modifies our local state directly
  const setBookmarks = useCallback((updaterFn: (bookmarks: Bookmark[]) => Bookmark[]) => {
    setLocalBookmarks(prevBookmarks => {
      const newBookmarks = updaterFn(prevBookmarks);
      allBookmarksRef.current = newBookmarks;
      return newBookmarks;
    });
  }, []);
  
  // Calculate if there are more pages
  const totalPages = Math.ceil(totalItems / pageSize);
  const hasNextPage = hasMore;
  
  // Reset the query when sort order, search, or collection ID changes
  useEffect(() => {
    refetch();
  }, [sortOrder, user?.id, searchQuery, collectionId, refetch]);

  // Function to load more bookmarks
  const loadMoreBookmarks = useCallback(() => {
    if (hasMore && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  return {
    bookmarks,
    setBookmarks,
    isLoading,
    isError,
    error,
    totalItems,
    totalPages,
    hasNextPage,
    loadMoreBookmarks,
    isFetchingNextPage,
    refetch
  };
}