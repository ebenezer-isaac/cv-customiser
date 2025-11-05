"# CV Customiser - AI Job Application Assistant

A modular, AI-powered application that generates customized CVs, cover letters, and cold emails for job applications using Google's Gemini API.

## Features

- 🤖 **AI-Powered Generation**: Uses Google Gemini to create tailored application documents
- 📄 **CV Generation**: Generates LaTeX CVs with automatic 2-page validation and retry logic
- 📝 **Cover Letters & Emails**: Creates personalized cover letters and cold emails
- 📂 **Session Management**: Tracks all generated documents and chat history
- 🎨 **Modern UI**: Clean, responsive single-page application
- 🏗️ **Modular Architecture**: Organized into distinct services for maintainability

## Architecture

The application follows a modular architecture with clear separation of concerns:

```
cv-customiser/
├── src/
│   ├── services/           # Business logic services
│   │   ├── aiService.js           # Google Gemini API integration
│   │   ├── fileService.js         # File reading/writing operations
│   │   ├── documentService.js     # Document generation & LaTeX compilation
│   │   └── sessionService.js      # Session management
│   ├── routes/            # API route definitions
│   │   └── api.js                 # All API endpoints
│   └── server.js          # Main Express server
├── public/                # Frontend files
│   ├── index.html                 # Main HTML page
│   ├── styles.css                 # Styling
│   └── app.js                     # Frontend JavaScript
└── sessions/              # Generated session data (created at runtime)
```

## Prerequisites

- Node.js (v14 or higher)
- pdflatex (for LaTeX compilation)
- Google Gemini API key

### Installing pdflatex

**Ubuntu/Debian:**
```bash
sudo apt-get install texlive-latex-base texlive-latex-extra
```

**macOS:**
```bash
brew install --cask mactex
```

**Windows:**
Download and install [MiKTeX](https://miktex.org/download)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/ebenezer-isaac/cv-customiser.git
cd cv-customiser
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Add your Google Gemini API key to `.env`:
```env
GEMINI_API_KEY=your_api_key_here
PORT=3000
```

## Usage

1. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

2. Open your browser to `http://localhost:3000`

3. Fill in the job description and company information

4. (Optional) Upload your existing CV in supported formats (.tex, .pdf, .doc, .docx, .txt)

5. Click "Generate Documents" and wait for the AI to create your application materials

6. Review the generated documents and approve the session when satisfied

## API Endpoints

### POST /api/generate
Generate CV, cover letter, and cold email for a job application.

**Request:**
- `jobDescription` (required): Job description text
- `companyInfo` (required): Company and role information
- `cvFile` (optional): Existing CV file
- `sessionId` (optional): Continue an existing session

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid",
  "message": "Documents generated successfully",
  "results": {
    "cv": {
      "content": "LaTeX content...",
      "success": true,
      "pageCount": 2,
      "attempts": 1
    },
    "coverLetter": {
      "content": "Cover letter text..."
    },
    "coldEmail": {
      "content": "Email text..."
    }
  }
}
```

### GET /api/history
Get list of all sessions.

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "uuid",
      "createdAt": "timestamp",
      "updatedAt": "timestamp",
      "status": "completed",
      "approved": false,
      "companyInfo": "Company Name - Role",
      "hasFiles": true
    }
  ]
}
```

### GET /api/history/:session_id
Get detailed information for a specific session.

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "createdAt": "timestamp",
    "status": "completed",
    "jobDescription": "...",
    "companyInfo": "...",
    "chatHistory": [],
    "generatedFiles": {}
  }
}
```

### POST /api/refine
Refine generated content based on feedback (placeholder for future implementation).

**Request:**
- `sessionId` (required): Session ID
- `contentType` (required): Type of content to refine (cv, cover_letter, email)
- `feedback` (required): User feedback

### POST /api/approve/:session_id
Approve a session.

**Response:**
```json
{
  "success": true,
  "message": "Session approved",
  "session": {}
}
```

## Key Features

### CV Generation Loop
The application implements a critical validation loop for CV generation:

1. Generate CV content using AI
2. Compile LaTeX to PDF
3. Validate page count is exactly 2 pages
4. If validation fails, retry up to 3 times with modified prompts
5. Each retry includes specific instructions to adjust content length

### File Support
Supports reading context from multiple file formats:
- `.tex` - LaTeX files
- `.pdf` - PDF documents (text extraction)
- `.doc` / `.docx` - Microsoft Word documents
- `.txt` - Plain text files

### Session Management
All generated content and chat history are saved to unique session directories, allowing users to:
- Track generation history
- Review previous applications
- Approve completed sessions
- Access all generated files

## Services

### AIService
Handles all interactions with Google Gemini API:
- CV generation with retry-aware prompting
- Cover letter generation
- Cold email generation
- Content refinement

### FileService
Manages all file operations:
- Reading files in various formats
- Writing generated content
- JSON data persistence
- Directory management

### DocumentService
Handles document generation and compilation:
- LaTeX to PDF compilation
- Page count validation
- Retry logic for CV generation
- Content cleaning and formatting

### SessionService
Manages application sessions:
- Session creation and updates
- Chat history tracking
- File metadata storage
- Session listing and retrieval

## Development

The codebase is organized for easy maintenance and extension:

- **Modular Services**: Each service has a single responsibility
- **Decoupled Routes**: API routes are separate from server configuration
- **Clear Interfaces**: Services communicate through well-defined methods
- **Error Handling**: Comprehensive error handling at all levels
- **Async/Await**: Modern async patterns throughout

## Contributing

Contributions are welcome! Please ensure:
- Code follows the existing modular structure
- New features include appropriate error handling
- Documentation is updated for API changes

## License

MIT" 
