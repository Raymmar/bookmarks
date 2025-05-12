/**
 * Performance monitoring utilities for measuring load times
 */

interface PerformanceLog {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
}

// Store performance logs in memory
const performanceLogs: PerformanceLog[] = [];

/**
 * Start measuring performance for a specific operation
 * @param operation Name of the operation being measured
 * @returns A function to call when the operation completes
 */
export function startMeasure(operation: string): () => void {
  const startTime = performance.now();
  
  // Return a function to call when the operation completes
  return () => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Store the log
    performanceLogs.push({
      operation,
      startTime,
      endTime,
      duration
    });
    
    // Log to console for immediate feedback
    console.log(`⏱️ Performance: ${operation} took ${duration.toFixed(2)}ms`);
    
    return duration;
  } as () => number;
}

/**
 * Get all recorded performance logs
 * @returns Array of performance logs
 */
export function getPerformanceLogs(): PerformanceLog[] {
  return [...performanceLogs];
}

/**
 * Clear all performance logs
 */
export function clearPerformanceLogs(): void {
  performanceLogs.length = 0;
}

/**
 * Run performance test for bookmark details loading
 * @param bookmarkId The ID of the bookmark to test
 * @returns Promise resolving to the detailed timing information
 */
export async function testBookmarkDetailsPerformance(bookmarkId: string): Promise<{
  standardApiTime: number;
  consolidatedApiTime: number;
  speedupFactor: number;
}> {
  // Test 1: Standard approach with multiple API calls
  const standardTest = startMeasure('Standard API approach with multiple calls');
  
  // Simulate the current approach with multiple fetch requests
  const [bookmarkResponse, tagsResponse, notesResponse, collectionsResponse] = await Promise.all([
    fetch(`/api/bookmarks/${bookmarkId}`),
    fetch(`/api/bookmarks/${bookmarkId}/tags`),
    fetch(`/api/bookmarks/${bookmarkId}/notes`),
    fetch(`/api/bookmarks/${bookmarkId}/collections`)
  ]);
  
  // Parse all responses
  await Promise.all([
    bookmarkResponse.json(),
    tagsResponse.json(),
    notesResponse.json(),
    collectionsResponse.json()
  ]);
  
  const standardTime = standardTest();
  
  // Test 2: Consolidated API approach
  const consolidatedTest = startMeasure('Consolidated API approach');
  
  // Use the new consolidated endpoint
  const detailsResponse = await fetch(`/api/bookmarks/${bookmarkId}/details`);
  await detailsResponse.json();
  
  const consolidatedTime = consolidatedTest();
  
  // Calculate improvement
  const speedupFactor = standardTime / consolidatedTime;
  
  console.log(`
  ⚡ Bookmark Details Performance Test Results:
  ------------------------------------------------
  Standard API approach: ${standardTime.toFixed(2)}ms
  Consolidated API approach: ${consolidatedTime.toFixed(2)}ms
  ------------------------------------------------
  Speed improvement: ${speedupFactor.toFixed(2)}x faster
  `);
  
  return {
    standardApiTime: standardTime,
    consolidatedApiTime: consolidatedTime,
    speedupFactor
  };
}