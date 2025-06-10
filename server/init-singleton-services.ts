import OpenAI, { ClientOptions as OpenAIClientOptions } from "openai";
import { Db } from "./db";
import { AIProcessorService } from "./lib/ai-processor-service";
import { BookmarkService } from "./lib/bookmark-service";
import { ContentProcessor } from "./lib/content-processor";
import { ReportService } from "./lib/report-service";
import { XConfig, XService } from "./lib/x-service";
import { DatabaseStorage } from "./storage";

/**
 * Creates and wires up all the singleton services with their dependencies,
 * returning their instances.
 * 
 * At some point we may want to do this with a dependency injection framework,
 * but for now this is probably okay while the app is small.
 */
export function initSingletonServices({ db, openAiConfig, xConfig }: InitSingletonServicesArgs) {
  const storage = new DatabaseStorage(db);
  const openAi = new OpenAI(openAiConfig);  
  const contentProcessor = new ContentProcessor(openAi);
  const bookmarkService = new BookmarkService(storage, contentProcessor);
  const aiProcessorService = new AIProcessorService(db, bookmarkService);
  const reportService = new ReportService(storage, openAi);
  const xService = new XService(db, storage, aiProcessorService, bookmarkService, xConfig);

  return { storage, contentProcessor, bookmarkService, aiProcessorService, reportService, xService };
}

interface InitSingletonServicesArgs {
  /**
   * The database connection to use.
   */
  db: Db;

  /**
   * The OpenAI API configuration object.
   */
  openAiConfig: OpenAIClientOptions;

  /**
   * The X API configuration object.
   */
  xConfig: XConfig;
}
