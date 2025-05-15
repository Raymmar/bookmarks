import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import { storage } from "../storage";
import { processAITags } from "./tag-normalizer";

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
  html: string;
  readingTime: number;
}

/**
 * Processes HTML content to extract readable text
 */
export async function processContent(contentHtml: string): Promise<ProcessedContent> {
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
  mediaUrls?: string[]
): Promise<{ summary: string; sentiment: number; tags: string[] }> {
  try {
    // Check if this is an X.com URL
    const isXTweet = url && (url.includes('twitter.com') || url.includes('x.com'));
    
    // For X tweets, we should always use content-based analysis with our context-enriched prompt
    // For other URLs, use URL-direct analysis if content is not available
    const useUrlDirectly = !isXTweet && url && (!content || content.length < 100);
    
    // Check for X.com media URLs - these will be included in the prompt
    const hasMediaUrls = Boolean(
      mediaUrls && 
      Array.isArray(mediaUrls) && 
      mediaUrls.length > 0 && 
      mediaUrls.some(url => typeof url === 'string' && url.includes('pbs.twimg.com'))
    );
    
    console.log(`Generating insights using ${useUrlDirectly ? 'URL-based' : 'content-based'} analysis${isXTweet ? ' (X tweet)' : ''}${hasMediaUrls ? ' with media' : ''}`);
    
    // Enhanced system prompt to set context for the AI and guide deeper analysis
    const baseSystemPrompt = "You are an expert research assistant analyzing content for the Atmosphere AI platform. Your task is to provide deep, nuanced analysis that goes beyond surface-level understanding.";
    
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
    
    // Construct a multi-stage analysis system prompt but maintain expected output format
    let systemPrompt = `${baseSystemPrompt}

ANALYSIS APPROACH:
First, carefully examine the content to identify core concepts and themes
Next, consider second-order implications and connections not explicitly stated
Then, evaluate how this information relates to broader fields or domains that might not be explicitly mentioned.
Finally, synthesize a comprehensive analysis that goes beyond surface-level understanding without regurgitating or restating the original content.
Your analysis should leverage the associated image for increased understanding.
The image will almost always be more relevant than the text of the post as it will represent the idea being expressed in the post. 
Your job is to read the image, understand the idea being expressed, and then write a summary that includes the idea expressed in the image as well as the text of the post.

Your response MUST include:
- A concise yet nuanced summary (250-500 words)
- A sentiment score (0-10)
- 3-5 tags that capture both explicit and implicit topics

User Instructions: ${userSystemPrompt}

Format your response as valid JSON with these exact keys:
{
  "summary": "your detailed summary",
  "sentiment": number,
  "tags": ["array of relevant tags"]
}`;
    
    // Add URL and depth level context to the system prompt
    if (url) {
      systemPrompt += `\n\nThe content is from URL: ${url}`;
    }
    if (depthLevel > 1) {
      systemPrompt += `\n\nAnalyze at depth level: ${depthLevel} (1-4 scale)`;
    }
    
    // Add instructions for X.com tweets with media
    if (isXTweet && hasMediaUrls) {
      systemPrompt += `\n\nThis content contains media (images) from X.com. Please analyze both the text content and the images to provide a comprehensive understanding. Use this undestanding of the image to help contextualize the images and how they relate to the post and summary.`;
    }

    // Prepare messages for the API call
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt
      }
    ];
    
    // For X.com tweets with media images, use the multi-modal capabilities of GPT-4o
    if (isXTweet && hasMediaUrls && mediaUrls) {
      // Filter to only include Twitter image URLs
      const twitterImageUrls = mediaUrls.filter(url => 
        typeof url === 'string' && url.includes('pbs.twimg.com')
      );
      
      if (twitterImageUrls.length > 0) {
        console.log(`Including ${twitterImageUrls.length} image URLs in the analysis request`);
        console.log(`Image URLs being sent to OpenAI: ${JSON.stringify(twitterImageUrls)}`);
        
        // Create a multimodal content array with proper typing for OpenAI SDK
        const multiModalContent: ChatCompletionContentPart[] = [
          {
            type: "text",
            text: content || url || "Please analyze the attached images and provide insights."
          } as ChatCompletionContentPart
        ];
        
        // Add each image URL to the content
        for (const imageUrl of twitterImageUrls) {
          try {
            console.log(`Adding image URL to multimodal content: ${imageUrl}`);
            
            // Ensure imageUrl is a valid URL string
            if (typeof imageUrl === 'string' && imageUrl.startsWith('https://')) {
              multiModalContent.push({
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              } as ChatCompletionContentPart);
            } else {
              console.warn(`Skipping invalid image URL: ${imageUrl}`);
            }
          } catch (error) {
            console.error(`Error adding image URL to multimodal content: ${error}`);
          }
        }
        
        // Add the multimodal content to the messages with proper typing
        messages.push({
          role: "user",
          content: multiModalContent
        });
        
        console.log(`Multimodal request prepared with ${multiModalContent.length} content parts (${multiModalContent.length - 1} images)`);
      } else {
        // Fallback to text-only if somehow filtering removed all URLs
        const contentToAnalyze = content ? content.slice(0, 15000) : "";
        messages.push({
          role: "user",
          content: contentToAnalyze || url
        });
      }
    } else {
      // Standard text-only mode for non-X.com content or X.com without media
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
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.2,  // Lower temperature for more detailed, focused analysis
      max_tokens: 2500   // Increase token limit for more detailed responses
    });

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
        .filter((tag: any) => tag && typeof tag === 'string')
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0);
        
      // Normalize tags to be single-word and lowercase
      const { normalizeTag } = await import("./tag-normalizer");
      // Map each tag through the normalizer to ensure lowercase and single-word format
      const tags = cleanedTags
        .map(tag => normalizeTag(tag))
        .filter(tag => tag.length > 0)
        // Remove duplicates
        .filter((tag, index, self) => self.indexOf(tag) === index);
      
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
        tags
      };
    } catch (parseError) {
      console.error("Error parsing insights result:", parseError);
      // If JSON parsing fails, try to extract a summary from the raw text
      return {
        summary: resultText.length > 1000 ? resultText.slice(0, 1000) + "..." : resultText,
        sentiment: 5,
        tags: []
      };
    }
  } catch (error) {
    console.error("Error generating insights:", error);
    return {
      summary: "Failed to generate insights",
      sentiment: 5,
      tags: []
    };
  }
}

