/**
 * Report Service
 *
 * This service generates weekly insights reports by analyzing user bookmarks
 * and their associated tags and insights.
 */

import { storage } from "../storage";
import { InsertReport, Report } from "@shared/schema";
import OpenAI from "openai";
import { addWeeks, subWeeks, startOfWeek, endOfWeek, format, subDays } from "date-fns";

// Define report status types - matches the schema enum values
type ReportStatus = "generating" | "completed" | "failed";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default system prompt for title generation
const DEFAULT_TITLE_SYSTEM_PROMPT = `You are a concise headline writer who creates accurate, descriptive titles.
Given a report about bookmarks, create a brief, engaging title that captures the essence of the content.
The title should be 8-12 words maximum and reflect the main themes or insights found in the report.
Focus on being specific and informative rather than generic.
DO NOT include phrases like "Daily Insights" or date ranges in your title.
Return ONLY the title with no additional text, quotes, or explanations.`;

// Default system prompt for report generation
const DEFAULT_SYSTEM_PROMPT = `You are a casual yet professional research assistant with a direct and straightforward tone.

Your job is to extract useful insights from bookmarks that have been collected by the user and turn them into an easily readable report with useful links back to the original content.

The report should be structured in two main sections:
"Atmosphere"
"Overview"

- Atmosphere: An informative list of key takeaways and analysis with links (formatted in markdown) back to the referenced bookmarks. Each point should be brief yet insightful. EVERY point must include at least one link to a relevant bookmark. This section should give the user a quick overview of the most important information with no added superlatives, adjectives or fluff. 

- Overview: A more detailed exploration of the content that dives deeper but as in a more readable format. Think news script, or briefing. Imagine this section might be read outloud as a audio segment on a podcast giving an overview of the insights from the report.

Your output should feel like a trusted advisor giving useful information rather than a formal business report. Use a casual, candid tone throughout but be direct and get straight to the point with no wasted words. Avoid being uptight, formal, or stiff in your language.

Follow these guidelines when creating your response:

- Use casual, everyday language - write like you're talking to a confidant.
- ALWAYS include links back to the original bookmarks when referencing specific content
- Every point in the Atmosphere section must have at least one link to a bookmark
- Organize content by themes but keep the structure simple and approachable. With related sections grouped together.
- Don't use executive summary, key insights, or other formal business report terminology
- Include useful analysis but present it in a conversational way
- Make connections between different bookmarks where relevant
- Don't skip any bookmarks - all should be referenced somewhere in the report
- Keep paragraphs short and readable

Follow these instructions for formatting:

- Use markdown formatting to create a casual, readable document
- Make sure all source links are properly formatted as markdown links: [link text](https://example.com) 
- Use bold and italics sparingly to highlight important points
- Use bullet points in the Quick Links section for easy scanning

Remember you're writing for a casual reader who wants useful information presented in an approachable way - not a business executive looking for a formal report.`;

export interface GenerateReportOptions {
  userId: string;
  customSystemPrompt?: string;
  customTitleSystemPrompt?: string;
  timePeriodStart?: Date;
  timePeriodEnd?: Date;
  maxBookmarks?: number;
  reportType?: "daily" | "weekly";
}

/**
 * Report Service for generating weekly insights
 */
export class ReportService {
  constructor() {}
  
  /**
   * Generate a title for a report based on its content
   * @param content The report content
   * @param customTitleSystemPrompt Optional custom system prompt for title generation
   * @returns A title string
   */
  async generateReportTitle(
    content: string,
    customTitleSystemPrompt?: string
  ): Promise<string> {
    try {
      // Use default or custom system prompt
      const systemPrompt = customTitleSystemPrompt || DEFAULT_TITLE_SYSTEM_PROMPT;
      
      // Create a shortened version of the content for the title generation
      // to avoid token limits - 4000 characters should be enough context
      const shortenedContent = content.length > 4000 
        ? content.substring(0, 4000) + "..." 
        : content;
      
      // Use OpenAI to generate a title
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Generate a concise title for this report content: \n\n${shortenedContent}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 50, // Titles are short
      });
      
      // Extract the title from the response
      const title = response.choices[0].message.content?.trim() || 
                   "Bookmark Insights Report"; // Fallback title
      
