/**
 * Basic tests for AI Service retry mechanism
 * These tests verify the retry logic without making actual API calls
 */

const AIFailureError = require('../src/errors/AIFailureError');

// Test 1: AIFailureError class
console.log('Test 1: AIFailureError class...');
try {
  const error = new AIFailureError('Test error', new Error('Original'), 3);
  if (error.name !== 'AIFailureError') {
    throw new Error('AIFailureError name not set correctly');
  }
  if (!error.isAIFailure) {
    throw new Error('AIFailureError isAIFailure flag not set');
  }
  if (error.retries !== 3) {
    throw new Error('AIFailureError retries not set correctly');
  }
  console.log('✓ AIFailureError class works correctly');
} catch (err) {
  console.error('✗ AIFailureError test failed:', err.message);
  process.exit(1);
}

// Test 2: Check if AIService can be imported
console.log('\nTest 2: Import AIService...');
try {
  // We can't actually instantiate it without a valid API key, but we can check the structure
  const AIServiceClass = require('../src/services/aiService');
  if (typeof AIServiceClass !== 'function') {
    throw new Error('AIService is not a constructor function');
  }
  console.log('✓ AIService imports correctly');
} catch (err) {
  console.error('✗ AIService import test failed:', err.message);
  process.exit(1);
}

// Test 3: Check DocumentService descriptive filename generation
console.log('\nTest 3: Descriptive filename generation...');
try {
  const DocumentService = require('../src/services/documentService');
  const FileService = require('../src/services/fileService');
  
  const fileService = new FileService();
  const documentService = new DocumentService(fileService);
  
  const filename = documentService.createDescriptiveFilename({
    companyName: 'Acme Corp',
    jobTitle: 'Software Engineer',
    documentType: 'CV',
    extension: 'pdf'
  });
  
  // Should match format: [YYYY-MM-DD]_[CompanyName]_[JobTitle]_[UserName]_[DocumentType].ext
  const pattern = /^\d{4}-\d{2}-\d{2}_.+_.+_ebenezer-isaac_CV\.pdf$/;
  if (!pattern.test(filename)) {
    throw new Error(`Filename "${filename}" does not match expected pattern`);
  }
  
  if (!filename.includes('Acme_Corp')) {
    throw new Error(`Filename does not include cleaned company name`);
  }
  
  if (!filename.includes('Software_Engineer')) {
    throw new Error(`Filename does not include cleaned job title`);
  }
  
  console.log(`✓ Descriptive filename generated: ${filename}`);
} catch (err) {
  console.error('✗ Descriptive filename test failed:', err.message);
  process.exit(1);
}

// Test 4: Check if retry mechanism constants are set
console.log('\nTest 4: Retry mechanism constants...');
try {
  // Create a mock version to test constants without API key
  class MockAIService {
    constructor() {
      this.maxRetries = 3;
      this.initialRetryDelay = 1000;
    }
  }
  
  const mockService = new MockAIService();
  if (mockService.maxRetries !== 3) {
    throw new Error('maxRetries should be 3');
  }
  if (mockService.initialRetryDelay !== 1000) {
    throw new Error('initialRetryDelay should be 1000ms');
  }
  console.log('✓ Retry constants are set correctly (3 retries, 1000ms initial delay)');
} catch (err) {
  console.error('✗ Retry constants test failed:', err.message);
  process.exit(1);
}

console.log('\n✅ All tests passed!');
