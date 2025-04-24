import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { storage } from "../storage";
import { processAITags, TAG_SYSTEM_PROMPT } from "./tag-normalizer";
import { processImageUrls } from "./image-processor";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

console.log("OpenAI initialized with API key:", process.env.OPENAI_API_KEY ? "API key is present" : "API key is missing");

interface ProcessedContent {
  text: string;
  readingTime: number;
}

/**
 * Processes HTML content to extract readable text
 */
export async function processContent(contentHtml: string): Promise<{ text: string; html: string; readingTime: number }> {
  console.log("Starting content processing...");
  
  if (!contentHtml) {
    console.error("Content HTML is null, empty, or undefined");
    return {
      text: "",
      html: "",
      readingTime: 0
    };
  }
  
  console.log("Content HTML length:", contentHtml.length);
  
  // Check if content looks like valid HTML
  if (!contentHtml.includes("<") || !contentHtml.includes(">")) {
    console.warn("Content doesn't appear to contain HTML tags");
  }
  
  try {
    // Simple HTML to text conversion (in a real app you would use a proper HTML parser)
    let text = contentHtml
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Calculate approximate reading time (average reading speed: 200-250 words per minute)
    const wordCount = text.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / 225);
    
    console.log(`Processed content: ${wordCount} words, ${readingTime} min reading time`);
    
    return {
      text,
      html: contentHtml, // Return the original HTML as well
      readingTime
    };
  } catch (error) {
    console.error("Error processing content:", error);
    
    // Return empty results rather than failing completely
    return {
      text: "",
      html: contentHtml || "",
      readingTime: 0
    };
  }
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
 * This function supports two modes: URL-based or content-based analysis
 */
