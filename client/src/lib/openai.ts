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

export async function chatWithBookmarks(
  query: string, 
  filters?: {
    tags?: string[],
    startDate?: string,
    endDate?: string,
    source?: string[]
  }
): Promise<string> {
  try {
    console.log("Sending chat request with query:", query, "and filters:", filters);
    
    // Use fetch directly instead of apiRequest to have more control
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        filters
      }),
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
