/**
 * Test script for generating a report
 * 
 * This script can be used to manually test the report generation functionality.
 * Run with: npx tsx scripts/test-report-generation.ts
 */

import { reportService } from '../server/lib/report-service';
import { storage } from '../server/storage';
import { subWeeks } from 'date-fns';

async function runTest() {
  try {
    // Replace with a valid user ID
    const [firstUser] = await storage.getUsers();
    
    if (!firstUser) {
      console.error('No users found in the database');
      return;
    }

    console.log(`Using user ID: ${firstUser.id}`);
    
    // Set time period to last 4 weeks to ensure we have enough bookmarks
    const timePeriodEnd = new Date();
    const timePeriodStart = subWeeks(timePeriodEnd, 4);
    
    console.log(`Generating report for period: ${timePeriodStart.toISOString()} to ${timePeriodEnd.toISOString()}`);
    
    // Generate the report
    const report = await reportService.generateWeeklyReport({
      userId: firstUser.id,
      timePeriodStart,
      timePeriodEnd,
      maxBookmarks: 50  // Limit to 50 bookmarks for testing
    });
    
    console.log('Report generated successfully:');
    console.log(`ID: ${report.id}`);
    console.log(`Title: ${report.title}`);
    console.log(`Status: ${report.status}`);
    
    // Get the bookmarks associated with this report
    const bookmarks = await storage.getBookmarksByReportId(report.id);
    
    console.log(`Number of bookmarks included in report: ${bookmarks.length}`);
    
    // Print the first 100 characters of the report content
    console.log('\nReport preview:');
    console.log(report.content.substring(0, 500) + '...');
    
    console.log('\nTest completed successfully');
  } catch (error) {
    console.error('Error running test:', error);
  }
}

// Run the test
runTest();