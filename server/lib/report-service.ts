import { storage } from '../storage';
import { Bookmark, InsertReport, Report, ReportSection } from '../../shared/schema';
import { OpenAI } from 'openai';
import { json } from 'drizzle-orm/pg-core';

// Extend the Bookmark type to include summary and tags
// that we'll extract from description and content
interface ExtendedBookmark extends Bookmark {
  summary: string;
  tags: string[];
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ReportGenerationParams {
  userId: string;
  limit?: number;
  fromDate?: Date;
  toDate?: Date;
  title?: string;
}

export class ReportService {
  /**
   * Creates a new report for the given user
   */
  static async createReport(params: ReportGenerationParams): Promise<Report> {
    const { userId, limit = 100, fromDate, toDate, title } = params;
    
    // Create the initial report record
    const report = await storage.createReport({
      user_id: userId,
      title: title || `Weekly Report - ${new Date().toLocaleDateString()}`,
      content: '', // Will be populated after processing
      status: 'queued',
      scheduled_for: new Date()
    });
    
    // Log the creation
    console.log(`Created new report ${report.id} for user ${userId}`);
    
    return report;
  }
  
  /**
   * Processes a queued report by analyzing bookmarks and generating content
   */
  static async processReport(reportId: string): Promise<Report | undefined> {
    try {
      // Get the report
      const report = await storage.getReport(reportId);
      if (!report) {
        console.error(`Report ${reportId} not found`);
        return undefined;
      }
      
      if (report.status !== 'queued') {
        console.log(`Report ${reportId} is not in queued state (${report.status}), skipping`);
        return report;
      }
      
      // Update report status to processing
      await storage.updateReport(reportId, { 
        status: 'processing'
      });
      
      // Get bookmarks for the user
      const bookmarks = await this.getRelevantBookmarks(report.user_id);
      
      if (bookmarks.length === 0) {
        // No bookmarks to process
        await storage.updateReport(reportId, {
          status: 'completed',
          content: 'No bookmarks found for this time period.'
          // Note: bookmark_count and completed_at are handled by the storage layer
        });
        return await storage.getReport(reportId);
      }
      
      // Add bookmarks to the report
      for (const bookmark of bookmarks) {
        await storage.addBookmarkToReport(reportId, bookmark.id);
      }
      
      // Group bookmarks by topic/theme
      const sections = await this.generateReportSections(reportId, bookmarks);
      
      // Create report content with sections
      const reportContent = await this.generateReportContent(reportId, sections);
      
      // Update report with final content
      const updatedReport = await storage.updateReport(reportId, {
        status: 'completed',
        content: reportContent
        // Note: bookmark_count and completed_at are handled by the storage layer
      });
      
      console.log(`Report ${reportId} processed successfully with ${bookmarks.length} bookmarks`);
      
      return updatedReport;
    } catch (error) {
      console.error(`Error processing report ${reportId}:`, error);
      
      // Update report with error
      await storage.updateReport(reportId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error)
      });
      
