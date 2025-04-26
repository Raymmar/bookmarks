/**
 * Centralized Bookmark Service
 * 
 * This service handles all bookmark-related operations, ensuring a single entry point
 * for bookmark processing with consistent handling of URL normalization, deduplication,
 * metadata extraction, and AI-powered features.
 */

import { IStorage, storage } from '../storage';
import { 
  InsertBookmark, 
  InsertInsight, 
  InsertNote,
  InsertScreenshot,
  InsertHighlight,
  InsertTag,
  Tag
} from '../../shared/schema';
import { normalizeUrl, areUrlsEquivalent } from '../../shared/url-service';
import { 
  processContent, 
  generateEmbedding,
  generateTags, 
  generateInsights
} from './content-processor';
import { extractMetadata } from './metadata-extractor';

export interface BookmarkCreationOptions {
  url: string;
  title?: string;
  description?: string;
  content_html?: string;
  notes?: string;
  tags?: string[];
  autoExtract?: boolean;
  insightDepth?: number;
  screenshotUrl?: string;
  highlights?: { quote: string; noteText?: string }[];
  source: string;
  user_id?: string | null; // Add user_id field to associate bookmarks with users
}

export interface ProcessedUrlResult {
  original: string;
  normalized: string;
  exists: boolean;
  existingBookmarkId?: string;
  existingForUser?: boolean;  // Indicates if this bookmark already exists for this specific user
}

export class BookmarkService {
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Processes a URL to normalize it and check for duplicates
   * 
   * @param url The URL to process
   * @param userId Optional user ID to check for URL duplicates for a user
   * @returns Processed URL result with normalization and existence information
   */
  async processUrl(url: string, userId?: string | null): Promise<ProcessedUrlResult> {
    if (!url) {
      throw new Error("URL is required");
    }

    // Normalize the URL (with tracking param removal)
    const normalizedUrl = normalizeUrl(url, true);
    
    // Check if a bookmark with this normalized URL already exists
    const bookmarks = await this.storage.getBookmarks();
    
    // Find matching bookmark for this user specifically
    const existingUserBookmark = userId 
      ? bookmarks.find(bookmark => 
          areUrlsEquivalent(bookmark.url, normalizedUrl) && 
          bookmark.user_id === userId
        )
      : null;
    
    // If we found a bookmark for this specific user, return it
    if (existingUserBookmark) {
      return {
        original: url,
        normalized: normalizedUrl,
        exists: true,
        existingBookmarkId: existingUserBookmark.id,
        existingForUser: true
      };
    }
    
    // Find if URL exists in general for domain consolidation purposes
    const existingBookmark = bookmarks.find(bookmark => 
      areUrlsEquivalent(bookmark.url, normalizedUrl)
    );
    
    if (existingBookmark) {
      return {
        original: url,
        normalized: normalizedUrl,
        exists: true,
        existingBookmarkId: existingBookmark.id,
        existingForUser: false
      };
    } else {
      return {
        original: url,
        normalized: normalizedUrl,
        exists: false
      };
    }
  }