/**
 * Enhanced system prompt for AI tag generation to improve consistency
 */
export const TAG_SYSTEM_PROMPT = `You are an AI assistant that extracts relevant tags from content.

Your goal is to generate a JSON array of 3 to 5 concise, lowercase, SINGLE-WORD tags that accurately represent the main topics and themes of the content.

TAGGING STRATEGY:
1. Identify explicit main topics directly mentioned in the content.
2. Identify important conceptual themes or fields.
3. Identify relevant technologies, methods, or domains.
4. Prioritize broader/general concepts over narrow/specialized ones.

TAG FORMATTING RULES:
- Tags must be SINGLE WORDS ONLY — no spaces, hyphens, or compound words.
- Tags must be all lowercase.
- Tags must always be singular — no plurals (e.g., "frameworks" → "framework").
- Tags must be common, familiar, and recognizable — avoid obscure technical jargon, brand names, or proper nouns.
- Tags must contain no special characters, numbers, or punctuation.
- Tags must not duplicate concepts (e.g., "version" and "versioning" are considered the same; use "version" only).
- Tags should favor general field/domain terms over specific implementations.
- When multiple reasonable options exist, pick the simplest and most widely understood word.

OUTPUT FORMAT:
Respond with a **strict JSON object** with a "tags" field, like this:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

QUALITY EXAMPLES:

Good tags:
- "ai"
- "web"
- "tech"
- "science"
- "marketing"
- "design"
- "security"

Bad tags:
- "artificial intelligence" (use "ai" instead)
- "web development" (use "web" instead)
- "machine learning" (use "ml" instead)
- "open source" (use "opensource" if absolutely necessary, otherwise prefer "software")

ADDITIONAL IMPORTANT GUIDANCE:
- If you extract a multi-word phrase, condense it into its standard **single-word equivalent**.
- Only return proper names if mentioned in the content (e.g., "Google", "AWS", "React", "OpenAI") — prefer the general field ("cloud", "ai", "framework") over the brand.
- Focus on topics that are **likely to be searchable categories**, not tiny implementation details.

---
`;

/**
 * Generate tags from content or URL
 */
