import { useEffect, useRef } from "react";

interface InfiniteScrollLoaderProps {
  onIntersect: () => void;
  isLoading: boolean;
  hasMore: boolean;
  loadingMessage?: string;
  margin?: string;
}

/**
 * A component that triggers a callback when it becomes visible in the viewport
 * Used for implementing infinite scroll
 */
export function InfiniteScrollLoader({
  onIntersect,
  isLoading,
  hasMore,
  loadingMessage = "Loading more items...",
  margin = "100px",
}: InfiniteScrollLoaderProps) {
  const loaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Skip if already loading, nothing more to load, or no loader ref
    if (!hasMore || !loaderRef.current) return;

    console.log("Creating IntersectionObserver for infinite scroll");

    // Create an observer instance
    const observer = new IntersectionObserver(
      (entries) => {
        // Check if our loader element is intersecting (visible)
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          console.log("Intersection detected, loading more bookmarks");
          onIntersect();
        }
      },
      {
        // Set a margin so we start loading before the element is fully visible
        rootMargin: margin,
        threshold: 0.1, // Trigger when at least 10% of the element is visible
      }
    );

    // Start observing our loader element
    observer.observe(loaderRef.current);

    // Cleanup function to disconnect observer when component unmounts
    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current);
      }
      observer.disconnect();
    };
  }, [onIntersect, isLoading, hasMore, margin]);

  return (
    <div
      ref={loaderRef}
      className="w-full flex justify-center items-center py-6 text-muted-foreground"
    >
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary"></div>
          <span>{loadingMessage}</span>
        </div>
      ) : hasMore ? (
        <span className="text-xs text-center">Scroll for more</span>
      ) : (
        <span className="text-xs text-center">No more items to load</span>
      )}
    </div>
  );
}