  /**
   * System prompts for AI processing
   */
  private async getSystemPrompts(bookmark?: any) {
    try {
      // Get only the two system prompts we need (for tags and summaries)
      const [taggingPrompt, summaryPrompt] = await Promise.all([
        this.storage.getSetting("auto_tagging_prompt"),
        this.storage.getSetting("summary_prompt")
      ]);
      
      // Create structured system prompts with bookmark context if available
      if (bookmark) {
        // Flag to identify X tweets specifically
        const isXTweet = bookmark.source === 'x';
        
        // Prepare media URLs section if available (for X tweets)
        let mediaSection = '';
        if (isXTweet && bookmark.media_urls && Array.isArray(bookmark.media_urls) && bookmark.media_urls.length > 0) {
          // Filter for only Twitter/X image URLs
          const twitterImageUrls = bookmark.media_urls.filter(url => 
            typeof url === 'string' && url.includes('pbs.twimg.com')
          );
          
          if (twitterImageUrls.length > 0) {
            mediaSection = `
Tweet media URLs:
${twitterImageUrls.map(url => `- ${url}`).join('\n')}

Media Instructions: The tweet contains images which you need to analyze in relation to the tweet content. Please describe the image(s) significance and how they relate to the tweet message.
`;
          }
        }
        
        // Build template strings with the bookmark data inserted
        const templateBase = `

You are analyzing a bookmark from the AtmosphereAI platform.

BOOKMARK DATA:
URL: ${bookmark.url || 'N/A'}
Title: ${bookmark.title || 'N/A'}
Source: ${bookmark.source || 'N/A'}
${bookmark.description ? `Description: ${bookmark.description}` : ''}
${isXTweet ? `
Tweet by: ${bookmark.author_name || 'Unknown'} (@${bookmark.author_username || 'unknown'})
Tweet content: ${bookmark.description || 'N/A'}
Tweet metrics: ${bookmark.like_count || 0} likes, ${bookmark.repost_count || 0} reposts, ${bookmark.reply_count || 0} replies
${mediaSection}
` : ''}

USER INSTRUCTIONS:
${taggingPrompt?.value || ''}

Please analyze this content and follow the user's instructions while considering the bookmark context provided above.
`;

        const summaryTemplateBase = `
You are analyzing a bookmark from the AtmosphereAI platform.

BOOKMARK DATA:
URL: ${bookmark.url || 'N/A'}
Title: ${bookmark.title || 'N/A'}
Source: ${bookmark.source || 'N/A'}
${bookmark.description ? `Description: ${bookmark.description}` : ''}
${isXTweet ? `
Tweet by: ${bookmark.author_name || 'Unknown'} (@${bookmark.author_username || 'unknown'})
Tweet content: ${bookmark.description || 'N/A'}
Tweet metrics: ${bookmark.like_count || 0} likes, ${bookmark.repost_count || 0} reposts, ${bookmark.reply_count || 0} replies
${mediaSection}
` : ''}

USER INSTRUCTIONS:
${summaryPrompt?.value || ''}
`;

        console.log(`Created templated system prompts with bookmark context for ${bookmark.id}`);
        
        return {
          taggingPrompt: templateBase,
          summaryPrompt: summaryTemplateBase
        };
      }
      
      // If no bookmark, return the original prompts
      return {
        taggingPrompt: taggingPrompt?.value,
        summaryPrompt: summaryPrompt?.value
      };
    } catch (error) {
      console.error("Error retrieving system prompts:", error);
      return {
        taggingPrompt: null,
        summaryPrompt: null
      };
    }
  }

