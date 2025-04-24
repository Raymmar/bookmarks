import { useState, useEffect, useCallback } from 'react';
import { Bookmark } from '@shared/types';

interface UsePaginatedBookmarksProps {
  initialOffset?: number;
  batchSize?: number;
  initialSort?: {
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  };
  enabled?: boolean;
}

interface UsePaginatedBookmarksResult {
  bookmarks: Bookmark[];
  isLoading: boolean;
  isError: boolean;
  totalBookmarks: number;
  loadedBookmarks: number;
  progress: number;
  hasNextPage: boolean;
  loadNextBatch: () => Promise<void>;
  reset: () => void;
}

export function usePaginatedBookmarks({
  initialOffset = 0,
  batchSize = 20,
  initialSort = { sortBy: 'date_saved', sortOrder: 'desc' },
  enabled = true
}: UsePaginatedBookmarksProps = {}): UsePaginatedBookmarksResult {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sortParams, setSortParams] = useState(initialSort);

  const loadNextBatch = useCallback(async () => {
    if (isLoading || !enabled) return;
    
    setIsLoading(true);
    setIsError(false);
    
    try {
      const { sortBy, sortOrder } = sortParams;
      const response = await fetch(
        `/api/bookmarks/paginated?limit=${batchSize}&offset=${offset}&sortBy=${sortBy}&sortOrder=${sortOrder}`
      );
      
      if (!response.ok) {
        throw new Error(`Error fetching bookmarks: ${response.statusText}`);
      }
      
      const data = await response.json();
      const { bookmarks: newBookmarks, total } = data;
      
      setBookmarks(prev => [...prev, ...newBookmarks]);
      setTotalBookmarks(total);
      setOffset(prev => prev + newBookmarks.length);
      
      // Calculate progress percentage
      const loadedCount = offset + newBookmarks.length;
      const progressPercent = Math.min(100, Math.round((loadedCount / total) * 100));
      setProgress(progressPercent);
    } catch (error) {
      console.error('Error loading bookmarks:', error);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [batchSize, enabled, isLoading, offset, sortParams]);

  const reset = useCallback(() => {
    setBookmarks([]);
    setOffset(initialOffset);
    setProgress(0);
    setIsError(false);
  }, [initialOffset]);

  // Load first batch on mount if enabled
  useEffect(() => {
    if (enabled && bookmarks.length === 0 && !isLoading) {
      loadNextBatch();
    }
  }, [bookmarks.length, enabled, isLoading, loadNextBatch]);

  return {
    bookmarks,
    isLoading,
    isError,
    totalBookmarks,
    loadedBookmarks: bookmarks.length,
    progress,
    hasNextPage: bookmarks.length < totalBookmarks,
    loadNextBatch,
    reset
  };
}