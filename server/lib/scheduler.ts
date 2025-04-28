/**
 * Automatic Task Scheduler
 * 
 * Sets up scheduled tasks for the application, such as syncing bookmarks from X.com
 */

import cron from 'node-cron';
import { xService } from './x-service';
import { db } from '../db';
import { xCredentials, xFolders } from '@shared/schema';
import { eq, lt, isNull } from 'drizzle-orm';
import { or } from 'drizzle-orm/expressions';

/**
 * Schedule automatic X.com bookmark sync for all connected users
 * Runs twice daily at noon and midnight
 */
export async function setupXSyncScheduler() {
  console.log('Setting up automatic X.com bookmark sync scheduler');
  
  // Schedule main bookmark sync task to run at noon and midnight
  cron.schedule('0 0,12 * * *', async () => {
    try {
      console.log('Running scheduled X.com bookmark sync for all users');
      await syncAllXAccounts();
    } catch (error) {
      console.error('Error in scheduled X.com bookmark sync:', error);
    }
  });
  
  // Schedule folder sync task to run every 15 minutes
  // This will handle no more than 5 folders in each run to avoid rate limits
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('Running scheduled X.com folder sync (rate-limited batch)');
      await syncFoldersBatchForAllUsers();
    } catch (error) {
      console.error('Error in scheduled X.com folder sync:', error);
    }
  });
  
  console.log('X.com bookmark sync scheduler set up successfully');
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
 * Sync a batch of folders across all users, rate-limited to avoid X API limits
 * This ensures we don't make more than 5 folder update requests in each 15-minute period
 */
async function syncFoldersBatchForAllUsers() {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Get a limited batch of folders to sync, prioritizing:
    // 1. Folders that have never been synced (last_sync_at is null)
    // 2. Folders that were synced more than an hour ago
    // Limit to 5 folders to avoid rate limits (X.com limits folder requests)
    const foldersToSync = await db.select()
      .from(xFolders)
      .where(
        or(
          isNull(xFolders.last_sync_at),
          lt(xFolders.last_sync_at, oneHourAgo)
        )
      )
      .limit(5);
    
    console.log(`Found ${foldersToSync.length} folders to sync in this batch`);
    
    // Process each folder
    let successCount = 0;
    let errorCount = 0;
    
    for (const folder of foldersToSync) {
      try {
        console.log(`Syncing folder ${folder.x_folder_name} (${folder.x_folder_id}) for user ${folder.user_id}`);
        
        // Sync this specific folder
        const result = await xService.syncBookmarksFromSpecificFolder(folder.user_id, folder.x_folder_id);
        
        // Update the folder's last_sync_at timestamp
        await db.update(xFolders)
          .set({ last_sync_at: now })
          .where(eq(xFolders.id, folder.id));
        
        console.log(`Folder sync complete: ${folder.x_folder_name} for user ${folder.user_id}:`, result);
        successCount++;
      } catch (error) {
        console.error(`Error syncing folder ${folder.x_folder_id} for user ${folder.user_id}:`, error);
        errorCount++;
      }
      
      // Add a delay between folder syncs to be extra cautious with rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`Folder batch sync complete. Success: ${successCount}, Errors: ${errorCount}`);
  } catch (error) {
    console.error('Error retrieving folders for batch sync:', error);
  }
}