  /**
   * Process AI-related data for a bookmark asynchronously
   * This is meant to be run after a bookmark is created
   * Uses a simplified URL-direct approach to AI analysis
   */
  async processAiBookmarkData(
    bookmarkId: string, 
    url: string, 
    content_html: string | null, 
    insightDepth: number = 1
  ) {
    console.log(`Starting AI processing for bookmark ${bookmarkId} in background`);
    
    try {
      // Get the bookmark first to confirm it exists
      const bookmark = await this.storage.getBookmark(bookmarkId);
      if (!bookmark) {
        console.error(`Cannot process AI data - bookmark ${bookmarkId} not found`);
        return;
      }
      
      // We'll process the URL directly even if no content HTML is available
      // This is one of the key improvements in this version
      if (!url) {
        console.error(`No URL available for bookmark ${bookmarkId}, skipping AI processing`);
        return;
      }
      
      console.log(`Processing bookmark ${bookmarkId} for URL: ${url}`);
      
      // Get system prompts to include in AI requests, passing bookmark details for context
      const systemPrompts = await this.getSystemPrompts(bookmark);
      console.log(`Retrieved system prompts for AI processing with bookmark context`);
      
      // We use the URL directly for both insights and tag generation
      // Process tasks in parallel for efficiency
      const [embedding, aiTags, insights] = await Promise.all([
        // 1. Generate embedding (for processed content if available)
        (async () => {
          try {
            if (content_html) {
              console.log(`Generating embedding for bookmark ${bookmarkId}`);
              // Process content to get clean text if we have HTML content
              const processedContent = await processContent(content_html);
              
              if (processedContent && processedContent.text) {
                const result = await generateEmbedding(processedContent.text);
                console.log(`Embedding generated for bookmark ${bookmarkId}: ${result.embedding.length} dimensions`);
                return result.embedding;
              }
            }
            
            // If we don't have content or couldn't process it
            console.log(`No content available for embedding generation, skipping for bookmark ${bookmarkId}`);
            return null;
          } catch (error) {
            console.error(`Error generating embedding for bookmark ${bookmarkId}:`, error);
            return null;
          }
        })(),
        
        // 2. Generate AI tags directly from URL
        (async () => {
          try {
            console.log(`Generating AI tags for bookmark ${bookmarkId} using URL: ${url}`);
            // Using the URL-based tag generation with content as fallback
            let processedText = "";
            
            if (content_html) {
              try {
                const processedContent = await processContent(content_html);
                if (processedContent && processedContent.text) {
                  processedText = processedContent.text;
                }
              } catch (contentError) {
                console.warn(`Error processing content for tag generation: ${contentError.message}`);
              }
            }
            
            // Check if this is an X.com URL - for X tweets, we want to prioritize the description field
            const isXTweet = url && (url.includes('twitter.com') || url.includes('x.com'));
            if (isXTweet && bookmark.description) {
              console.log(`Using X tweet description as primary content for tag generation: "${bookmark.description.substring(0, 50)}..."`);
              processedText = bookmark.description;
            }
            
            // Pass the custom tagging prompt to the generateTags function
            const tags = await generateTags(processedText || '', url, systemPrompts.taggingPrompt);
            console.log(`Generated ${tags.length} AI tags for bookmark ${bookmarkId}: ${tags.join(', ')}`);
            return tags;
          } catch (error) {
            console.error(`Error generating AI tags for bookmark ${bookmarkId}:`, error);
            return [];
          }
        })(),
        
        // 3. Generate insights directly from URL
        (async () => {
          try {
            console.log(`Generating insights for bookmark ${bookmarkId} with depth ${insightDepth} using URL: ${url}`);
            let processedText = "";
            
            if (content_html) {
              try {
                const processedContent = await processContent(content_html);
                if (processedContent && processedContent.text) {
                  processedText = processedContent.text;
                }
              } catch (contentError) {
                console.warn(`Error processing content for insight generation: ${contentError.message}`);
              }
            }
            
            // Check if this is an X.com URL - for X tweets, we want to prioritize the description field
            const isXTweet = url && (url.includes('twitter.com') || url.includes('x.com'));
            if (isXTweet && bookmark.description) {
              console.log(`Using X tweet description as primary content for insights generation: "${bookmark.description.substring(0, 50)}..."`);
              processedText = bookmark.description;
            }
            
            // For X.com tweets with media, pass the media_urls to the insights generator
            let mediaUrls = [];
            if (isXTweet && bookmark.media_urls && Array.isArray(bookmark.media_urls) && bookmark.media_urls.length > 0) {
              // Filter for only pbs.twimg.com URLs
              mediaUrls = bookmark.media_urls.filter((url: string) => 
                typeof url === 'string' && url.includes('pbs.twimg.com')
              );
              
              if (mediaUrls.length > 0) {
                console.log(`Found ${mediaUrls.length} Twitter image URLs to include in the analysis`);
              }
            }
            
            // Pass the custom summary prompt and media URLs to the generateInsights function
            const result = await generateInsights(
              url, 
              processedText || '', 
              insightDepth, 
              systemPrompts.summaryPrompt,
              mediaUrls.length > 0 ? mediaUrls : undefined
            );
            console.log(`Insights generated for bookmark ${bookmarkId}. Summary length: ${result.summary.length}`);
            return result;
          } catch (error) {
            console.error(`Error generating insights for bookmark ${bookmarkId}:`, error);
            return null;
          }
        })()
      ]);
      
      // Now update the bookmark with all the processed data
      
      // 1. Update bookmark with embedding if available
      if (embedding && embedding.length > 0) {
        try {
          // Update bookmark using SQL directly to avoid schema typing issues
          // This is a known workaround until we update the schema definition
          await this.storage.getDb().execute(
            `UPDATE bookmarks 
             SET vector_embedding = $1, 
                 ai_processing_status = 'complete' 
             WHERE id = $2`,
            [embedding, bookmarkId]
          );
          console.log(`Updated bookmark ${bookmarkId} with embedding and set processing status to complete`);
        } catch (error) {
          console.error(`Error updating bookmark ${bookmarkId} with embedding:`, error);
        }
      }
      
      // 2. Add all AI-generated tags
      // Use Array.from instead of Set for better compatibility
      const allTagsArray = [
        ...(aiTags || []),                // Tags from tag generation
        ...(insights?.tags || [])         // Tags from insights
      ].filter((value, index, self) => 
        // Remove duplicates
        self.indexOf(value) === index
      );
      
      if (allTagsArray.length > 0) {
        console.log(`Adding ${allTagsArray.length} AI-generated tags to bookmark ${bookmarkId}`);
        
        for (const tagName of allTagsArray) {
          try {
            // Check if this tag is already associated with the bookmark
            const existingTags = await this.storage.getTagsByBookmarkId(bookmarkId);
            const tagExists = existingTags.some(t => t.name.toLowerCase() === tagName.toLowerCase());
            
            if (!tagExists) {
              // First check if the tag already exists in the system
              let tag = await this.storage.getTagByName(tagName);
              
              if (!tag) {
                // Create the tag if it doesn't exist
                tag = await this.storage.createTag({
                  name: tagName,
                  type: "system" // This is an AI-generated tag
                });
                console.log(`Created new system tag "${tagName}" for bookmark ${bookmarkId}`);
              }
              
              // Associate tag with bookmark
              await this.storage.addTagToBookmark(bookmarkId, tag.id);
              
              // Increment tag count
              await this.storage.incrementTagCount(tag.id);
              console.log(`Associated tag "${tagName}" with bookmark ${bookmarkId}`);
            }
          } catch (tagError) {
            console.error(`Error adding AI tag "${tagName}" to bookmark ${bookmarkId}:`, tagError);
          }
        }
      }
      
      // 3. Store insights if generated
      if (insights) {
        try {
          // Check if insights already exist
          const existingInsight = await this.storage.getInsightByBookmarkId(bookmarkId);
          
          if (existingInsight) {
            console.log(`Updating existing insights for bookmark ${bookmarkId}`);
            await this.storage.updateInsight(existingInsight.id, {
              summary: insights.summary,
              sentiment: insights.sentiment,
              depth_level: insightDepth,
              related_links: [] // No more related links
            });
          } else {
            console.log(`Creating new insights for bookmark ${bookmarkId}`);
            await this.storage.createInsight({
              bookmark_id: bookmarkId,
              summary: insights.summary,
              sentiment: insights.sentiment,
              depth_level: insightDepth,
              related_links: [] // No more related links
            });
          }
          
          // Create activity for insight generation
          await this.storage.createActivity({
            bookmark_id: bookmarkId,
            bookmark_title: bookmark.title,
            type: "insight_generated",
            tags: insights.tags,
            timestamp: new Date(),
            user_id: bookmark.user_id // Include user_id from the bookmark
          });
          
          console.log(`Insights and activity created for bookmark ${bookmarkId}`);
        } catch (error) {
          console.error(`Error storing insights for bookmark ${bookmarkId}:`, error);
        }
      }
      
      console.log(`Completed AI processing for bookmark ${bookmarkId}`);
    } catch (error) {
      console.error(`Error in AI processing for bookmark ${bookmarkId}:`, error);
    }
  }

