require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import services
const AIService = require('./services/aiService');
const FileService = require('./services/fileService');
const DocumentService = require('./services/documentService');
const SessionService = require('./services/sessionService');

// Import routes
const createApiRoutes = require('./routes/api_advanced');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve generated documents
app.use('/documents', express.static(path.join(__dirname, '../documents')));

// Initialize services
const fileService = new FileService();
const aiService = new AIService();
const documentService = new DocumentService(fileService);
const sessionService = new SessionService(fileService);

// Initialize session service
sessionService.initialize().catch(error => {
  console.error('Failed to initialize session service:', error);
});

// API Routes
const services = {
  aiService,
  fileService,
  documentService,
  sessionService
};

app.use('/api', createApiRoutes(services));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 CV Customiser Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Server running on port ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

module.exports = app;