export async function generateTags(content: string, url?: string, customSystemPrompt?: string): Promise<string[]> {
  try {
    // Check if this is an X.com URL
    const isXTweet = url && (url.includes('twitter.com') || url.includes('x.com'));
    
    // For X tweets, we should always use content-based analysis with our context-enriched prompt
    // For other URLs, use URL-direct analysis if content is not available
    const useUrlDirectly = !isXTweet && url && (!content || content.length < 100);
    
    console.log(`Generating tags using ${useUrlDirectly ? 'URL-based' : 'content-based'} analysis${isXTweet ? ' (X tweet)' : ''}`);
    
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
    
    // Always use our TAG_SYSTEM_PROMPT, and add the user's custom prompt if provided
    let systemPrompt = TAG_SYSTEM_PROMPT;
    
    // Add user instructions if they exist
    if (userSystemPrompt) {
      systemPrompt += `

Additional User Instructions: ${userSystemPrompt}`;
    }
    
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
    
    // Add content or URL as user message with reinforcement of single-word requirement
    let userContent = '';
    
    if (useUrlDirectly && url) {
      userContent = url;
    } else {
      // Use provided content (with length limit)
      userContent = content.slice(0, 15000); // Increased limit for GPT-4o
    }
    
    // Add the content plus a reminder about single-word tags
    messages.push({
      role: "user",
      content: `${userContent}\n\nIMPORTANT: Return ONLY single-word tags. No spaces allowed in tags.`
    });

    console.log(`Sending request to OpenAI for tag generation${url ? ` for URL: ${url}` : ''}`);

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.2,  // Lower temperature for more consistent, focused tag generation
      max_tokens: 1500   // Increase token limit for more comprehensive tagging
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
    
    // Clean and normalize tags to be single-word and lowercase
    const { normalizeTag } = await import("./tag-normalizer");
    
    // Apply consistent tag normalization
    const normalizedTags = tags
      .filter(tag => tag && typeof tag === 'string')
      .map((tag: string) => normalizeTag(tag)) // Converts to lowercase and removes special chars
      .filter(tag => tag.length > 0)
      // Remove duplicates
      .filter((tag, index, self) => self.indexOf(tag) === index);
    
    console.log("Raw tags:", tags);
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
    
    // Enhanced system prompt to set context for the AI
    const baseSystemPrompt = "You are an expert research assistant creating summaries for the Atmosphere AI platform. Your task is to provide concise yet nuanced summaries that capture both explicit content and implicit significance.";
    
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
    const systemPrompt = `${baseSystemPrompt}

SUMMARIZATION APPROACH:
1. First, identify the core message and main points of the content
2. Next, extract key supporting details and evidence by doingn some deep research
3. Then, identify any implicit significance, related knowledge, or context to bring back for the summary
4. Finally, create a concise summary that balances coverage with brevity without simply repeating back any of the original content

SUMMARY RULES
- Never assume to know anything about the bookmark. If you do not know it, or cannot look it up. 
- Never use "likely", "suggests", or similar words in your summary.

Your summary should:
- Capture both explicit information and implicit significance
- Maintain the original author's perspective while highlighting key insights
- Prioritize accuracy and avoid introducing information not in the original

User Instructions: ${userSystemPrompt}`;

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
      response_format: { type: "json_object" },
      temperature: 0.2,  // Lower temperature for more focused, detailed analysis
      max_tokens: 5000   // Increase token limit for more comprehensive summaries
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
  },
  userId?: string
): Promise<string> {
  try {
    // Get bookmarks for the specific user only (or all bookmarks if userId is undefined, for backward compatibility)
    let bookmarks = await storage.getBookmarks(userId);
    console.log(`Starting with ${bookmarks.length} total bookmarks${userId ? ' for user ' + userId : ''}`);
    
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
    
    // Limit to 100 bookmarks max to prevent overwhelming the AI
    if (bookmarks.length > 100) {
      console.log(`Limiting from ${bookmarks.length} to 100 bookmarks to prevent context overflow`);
      bookmarks = bookmarks.slice(0, 100);
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
    
    // Send query to OpenAI with enhanced system prompt
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert research assistant that helps users explore and understand their bookmarked content with deep, insightful analysis.

ANALYSIS APPROACH:
1. First, examine the content carefully to identify main points and themes
2. Next, consider connections between different bookmarks and sources
3. Then, evaluate how the information relates to the user's specific query
4. Finally, synthesize a comprehensive response that provides value beyond surface-level information

You have access to the following bookmarks (with their summaries, highlights, and tags):
${filterInfo ? `The user has applied the following filters to narrow down the bookmarks: \n${filterInfo}` : ''}

Answer the user's question based on this information, providing thoughtful analysis that draws connections, identifies patterns, and extracts deeper insights. If asked about filters or tags, mention the filters that have been applied.
          
${context}`
        },
        {
          role: "user",
          content: query
        }
      ],
      temperature: 0.3,  // Lower temperature for more focused, detailed analysis
      max_tokens: 4000   // Increased token limit for more comprehensive responses
    });
    
    return response.choices[0].message.content || "I couldn't generate a response. Please try a different question.";
  } catch (error) {
    console.error("Error generating chat response:", error);
    return "I encountered an error while processing your request. Please try again later.";
  }
}
