/**
 * Tests for file reading functionality
 * These tests verify that the file reading works correctly with .txt files
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


// Run all tests
async function runTests() {
  await testFileReading();
  console.log('\n✅ All file reading tests passed!');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
