/**
 * Report Service
 *
 * This service generates weekly insights reports by analyzing user bookmarks
 * and their associated tags and insights.
 */

import { storage } from "../storage";
import { InsertReport, Report } from "@shared/schema";
import OpenAI from "openai";
import { addWeeks, subWeeks, startOfWeek, endOfWeek, format } from "date-fns";

// Define report status types
type ReportStatus = "generating" | "completed" | "failed";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default system prompt for report generation
const DEFAULT_SYSTEM_PROMPT = `You are a expert research assistant and investigative journalist. 

Your task is to extract trends, deep research and additional insights from bookmarks that have been collected and submitted by the user in order to turn the raw bookmarks into an insightful, well-researched report.

The research should be structured as follows in three core sections:
"Summary"
"Rundown"
"Deeper insights"

-Summary: one to two sentence overview of entire report. 
-Rundown: A list of key takeaways with links (formatted markdown) back to any referenced bookmarks. All the value in our report should be easily digestible and accessible in this section.
-Deeper insights: This section should dive deeper into the content and provide additional insights that the user might not have considered.

Your output should be a well-structured, skimmable digest that provides valuable insights and explores possible connections between bookmarks. You should also look for themes and additional insights which can be extracted by using your online research ability. 

Where possible provid broader context to frame the report but do not make things up or create content that is not supported by the bookmarks. 

Keep the newsletter and overall responses as brief and to the point as possible. 

Follow these guidelines when shaping your response:

-Research each submitted bookmark one by one and then all together as a unified body. You want to understand the individual bookmarks but also how they fit together.
-Organize the report into logical sections and themes, but string it together like an interesting article, not just a list of topics and bullets. 
-Imagine you are writing a wikipedia article summarizing the content with links and additional context.
-anytime you reference content from a bookmark, be sure to include a properly formatted link (using markdown) so that the user can easily click to explore the source content.
-Write the report using a unbiased voice. Where possible, combine similar concepts into sections with clear story arcs, and point out how the content is interrelated.
-You should fact check bookmarks, play devils advocate, point out logical fallacies and provide additional insights where possible based on additional web research you will conduct. 
-Do not use filler words or unecessary adjectives anywhere in the report. You are not selling or adding opinions here. Your goal is to act as an unbiased research assistant and fact checker that helps the user turn their bookmarks into useful insights. 
-If a bookmark does not fit into one of the high level themes, include it in a "misc & interesting" section that includes content which does not fit into our core hight level topics. 
-Write your response as if you were an investigative journalist stringing the report into a captivating article about the related topic. 
-Always link back to the original content when mentioning bookmarks with a clickable in-line link formatted in markdown.
-Include all themes and topics in your report. Do not skip any bookmarks.

Follow these instructions for formatting your response: 

-Use markdown formatting to create a simple but readable document with a "newsletter" feel that has three clear sections (as outlined above) making the content easily digestible
-make sure all source links are properly formatted as markdown [link text][https://example.com]

Remember that you have access to the bookmark content, extracted insights, and associated tags as well as the open internet where you can research and expand on any of the submitted content. You are to use all  of your available resources to enhance the users bookmarks into a comprehnsive report that is easy to read at a high level but with enough substance to dig in if they want to learn more.`;

export interface GenerateReportOptions {
  userId: string;
  customSystemPrompt?: string;
  timePeriodStart?: Date;
  timePeriodEnd?: Date;
  maxBookmarks?: number;
  reportType?: 'daily' | 'weekly';
}

/**
 * Report Service for generating weekly insights
 */
export class ReportService {
  constructor() {}

  /**
   * Generate a report for the user's recent bookmarks
   */
  async generateWeeklyReport(options: GenerateReportOptions): Promise<Report> {
    const { userId, customSystemPrompt, maxBookmarks = 100, reportType = 'weekly' } = options;

    // Determine time period based on report type
    const timePeriodEnd = options.timePeriodEnd || new Date();
    let timePeriodStart: Date;
    
    if (reportType === 'daily') {
      // For daily reports, get just the last day
      timePeriodStart = options.timePeriodStart || subDays(timePeriodEnd, 1);
    } else {
      // For weekly reports, get the last week
      timePeriodStart = options.timePeriodStart || subWeeks(timePeriodEnd, 1);
    }

    // Format date range for the report title
    const formattedStartDate = format(timePeriodStart, "MMM d, yyyy");
    const formattedEndDate = format(timePeriodEnd, "MMM d, yyyy");
    const reportTitle = `${reportType === 'daily' ? 'Daily' : 'Weekly'} Insights: ${formattedStartDate} - ${formattedEndDate}`;

    // Used to store the report for reference in the catch block
    let reportObj: Report;

    try {
      // Create the report first with "generating" status
      const report = await storage.createReport({
        user_id: userId,
        title: reportTitle,
        content: "Generating report...",
        time_period_start: timePeriodStart,
        time_period_end: timePeriodEnd,
        status: "generating" as ReportStatus,
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
        await storage.updateReport(report.id, {
          content: "No bookmarks found for this time period.",
          status: "completed",
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
        request:
          `Generate a comprehensive ${reportType} insights report for my bookmarks`,
        time_period: {
          start: format(timePeriodStart, "yyyy-MM-dd"),
          end: format(timePeriodEnd, "yyyy-MM-dd"),
          type: reportType
        },
        instructions:
          `Use the attached system prompt to create a unified ${reportType} report. You're looking for patterns in the bookmarks and to provide additional insights by acting as a research assistant for the user.`,
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

      // Update the report with the generated content
      const updatedReport = await storage.updateReport(report.id, {
        content,
        status: "completed",
      });

      return updatedReport || report;
    } catch (error) {
      console.error("Error generating weekly report:", error);

      if (!reportObj) {
        // If we failed even before creating the report, return a minimal error response
        return {
          id: "",
          user_id: userId,
          title: reportTitle,
          content: "Error generating report",
          created_at: new Date(),
          updated_at: new Date(),
          time_period_start: timePeriodStart,
          time_period_end: timePeriodEnd,
          status: "failed" as ReportStatus,
        };
      }

      // Update the report with error status
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
}

// Export a singleton instance
export const reportService = new ReportService();