      return title;
    } catch (error) {
      console.error("Error generating report title:", error);
      return "Bookmark Insights Report"; // Fallback title on error
    }
  }

  /**
   * Generate a report for the user's recent bookmarks
   */
  async generateWeeklyReport(options: GenerateReportOptions): Promise<Report> {
    const {
      userId,
      customSystemPrompt,
      customTitleSystemPrompt,
      maxBookmarks = 100,
      reportType = "weekly",
    } = options;

    // Determine time period based on report type
    const timePeriodEnd = options.timePeriodEnd || new Date();
    let timePeriodStart: Date;

    if (reportType === "daily") {
      // For daily reports, get just the last day
      timePeriodStart = options.timePeriodStart || subDays(timePeriodEnd, 1);
    } else {
      // For weekly reports, get the last week
      timePeriodStart = options.timePeriodStart || subWeeks(timePeriodEnd, 1);
    }

    // Format date range for the initial report title (will be replaced later)
    const formattedStartDate = format(timePeriodStart, "MMM d, yyyy");
    const formattedEndDate = format(timePeriodEnd, "MMM d, yyyy");
    // This is a temporary title that will be updated after content generation
    const initialTitle = `${reportType === "daily" ? "Daily" : "Weekly"} Insights: ${formattedStartDate} - ${formattedEndDate}`;

    // Used to store the report for reference in the catch block
    let reportObj: Report | undefined;

    try {
      // Create the report first with initial values
      // Note: Status is automatically set to "generating" in the schema definition
      const report = await storage.createReport({
        user_id: userId,
        title: initialTitle,
        content: "Generating report...",
        time_period_start: timePeriodStart,
        time_period_end: timePeriodEnd,
      });

      // Store the report for the catch block
      reportObj = report;

      // Fetch bookmarks with insights and tags
      const bookmarksWithData = await storage.getBookmarksWithInsightsAndTags(
        userId,
        timePeriodStart,
        maxBookmarks,
      );

      if (bookmarksWithData.length === 0) {
        // Update the content and set status to completed
        await storage.updateReportStatus(report.id, "completed");
        await storage.updateReport(report.id, {
          content: "No bookmarks found for this time period.",
        });
        
        return {
          ...report,
          content: "No bookmarks found for this time period.",
          status: "completed",
        };
      }

      // Add the bookmarks to the report for tracking
      for (const { bookmark } of bookmarksWithData) {
        await storage.addBookmarkToReport(report.id, bookmark.id);
      }

      // Prepare data for OpenAI
      const bookmarksData = bookmarksWithData.map(
        ({ bookmark, insight, tags }) => ({
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          description: bookmark.description || "",
          date_saved: format(
            new Date(bookmark.date_saved),
            "yyyy-MM-dd HH:mm:ss",
          ),
          insight: insight
            ? {
                summary: insight.summary,
                sentiment: insight.sentiment,
              }
            : null,
          tags: tags.map((tag) => tag.name),
        }),
      );

      // Prepare the system prompt
      const systemPrompt = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;

      // Log the number of bookmarks being processed
      console.log(
        `Report generation: Processing ${bookmarksData.length} bookmarks for user ${userId}`,
      );

      // Log a sample of bookmark titles for debugging
      const sampleTitles = bookmarksData.slice(0, 5).map((b) => b.title);
      console.log(
        `Report generation: Sample bookmarks (first 5): ${sampleTitles.join(", ")}${bookmarksData.length > 5 ? "..." : ""}`,
      );

      // Enhanced user prompt to ensure comprehensive coverage
      const userPrompt = JSON.stringify({
        request: `Generate a comprehensive ${reportType} insights report for my bookmarks`,
        time_period: {
          start: format(timePeriodStart, "yyyy-MM-dd"),
          end: format(timePeriodEnd, "yyyy-MM-dd"),
          type: reportType,
        },
        instructions: `Use the attached system prompt to create a unified ${reportType} report. You're looking for patterns in the bookmarks and to provide additional insights by acting as a research assistant for the user.`,
        bookmarks: bookmarksData,
      });

      console.log(
        `Report generation: Sending request to OpenAI with ${userPrompt.length} characters`,
      );

      // Send to OpenAI for processing with increased token limits
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.6,
        max_tokens: 4000, // Increased from 4000 to allow for longer, more detailed reports
      });

      // Get the generated report content
      const content =
        response.choices[0].message.content ||
        "Failed to generate report content";
        
      console.log("Report content generated, now generating title...");
        
      // Generate a title for the report based on the content
      const generatedTitle = await this.generateReportTitle(content, customTitleSystemPrompt);
      
      console.log(`Generated title: "${generatedTitle}"`);

      // Update the report status first
      await storage.updateReportStatus(report.id, "completed");
      
      // Update the report with the generated content and title
      const updatedReport = await storage.updateReport(report.id, {
        title: generatedTitle,
        content,
      });

      return updatedReport || report;
    } catch (error) {
      console.error("Error generating weekly report:", error);

      // Format date range for error case
      const formattedStartDate = format(timePeriodStart, "MMM d, yyyy");
      const formattedEndDate = format(timePeriodEnd, "MMM d, yyyy");
      const fallbackTitle = `${reportType === "daily" ? "Daily" : "Weekly"} Insights: ${formattedStartDate} - ${formattedEndDate}`;

      // If the report object isn't defined yet (error before report creation)
      if (!reportObj) {
        // Create a minimal report with failed status
        try {
          // Create a new report with failed status
          const errorReport = await storage.createReport({
            user_id: userId,
            title: fallbackTitle,
            content: "Error generating report",
            time_period_start: timePeriodStart,
            time_period_end: timePeriodEnd,
          });
          
          // Set the status to failed
          await storage.updateReportStatus(errorReport.id, "failed");
          
          return errorReport;
        } catch (createError) {
          // If even creating the error report fails, return a minimal object
          console.error("Failed to create error report:", createError);
          // Since we're having type issues, create a compatible object structure
          // that matches what the API expects to return
          const errorObject = {
            id: "",
            user_id: userId,
            title: fallbackTitle,
            content: "Error generating report",
            created_at: new Date(), // Use Date object as required by Report type
            time_period_start: timePeriodStart,
            time_period_end: timePeriodEnd,
            status: "failed" as const, // Use const assertion to match the enum
          };
          
          return errorObject;
        }
      }

      // Update the existing report with error status
      const failedReport = await storage.updateReportStatus(
        reportObj.id,
        "failed",
      );

      return failedReport || reportObj;
    }
  }

  /**
   * Get all reports for a user
   */
  async getReportsByUserId(userId: string): Promise<Report[]> {
    return await storage.getReportsByUserId(userId);
  }

  /**
   * Get a specific report by ID
   */
  async getReport(reportId: string): Promise<Report | undefined> {
    return await storage.getReport(reportId);
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId: string): Promise<boolean> {
    return await storage.deleteReport(reportId);
  }

  /**
   * Update a report's content and/or title
   */
  async updateReport(reportId: string, updates: { title?: string; content?: string }): Promise<Report | undefined> {
    return await storage.updateReport(reportId, updates);
  }
}

// Export a singleton instance
export const reportService = new ReportService();