      return await storage.getReport(reportId);
    }
  }
  
  /**
   * Fetches relevant bookmarks for the report
   * Returns bookmarks enhanced with summary and tags
   */
  private static async getRelevantBookmarks(userId: string, limit: number = 100): Promise<ExtendedBookmark[]> {
    // Get most recent bookmarks for the user, with a limit
    const allBookmarks = await storage.getBookmarks(userId);
    
    // Sort by date saved, newest first
    const sortedBookmarks = allBookmarks.sort((a, b) => {
      const dateA = new Date(a.date_saved);
      const dateB = new Date(b.date_saved);
      return dateB.getTime() - dateA.getTime();
    });
    
    // Limit to the most recent 'limit' bookmarks
    const recentBookmarks = sortedBookmarks.slice(0, limit);
    
    // Convert regular bookmarks to extended bookmarks
    const extendedBookmarks: ExtendedBookmark[] = await Promise.all(
      recentBookmarks.map(async (bookmark) => {
        // Create extended bookmark with initial empty tags array
        const extendedBookmark: ExtendedBookmark = {
          ...bookmark,
          summary: bookmark.description || '', // Use description as summary
          tags: [] // Initialize with empty array, will be populated below
        };
        
        try {
          // Get tags for this bookmark
          const bookmarkTags = await storage.getTagsByBookmarkId(bookmark.id);
          extendedBookmark.tags = bookmarkTags.map(tag => tag.name);
        } catch (error) {
          console.warn(`Could not fetch tags for bookmark ${bookmark.id}:`, error);
          extendedBookmark.tags = [];
        }
        
        return extendedBookmark;
      })
    );
    
    return extendedBookmarks;
  }
  
  /**
   * Groups bookmarks into thematic sections and creates report sections
   */
  private static async generateReportSections(reportId: string, bookmarks: ExtendedBookmark[]): Promise<ReportSection[]> {
    try {
      // Extract bookmark data for AI processing
      const bookmarkData = bookmarks.map(b => ({
        id: b.id,
        title: b.title,
        url: b.url,
        summary: b.summary,
        tags: b.tags || [],
        date_saved: b.date_saved
      }));
      
      // Prompt for the OpenAI API
      const promptMessages = [
        {
          role: "system" as const,
          content: `You are an expert content curator and analyst. Your task is to organize bookmarks into logical sections based on common themes or topics. For each section:
          
          1. Identify a clear, descriptive title 
          2. Write a concise summary of the theme connecting the bookmarks (100-150 words)
          3. Explain why these bookmarks are grouped together
          4. Include a brief insight about what these materials collectively suggest
          
          Group similar content together. Create 3-7 sections, each with at least 2 bookmarks where possible.
          
          Return your response as a JSON array with objects having these properties:
          - title: The section title
          - content: A well-written summary of the section theme and insights
          - bookmark_ids: Array of bookmark IDs in this section
          - theme: One-word description of the theme (technology, marketing, education, etc.)
          
          Make the sections engaging and insightful, as if creating a personalized magazine.`
        },
        {
          role: "user" as const,
          content: `Here are my bookmarks to organize: ${JSON.stringify(bookmarkData)}`
        }
      ];
      
      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: promptMessages,
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });
      
      // Parse the response
      const responseText = completion.choices[0].message.content;
      if (!responseText) {
        throw new Error('Empty response from OpenAI');
      }
      
      try {
        const response = JSON.parse(responseText);
        const sections = response.sections || [];
        
        if (!Array.isArray(sections) || sections.length === 0) {
          throw new Error('Invalid or empty sections in OpenAI response');
        }
        
        // Create report sections in the database
        const createdSections: ReportSection[] = [];
        
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          const createdSection = await storage.createReportSection({
            report_id: reportId,
            title: section.title,
            content: section.content,
            position: i,
            theme: section.theme,
            bookmark_ids: section.bookmark_ids
          });
          
          createdSections.push(createdSection);
        }
        
        return createdSections;
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError);
        console.log('Raw response:', responseText);
        
        // Fallback: create a single section with all bookmarks
        const fallbackSection = await storage.createReportSection({
          report_id: reportId,
          title: 'Your Recent Bookmarks',
          content: 'A collection of your recently saved content.',
          position: 0,
          theme: 'mixed',
          bookmark_ids: bookmarks.map(b => b.id)
        });
        
        return [fallbackSection];
      }
    } catch (error) {
      console.error('Error generating report sections:', error);
      
      // Fallback to a simple section with all bookmarks
      const fallbackSection = await storage.createReportSection({
        report_id: reportId,
        title: 'Your Recent Bookmarks',
        content: 'A collection of your recently saved content.',
        position: 0,
        theme: 'mixed',
        bookmark_ids: bookmarks.map(b => b.id)
      });
      
      return [fallbackSection];
    }
  }
  
  /**
   * Generates the report content using the sections
   */
  private static async generateReportContent(reportId: string, sections: ReportSection[]): Promise<string> {
    try {
      // Get all report bookmarks
      const bookmarks = await storage.getBookmarksByReportId(reportId);
      
      // Get bookmarks and convert to ExtendedBookmarks
      const extendedBookmarks: ExtendedBookmark[] = await Promise.all(
        bookmarks.map(async (bookmark) => {
          // Create extended bookmark with initial empty tags array
          const extendedBookmark: ExtendedBookmark = {
            ...bookmark,
            summary: bookmark.description || '', // Use description as summary
            tags: [] // Initialize with empty array, will be populated below
          };
          
          try {
            // Get tags for this bookmark
            const bookmarkTags = await storage.getTagsByBookmarkId(bookmark.id);
            extendedBookmark.tags = bookmarkTags.map(tag => tag.name);
          } catch (error) {
            console.warn(`Could not fetch tags for bookmark ${bookmark.id}:`, error);
            extendedBookmark.tags = [];
          }
          
          return extendedBookmark;
        })
      );
      
      // Create a map of extended bookmarks by ID for easy lookup
      const bookmarksById = extendedBookmarks.reduce((map, bookmark) => {
        map[bookmark.id] = bookmark;
        return map;
      }, {} as Record<string, ExtendedBookmark>);
      
      // Format the sections and bookmarks for the content
      const sectionsData = sections.map(section => {
        // Get bookmarks for this section
        const sectionBookmarkIds = section.bookmark_ids || [];
        const sectionBookmarks = sectionBookmarkIds
          .map(id => bookmarksById[id])
          .filter(Boolean) // Remove any undefined bookmarks
          .map(b => ({
            title: b.title,
            url: b.url,
            summary: b.summary || '',
            tags: b.tags || []
          }));
        
        return {
          title: section.title,
          content: section.content,
          bookmarks: sectionBookmarks,
          theme: section.theme
        };
      });
      
      // Prompt for the OpenAI API to generate the report content
      const promptMessages = [
        {
          role: "system" as const,
          content: `You are an expert content curator creating a personalized weekly report. Your task is to create a well-formatted, engaging report based on the sections and bookmarks provided.

          For each section:
          1. Include the section title as a heading
          2. Include the section content/summary
          3. List the bookmarks in that section with their titles as links
          4. Add brief notes about each bookmark based on its summary or tags
          
          Write in a personalized, friendly tone as if this report is a weekly digest for the user. Include an introduction at the beginning and a conclusion at the end.
          
          Format the content in Markdown for readability.`
        },
        {
          role: "user" as const,
          content: `Create a weekly report with these sections: ${JSON.stringify(sectionsData)}`
        }
      ];
      
      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: promptMessages,
        temperature: 0.7,
        max_tokens: 4000
      });
      
      // Get the response text
      const reportContent = completion.choices[0].message.content || '';
      
      if (!reportContent) {
        return "We couldn't generate a detailed report this time. Please check the individual sections.";
      }
      
      return reportContent;
    } catch (error) {
      console.error('Error generating report content:', error);
      
      // Generate a simple report as fallback
      let fallbackContent = `# Your Weekly Bookmark Report\n\n`;
      fallbackContent += `Here's a summary of your recent bookmarks:\n\n`;
      
      for (const section of sections) {
        fallbackContent += `## ${section.title}\n\n`;
        fallbackContent += `${section.content}\n\n`;
        
        // Add bookmark links if available
        if (section.bookmark_ids && section.bookmark_ids.length > 0) {
          fallbackContent += `Bookmarks in this section:\n\n`;
          
          const sectionBookmarks = await Promise.all(
            section.bookmark_ids.map(async id => {
              return await storage.getBookmark(id);
            })
          );
          
          for (const bookmark of sectionBookmarks) {
            if (bookmark) {
              fallbackContent += `- [${bookmark.title}](${bookmark.url})\n`;
            }
          }
          
          fallbackContent += `\n`;
        }
      }
      
      return fallbackContent;
    }
  }
  
  /**
   * Schedules weekly reports for all users
   */
  static async scheduleWeeklyReports(): Promise<void> {
    try {
      // Get all users
      const users = await storage.getUsers();
      let reportCount = 0;
      
      for (const user of users) {
        // Check if user has any bookmarks before creating a report
        const userBookmarks = await storage.getBookmarks(user.id);
        
        if (userBookmarks.length === 0) {
          console.log(`Skipping report for user ${user.id} (no bookmarks)`);
          continue;
        }
        
        // Create a report for the user
        await this.createReport({ userId: user.id });
        reportCount++;
      }
      
      console.log(`Scheduled ${reportCount} reports for ${users.length} users`);
    } catch (error) {
      console.error('Error scheduling weekly reports:', error);
    }
  }
  
  /**
   * Processes all queued reports
   */
  static async processQueuedReports(): Promise<void> {
    try {
      // Get all reports with 'queued' status
      const allReports = await storage.getReports();
      const queuedReports = allReports.filter(report => report.status === 'queued');
      
      console.log(`Processing ${queuedReports.length} queued reports`);
      
      for (const report of queuedReports) {
        await this.processReport(report.id);
      }
    } catch (error) {
      console.error('Error processing queued reports:', error);
    }
  }
}