export async function generateInsights(
  url: string,
  content?: string,
  depthLevel: number = 1,
  customSystemPrompt?: string,
  imageUrls?: string[]
): Promise<{ summary: string; sentiment: number; tags: string[]; relatedLinks: string[] }> {
  try {
    // Check if this is an X.com URL
    const isXTweet = url && (url.includes('twitter.com') || url.includes('x.com'));
    
    // For X tweets, we should always use content-based analysis with our context-enriched prompt
    // For other URLs, use URL-direct analysis if content is not available
    const useUrlDirectly = !isXTweet && url && (!content || content.length < 100);
    
    // Log whether we're using images
    const hasImages = imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0;
    console.log(`Generating insights using ${useUrlDirectly ? 'URL-based' : 'content-based'} analysis${isXTweet ? ' (X tweet)' : ''}${hasImages ? ' with image analysis' : ''}`);
    
    // Basic system prompt to set context for the AI
    const baseSystemPrompt = "You will receive content details about a user submitted bookmark, which may include text and/or images. Follow the user's instructions precisely and format your response as JSON to be properly parsed as a reply.";
    
    // Get custom system prompt
    let userSystemPrompt;
    
    // Use custom system prompt if provided directly to this function
    if (customSystemPrompt) {
      userSystemPrompt = customSystemPrompt;
      console.log("Using provided custom system prompt for insights generation");
    } 
    // Otherwise get it from storage (we assume there will always be a default prompt set)
    else {
      // Use the summary prompt for insights generation
      const customPrompt = await storage.getSetting("summary_prompt");
      userSystemPrompt = customPrompt?.value;
      console.log("Retrieved custom summary prompt from storage for insights generation");
    }
    
    // Combine base prompt with user prompt
    let systemPrompt = `${baseSystemPrompt}\n\nUser Instructions: ${userSystemPrompt}`;
    
    // Add URL and depth level context to the system prompt
    if (url) {
      systemPrompt += `\n\nThe content is from URL: ${url}`;
    }
    if (depthLevel > 1) {
      systemPrompt += `\n\nAnalyze at depth level: ${depthLevel} (1-4 scale)`;
    }

    // Prepare messages for the API call
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt
      }
    ];
    
    // For multimodal analysis (with images)
    if (hasImages) {
      try {
        // Process and download images first
        console.log(`Processing ${imageUrls.length} images for insights generation analysis: ${JSON.stringify(imageUrls)}`);
        const processedImages = await processImageUrls(imageUrls, 'Insights');
        
        if (processedImages.length === 0) {
          console.warn(`No images were successfully processed for insights, falling back to text-only analysis`);
        }
        
        // Create multimodal message content
        const multimodalContent: Array<any> = []; 
        
        // Add text content first
        if (content && content.trim().length > 0) {
          multimodalContent.push({
            type: "text",
            text: content.slice(0, 15000) // Limit content length
          });
        } else if (url) {
          multimodalContent.push({
            type: "text",
            text: `Please analyze the following URL and images: ${url}`
          });
        }
        
        // Add processed image base64 data to the content
        if (processedImages.length > 0) {
          console.log(`Including ${processedImages.length} processed images in insights generation analysis`);
          
          // Add each image
          for (const base64Image of processedImages) {
            if (base64Image && typeof base64Image === 'string' && base64Image.trim().length > 0) {
              multimodalContent.push({
                type: "image_url",
                image_url: {
                  url: base64Image
                }
              });
            }
          }
          
          // Add the multimodal content as user message
          messages.push({
            role: "user",
            content: multimodalContent
          });
        } else {
          // If we couldn't process any images, fall back to text-only
          console.log("No images were successfully processed, falling back to text-only analysis");
          const contentToAnalyze = content ? content.slice(0, 15000) : "";
          messages.push({
            role: "user",
            content: contentToAnalyze || url || ""
          });
        }
      } catch (imageError) {
        console.error("Error setting up multimodal content, falling back to text-only analysis:", imageError);
        
        // Fall back to text-only analysis
        const contentToAnalyze = content ? content.slice(0, 15000) : "";
        messages.push({
          role: "user",
          content: contentToAnalyze || url || ""
        });
      }
    }
    // Standard text-only analysis
    else {
      // Add content or URL as user message with NO additional instructions
      if (useUrlDirectly) {
        messages.push({
          role: "user",
          content: url
        });
      } else {
        // Use provided content (with length limit)
        const contentToAnalyze = content ? content.slice(0, 15000) : ""; // Increased limit for GPT-4o
        messages.push({
          role: "user",
          content: contentToAnalyze
        });
      }
    }

    console.log(`Sending request to OpenAI for insights on ${url}`);
    
    let response;
    try {
      response = await openai.chat.completions.create({
        model: MODEL,
        messages: messages,
        response_format: { type: "json_object" }
      });
    } catch (apiError) {
      console.error("OpenAI API error when getting insights, falling back to text-only analysis:", apiError);

      // If we hit an error with images, retry without images
      if (hasImages) {
        console.log("Retrying insights without image URLs due to API error");
        
        // Create new messages array without images
        const textOnlyMessages: ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: content || url || ""
          }
        ];
        
        // Retry with text-only content
        response = await openai.chat.completions.create({
          model: MODEL,
          messages: textOnlyMessages,
          response_format: { type: "json_object" }
        });
      } else {
        // If not related to images, rethrow
        throw apiError;
      }
    }

    const resultText = response.choices[0].message.content || "{}";
    console.log("Raw insights result:", resultText);
    
    try {
      // Attempt to parse JSON result
      const result = JSON.parse(resultText);
      
      // Extract values with various fallbacks and format conversions
      let summary = "No summary generated";
      if (typeof result.summary === 'string') {
        summary = result.summary;
      } else if (typeof result.Summary === 'string') {
        summary = result.Summary;
      } else if (typeof result.content === 'string') {
        summary = result.content;
      }
      
      // Extract sentiment with fallbacks
      let sentiment = 5;
      if (typeof result.sentiment === 'number') {
        sentiment = result.sentiment;
      } else if (typeof result.sentiment === 'string' && !isNaN(Number(result.sentiment))) {
        sentiment = Number(result.sentiment);
      } else if (typeof result.Sentiment === 'number') {
        sentiment = result.Sentiment;
      } else if (typeof result.score === 'number') {
        sentiment = result.score;
      }
      
      // Ensure sentiment is in the range 0-10
      sentiment = Math.max(0, Math.min(10, sentiment));
      
      // Extract tags with fallbacks
      let rawTags = [];
      if (Array.isArray(result.tags)) {
        rawTags = result.tags;
      } else if (Array.isArray(result.Tags)) {
        rawTags = result.Tags;
      } else if (typeof result.tags === 'string') {
        rawTags = result.tags.split(',').map(tag => tag.trim());
      }
      
      // First do basic cleaning
      const cleanedTags = rawTags
        .filter(tag => tag && typeof tag === 'string')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
        
      // Then apply enhanced tag normalization with deduplication
      const tags = processAITags(cleanedTags);
      
      // Extract related links with fallbacks
      let relatedLinks = [];
      if (Array.isArray(result.relatedLinks)) {
        relatedLinks = result.relatedLinks;
      } else if (Array.isArray(result.related_links)) {
        relatedLinks = result.related_links;
      } else if (Array.isArray(result.links)) {
        relatedLinks = result.links;
      } else if (typeof result.relatedLinks === 'string') {
        relatedLinks = [result.relatedLinks];
      }
      
      // Filter and clean related links
      relatedLinks = relatedLinks
        .filter(link => link && typeof link === 'string')
        .map(link => link.trim())
        .filter(link => link.length > 0);
      
      return {
        summary,
        sentiment,
        tags,
        relatedLinks
      };
    } catch (parseError) {
      console.error("Error parsing insights result:", parseError);
      // If JSON parsing fails, try to extract a summary from the raw text
      return {
        summary: resultText.length > 1000 ? resultText.slice(0, 1000) + "..." : resultText,
        sentiment: 5,
        tags: [],
        relatedLinks: []
      };
    }
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
 * Generate tags from content or URL, potentially including image analysis
 */
