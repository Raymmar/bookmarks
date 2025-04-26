import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { storage } from "../storage";
import { processAITags } from "./tag-normalizer";

/**
 * Enhanced system prompt for AI tag generation to improve consistency
 */
export const TAG_SYSTEM_PROMPT = `You are an AI assistant that extracts relevant tags from content. 
Generate 3-5 SINGLE WORD tags that accurately represent the main topics and themes of the content.

TAGGING APPROACH:
1. First, identify explicit main topics directly mentioned in the content
2. Next, derive conceptual tags that represent higher-level themes 
3. Then, determine field/domain tags that classify the content area
4. Finally, identify technology, methodology, or specialized terminology tags

TAG FORMATING:
- Output should be a JSON array of tag strings
- Tags must be SINGLE WORDS ONLY - no spaces allowed
- Do not duplicate tags or concepts
- Tags should be concise, unique, and relevant 
- Tags should be in lowercase
- Maximum of 5 tags allowed
- Avoid obscure or highly technical terms

Consider both:
- Surface-level topics (explicitly mentioned)
- Deep conceptual connections (implicitly related)
- Industry-specific categorization 

IMPORTANT RULES FOR TAG GENERATION:
1. ONLY use single word tags - no phrases, no compound words with spaces
2. Tags should be lowercase
3. Avoid obscure or highly specific tags
4. No special characters or punctuation
5. Prefer common, recognizable category names 
6. Choose familiar terms over specialized jargon
7. When multiple related concepts exist, pick the most general one
8. Do not strong concepts like "open source" into two tags like "open" and "source"
9. Do not duplicate tags. We should never see "version" and "versioning" as separate tags. 

You must respond with a JSON object in the following format:
{
  "tags": ["word1", "word2", "word3", "word4", "word5"]
}

Examples of good tags: "tech", "ai", "productivity", "design", "science", "marketing" 
Examples of BAD tags: "artificial intelligence" (use "ai" instead), "web development" (use "web" instead) "open source" (use "opensource" instead), "versioning" (use "version" instead) "data science" (use "data" instead) "machine learning" (use "ml" instead)

The tags should capture the main topics while strictly following the single-word requirement.`;

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
  customSystemPrompt?: string
): Promise<{ summary: string; sentiment: number; tags: string[] }> {
  try {
    // Check if this is an X.com URL
    const isXTweet = url && (url.includes('twitter.com') || url.includes('x.com'));
    
    // For X tweets, we should always use content-based analysis with our context-enriched prompt
    // For other URLs, use URL-direct analysis if content is not available
    const useUrlDirectly = !isXTweet && url && (!content || content.length < 100);
    
    console.log(`Generating insights using ${useUrlDirectly ? 'URL-based' : 'content-based'} analysis${isXTweet ? ' (X tweet)' : ''}`);
    
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

    // Prepare messages for the API call
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt
      }
    ];
    
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
      max_tokens: 1500   // Increase token limit for more comprehensive responses
    });
    
    return response.choices[0].message.content || "I couldn't generate a response. Please try a different question.";
  } catch (error) {
    console.error("Error generating chat response:", error);
    return "I encountered an error while processing your request. Please try again later.";
  }
}
