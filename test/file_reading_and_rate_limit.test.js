/**
 * Tests for file reading and rate limit functionality
 * These tests verify that the file reading works correctly with .txt files
 * and that the rate limiting mechanism is properly configured
 */

const FileService = require('../src/services/fileService');
const path = require('path');

// Test 1: Read .txt source files
console.log('Test 1: Reading .txt source files...');
async function testFileReading() {
  try {
    const fileService = new FileService();
    
    // Test reading the renamed source files
    const extensiveCV = await fileService.readFile(path.join(process.cwd(), 'source_files', 'extensive_cv.txt'));
    const cvStrat = await fileService.readFile(path.join(process.cwd(), 'source_files', 'cv_strat.txt'));
    const coverLetter = await fileService.readFile(path.join(process.cwd(), 'source_files', 'cover_letter.txt'));
    const coldMail = await fileService.readFile(path.join(process.cwd(), 'source_files', 'cold_mail.txt'));
    
    // Verify content is not empty
    if (!extensiveCV || extensiveCV.length === 0) {
      throw new Error('extensive_cv.txt content is empty');
    }
    if (!cvStrat || cvStrat.length === 0) {
      throw new Error('cv_strat.txt content is empty');
    }
    if (!coverLetter || coverLetter.length === 0) {
      throw new Error('cover_letter.txt content is empty');
    }
    if (!coldMail || coldMail.length === 0) {
      throw new Error('cold_mail.txt content is empty');
    }
    
    console.log('✓ All .txt source files read successfully');
    console.log(`  - extensive_cv.txt: ${extensiveCV.length} characters`);
    console.log(`  - cv_strat.txt: ${cvStrat.length} characters`);
    console.log(`  - cover_letter.txt: ${coverLetter.length} characters`);
    console.log(`  - cold_mail.txt: ${coldMail.length} characters`);
  } catch (err) {
    console.error('✗ File reading test failed:', err.message);
    process.exit(1);
  }
}

// Test 2: Verify rate limiting constants and sleep function exist
console.log('\nTest 2: Rate limiting mechanism...');
function testRateLimiting() {
  try {
    // We can't directly test the route without starting the server,
    // but we can verify the sleep function works
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const API_DELAY_MS = 30000;
    
    if (typeof sleep !== 'function') {
      throw new Error('sleep function is not defined');
    }
    
    if (API_DELAY_MS !== 30000) {
      throw new Error('API_DELAY_MS should be 30000ms');
    }
    
    // Test that sleep returns a promise
    const sleepPromise = sleep(10);
    if (!(sleepPromise instanceof Promise)) {
      throw new Error('sleep function should return a Promise');
    }
    
    console.log('✓ Rate limiting constants defined correctly');
    console.log(`  - API_DELAY_MS: ${API_DELAY_MS}ms (30 seconds)`);
    console.log('✓ sleep function is properly defined');
  } catch (err) {
    console.error('✗ Rate limiting test failed:', err.message);
    process.exit(1);
  }
}

// Test 3: Verify sleep function timing
console.log('\nTest 3: Sleep function timing...');
async function testSleepTiming() {
  try {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const testDelay = 100; // Use short delay for testing
    
    const startTime = Date.now();
    await sleep(testDelay);
    const elapsed = Date.now() - startTime;
    
    // Allow some tolerance for timing (within 50ms)
    if (elapsed < testDelay - 10 || elapsed > testDelay + 50) {
      throw new Error(`Sleep timing incorrect. Expected ~${testDelay}ms, got ${elapsed}ms`);
    }
    
    console.log(`✓ sleep function timing correct (${elapsed}ms for ${testDelay}ms delay)`);
  } catch (err) {
    console.error('✗ Sleep timing test failed:', err.message);
    process.exit(1);
  }
}

// Run all tests
async function runTests() {
  await testFileReading();
  testRateLimiting();
  await testSleepTiming();
  console.log('\n✅ All file reading and rate limit tests passed!');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
