/**
 * Test File for Tag Normalization
 * 
 * This file tests the tag normalization and deduplication functionality.
 * To run manually:
 * npx tsx server/lib/tag-normalization-test.ts
 */

import { processAITags, normalizeTag, areSimilarTags, deduplicateTags } from './tag-normalizer';

// Test tag normalization
function testNormalization() {
  console.log('--- Testing Tag Normalization ---');
  
  const testCases = [
    { input: 'JavaScript', expected: 'javascript' },
    { input: 'React.js', expected: 'react' },
    { input: 'machine learning', expected: 'machine learning' },
    { input: 'machine-learning', expected: 'machine learning' },
    { input: 'Machine_Learning', expected: 'machine learning' },
    { input: '  AI  ', expected: 'ai' },
    { input: 'web3.0', expected: 'web30' },
    { input: '  ', expected: '' },
    { input: 'a!@#$%^&*()+=b', expected: 'ab' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(test => {
    const result = normalizeTag(test.input);
    const success = result === test.expected;
    
    console.log(`${success ? '✓' : '✗'} normalizeTag('${test.input}') => '${result}' ${success ? '' : `(expected '${test.expected}')`}`);
    
    if (success) passed++;
    else failed++;
  });
  
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
}

// Test similar tag detection
function testSimilarTagDetection() {
  console.log('--- Testing Similar Tag Detection ---');
  
  const testCases = [
    { tag1: 'javascript', tag2: 'javascript', expected: true },
    { tag1: 'javascript', tag2: 'JavaScript', expected: true },
    { tag1: 'react', tag2: 'React.js', expected: true },
    { tag1: 'machine learning', tag2: 'machine-learning', expected: true },
    { tag1: 'AI', tag2: 'artificial intelligence', expected: false },
    { tag1: 'tech', tag2: 'tech community', expected: true },
    { tag1: 'technology', tag2: 'tech', expected: true },
    { tag1: 'web development', tag2: 'webdev', expected: true },
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(test => {
    const result = areSimilarTags(test.tag1, test.tag2);
    const success = result === test.expected;
    
    console.log(`${success ? '✓' : '✗'} areSimilarTags('${test.tag1}', '${test.tag2}') => ${result} ${success ? '' : `(expected ${test.expected})`}`);
    
    if (success) passed++;
    else failed++;
  });
  
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
}

// Test tag deduplication
function testTagDeduplication() {
  console.log('--- Testing Tag Deduplication ---');
  
  const testCases = [
    { 
      input: ['javascript', 'JavaScript', 'JS'], 
      expected: ['javascript'] 
    },
    { 
      input: ['tech', 'technology', 'tech community'], 
      expected: ['tech community'] 
    },
    { 
      input: ['AI', 'machine learning', 'artificial intelligence'], 
      expected: ['ai', 'machine learning', 'artificial intelligence'] 
    },
    { 
      input: ['web-dev', 'web development', 'frontend'], 
      expected: ['web development', 'frontend'] 
    },
    { 
      input: ['Python', 'python programming', 'programming'], 
      expected: ['python programming', 'programming'] 
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(test => {
    const result = deduplicateTags(test.input);
    // Check if arrays have the same elements regardless of order
    const success = result.length === test.expected.length && 
                    test.expected.every(tag => result.includes(tag));
    
    console.log(`${success ? '✓' : '✗'} deduplicateTags(${JSON.stringify(test.input)}) => ${JSON.stringify(result)} ${success ? '' : `(expected ${JSON.stringify(test.expected)})`}`);
    
    if (success) passed++;
    else failed++;
  });
  
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
}

// Test full AI tag processing
function testFullProcessing() {
  console.log('--- Testing Full AI Tag Processing ---');
  
  const testCases = [
    { 
      input: ['JavaScript', 'js', 'Web Development', 'react.js', 'Frontend'], 
      expected: ['javascript', 'web development', 'frontend'] 
    },
    { 
      input: ['AI', 'machine learning', 'Machine-Learning', 'artificial intelligence', 'data science'], 
      expected: ['ai', 'machine learning', 'artificial intelligence', 'data science'] 
    },
    { 
      input: ['tech community', 'Technology', 'innovation', 'startups', 'tech'], 
      expected: ['tech community', 'innovation', 'startups'] 
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(test => {
    const result = processAITags(test.input);
    // Check if arrays have the same elements regardless of order
    const success = result.length === test.expected.length && 
                    test.expected.every(tag => result.includes(tag));
    
    console.log(`${success ? '✓' : '✗'} processAITags(${JSON.stringify(test.input)}) => ${JSON.stringify(result)} ${success ? '' : `(expected ${JSON.stringify(test.expected)})`}`);
    
    if (success) passed++;
    else failed++;
  });
  
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
}

// Run the tests
console.log('\n==== TAG NORMALIZATION TESTS ====\n');
testNormalization();
testSimilarTagDetection();
testTagDeduplication();
testFullProcessing();
console.log('==== TESTS COMPLETE ====\n');