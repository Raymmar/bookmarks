/**
 * AI Processor Service
 * 
 * Provides background processing of bookmark content through AI analysis
 * Automatically processes bookmarks in pending state without requiring user intervention
 */

import { BookmarkService } from './bookmark-service';
import { bookmarks } from '@shared/schema';
import { Db } from '../db';
import { eq, and } from 'drizzle-orm';
import cron from 'node-cron';

// Configuration
const BATCH_SIZE = 5; // Number of bookmarks to process in one batch
const PROCESSING_INTERVAL = '*/15 * * * *'; // Run every 15 minutes
const MAX_CONCURRENCY = 3; // Maximum number of concurrent AI processes

export class AIProcessorService {
  private isProcessing: boolean = false;
  private processingCount: number = 0;
  private recentRateLimitErrors: number = 0;

  constructor(private readonly db: Db, private readonly bookmarkService: BookmarkService) {}

  /**
   * Set up scheduled background processing of unprocessed bookmarks
   */
  setupScheduledProcessing() {
    console.log('Setting up automatic AI processing for bookmarks');
    
    // Schedule the task to run periodically
    cron.schedule(PROCESSING_INTERVAL, async () => {
      console.log('Running scheduled AI processing for unprocessed bookmarks');
      await this.processPendingBookmarks();
    });
    
    console.log(`AI processing scheduler set up successfully (runs every 15 minutes)`);
    
    // Run an initial processing pass when the service starts
    setTimeout(() => this.processPendingBookmarks(), 30000);
  }
  
  /**
   * Process bookmarks after a sync operation has completed
   * This should be called after new bookmarks are added from external sources
   * 
   * @param userId Optional user ID to filter bookmarks by user
   * @param processedBookmarkIds Optional array to collect processed bookmark IDs for further operations
   * @returns The IDs of all processed bookmarks
   */
  async processAfterSync(userId?: string): Promise<string[]> {
    console.log(`Processing bookmarks after sync${userId ? ` for user ${userId}` : ''}`);
    return await this.processPendingBookmarks(userId);
  }
  
  /**
   * Find and process all bookmarks in pending state
   * Continues processing in batches until all pending bookmarks are processed
   * 
   * @param userId Optional user ID to filter bookmarks by user
   * @returns The IDs of all processed bookmarks
   */
  async processPendingBookmarks(userId?: string): Promise<string[]> {
    // Prevent multiple processing runs from executing simultaneously
    if (this.isProcessing) {
      console.log('AI processing already in progress, skipping this run');
      return [];
    }
    
    // Track processed bookmark IDs
    const processedBookmarkIds: string[] = [];
    
    try {
      this.isProcessing = true;
      
      // Process in continuous batches until no more pending bookmarks
      let hasMoreBookmarks = true;
      let totalProcessed = 0;
      let batchNumber = 1;
      
      while (hasMoreBookmarks) {
        console.log(`Starting batch #${batchNumber} of AI processing...`);
        
        // Get pending bookmarks (ai_processing_status = 'pending')
        let pendingBookmarksQuery = this.db
          .select()
          .from(bookmarks)
          .where(eq(bookmarks.ai_processing_status, 'pending'));
        
        // Add user filter if provided
        if (userId) {
          pendingBookmarksQuery = this.db
            .select()
            .from(bookmarks)
            .where(and(
              eq(bookmarks.ai_processing_status, 'pending'),
              eq(bookmarks.user_id, userId)
            ));
        }
        
        // Execute query with limit
        const pendingBookmarks = await pendingBookmarksQuery.limit(BATCH_SIZE);
        
        if (pendingBookmarks.length === 0) {
          console.log('No more pending bookmarks found for AI processing');
          hasMoreBookmarks = false;
          break;
        }
        
        console.log(`Found ${pendingBookmarks.length} pending bookmarks for AI processing (batch #${batchNumber})`);
        
        // Process bookmarks in parallel with concurrency limit
        this.processingCount = 0;
        const promises: Promise<void>[] = [];
        
        for (const bookmark of pendingBookmarks) {
          // Add bookmark ID to the processed list
          processedBookmarkIds.push(bookmark.id);
          
          // Wait until we have a processing slot available
          while (this.processingCount >= MAX_CONCURRENCY) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          this.processingCount++;
          
          // Process the bookmark
          const promise = this.processBookmark(bookmark.id, bookmark.url, bookmark.content_html)
            .finally(() => {
              this.processingCount--;
            });
          
          promises.push(promise);
        }
        
        // Wait for all processing to complete in this batch
        await Promise.all(promises);
        
        totalProcessed += pendingBookmarks.length;
        console.log(`Completed processing batch #${batchNumber} of ${pendingBookmarks.length} bookmarks`);
        batchNumber++;
        
        // Check if we're reaching OpenAI rate limits (429 errors)
        // If we get too many errors in a batch, pause before continuing
        if (this.recentRateLimitErrors > 2) {
          console.log('Detected multiple rate limit errors, pausing processing for 60 seconds');
          await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute pause
          this.recentRateLimitErrors = 0;
        }
      }
      
      console.log(`AI processing complete. Total bookmarks processed: ${totalProcessed}`);
      
      // Return the list of processed bookmark IDs
      return processedBookmarkIds;
    } catch (error) {
      console.error('Error in AI bookmark processing:', error);
      return processedBookmarkIds;
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Process a single bookmark
   * 
   * @param bookmarkId The ID of the bookmark to process
   * @param url The URL of the bookmark
   * @param contentHtml The HTML content of the bookmark (if available)
   */
  private async processBookmark(bookmarkId: string, url: string, contentHtml: string | null): Promise<void> {
    console.log(`Starting AI processing for bookmark ${bookmarkId}`);
    
    try {
      // Update status to processing
      await this.db
        .update(bookmarks)
        .set({ ai_processing_status: 'processing' })
        .where(eq(bookmarks.id, bookmarkId));
      
      // Process the bookmark - use the existing service
      await this.bookmarkService.processAiBookmarkData(
        bookmarkId,
        url,
        contentHtml,
        1 // Use default insight depth
      );
      
      console.log(`AI processing completed for bookmark ${bookmarkId}`);
    } catch (error) {
      console.error(`Error processing bookmark ${bookmarkId}:`, error);
      
      // Check if this is a rate limit error from OpenAI
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (
          errorMessage.includes('rate limit') || 
          errorMessage.includes('too many requests') || 
          errorMessage.includes('429')
        ) {
          console.log('Detected OpenAI rate limit error');
          this.recentRateLimitErrors++;
        }
      }
      
      // Update status to failed
      await this.db
        .update(bookmarks)
        .set({ ai_processing_status: 'failed' })
        .where(eq(bookmarks.id, bookmarkId));
    }
  }
}
