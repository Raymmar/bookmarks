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
  const response = await apiRequest("POST", "/api/chat", {
    query,
    filters
  });
  const data = await response.json();
  return data.response;
}
