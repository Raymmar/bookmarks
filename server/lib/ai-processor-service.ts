/**
 * AI Processor Service
 * 
 * Provides background processing of bookmark content through AI analysis
 * Automatically processes bookmarks in pending state without requiring user intervention
 */

import { bookmarkService } from './bookmark-service';
import { bookmarks } from '@shared/schema';
import { db } from '../db';
import { eq, and, isNull } from 'drizzle-orm';
import cron from 'node-cron';

// Configuration
const BATCH_SIZE = 5; // Number of bookmarks to process in one batch
const PROCESSING_INTERVAL = '*/15 * * * *'; // Run every 15 minutes
const MAX_CONCURRENCY = 3; // Maximum number of concurrent AI processes

export class AIProcessorService {
  private isProcessing: boolean = false;
  private processingCount: number = 0;

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
   */
  async processAfterSync(userId?: string) {
    console.log(`Processing bookmarks after sync${userId ? ` for user ${userId}` : ''}`);
    await this.processPendingBookmarks(userId);
  }
  
  /**
   * Find and process all bookmarks in pending state
   * 
   * @param userId Optional user ID to filter bookmarks by user
   */
  async processPendingBookmarks(userId?: string) {
    // Prevent multiple processing runs from executing simultaneously
    if (this.isProcessing) {
      console.log('AI processing already in progress, skipping this run');
      return;
    }
    
    try {
      this.isProcessing = true;
      
      // Get pending bookmarks (ai_processing_status = 'pending')
      let pendingBookmarksQuery = db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.ai_processing_status, 'pending'));
      
      // Add user filter if provided
      if (userId) {
        pendingBookmarksQuery = db
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
        console.log('No pending bookmarks found for AI processing');
        return;
      }
      
      console.log(`Found ${pendingBookmarks.length} pending bookmarks for AI processing`);
      
      // Process bookmarks in parallel with concurrency limit
      this.processingCount = 0;
      const promises: Promise<void>[] = [];
      
      for (const bookmark of pendingBookmarks) {
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
      
      // Wait for all processing to complete
      await Promise.all(promises);
      
      console.log(`Completed processing batch of ${pendingBookmarks.length} bookmarks`);
    } catch (error) {
      console.error('Error in AI bookmark processing:', error);
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
      await db
        .update(bookmarks)
        .set({ ai_processing_status: 'processing' })
        .where(eq(bookmarks.id, bookmarkId));
      
      // Process the bookmark - use the existing service
      await bookmarkService.processAiBookmarkData(
        bookmarkId,
        url,
        contentHtml,
        1 // Use default insight depth
      );
      
      console.log(`AI processing completed for bookmark ${bookmarkId}`);
    } catch (error) {
      console.error(`Error processing bookmark ${bookmarkId}:`, error);
      
      // Update status to failed
      await db
        .update(bookmarks)
        .set({ ai_processing_status: 'failed' })
        .where(eq(bookmarks.id, bookmarkId));
    }
  }
}

// Export a singleton instance
export const aiProcessorService = new AIProcessorService();