/**
 * Test file for OpenAI tag generation
 * 
 * This file tests the OpenAI tag generation and normalization workflow
 * To run manually:
 * npx tsx server/lib/openai-tag-test.ts
 */

import { generateTags } from './content-processor';
import { processAITags } from './tag-normalizer';

// Test URLs with different content types
const TEST_URLS = [
  "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  "https://reactjs.org/docs/getting-started.html",
  "https://tailwindcss.com/docs",
];

async function testOpenAITagGeneration() {
  console.log('\n==== OPENAI TAG GENERATION TESTS ====\n');
  
  for (const url of TEST_URLS) {
    try {
      console.log(`Testing tag generation for URL: ${url}`);
      
      // Generate tags directly from URL
      const tags = await generateTags("", url);
      
      console.log(`Generated tags: ${JSON.stringify(tags)}`);
      console.log(`Normalized tags: ${JSON.stringify(processAITags(tags))}`);
      console.log("\n---\n");
    } catch (error) {
      console.error(`Error testing URL ${url}:`, error.message);
    }
  }
  
  console.log('==== TESTS COMPLETE ====\n');
}

// Run the test
testOpenAITagGeneration();