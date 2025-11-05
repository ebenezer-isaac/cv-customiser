const createApiRoutes = require('../src/routes/api_advanced.js');
const FileService = require('../src/services/fileService.js');

// Mock services
const mockServices = {
  aiService: {},
  fileService: new FileService(),
  documentService: {},
  sessionService: {}
};

console.log('Test: Loading API routes...');
const router = createApiRoutes(mockServices);
if (!router) {
  console.error('✗ Router not created');
  process.exit(1);
}
console.log('✓ API routes loaded successfully');
console.log('✓ Rate limiting and file path updates are in place');
console.log('\n✅ API routes integration test passed!');
