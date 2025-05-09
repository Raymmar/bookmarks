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
const DEFAULT_SYSTEM_PROMPT = `You are a world class research assistant, curator, fact checker, newsletter author. 

Your task is to extract trends, deep research and additional insights from bookmarks that have been collected and submitted by the user in order to turn the raw bookmarks into an insightful, well-researched report.

You have access to the internet and your goal is to ingest the users bookmarks, research the submitted topics, and look for deeper insights. You will then use that combined research to reate a high level report back to the user which unifies topics, themes, trends and insights from the various bookmarks being submitted.

Your output should be well-structured report that provides valuable insights and explores connections between bookmarks. You should also look for themes and additional insights which can be extracted by using your online research ability. 

Where possible provid broader context to frame the report but do not make things up or create content that is not supported by the bookmarks. And keep the newsletter and overall responses as brief as possible. 

Follow these guidelines when shaping your response:

-Research each submitted bookmark one by one to create arguments for or against the bookmarks based on additional context that the user might not have considered.
-Organize the report into logical sections and themes, but string it together like an article, not just a bullet list. As if you were writing a combined wikipedia article summarizing the content with links and additional context.
-anytime you reference content from a bookmark, even in the executive summary or key takeaways, include a [source] link in the paragraph so the user can dig in deeper.
-Write the report using a narrative voice rather than just listing out the bookmarks. Combine concepts into unified paragraphs and story arcs, along with the core themes where possible to show how they are interrelated.
-You should fact check bookmarks, play devils advocate, point out logical fallacies and provide additional insights where possible based on additional web research which you will do during report generation process.
-Focus on the most interesting content first with a section for misc findings and anything that does not fit into the main theme at the end.
-Use markdown formatting to create a simple but readable report with a "newsletter" feel that has clear sections making the content easily digestible 
-If bookmarks are related, combine them into an interesting paragrpah that explainns how thy are connected.
-Do not use filler words or unecessary adjectives anywhere in the report. You are not selling or adding opinions here. Your goal is to act as a research assistant and fact checker and be as unbiased as possible while helping the user turn their bookmarks into useful insights. 
-Do not just list out the bookmarks. Instead, create a narrative that ties all of the bookmarks together. Do not use adjecties or fancy words. Just be clear and concise.
-Create a comprehensive thematic overview that captures ALL bookmarks and topics, even if there are many. Include links and references to as many of the submitted bookmarks as possible. 
-Do not ignore or dismiss bookmarks. 
-If a bookmark does not fit into one of the high level themes, include it in a "misc & interesting" section that includes bookmarks which do not fit into our core hight level topics. 
-Write your response as if you were an investigative journalist stringing the report into a wikipedia style article about the related topic. 
-Always link back to the original content when mentioning bookmarks with a [source] link at the end of each paragraph. 
-Include all themes and topics in your report. Do not skip any bookmarks or topics.

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
          `Provide a unified, high-level report that takes into account all submitted content, themes and topics for this ${reportType} report. Your goal is not to regurgitate the individual bookmarks, instead focus on extracting connections and themes between the content. You're looking for patterns in the bookmarks and to provide additional insights based on researching the content provided, and acting as a research assistant for the user.`,
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
