import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  // Status codes in the 200 range are considered successful
  if (res.ok) {
    return; // Response is good, nothing to do
  }
  
  // For unsuccessful responses, try to get the error message
  try {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  } catch (error) {
    // If we couldn't parse the response, create a generic error
    if (error instanceof Error && error.message.includes('JSON')) {
      throw new Error(`${res.status}: ${res.statusText || 'Request failed'}`);
    }
    throw error; // Re-throw the original error
  }
}

export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // For DELETE operations and 204 No Content responses, return a success object
  // instead of trying to parse JSON
  if (method === 'DELETE' || res.status === 204) {
    return { success: true } as any as T;
  }
  
  // For all other responses, try to parse JSON
  try {
    return await res.json();
  } catch (error) {
    console.error('Failed to parse JSON response:', error);
    return { success: true } as any as T;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    
    // Return empty success object for 204 No Content responses
    if (res.status === 204) {
      return { success: true } as any as T;
    }
    
    // Try to parse JSON, handle error gracefully
    try {
      return await res.json();
    } catch (error) {
      console.error('Failed to parse JSON in getQueryFn:', error);
      return { success: true } as any as T;
    }
  };

// Configure default query behavior for specific endpoints
const TAGS_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Add a default behavior for all tag queries to use consistent caching
queryClient.setQueryDefaults(['/api/tags'], {
  staleTime: TAGS_CACHE_TIME,
  gcTime: 2 * TAGS_CACHE_TIME,
  refetchOnMount: false,
  refetchOnWindowFocus: false
});
