import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Bookmark } from '@shared/types';

interface PaginatedBookmarksResult {
  bookmarks: Bookmark[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
}

/**
 * Hook for fetching paginated bookmarks
 * 
 * @param pageSize Number of bookmarks per page
 * @param sortOrder Sort order for bookmarks
 * @returns An object with bookmarks and pagination controls
 */
export function usePaginatedBookmarks(
  pageSize: number = 50,
  sortOrder: 'newest' | 'oldest' | 'recently_updated' = 'newest'
): PaginatedBookmarksResult {
  // Use React Query's state management to keep track of the current page
  const [page, setPage] = React.useState(1);
  
  // Calculate the offset based on page number and page size
  const offset = (page - 1) * pageSize;
  
  // Create a query key that includes pagination parameters
  const queryKey = ['/api/bookmarks', { limit: pageSize, offset, sortOrder }];
  
  // Fetch the bookmarks using React Query
  const { data = [], isLoading, error } = useQuery<Bookmark[]>({
    queryKey,
    queryFn: async () => {
      // Construct query parameters for pagination and sorting
      const params = new URLSearchParams();
      params.append('limit', pageSize.toString());
      params.append('offset', offset.toString());
      params.append('sort', sortOrder);
      
      // Fetch the bookmarks using our apiRequest utility
      const bookmarks = await apiRequest<Bookmark[]>('GET', `/api/bookmarks?${params.toString()}`);
      return bookmarks;
    },
  });
  
  // Estimate the total number of pages based on whether we have a full page
  // This is a simple approach as we don't have a count endpoint
  const hasFullPage = data.length === pageSize;
  const totalPages = hasFullPage ? Math.max(page, page + 1) : page;
  
  // Helper functions for pagination
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;
  
  const goToNextPage = React.useCallback(() => {
    if (hasNextPage) {
      setPage(page + 1);
    }
  }, [page, hasNextPage]);
  
  const goToPreviousPage = React.useCallback(() => {
    if (hasPreviousPage) {
      setPage(page - 1);
    }
  }, [page, hasPreviousPage]);
  
  return {
    bookmarks: data,
    isLoading,
    error: error as Error | null,
    page,
    totalPages,
    setPage,
    hasNextPage,
    hasPreviousPage,
    goToNextPage,
    goToPreviousPage,
  };
}