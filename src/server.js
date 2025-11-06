const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

// Validate required configuration
config.validateConfig();

// Import services
const AIService = require('./services/aiService');
const FileService = require('./services/fileService');
const DocumentService = require('./services/documentService');
const SessionService = require('./services/sessionService');
const ApolloService = require('./services/apolloService');
const DisambiguationService = require('./services/disambiguationService');

// Import routes
const createApiRoutes = require('./routes/api_advanced');

// Initialize Express app
const app = express();
const PORT = config.server.port;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve generated documents
app.use('/documents', express.static(path.join(__dirname, '../documents')));

// Initialize services
console.log('[DEBUG] Server: Initializing services...');
const fileService = new FileService();
console.log('[DEBUG] Server: FileService initialized');
const aiService = new AIService();
console.log('[DEBUG] Server: AIService initialized');
const documentService = new DocumentService(fileService);
console.log('[DEBUG] Server: DocumentService initialized');
const sessionService = new SessionService(fileService);
console.log('[DEBUG] Server: SessionService initialized');
const apolloService = new ApolloService();
console.log('[DEBUG] Server: ApolloService initialized');
const disambiguationService = new DisambiguationService();
console.log('[DEBUG] Server: DisambiguationService initialized');

// Initialize session service
console.log('[DEBUG] Server: Initializing session storage...');
sessionService.initialize().catch(error => {
  console.error('[DEBUG] Server: Failed to initialize session service:', error);
  console.error('Failed to initialize session service:', error);
});

// API Routes
const services = {
  aiService,
  fileService,
  documentService,
  sessionService,
  apolloService,
  disambiguationService
};

console.log('[DEBUG] Server: Mounting API routes at /api');
app.use('/api', createApiRoutes(services));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('[DEBUG] Server: Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[DEBUG] Server: Error caught by error handling middleware:', err);
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(config.server.nodeEnv === 'development' && { stack: err.stack })
  });
});

// Start server
console.log(`[DEBUG] Server: Starting server on port ${PORT}...`);
app.listen(PORT, () => {
  console.log('[DEBUG] Server: Server started successfully');
  console.log(`\n🚀 CV Customiser Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Server running on port ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

module.exports = app;
