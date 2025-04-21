import OpenAI from "openai";
import { storage } from "../storage";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-dummy-key-for-development"
});

interface ProcessedContent {
  text: string;
  readingTime: number;
}

/**
 * Processes HTML content to extract readable text
 */
export async function processContent(contentHtml: string): Promise<ProcessedContent> {
  // Simple HTML to text conversion (in a real app you would use a proper HTML parser)
  let text = contentHtml
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Calculate approximate reading time (average reading speed: 200-250 words per minute)
  const wordCount = text.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 225);

  return {
    text,
    readingTime
  };
}

/**
 * Generate vector embedding for text
 */
export async function generateEmbedding(text: string): Promise<{ embedding: number[] }> {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text.slice(0, 8000), // Limit the text to the model's token limit
    });

    return {
      embedding: embeddingResponse.data[0].embedding
    };
  } catch (error) {
    console.error("Error generating embedding:", error);
    return { embedding: [] };
  }
}

/**
 * Generate insights from content
 */
export async function generateInsights(
  url: string,
  content: string,
  depthLevel: number
): Promise<{ summary: string; sentiment: number; tags: string[]; relatedLinks: string[] }> {
  try {
    const contentToAnalyze = content.slice(0, 8000); // Limit content to avoid token limits

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that analyzes web content and extracts insights. 
          Analyze the content from the URL ${url} based on a depth level of ${depthLevel} (1-4, where 1 is on-page content only, 
          4 is in-depth research sweep). Generate a concise summary, sentiment score (0-10), relevant tags (at least 3), 
          and related links that might be valuable. Respond in JSON format.`
        },
        {
          role: "user",
          content: contentToAnalyze
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      summary: result.summary || "No summary generated",
      sentiment: result.sentiment || 5,
      tags: result.tags || [],
      relatedLinks: result.relatedLinks || []
    };
  } catch (error) {
    console.error("Error generating insights:", error);
    return {
      summary: "Failed to generate insights",
      sentiment: 5,
      tags: [],
      relatedLinks: []
    };
  }
}

/**
 * Generate tags from content
 */
export async function generateTags(content: string): Promise<string[]> {
  try {
    const contentToAnalyze = content.slice(0, 8000); // Limit content to avoid token limits
    
    // Get custom tag generation prompt from settings if available
    let systemPrompt = "You are an AI assistant that extracts relevant tags from content. Generate 3-7 tags that accurately represent the main topics and themes of the given content. Return the tags as a JSON array.";
    try {
      const customPrompt = await storage.getSetting("auto_tagging_prompt");
      if (customPrompt && customPrompt.value) {
        systemPrompt = customPrompt.value;
      }
    } catch (err) {
      console.warn("Could not retrieve custom tagging prompt, using default:", err);
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: contentToAnalyze
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.tags || [];
  } catch (error) {
    console.error("Error generating tags:", error);
    return [];
  }
}

/**
 * Summarize content
 */
export async function summarizeContent(content: string): Promise<string> {
  try {
    const contentToSummarize = content.slice(0, 8000); // Limit content to avoid token limits
    
    // Get custom summary prompt from settings if available
    let systemPrompt = "You are an AI assistant that summarizes content. Provide a concise, informative summary of the given content in about 2-3 sentences.";
    try {
      const customPrompt = await storage.getSetting("summary_prompt");
      if (customPrompt && customPrompt.value) {
        systemPrompt = customPrompt.value;
      }
    } catch (err) {
      console.warn("Could not retrieve custom summary prompt, using default:", err);
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: contentToSummarize
        }
      ]
    });

    return response.choices[0].message.content || "No summary generated";
  } catch (error) {
    console.error("Error summarizing content:", error);
    return "Failed to generate summary";
  }
}

/**
 * Generate AI chat response based on query and bookmark context
 */
export async function generateChatResponse(
  query: string,
  filters?: {
    tags?: string[];
    startDate?: string;
    endDate?: string;
    source?: string[];
  }
): Promise<string> {
  try {
    // Get all bookmarks first
    let bookmarks = await storage.getBookmarks();
    console.log(`Starting with ${bookmarks.length} total bookmarks`);
    
    // Apply filters if provided
    if (filters) {
      if (filters.tags && filters.tags.length > 0) {
        console.log(`Filtering by tags: ${filters.tags.join(', ')}`);
        
        // First get all bookmarks with their normalized tags
        const bookmarksWithTags = await Promise.all(
          bookmarks.map(async (bookmark) => {
            try {
              // Get normalized tags for this bookmark
              const normalizedTags = await storage.getTagsByBookmarkId(bookmark.id);
              // Extract tag names from normalized tags
              const normalizedTagNames = normalizedTags.map(tag => tag.name);
              // Combine with system tags
              const allTagNames = [...(bookmark.system_tags || []), ...normalizedTagNames];
              
              console.log(`Bookmark "${bookmark.title}" has tags: ${allTagNames.join(', ') || 'none'}`);
              
              return {
                bookmark,
                tags: allTagNames
              };
            } catch (error) {
              console.error(`Error getting tags for bookmark ${bookmark.id}:`, error);
              return {
                bookmark,
                tags: bookmark.system_tags || []
              };
            }
          })
        );
        
        // Filter bookmarks based on combined tags
        bookmarks = bookmarksWithTags
          .filter(item => {
            const matches = filters.tags!.some(tag => item.tags.includes(tag));
            if (matches) {
              console.log(`Bookmark "${item.bookmark.title}" matched tag filter`);
            }
            return matches;
          })
          .map(item => item.bookmark);
          
        console.log(`After tag filtering: ${bookmarks.length} bookmarks remain`);
      }
      
      if (filters.startDate) {
        console.log(`Filtering by start date: ${filters.startDate}`);
        const startDate = new Date(filters.startDate);
        const beforeCount = bookmarks.length;
        
        bookmarks = bookmarks.filter(bookmark => {
          const bookmarkDate = new Date(bookmark.date_saved);
          return bookmarkDate >= startDate;
        });
        
        console.log(`After start date filtering: ${bookmarks.length} of ${beforeCount} bookmarks remain`);
      }
      
      if (filters.endDate) {
        console.log(`Filtering by end date: ${filters.endDate}`);
        const endDate = new Date(filters.endDate);
        const beforeCount = bookmarks.length;
        
        bookmarks = bookmarks.filter(bookmark => {
          const bookmarkDate = new Date(bookmark.date_saved);
          return bookmarkDate <= endDate;
        });
        
        console.log(`After end date filtering: ${bookmarks.length} of ${beforeCount} bookmarks remain`);
      }
      
      if (filters.source && filters.source.length > 0) {
        console.log(`Filtering by sources: ${filters.source.join(', ')}`);
        const beforeCount = bookmarks.length;
        
        bookmarks = bookmarks.filter(bookmark => 
          filters.source!.includes(bookmark.source)
        );
        
        console.log(`After source filtering: ${bookmarks.length} of ${beforeCount} bookmarks remain`);
      }
    }
    
    // Fetch insights for the filtered bookmarks
    const bookmarkContent = await Promise.all(
      bookmarks.map(async (bookmark) => {
        const insights = await storage.getInsightByBookmarkId(bookmark.id);
        const highlights = await storage.getHighlightsByBookmarkId(bookmark.id);
        const normalizedTags = await storage.getTagsByBookmarkId(bookmark.id);
        
        let highlightsText = "";
        if (highlights && highlights.length > 0) {
          highlightsText = "Highlights:\n" + highlights.map(h => `- ${h.quote}`).join("\n");
        }
        
        // Get all tags for this bookmark
        const normalizedTagNames = normalizedTags.map(tag => tag.name);
        const systemTagNames = bookmark.system_tags || [];
        const allTags = [...new Set([...normalizedTagNames, ...systemTagNames])];
        const tagsText = allTags.length > 0 ? `Tags: ${allTags.join(', ')}` : "No tags";
        
        return {
          title: bookmark.title,
          url: bookmark.url,
          summary: insights?.summary || "",
          highlights: highlightsText,
          tags: tagsText
        };
      })
    );
    
    // Create context for the AI
    const context = bookmarkContent.map((bookmark, index) => 
      `[${index + 1}] ${bookmark.title} (${bookmark.url})
       ${bookmark.tags}
       ${bookmark.summary}
       ${bookmark.highlights}`
    ).join("\n\n");
    
    console.log(`Sending ${bookmarkContent.length} bookmarks to AI for context`);
    if (bookmarkContent.length > 0) {
      console.log(`First bookmark in context: "${bookmarkContent[0].title}"`);
      if (bookmarkContent.length > 1) {
        console.log(`Last bookmark in context: "${bookmarkContent[bookmarkContent.length - 1].title}"`);
      }
    } else {
      console.log("Warning: No bookmarks in context!");
    }
    
    // Create filter information for AI
    let filterInfo = "";
    if (filters) {
      const filterParts = [];
      
      if (filters.tags && filters.tags.length > 0) {
        filterParts.push(`Tags: ${filters.tags.join(', ')}`);
      }
      
      if (filters.startDate) {
        const dateObj = new Date(filters.startDate);
        filterParts.push(`Date Range: Starting from ${dateObj.toLocaleDateString()}`);
      }
      
      if (filters.endDate) {
        const dateObj = new Date(filters.endDate);
        filterParts.push(`Date Range: Until ${dateObj.toLocaleDateString()}`);
      }
      
      if (filters.source && filters.source.length > 0) {
        filterParts.push(`Sources: ${filters.source.join(', ')}`);
      }
      
      if (filterParts.length > 0) {
        filterInfo = "Filters applied:\n" + filterParts.join("\n") + "\n\n";
      }
    }
    
    // Send query to OpenAI
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that helps users explore and understand their bookmarked content. 
          You have access to the following bookmarks (with their summaries and highlights).
          ${filterInfo ? `The user has applied the following filters to narrow down the bookmarks: \n${filterInfo}` : ''}
          Answer the user's question based on this information. If asked about filters or tags, mention the filters that have been applied.
          
          ${context}`
        },
        {
          role: "user",
          content: query
        }
      ]
    });
    
    return response.choices[0].message.content || "I couldn't generate a response. Please try a different question.";
  } catch (error) {
    console.error("Error generating chat response:", error);
    return "I encountered an error while processing your request. Please try again later.";
  }
}
