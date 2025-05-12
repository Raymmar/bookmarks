import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { Bookmark } from '@shared/types';

// Define the fields to search on and their weights
const defaultOptions = {
  includeScore: true,
  // Keys to search with weighted importance
  keys: [
    { name: 'title', weight: 2 },
    { name: 'description', weight: 1.5 },
    { name: 'content_html', weight: 1 },
    { name: 'url', weight: 1 },
    // Check notes content
    { name: 'notes.text', weight: 1.5 },
    // Check insights
    { name: 'insights.summary', weight: 1.5 },
    // Include author information for tweets/posts
    { name: 'author_name', weight: 1 },
    { name: 'author_username', weight: 0.8 },
  ],
  // A lower threshold results in more matches
  threshold: 0.4,
  // Allow matching any word in the query, not just the whole phrase
  useExtendedSearch: true,
  // Support searching across word boundaries
  ignoreLocation: true,
  // Fuzzy matching
  fuzzySearch: true,
  // Allow fuzzy matches up to 2 characters off
  distance: 2
};

export function useFuzzySearch<T extends Bookmark>(
  items: T[],
  searchQuery: string,
  options: Fuse.IFuseOptions<T> = defaultOptions
) {
  // Create a memoized Fuse instance
  const fuse = useMemo(() => new Fuse(items, options), [items, options]);
  
  // Track the filtered results
  const [results, setResults] = useState<T[]>(items);

  // Update results when search query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      // If search is empty, return all items
      setResults(items);
      return;
    }

    // Perform the fuzzy search
    const searchResults = fuse.search(searchQuery);
    
    // Return the items (not the Fuse result objects)
    const filteredItems = searchResults.map(result => result.item);
    setResults(filteredItems);
  }, [fuse, items, searchQuery]);

  return results;
}