  /**
   * Creates a new bookmark with comprehensive processing
   */
  async createBookmark(options: BookmarkCreationOptions) {
    // Validate required fields
    if (!options.url) {
      throw new Error("URL is required");
    }

    // Process URL normalization
    // Pass the user_id to only check for duplicates for this specific user
    const urlResult = await this.processUrl(options.url, options.user_id);
    
    // Check for duplicates for this user only
    if (urlResult.exists && urlResult.existingBookmarkId && urlResult.existingForUser) {
      // URL already exists for this user - update the existing bookmark with new information
      const existingBookmark = await this.storage.getBookmark(urlResult.existingBookmarkId);
      console.log(`URL already exists as bookmark for this user: ${urlResult.existingBookmarkId} - Updating with new information`);
      
      if (!existingBookmark) {
        throw new Error("Error retrieving existing bookmark");
      }
      
      // Prepare update data object to enhance the bookmark with new information
      const updateData: Partial<InsertBookmark> = {};
      
      // Append new description if provided (don't overwrite)
      if (options.description && options.description.trim() !== '') {
        if (existingBookmark.description) {
          // Append to existing description with a separator
          updateData.description = `${existingBookmark.description}\n\n--- Additional context ---\n${options.description}`;
        } else {
          updateData.description = options.description;
        }
      }
      
      // Update content_html if provided and different from existing
      if (options.content_html && options.content_html !== existingBookmark.content_html) {
        updateData.content_html = options.content_html;
      }
      
      // Apply any updates to the bookmark if we have changes
      if (Object.keys(updateData).length > 0) {
        await this.storage.updateBookmark(urlResult.existingBookmarkId, updateData);
        console.log(`Updated bookmark ${urlResult.existingBookmarkId} with new information`);
      }
      
      // Add user tags if provided
      if (options.tags && options.tags.length > 0) {
        try {
          // Get existing tags to avoid duplicates
          const existingTags = await this.storage.getTagsByBookmarkId(urlResult.existingBookmarkId);
          const existingTagNames = existingTags.map(tag => tag.name.toLowerCase());
          
          // Apply tag normalization to new user tags
          const { processAITags } = await import('./tag-normalizer');
          const normalizedTags = processAITags(options.tags);
          
          console.log(`Adding new tags to existing bookmark ${urlResult.existingBookmarkId}`);
          for (const tagName of normalizedTags) {
            // Skip if tag already exists on this bookmark
            if (existingTagNames.includes(tagName.toLowerCase())) {
              console.log(`Tag "${tagName}" already exists on bookmark ${urlResult.existingBookmarkId}, skipping`);
              continue;
            }
            
            // Check if tag exists in system
            let tag = await this.storage.getTagByName(tagName);
            
            if (!tag) {
              // Create tag if it doesn't exist
              tag = await this.storage.createTag({
                name: tagName,
                type: "user"
              });
            }
            
            // Associate tag with bookmark
            await this.storage.addTagToBookmark(urlResult.existingBookmarkId, tag.id);
            
            // Increment tag count
            await this.storage.incrementTagCount(tag.id);
            console.log(`Added new tag "${tagName}" to existing bookmark ${urlResult.existingBookmarkId}`);
          }
        } catch (error) {
          console.error(`Error adding new tags to existing bookmark ${urlResult.existingBookmarkId}:`, error);
        }
      }
      
      // Get the updated bookmark with the new information
      const updatedBookmark = await this.storage.getBookmark(urlResult.existingBookmarkId);
      
      // Create activity for bookmark update (using "bookmark_added" as the type since "bookmark_updated" isn't defined in schema)
      await this.storage.createActivity({
        bookmark_id: urlResult.existingBookmarkId,
        bookmark_title: updatedBookmark?.title || "Updated Bookmark",
        type: "bookmark_added", // Using an existing activity type
        content: "Bookmark updated with new information",
        timestamp: new Date(),
        user_id: updatedBookmark?.user_id || null
      });
      
      return {
        bookmark: updatedBookmark,
        isExisting: true,
        wasUpdated: true
      };
    }

    // Create a basic bookmark data object
    const bookmarkData: InsertBookmark = {
      url: urlResult.normalized, // Use the normalized URL
      title: options.title || urlResult.normalized.split("/").pop() || "Untitled",
      description: options.description || "",
      content_html: options.content_html || null,
      source: options.source as "extension" | "web" | "import",
      // Handle vector_embedding through the updateBookmark mechanism after creation
      user_id: options.user_id // Include user_id to associate bookmark with user
    };

    // Extract metadata if not provided
    if (bookmarkData.url && (!options.title || !options.description)) {
      try {
        console.log(`Extracting metadata for URL: ${bookmarkData.url}`);
        const metadata = await extractMetadata(bookmarkData.url);
        bookmarkData.title = options.title || metadata.title || bookmarkData.title;
        bookmarkData.description = options.description || metadata.description || bookmarkData.description;
        bookmarkData.content_html = metadata.content || bookmarkData.content_html;
      } catch (error) {
        console.error("Error extracting metadata:", error);
        // Continue with available data
      }
    }

    // Create the bookmark (without waiting for AI processing)
    console.log(`Creating bookmark for URL: ${bookmarkData.url}`);
    const bookmark = await this.storage.createBookmark({
      ...bookmarkData,
      date_saved: new Date()
    });
    
    console.log(`Created bookmark: ${bookmark.id}`);

    // Create activity for bookmark creation
    await this.storage.createActivity({
      bookmark_id: bookmark.id,
      bookmark_title: bookmark.title,
      type: "bookmark_added",
      timestamp: new Date(),
      user_id: bookmark.user_id // Include user_id from the bookmark
    });
    
    // Add user tags immediately (don't wait for AI processing)
    if (options.tags && options.tags.length > 0) {
      try {
        // Apply tag normalization to user tags
        const { processAITags } = await import('./tag-normalizer');
        
        // Normalize the user-provided tags
        console.log(`Normalizing ${options.tags.length} user tags for bookmark ${bookmark.id}`);
        const normalizedTags = processAITags(options.tags);
        console.log(`Normalized tags: ${normalizedTags.join(', ')}`);
        
        console.log(`Adding ${normalizedTags.length} normalized user tags to bookmark ${bookmark.id}`);
        for (const tagName of normalizedTags) {
          // First check if the tag already exists
          let tag = await this.storage.getTagByName(tagName);
          
          if (!tag) {
            // Create the tag if it doesn't exist
            tag = await this.storage.createTag({
              name: tagName,
              type: "user"
            });
          }
          
          // Associate tag with bookmark
          await this.storage.addTagToBookmark(bookmark.id, tag.id);
          
          // Increment tag count
          await this.storage.incrementTagCount(tag.id);
        }
      } catch (error) {
        console.error(`Error adding user tags to bookmark ${bookmark.id}:`, error);
      }
    }

    // Add notes if provided
    if (options.notes) {
      try {
        const note = await this.storage.createNote({
          bookmark_id: bookmark.id,
          text: options.notes,
          timestamp: new Date()
        });
        
        // Create activity for note
        await this.storage.createActivity({
          bookmark_id: bookmark.id,
          bookmark_title: bookmark.title,
          type: "note_added",
          content: options.notes,
          timestamp: new Date(),
          user_id: bookmark.user_id // Include user_id from the bookmark
        });
      } catch (error) {
        console.error("Error adding notes:", error);
      }
    }

    // Add screenshot if provided
    if (options.screenshotUrl) {
      try {
        await this.storage.createScreenshot({
          bookmark_id: bookmark.id,
          image_url: options.screenshotUrl,
          uploaded_at: new Date()
        });
        
        // Create activity for screenshot
        await this.storage.createActivity({
          bookmark_id: bookmark.id,
          bookmark_title: bookmark.title,
          type: "bookmark_added", // Use an enum-compatible type
          content: "Screenshot added",
          timestamp: new Date(),
          user_id: bookmark.user_id // Include user_id from the bookmark
        });
      } catch (error) {
        console.error("Error adding screenshot:", error);
      }
    }

    // Add highlights if provided
    if (options.highlights && options.highlights.length > 0) {
      try {
        for (const highlight of options.highlights) {
          await this.storage.createHighlight({
            bookmark_id: bookmark.id,
            quote: highlight.quote,
            // Note: don't include noteText as a property on highlight entity
          });
          
          // Create activity for highlight
          await this.storage.createActivity({
            bookmark_id: bookmark.id,
            bookmark_title: bookmark.title,
            type: "highlight_added",
            content: highlight.quote,
            timestamp: new Date(),
            user_id: bookmark.user_id // Include user_id from the bookmark
          });
        }
      } catch (error) {
        console.error("Error adding highlights:", error);
      }
    }

    // Launch AI processing in the background if autoExtract is enabled
    if (options.autoExtract) {
      const contentHtml = bookmarkData.content_html;
      
      if (!contentHtml || contentHtml.length === 0) {
        console.warn(`No content HTML available for bookmark ${bookmark.id}, fetching content now`);
        
        try {
          // Try to fetch the content directly if we don't have it
          const metadata = await extractMetadata(bookmarkData.url);
          
          if (metadata.content && metadata.content.length > 0) {
            console.log(`Successfully fetched content for ${bookmark.id}, length: ${metadata.content.length}`);
            
            // Update the bookmark with the content
            await this.storage.updateBookmark(bookmark.id, {
              content_html: metadata.content
            });
            
            // Process asynchronously - don't await this!
            this.processAiBookmarkData(
              bookmark.id,
              bookmarkData.url,
              metadata.content,
              options.insightDepth ? (typeof options.insightDepth === 'string' ? parseInt(options.insightDepth) : options.insightDepth) : 1
            ).catch(error => {
              console.error(`Background AI processing failed for bookmark ${bookmark.id}:`, error);
            });
            
            console.log(`Started background AI processing for bookmark ${bookmark.id}`);
          } else {
            console.warn(`Failed to fetch content for ${bookmark.id}`);
          }
        } catch (error) {
          console.error(`Error fetching content for AI processing of bookmark ${bookmark.id}:`, error);
        }
      } else {
        // Process asynchronously with the content we already have
        console.log(`Processing bookmark ${bookmark.id} with existing HTML content (${contentHtml.length} chars)`);
        
        this.processAiBookmarkData(
          bookmark.id,
          bookmarkData.url,
          contentHtml,
          options.insightDepth ? (typeof options.insightDepth === 'string' ? parseInt(options.insightDepth) : options.insightDepth) : 1
        ).catch(error => {
          console.error(`Background AI processing failed for bookmark ${bookmark.id}:`, error);
        });
        
        console.log(`Started background AI processing for bookmark ${bookmark.id}`);
      }
    } else {
      console.log(`Skipping AI processing for bookmark ${bookmark.id} (autoExtract: ${options.autoExtract})`);
    }

    return {
      bookmark,
      isExisting: false
    };
  }

