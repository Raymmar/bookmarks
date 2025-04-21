import { apiRequest } from "./queryClient";

export interface EmbeddingResponse {
  embedding: number[];
}

export interface InsightGenerationResponse {
  summary: string;
  sentiment: number;
  tags: string[];
  depthLevel: number;
  relatedLinks: string[];
}

export async function generateEmbedding(text: string): Promise<EmbeddingResponse> {
  const response = await apiRequest("POST", "/api/embeddings", { text });
  return response.json();
}

export async function generateInsights(
  url: string,
  content: string,
  depthLevel: number
): Promise<InsightGenerationResponse> {
  const response = await apiRequest("POST", "/api/insights", {
    url,
    content,
    depthLevel,
  });
  return response.json();
}

export async function generateTags(content: string): Promise<string[]> {
  const response = await apiRequest("POST", "/api/tags", { content });
  const data = await response.json();
  return data.tags;
}

export async function summarizeContent(content: string): Promise<string> {
  const response = await apiRequest("POST", "/api/summarize", { content });
  const data = await response.json();
  return data.summary;
}

export interface ChatFilters {
  tags?: string[];
  startDate?: string;
  endDate?: string;
  source?: string[];
}

export interface ChatSession {
  id: string;
  title?: string;
  created_at: string;
  updated_at: string;
  filters: ChatFilters | null;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/**
 * Generates a chat response for a given query with optional filters
 */
async function chatWithBookmarks(
  query: string, 
  filters?: ChatFilters,
  sessionId?: string
): Promise<string> {
  try {
    console.log("Sending chat request with query:", query, "and filters:", filters);
    
    // Use the new chat/generate endpoint for sessions or fall back to the old endpoint
    const endpoint = sessionId ? "/api/chat/generate" : "/api/chat";
    
    // Prepare request body based on whether we have a session ID
    const requestBody: any = { 
      message: query,
      filters 
    };
    
    // If session ID is provided, include it in the request
    if (sessionId) {
      requestBody.sessionId = sessionId;
    } else {
      // For backward compatibility with the old endpoint
      requestBody.query = query;
    }
    
    // Use fetch directly instead of apiRequest to have more control
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      credentials: "include"
    });
    
    if (!response.ok) {
      console.error("Chat API error:", response.status, response.statusText);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data || !data.response) {
      console.error("No valid response data from chat API:", data);
      throw new Error("No valid response received from API");
    }
    
    return data.response;
  } catch (error) {
    console.error("Error in chatWithBookmarks:", error);
    throw new Error("Failed to get chat response: " + (error.message || "Unknown error"));
  }
}

/**
 * Gets all chat sessions
 */
export async function getChatSessions(): Promise<ChatSession[]> {
  try {
    const response = await fetch("/api/chat/sessions", {
      credentials: "include"
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    throw new Error("Failed to fetch chat sessions");
  }
}

/**
 * Gets a specific chat session with its messages
 */
export async function getChatSessionWithMessages(sessionId: string): Promise<{
  session: ChatSession;
  messages: ChatMessage[];
}> {
  try {
    // Fetch the session
    const sessionResponse = await fetch(`/api/chat/sessions/${sessionId}`, {
      credentials: "include"
    });
    
    if (!sessionResponse.ok) {
      throw new Error(`API error: ${sessionResponse.status} ${sessionResponse.statusText}`);
    }
    
    const session = await sessionResponse.json();
    
    // Fetch the messages
    const messagesResponse = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
      credentials: "include"
    });
    
    if (!messagesResponse.ok) {
      throw new Error(`API error: ${messagesResponse.status} ${messagesResponse.statusText}`);
    }
    
    const messages = await messagesResponse.json();
    
    return { session, messages };
  } catch (error) {
    console.error("Error fetching chat session with messages:", error);
    throw new Error("Failed to fetch chat session");
  }
}

/**
 * Creates a new chat session
 */
export async function createChatSession(title?: string, filters?: ChatFilters): Promise<ChatSession> {
  try {
    const response = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || "New Chat",
        filters: filters || null
      }),
      credentials: "include"
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error creating chat session:", error);
    throw new Error("Failed to create chat session");
  }
}

// Export functions
export { chatWithBookmarks };