export async function generateTags(
  content: string, 
  url?: string, 
  customSystemPrompt?: string, 
  imageUrls?: string[]
): Promise<string[]> {
  try {
    // Check if this is an X.com URL
    const isXTweet = url && (url.includes('twitter.com') || url.includes('x.com'));
    
    // For X tweets, we should always use content-based analysis with our context-enriched prompt
    // For other URLs, use URL-direct analysis if content is not available
    const useUrlDirectly = !isXTweet && url && (!content || content.length < 100);
    
    // Log whether we're using images
    const hasImages = imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0;
    console.log(`Generating tags using ${useUrlDirectly ? 'URL-based' : 'content-based'} analysis${isXTweet ? ' (X tweet)' : ''}${hasImages ? ' with image analysis' : ''}`);
    
    // Basic system prompt to set context for the AI
    const baseSystemPrompt = "You will receive content details about a user submitted bookmark, which may include text and/or images. Follow the user's instructions precisely and format your response as JSON to be properly parsed as a reply.";
    
    // Get custom system prompt
    let userSystemPrompt;
    
    // Use custom system prompt if provided directly to this function
    if (customSystemPrompt) {
      userSystemPrompt = customSystemPrompt;
      console.log("Using provided custom system prompt for tag generation");
    } 
    // Otherwise get it from storage (we assume there will always be a default prompt set)
    else {
      // Get the tagging prompt from storage
      const customPrompt = await storage.getSetting("auto_tagging_prompt");
      userSystemPrompt = customPrompt?.value;
      console.log("Retrieved custom tagging prompt from storage");
    }
    
    // Combine base prompt with user prompt
    let systemPrompt = `${baseSystemPrompt}\n\nUser Instructions: ${userSystemPrompt}`;
    
    // Add URL context to the system prompt if available
    if (url) {
      systemPrompt += `\n\nThe content is from URL: ${url}`;
    }

    // Prepare messages for the API call
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt
      }
    ];
    
    // For multimodal analysis (with images)
    if (hasImages) {
      try {
        // Process and download images first
        console.log(`Processing ${imageUrls.length} images for tag generation analysis: ${JSON.stringify(imageUrls)}`);
        const processedImages = await processImageUrls(imageUrls, 'TagGen');
        
        if (processedImages.length === 0) {
          console.warn(`No images were successfully processed for tag generation, falling back to text-only tag generation`);
        }
        
        // Create multimodal message content
        const multimodalContent: Array<any> = []; 
        
        // Add text content first
        if (content && content.trim().length > 0) {
          multimodalContent.push({
            type: "text",
            text: content.slice(0, 15000) // Limit content length
          });
        } else if (url) {
          multimodalContent.push({
            type: "text",
            text: `Please analyze the following URL and images: ${url}`
          });
        }
        
        // Add processed image base64 data to the content
        if (processedImages.length > 0) {
          console.log(`Including ${processedImages.length} processed images in tag generation analysis`);
          
          // Add each image
          for (const base64Image of processedImages) {
            if (base64Image && typeof base64Image === 'string' && base64Image.trim().length > 0) {
              multimodalContent.push({
                type: "image_url",
                image_url: {
                  url: base64Image
                }
              });
            }
          }
          
          // Add the multimodal content as user message
          messages.push({
            role: "user",
            content: multimodalContent
          });
        } else {
          // If we couldn't process any images, fall back to text-only
          console.log("No images were successfully processed, falling back to text-only tag generation");
          const contentToAnalyze = content ? content.slice(0, 15000) : "";
          messages.push({
            role: "user",
            content: contentToAnalyze || url || ""
          });
        }
      } catch (imageError) {
        console.error("Error setting up multimodal content for tag generation, falling back to text-only analysis:", imageError);
        
        // Fall back to text-only analysis
        const contentToAnalyze = content ? content.slice(0, 15000) : "";
        messages.push({
          role: "user",
          content: contentToAnalyze || url || ""
        });
      }
    } 
    // Standard text-only analysis
    else {
      // Add content or URL as user message with NO additional instructions
      if (useUrlDirectly && url) {
        messages.push({
          role: "user",
          content: url
        });
      } else {
        // Use provided content (with length limit)
        const contentToAnalyze = content.slice(0, 15000); // Increased limit for GPT-4o
        messages.push({
          role: "user",
          content: contentToAnalyze
        });
      }
    }

    console.log(`Sending request to OpenAI for tag generation${url ? ` for URL: ${url}` : ''}`);

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages,
      response_format: { type: "json_object" }
    });

    const resultText = response.choices[0].message.content || "{}";
    console.log("Raw tag generation result:", resultText);
    
    let tags: string[] = [];
    try {
      const result = JSON.parse(resultText);
      // Handle different possible formats the AI might respond with
      if (Array.isArray(result)) {
        // The AI returned an array directly
        tags = result;
      } else if (result.tags && Array.isArray(result.tags)) {
        // The AI returned an object with a tags array
        tags = result.tags;
      } else if (typeof result === 'object') {
        // The AI returned some other object, try to extract string values
        tags = Object.values(result).filter(value => typeof value === 'string');
      }
    } catch (parseError) {
      console.error("Error parsing tag generation result:", parseError);
      // If JSON parsing fails, try to extract tags using regex
      const tagMatches = resultText.match(/["']([^"']+)["']/g);
      if (tagMatches) {
        tags = tagMatches.map(match => match.replace(/["']/g, ''));
      }
    }
    
    // First basic cleaning
    let cleanedTags = tags
      .filter(tag => tag && typeof tag === 'string')
      .map((tag: string) => tag.trim())
      .filter(tag => tag.length > 0);
    
    // Then apply our enhanced normalization and deduplication
    const normalizedTags = processAITags(cleanedTags);
    
    console.log("Raw tags:", cleanedTags);
    console.log("Normalized tags:", normalizedTags);
    return normalizedTags;
  } catch (error) {
    console.error("Error generating tags:", error);
    return [];
  }
}

/**
 * Summarize content
 */
export async function summarizeContent(content: string, customSystemPrompt?: string): Promise<string> {
  try {
    const contentToSummarize = content.slice(0, 8000); // Limit content to avoid token limits
    
    // Basic system prompt to set context for the AI
    const baseSystemPrompt = "You will receive content from a user submitted bookmark. Follow the user's instructions precisely.";
    
    // Get custom system prompt
    let userSystemPrompt;
    
    // Use custom system prompt if provided directly to this function
    if (customSystemPrompt) {
      userSystemPrompt = customSystemPrompt;
      console.log("Using provided custom system prompt for summarization");
    } 
    // Otherwise get it from storage (we assume there will always be a default prompt set)
    else {
      // Get the summary prompt from storage
      const customPrompt = await storage.getSetting("summary_prompt");
      userSystemPrompt = customPrompt?.value;
      console.log("Retrieved custom summary prompt from storage");
    }
    
    // Combine base prompt with user prompt
    const systemPrompt = `${baseSystemPrompt}\n\nUser Instructions: ${userSystemPrompt}`;

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
      ],
      response_format: { type: "json_object" }
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
              
              console.log(`Bookmark "${bookmark.title}" has tags: ${normalizedTagNames.join(', ') || 'none'}`);
              
              return {
                bookmark,
                tags: normalizedTagNames
              };
            } catch (error) {
              console.error(`Error getting tags for bookmark ${bookmark.id}:`, error);
              return {
                bookmark,
                tags: []
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
        // Using only normalized tags now
        const tagsText = normalizedTagNames.length > 0 ? `Tags: ${normalizedTagNames.join(', ')}` : "No tags";
        
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
