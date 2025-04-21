/**
 * Test file for OpenAI insights generation
 * 
 * This file tests the OpenAI insights generation workflow
 * To run manually:
 * npx tsx server/lib/openai-insights-test.ts
 */

import { generateInsights } from './content-processor';
import { processAITags } from './tag-normalizer';

// Test URL
const TEST_URL = "https://developer.mozilla.org/en-US/docs/Web/JavaScript";

async function testOpenAIInsightsGeneration() {
  console.log('\n==== OPENAI INSIGHTS GENERATION TEST ====\n');
  
  try {
    console.log(`Testing insights generation for URL: ${TEST_URL}`);
    
    // Generate insights directly from URL (empty content, pass URL)
    const insights = await generateInsights(TEST_URL, "");
    
    console.log("\n=== GENERATED INSIGHTS ===\n");
    // Note: The insights object doesn't include a title field
    console.log(`Summary: ${insights.summary}`);
    console.log(`Sentiment: ${insights.sentiment}/10`);
    console.log(`Tags: ${JSON.stringify(insights.tags)}`);
    console.log(`Normalized Tags: ${JSON.stringify(processAITags(insights.tags))}`);
    
    console.log("\n=== END OF INSIGHTS ===\n");
  } catch (error) {
    console.error(`Error testing insights generation:`, error);
  }
  
  console.log('==== TEST COMPLETE ====\n');
}

// Run the test
testOpenAIInsightsGeneration();