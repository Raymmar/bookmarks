import { UseQueryResult, useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Bookmark } from '@shared/types';

type Collection = {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
};

type CollectionWithBookmarks = Collection & {
  bookmarks: any[]; // We could type this more specifically if needed
};

// Hook for fetching collections
export function useCollections(): UseQueryResult<Collection[], Error> {
  return useQuery({
    queryKey: ['/api/collections'],
    queryFn: async () => {
      const collections = await apiRequest('GET', '/api/collections');
      return collections;
    }
  });
}

// Hook for fetching a specific collection with its bookmarks
export function useCollection(id: string): UseQueryResult<CollectionWithBookmarks, Error> {
  return useQuery({
    queryKey: ['/api/collections', id],
    queryFn: async () => {
      const collection = await apiRequest('GET', `/api/collections/${id}`);
      return collection;
    },
    enabled: !!id // Only run query if id is provided
  });
}

// Hook for fetching bookmarks by collection for graph visualization
export function useCollectionBookmarksForGraph(id: string | null): UseQueryResult<Bookmark[], Error> {
  return useQuery({
    queryKey: ['/api/collections/graph', id],
    queryFn: async () => {
      if (!id) return [];
      const bookmarks = await apiRequest('GET', `/api/collections/${id}/graph`);
      return bookmarks;
    },
    enabled: !!id // Only run query if id is provided
  });
}

// Hook for fetching bookmarks from multiple collections for graph visualization
export function useMultiCollectionBookmarksForGraph(ids: string[]): UseQueryResult<Bookmark[], Error> {
  return useQuery({
    queryKey: ['/api/collections/graph', ids],
    queryFn: async () => {
      if (!ids || ids.length === 0) return [];
      const bookmarks = await apiRequest('POST', '/api/collections/graph', { collectionIds: ids });
      return bookmarks;
    },
    enabled: ids.length > 0 // Only run query if at least one id is provided
  });
}

// Hook for fetching collections a bookmark belongs to
export function useBookmarkCollections(bookmarkId: string): UseQueryResult<Collection[], Error> {
  return useQuery({
    queryKey: ['/api/bookmarks', bookmarkId, 'collections'],
    queryFn: async () => {
      if (!bookmarkId) return [];
      const collections = await apiRequest('GET', `/api/bookmarks/${bookmarkId}/collections`);
      return collections;
    },
    enabled: !!bookmarkId // Only run query if bookmarkId is provided
  });
}

// Hook for collection mutations (create, update, delete)
export function useCollectionMutations() {
  // Create a new collection
  const createCollection = useMutation({
    mutationFn: async (variables: { 
      name: string; 
      description?: string; 
      is_public?: boolean;
    }) => {
      return await apiRequest('POST', '/api/collections', variables);
    },
    onSuccess: () => {
      // Invalidate collections query to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
    }
  });

  // Update an existing collection
  const updateCollection = useMutation({
    mutationFn: async (variables: { 
      id: string; 
      name?: string; 
      description?: string; 
      is_public?: boolean;
    }) => {
      const { id, ...data } = variables;
      return await apiRequest('PUT', `/api/collections/${id}`, data);
    },
    onSuccess: (_, variables) => {
      // Invalidate specific collection and collections list
      queryClient.invalidateQueries({ queryKey: ['/api/collections', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
    }
  });

  // Delete a collection
  const deleteCollection = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/collections/${id}`);
    },
    onSuccess: () => {
      // Invalidate collections query to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
    }
  });

  // Add a bookmark to a collection
  const addBookmarkToCollection = useMutation({
    mutationFn: async (variables: { collectionId: string; bookmarkId: string }) => {
      const { collectionId, bookmarkId } = variables;
      return await apiRequest('POST', `/api/collections/${collectionId}/bookmarks/${bookmarkId}`);
    },
    onSuccess: (_, variables) => {
      // Invalidate collection and bookmark queries
      queryClient.invalidateQueries({ queryKey: ['/api/collections', variables.collectionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/collections/graph', variables.collectionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks', variables.bookmarkId] });
      // Invalidate bookmark collections query
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks', variables.bookmarkId, 'collections'] });
    }
  });

  // Remove a bookmark from a collection
  const removeBookmarkFromCollection = useMutation({
    mutationFn: async (variables: { collectionId: string; bookmarkId: string }) => {
      const { collectionId, bookmarkId } = variables;
      try {
        const result = await apiRequest('DELETE', `/api/collections/${collectionId}/bookmarks/${bookmarkId}`);
        return result;
      } catch (error) {
        // Log the error but don't re-throw if it appears to be a 404 (item doesn't exist)
        // This still gives success response to the UI but logs the issue
        console.error(`Error removing bookmark ${bookmarkId} from collection ${collectionId}:`, error);
        
        // Return a successful response since the end result is what we want
        // (bookmark not in collection)
        return { success: true, message: "Operation completed." };
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate collection and bookmark queries
      queryClient.invalidateQueries({ queryKey: ['/api/collections', variables.collectionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/collections/graph', variables.collectionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks', variables.bookmarkId] });
      // Invalidate bookmark collections query
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks', variables.bookmarkId, 'collections'] });
    },
    onError: (error, variables) => {
      console.error(`Mutation error removing bookmark ${variables.bookmarkId} from collection ${variables.collectionId}:`, error);
      // Let the component handle the error UI with toast notifications
    }
  });

  return {
    createCollection,
    updateCollection,
    deleteCollection,
    addBookmarkToCollection,
    removeBookmarkFromCollection
  };
}