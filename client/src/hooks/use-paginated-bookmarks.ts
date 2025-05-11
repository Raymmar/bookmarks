import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark } from '@shared/types';
import { useAuth } from './use-auth';

type SortOption = 'newest' | 'oldest' | 'recently_updated' | 'created_newest';

export function usePaginatedBookmarks(pageSize: number = 50, sortOrder: SortOption = 'newest', searchQuery: string = '') {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Calculate offset for pagination
  const offset = (page - 1) * pageSize;

  // Build query parameters
  const queryParams = new URLSearchParams({
    limit: pageSize.toString(),
    offset: offset.toString(),
    sort: sortOrder
  });
  
  if (user?.id) {
    queryParams.append('user_id', user.id);
  }
  
  // Add search query if provided
  if (searchQuery) {
    queryParams.append('search', searchQuery);
  }

  // Fetch bookmarks with pagination
  const {
    data: bookmarks = [],
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<Bookmark[]>({
    queryKey: ['/api/bookmarks', page, pageSize, sortOrder, user?.id, searchQuery],
    queryFn: async () => {
      const response = await fetch(`/api/bookmarks?${queryParams.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch bookmarks: ${response.statusText}`);
      }
      
      // Get total count from headers if available
      const totalCount = response.headers.get('X-Total-Count');
      if (totalCount) {
        const count = parseInt(totalCount, 10);
        setTotalItems(count);
        setTotalPages(Math.ceil(count / pageSize));
      }
      
      return response.json();
    },
  });

  // Reset to page 1 when sort order changes
  useEffect(() => {
    setPage(1);
  }, [sortOrder, user?.id]);

  // Pagination controls
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;
  
  const goToNextPage = () => {
    if (hasNextPage) {
      setPage(page + 1);
    }
  };
  
  const goToPreviousPage = () => {
    if (hasPreviousPage) {
      setPage(page - 1);
    }
  };

  return {
    bookmarks,
    isLoading,
    isError,
    error,
    page,
    setPage,
    totalItems,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    goToNextPage,
    goToPreviousPage,
    refetch
  };
}