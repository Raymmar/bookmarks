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
      system_tags: [],
      source: options.source,
      vector_embedding: null
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

    let bookmark;
    let processedContent: { text: string; html: string } | null = null;

    // Process content if auto-extract is enabled and we have content
    if (options.autoExtract && bookmarkData.content_html) {
      try {
        console.log(`Processing content for URL: ${bookmarkData.url}`);
        processedContent = await processContent(bookmarkData.content_html);
        
        if (!processedContent) {
          console.error("Error: processContent returned null");
          throw new Error("Failed to process content");
        }
        
        console.log(`Content processed successfully. Text length: ${processedContent.text.length}`);
        
        // Generate embedding for search
        try {
          const embedding = await generateEmbedding(processedContent.text);
          console.log(`Embedding generated successfully: ${embedding.embedding.length} dimensions`);
          bookmarkData.vector_embedding = embedding.embedding;
        } catch (embeddingError) {
          console.error("Error generating embedding:", embeddingError);
          // Continue without embedding
        }
        
        // Generate AI tags - we'll always attempt to generate these
        let aiGeneratedTags: string[] = [];
        try {
          console.log("Generating AI tags...");
          aiGeneratedTags = await generateTags(processedContent.text);
          console.log(`Generated ${aiGeneratedTags.length} AI tags: ${aiGeneratedTags.join(', ')}`);
          
          // Store in system_tags for backward compatibility
          bookmarkData.system_tags = aiGeneratedTags;
        } catch (tagError) {
          console.error("Error generating AI tags:", tagError);
          // Continue without AI tags
          aiGeneratedTags = [];
        }
        
        // Create bookmark with all the data we've collected
        bookmark = await this.storage.createBookmark({
          ...bookmarkData,
          date_saved: new Date()
        });
        console.log(`Created bookmark with processed content: ${bookmark.id}`);
      } catch (error) {
        console.error("Error in content processing workflow:", error);
        // Fall back to basic bookmark creation if content processing fails
        bookmark = await this.storage.createBookmark({
          ...bookmarkData,
          date_saved: new Date()
        });
        console.log(`Created basic bookmark (processing failed): ${bookmark.id}`);
      }
    } else {
      // Basic bookmark creation without processing
      bookmark = await this.storage.createBookmark({
        ...bookmarkData,
        date_saved: new Date()
      });
      console.log(`Created basic bookmark (no auto-extract): ${bookmark.id}`);
    }

    // Create activity for bookmark creation
    await this.storage.createActivity({
      bookmark_id: bookmark.id,
      bookmark_title: bookmark.title,
      type: "bookmark_added",
      timestamp: new Date()
    });
    
    // Save AI-generated tags as normalized tags
    if (processedContent) {
      try {
        // Get the AI-generated tags (from the bookmarkData.system_tags)
        const systemTags = bookmarkData.system_tags || [];
        
        if (systemTags.length > 0) {
          console.log(`Adding ${systemTags.length} AI-generated tags as normalized tags`);
          
          for (const tagName of systemTags) {
            try {
              // Check if this tag is already associated with the bookmark
              const existingTags = await this.storage.getTagsByBookmarkId(bookmark.id);
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
                  console.log(`Created new system tag: ${tagName}`);
                } else {
                  console.log(`Using existing tag: ${tagName}`);
                }
                
                // Associate tag with bookmark
                await this.storage.addTagToBookmark(bookmark.id, tag.id);
                
                // Increment tag count
                await this.storage.incrementTagCount(tag.id);
                console.log(`Associated tag "${tagName}" with bookmark ${bookmark.id}`);
              }
            } catch (tagError) {
              console.error(`Error adding system tag ${tagName}:`, tagError);
            }
          }
        }
      } catch (error) {
        console.error("Error saving AI-generated tags as normalized tags:", error);
      }
    }

    // Process insights if requested and we have processed content
    if (options.insightDepth && processedContent) {
      try {
        const insightDepth = typeof options.insightDepth === 'string' 
          ? parseInt(options.insightDepth) 
          : options.insightDepth;
        
        console.log(`Generating insights with depth ${insightDepth} for bookmark: ${bookmark.id}`);
        
        try {
          // Generate insights with OpenAI
          const insights = await generateInsights(
            bookmarkData.url,
            processedContent.text,
            insightDepth
          );
          
          console.log(`Insights generated successfully. Summary length: ${insights.summary.length}, tags: ${insights.tags.join(', ')}`);
          
          // Store insights
          await this.storage.createInsight({
            bookmark_id: bookmark.id,
            summary: insights.summary,
            sentiment: insights.sentiment,
            depth_level: insightDepth,
            related_links: insights.relatedLinks || []
          });
          
          console.log(`Insights stored in database for bookmark: ${bookmark.id}`);
          
          // Add AI-generated tags to the bookmark if they don't exist already
          if (insights.tags && insights.tags.length > 0) {
            for (const tagName of insights.tags) {
              try {
                // Check if this tag is already associated with the bookmark
                const existingTags = await this.storage.getTagsByBookmarkId(bookmark.id);
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
                  }
                  
                  // Associate tag with bookmark
                  await this.storage.addTagToBookmark(bookmark.id, tag.id);
                  
                  // Increment tag count
                  await this.storage.incrementTagCount(tag.id);
                }
              } catch (tagError) {
                console.error(`Error adding AI tag ${tagName}:`, tagError);
              }
            }
          }
          
          // Create activity for insight generation
          await this.storage.createActivity({
            bookmark_id: bookmark.id,
            bookmark_title: bookmark.title,
            type: "insight_generated",
            tags: insights.tags,
            timestamp: new Date()
          });
          
          console.log(`Activity created for insight generation on bookmark: ${bookmark.id}`);
        } catch (insightError) {
          console.error("Error in OpenAI insight generation:", insightError);
          // Create basic insight if AI failed
          await this.storage.createInsight({
            bookmark_id: bookmark.id,
            summary: "Could not generate AI insights for this content.",
            sentiment: 5, // neutral sentiment
            depth_level: insightDepth,
            related_links: []
          });
        }
      } catch (error) {
        console.error("Error in insight processing workflow:", error);
      }
    }

    // Add user tags
    if (options.tags && options.tags.length > 0) {
      try {
        for (const tagName of options.tags) {
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
        console.error("Error adding tags:", error);
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
    
    // Update URL if provided (with normalization)
    if (updateData.url) {
      const urlResult = await this.processUrl(updateData.url);
      bookmarkUpdateData.url = urlResult.normalized;
    }

    // Update bookmark record
    const updatedBookmark = await this.storage.updateBookmark(bookmarkId, bookmarkUpdateData);
    
    // Update tags if provided
    if (updateData.tags) {
      // Get current tags
      const currentTags = await this.storage.getTagsByBookmarkId(bookmarkId);
      
      // Remove existing tag associations
      for (const tag of currentTags) {
        await this.storage.removeTagFromBookmark(bookmarkId, tag.id);
        await this.storage.decrementTagCount(tag.id);
      }
      
      // Add new tags
      for (const tagName of updateData.tags) {
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