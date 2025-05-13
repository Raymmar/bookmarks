import { useState, useEffect, useCallback, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Activity } from '@shared/types';
import { useAuth } from './use-auth';

export function usePaginatedActivities(pageSize: number = 50) {
  const { user } = useAuth();
  const [totalItems, setTotalItems] = useState(0);
  const allActivitiesRef = useRef<Activity[]>([]);

  // Function to build query parameters
  const buildQueryParams = useCallback((pageParam: number) => {
    const offset = (pageParam - 1) * pageSize;
    const params = new URLSearchParams({
      limit: pageSize.toString(),
      offset: offset.toString()
    });
    
    return params;
  }, [pageSize]);

  // Use infinite query for activities
  const {
    data,
    fetchNextPage,
    hasNextPage: hasMore,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch
  } = useInfiniteQuery({
    queryKey: ['/api/activities/infinite', pageSize, user?.id],
    queryFn: async ({ pageParam = 1 }) => {
      const queryParams = buildQueryParams(pageParam);
      const response = await fetch(`/api/activities?${queryParams.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch activities: ${response.statusText}`);
      }
      
      // Get total count from headers if available
      const totalCount = response.headers.get('X-Total-Count');
      if (totalCount) {
        const count = parseInt(totalCount, 10);
        setTotalItems(count);
      }
      
      const activities = await response.json();
      return { 
        activities, 
        nextPage: activities.length === pageSize ? pageParam + 1 : undefined 
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
  
  // Combine all pages of activities into a single array
  const [activities, setLocalActivities] = useState<Activity[]>([]);
  
  // Update local state when data changes
  useEffect(() => {
    const newActivities = data?.pages.flatMap(page => page.activities) || [];
    setLocalActivities(newActivities);
    allActivitiesRef.current = newActivities;
  }, [data]);
  
  // Custom setter function that modifies our local state directly
  const setActivities = useCallback((updaterFn: (activities: Activity[]) => Activity[]) => {
    setLocalActivities(prevActivities => {
      const newActivities = updaterFn(prevActivities);
      allActivitiesRef.current = newActivities;
      return newActivities;
    });
  }, []);
  
  // Calculate if there are more pages
  const totalPages = Math.ceil(totalItems / pageSize);
  const hasNextPage = hasMore;
  
  // Function to load more activities
  const loadMoreActivities = useCallback(() => {
    if (hasMore && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  return {
    activities,
    setActivities,
    isLoading,
    isError,
    error,
    totalItems,
    totalPages,
    hasNextPage,
    loadMoreActivities,
    isFetchingNextPage,
    refetch
  };
}