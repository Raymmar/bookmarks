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
}

export class BookmarkService {
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Processes a URL to normalize it and check for duplicates
   */
  async processUrl(url: string): Promise<ProcessedUrlResult> {
    if (!url) {
      throw new Error("URL is required");
    }

    // Normalize the URL (with tracking param removal)
    const normalizedUrl = normalizeUrl(url, true);
    
    // Check if a bookmark with this normalized URL already exists
    const bookmarks = await this.storage.getBookmarks();
    const existingBookmark = bookmarks.find(bookmark => 
      areUrlsEquivalent(bookmark.url, normalizedUrl)
    );
    
    if (existingBookmark) {
      return {
        original: url,
        normalized: normalizedUrl,
        exists: true,
        existingBookmarkId: existingBookmark.id
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
  private async getSystemPrompts() {
    try {
      // Get only the two system prompts we need (for tags and summaries)
      const [taggingPrompt, summaryPrompt] = await Promise.all([
        this.storage.getSetting("auto_tagging_prompt"),
        this.storage.getSetting("summary_prompt")
      ]);
      
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
      
      // Get system prompts to include in AI requests
      const systemPrompts = await this.getSystemPrompts();
      console.log(`Retrieved system prompts for AI processing: ${JSON.stringify(systemPrompts, null, 2)}`);
      
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
            
            // Pass the custom summary prompt to the generateInsights function
            const result = await generateInsights(url, processedText || '', insightDepth, systemPrompts.summaryPrompt);
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
          await this.storage.updateBookmark(bookmarkId, {
            vector_embedding: embedding,
            system_tags: aiTags
          });
          console.log(`Updated bookmark ${bookmarkId} with embedding and system tags`);
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
              related_links: insights.relatedLinks || []
            });
          } else {
            console.log(`Creating new insights for bookmark ${bookmarkId}`);
            await this.storage.createInsight({
              bookmark_id: bookmarkId,
              summary: insights.summary,
              sentiment: insights.sentiment,
              depth_level: insightDepth,
              related_links: insights.relatedLinks || []
            });
          }
          
          // Create activity for insight generation
          await this.storage.createActivity({
            bookmark_id: bookmarkId,
            bookmark_title: bookmark.title,
            type: "insight_generated",
            tags: insights.tags,
            timestamp: new Date()
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
    const urlResult = await this.processUrl(options.url);
    
    // Check for duplicates
    if (urlResult.exists && urlResult.existingBookmarkId) {
      // Return existing bookmark instead of creating a duplicate
      const existingBookmark = await this.storage.getBookmark(urlResult.existingBookmarkId);
      console.log(`URL already exists as bookmark: ${urlResult.existingBookmarkId}`);
      
      if (!existingBookmark) {
        throw new Error("Error retrieving existing bookmark");
      }
      
      return {
        bookmark: existingBookmark,
        isExisting: true
      };
    }

    // Create a basic bookmark data object
    const bookmarkData: InsertBookmark = {
      url: urlResult.normalized, // Use the normalized URL
      title: options.title || urlResult.normalized.split("/").pop() || "Untitled",
      description: options.description || "",
      content_html: options.content_html || null,
      source: options.source,
      vector_embedding: null,
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
      timestamp: new Date()
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
          timestamp: new Date()
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
          timestamp: new Date()
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
            timestamp: new Date()
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
      const urlResult = await this.processUrl(updateData.url);
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
      
      // Get current tags
      const currentTags = await this.storage.getTagsByBookmarkId(bookmarkId);
      
      // Remove existing tag associations
      for (const tag of currentTags) {
        await this.storage.removeTagFromBookmark(bookmarkId, tag.id);
        await this.storage.decrementTagCount(tag.id);
      }
      
      // Add new normalized tags
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
        await this.storage.addTagToBookmark(bookmarkId, tag.id);
        
        // Increment tag count
        await this.storage.incrementTagCount(tag.id);
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