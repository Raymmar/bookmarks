/**
 * Create auto_extract_on_paste Setting Script
 * 
 * This script adds the auto_extract_on_paste setting to the database with a default value of true.
 * This setting controls whether AI insights (tags and summary) are automatically extracted when a URL is pasted.
 */

import { db } from "../server/db";
import { settings } from "../shared/schema";
import { v4 as uuidv4 } from "uuid";

async function createAutoExtractSetting() {
  console.log("Creating auto_extract_on_paste setting...");
  
  try {
    // Check if the setting already exists
    const existingSetting = await db.query.settings.findFirst({
      where: (settings, { eq }) => eq(settings.key, "auto_extract_on_paste")
    });
    
    if (existingSetting) {
      console.log("Setting already exists, no action needed.");
      return;
    }
    
    // Create the setting
    const result = await db.insert(settings).values({
      id: uuidv4(),
      key: "auto_extract_on_paste",
      value: "true", // Default to true
      description: "Automatically extract AI insights (tags and summary) when a URL is pasted",
      updated_at: new Date()
    });
    
    console.log("Successfully created auto_extract_on_paste setting with value: true");
  } catch (error) {
    console.error("Error creating setting:", error);
  } finally {
    process.exit(0);
  }
}

// Run the script
createAutoExtractSetting();