  /**
   * Deletes a bookmark and all its associated data
   */
  async deleteBookmark(bookmarkId: string) {
    // Check if bookmark exists
    const bookmark = await this.storage.getBookmark(bookmarkId);
    if (!bookmark) {
      throw new Error("Bookmark not found");
    }

    // Get all tags associated with this bookmark
    const tags = await this.storage.getTagsByBookmarkId(bookmarkId);
    
    // Remove tag associations and decrement counts
    for (const tag of tags) {
      await this.storage.removeTagFromBookmark(bookmarkId, tag.id);
      await this.storage.decrementTagCount(tag.id);
    }

    // Delete the bookmark
    await this.storage.deleteBookmark(bookmarkId);
    
    return true;
  }

  /**
   * Updates a bookmark with new data
   */
  async updateBookmark(bookmarkId: string, updateData: Partial<BookmarkCreationOptions>) {
    // Check if bookmark exists
    const bookmark = await this.storage.getBookmark(bookmarkId);
    if (!bookmark) {
      throw new Error("Bookmark not found");
    }

    // Prepare update data for database
    const bookmarkUpdateData: Partial<InsertBookmark> = {};
    
    // Update basic properties
    if (updateData.title) bookmarkUpdateData.title = updateData.title;
    if (updateData.description) bookmarkUpdateData.description = updateData.description;
    if (updateData.user_id !== undefined) bookmarkUpdateData.user_id = updateData.user_id;
    
    // Update URL if provided (with normalization)
    if (updateData.url) {
      // Use the bookmark's user_id for URL duplication check
      const urlResult = await this.processUrl(updateData.url, bookmark.user_id);
      bookmarkUpdateData.url = urlResult.normalized;
    }

    // Update bookmark record
    const updatedBookmark = await this.storage.updateBookmark(bookmarkId, bookmarkUpdateData);
    
    // Update tags if provided
    if (updateData.tags) {
      // Normalize the provided tags
      const { processAITags } = await import('./tag-normalizer');
      
      // Normalize the user-provided tags
      console.log(`Normalizing ${updateData.tags.length} user tags for bookmark ${bookmarkId}`);
      const normalizedTags = processAITags(updateData.tags);
      console.log(`Normalized tags: ${normalizedTags.join(', ')}`);
      
      // Get current tags to avoid duplicates and preserve existing tags
      const currentTags = await this.storage.getTagsByBookmarkId(bookmarkId);
      const currentTagNames = currentTags.map(tag => tag.name.toLowerCase());
      
      console.log(`Adding new tags to existing bookmark ${bookmarkId}`);
      
      // Add new normalized tags (only adding new ones, not replacing)
      for (const tagName of normalizedTags) {
        // Skip if tag already exists on this bookmark
        if (currentTagNames.includes(tagName.toLowerCase())) {
          console.log(`Tag "${tagName}" already exists on bookmark ${bookmarkId}, skipping`);
          continue;
        }
        
        // Check if tag exists in system
        let tag = await this.storage.getTagByName(tagName);
        
        if (!tag) {
          // Create the tag if it doesn't exist
          tag = await this.storage.createTag({
            name: tagName,
            type: "user"
          });
        }
        
        // Associate tag with bookmark
        await this.storage.addTagToBookmark(bookmarkId, tag.id);
        
        // Increment tag count
        await this.storage.incrementTagCount(tag.id);
        console.log(`Added new tag "${tagName}" to existing bookmark ${bookmarkId}`);
      }
    }
    
    // If notes are provided, add them as a new note
    if (updateData.notes) {
      await this.storage.createNote({
        bookmark_id: bookmarkId,
        text: updateData.notes,
        timestamp: new Date()
      });
    }

    return updatedBookmark;
  }
}

// Export a singleton instance
export const bookmarkService = new BookmarkService(storage);