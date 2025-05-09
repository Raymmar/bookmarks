/**
 * Automatic Task Scheduler
 * 
 * Sets up scheduled tasks for the application, such as syncing bookmarks from X.com,
 * processing bookmark AI analysis, and generating weekly reports in the background
 */

import cron from 'node-cron';
import { xService } from './x-service';
import { aiProcessorService } from './ai-processor-service';
import { ReportService } from './report-service';
import { db } from '../db';
import { xCredentials, xFolders } from '@shared/schema';
import { eq, lt, isNull } from 'drizzle-orm';
import { or } from 'drizzle-orm/expressions';

/**
 * Set up all application schedulers
 */
export async function setupSchedulers() {
  await setupXSyncScheduler();
  setupAIProcessingScheduler();
  setupWeeklyReportScheduler();
}

/**
 * Schedule automatic X.com bookmark sync for all connected users
 * Runs twice daily at noon and midnight
 * 
 * Note: Automatic folder sync has been removed as per requirements.
 * Users should manually sync folders as needed.
 */
export async function setupXSyncScheduler() {
  console.log('Setting up automatic X.com bookmark sync scheduler');
  
  // Schedule main bookmark sync task to run at noon and midnight
  cron.schedule('0 0,12 * * *', async () => {
    try {
      console.log('Running scheduled X.com bookmark sync for all users');
      await syncAllXAccounts();
      
      // After sync completes, process new bookmarks with AI
      console.log('X.com sync complete, triggering AI processing for new bookmarks');
      await aiProcessorService.processPendingBookmarks();
    } catch (error) {
      console.error('Error in scheduled X.com bookmark sync:', error);
    }
  });
  
  console.log('X.com bookmark sync scheduler set up successfully (folder sync removed)');
}

/**
 * Set up the AI processing scheduler for background bookmark analysis
 */
export function setupAIProcessingScheduler() {
  console.log('Setting up AI processing scheduler');
  aiProcessorService.setupScheduledProcessing();
}

/**
 * Set up the weekly report generation scheduler
 * Runs every Sunday at 1:00 AM to generate reports for all users
 */
export function setupWeeklyReportScheduler() {
  console.log('Setting up weekly report generation scheduler');
  
  // Schedule weekly report generation (every Sunday at 1:00 AM)
  cron.schedule('0 1 * * 0', async () => {
    try {
      console.log('Running scheduled weekly report generation');
      await ReportService.scheduleWeeklyReports();
      
      // Process the reports
      console.log('Processing queued reports');
      await ReportService.processQueuedReports();
    } catch (error) {
      console.error('Error in weekly report generation:', error);
    }
  });
  
  console.log('Weekly report scheduler set up successfully');
}

/**
 * Sync bookmarks from X.com for all connected users
 */
async function syncAllXAccounts() {
  try {
    // Get all users with X.com credentials
    const connectedUsers = await db.select().from(xCredentials);
    
    console.log(`Found ${connectedUsers.length} users connected to X.com`);
    
    // Counter for statistics
    let successCount = 0;
    let errorCount = 0;
    
    // Process each user
    for (const user of connectedUsers) {
      try {
        console.log(`Syncing X.com bookmarks for user ${user.user_id}`);
        
        // Sync bookmarks for this user
        const result = await xService.syncBookmarks(user.user_id);
        
        console.log(`Sync complete for user ${user.user_id}:`, result);
        successCount++;
      } catch (error) {
        console.error(`Error syncing X.com bookmarks for user ${user.user_id}:`, error);
        errorCount++;
      }
      
      // Add a small delay between users to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Scheduled sync complete. Success: ${successCount}, Errors: ${errorCount}`);
  } catch (error) {
    console.error('Error retrieving users for X.com sync:', error);
  }
}

/**
 * THIS FUNCTION IS DEPRECATED - DO NOT USE
 * Automatic folder sync has been removed as per requirements
 * Users should manually sync folders as needed.
 * 
 * This placeholder function exists to ensure any accidental calls
 * don't cause runtime errors, but it does not perform any actions.
 */
async function syncFoldersBatchForAllUsers() {
  console.log('NOTICE: Automatic folder sync is disabled. No action taken.');
  return;
}