"# CV Customiser - AI Job Application Assistant

A sophisticated, modular AI-powered application that generates customized CVs, cover letters, and cold emails for job applications using Google's Gemini API with advanced prompting strategies.

## ✨ Key Features

- 🤖 **Sophisticated AI Prompting**: Multi-step generation with word count heuristics and intelligent retry logic
- 🔄 **AI Service Failsafe**: Automatic retry mechanism with exponential backoff for 503 errors (3 attempts, 1s → 2s → 4s delays)
- 📄 **Smart CV Generation**: Surgical editing of base CV using extensive CV database, with 2-page validation
- 🔍 **AI Change Summary**: Automatic generation of bullet-pointed CV change summaries
- 📋 **In-Chat PDF Viewer**: Preview generated CV PDFs directly in the chat interface
- 📝 **Comprehensive Documents**: Generates CV, cover letter, and cold email in one workflow
- 🏷️ **Descriptive File Naming**: All files named with date, company, job title, and username
- 🔄 **Iterative Refinement**: Chat-based interface for refining generated content
- 📂 **Organized Sessions**: Auto-named directories (`YYYY-MM-DD_CompanyName_JobTitle`)
- 🔒 **Session Locking**: Approve sessions to prevent further modifications
- 📊 **Complete Logging**: All generation steps logged to `chat_history.json`
- 🎨 **Structured UI**: Clean sections for CV, Cover Letter, and Cold Email with easy copy-pasting
- 🛡️ **Partial Success Handling**: Graceful degradation when AI service fails for some documents

## 🏗️ Architecture

The application follows a modular architecture with clear separation of concerns:

```
cv-customiser/
├── source_files/              # Knowledge base (CV templates & strategies)
│   ├── original_cv.tex        # 2-page base CV template
│   ├── extensive_cv.doc       # Master CV with additional projects
│   ├── cv_strat.pdf          # CV writing strategies
│   ├── cover_letter.pdf      # Cover letter strategies
│   └── cold_mail.pdf         # Cold email strategies
├── src/
│   ├── services/             # Business logic services
│   │   ├── aiService.js            # Google Gemini API with sophisticated prompts
│   │   ├── fileService.js          # File reading/writing (.tex, .doc, .pdf)
│   │   ├── documentService.js      # LaTeX compilation & validation
│   │   └── sessionService.js       # Session & chat history management
│   ├── routes/              # API route definitions
│   │   └── api_advanced.js        # Enhanced endpoints with full features
│   └── server.js            # Main Express server
├── public/                  # Frontend SPA
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── documents/               # Generated sessions (created at runtime)
│   └── YYYY-MM-DD_Company_Title/
│       ├── session.json
│       ├── chat_history.json
│       ├── generated_cv.tex
│       ├── generated_cv.pdf
│       ├── cover_letter.txt
│       └── cold_email.txt
└── package.json
```

## 🚀 How It Works

### Generation Flow

1. **Job Analysis**: 
   - User pastes job description
   - AI extracts company name and job title
   - Creates session directory: `documents/2025-11-05_Google_SeniorEngineer/`

2. **Source Loading**:
   - Loads `original_cv.tex` (2-page base CV)
   - Loads `extensive_cv.doc` (master CV with all projects)
   - Loads strategy guides (cv_strat.pdf, cover_letter.pdf, cold_mail.pdf)

3. **CV Generation** (Critical Loop):
   - **Attempt 1**: AI surgically edits original CV using extensive CV
     - Mirrors keywords from job description
     - Replaces irrelevant content with relevant projects
     - Maintains word count to preserve 2-page layout
   - **Compile & Validate**: Runs pdflatex, checks page count
   - **If ≠ 2 pages**: Retry with modified prompt (up to 3 attempts)
   - **Success**: Proceed to next step

4. **Cover Letter Generation**:
   - Uses validated CV text as source of truth
   - Highlights 2-3 key qualifications matching job requirements
   - 300-400 words, professional business format

5. **Cold Email Generation**:
   - Brief, scannable format (under 150 words)
   - Includes compelling subject line
   - One standout achievement
   - Clear call-to-action

6. **Logging**:
   - All steps logged to `chat_history.json`
   - Session metadata saved to `session.json`

### Refinement Flow

- User provides feedback: "Make cover letter more formal"
- AI loads current content + chat history for context
- Applies specific changes while preserving structure
- If refining CV: recompiles and validates page count
- Updates files and chat history

### Approval Flow

- User reviews all generated documents
- Clicks "Approve" when satisfied
- Session locked - no further modifications allowed
- Perfect for final submission tracking

## 📝 Sophisticated AI Prompting

The application uses 6 specialized AI prompts for maximum quality:

### 1. Job Details Extraction
- Parses job description
- Extracts company name and exact job title
- Returns structured JSON

### 2. Advanced CV Generation
- Step-by-step surgical editing
- Keyword mirroring from job description
- Word count heuristic (±10%) to preserve layout
- Replaces weak points with strong matches from extensive CV

### 3. CV Page Count Fix
- Triggered if compilation ≠ 2 pages
- Provides actual page count feedback
- Instructs conciseness without truncation
- Prioritizes job-relevant content

### 4. Advanced Cover Letter
- Uses validated CV as only source
- Targets 2-3 critical job requirements
- Includes quantifiable achievements
- Professional business format

### 5. Advanced Cold Email
- Maximum 150 words
- Compelling 5-7 word subject line
- One killer achievement
- Low-friction call-to-action

### 6. Chat-Based Refinement
- Context-aware with conversation history
- Applies specific user feedback
- Maintains document structure
- Respects layout constraints for CVs

## 📋 Prerequisites

- Node.js (v14 or higher)
- pdflatex (for LaTeX compilation)
- Google Gemini API key

## 🆕 New Features

### AI Service Failsafe
The application now includes automatic retry logic for AI service failures:
- **Automatic Retries**: Up to 3 attempts for 503 Service Unavailable errors
- **Exponential Backoff**: Delays increase progressively (1s → 2s → 4s)
- **Graceful Degradation**: Returns partial success with any successfully generated documents
- **User-Friendly Messages**: Clear error messages when AI service is unavailable

### Structured UI Output
Documents are now displayed in a clean, organized format:
- **📄 CV Section**: Shows change summary and embedded PDF preview
- **📧 Cover Letter Section**: Easily copyable with clear formatting
- **✉️ Cold Email Section**: Ready to copy and send
- Each section has visual status indicators (success/warning/error)

### In-Chat PDF Viewer
- Generated CV PDFs are embedded directly in the chat interface
- No need to download files to preview them
- Instant visual feedback on CV layout and formatting

### AI-Powered CV Change Summary
- Automatically generates a bullet-pointed summary of CV changes
- Compares original CV with newly generated version
- Highlights added, removed, and modified content
- Focuses on meaningful changes, not just formatting

### Descriptive File Naming
All generated files use a standardized naming convention:
```
[YYYY-MM-DD]_[CompanyName]_[JobTitle]_[UserName]_[DocumentType].ext
```
Examples:
- `2025-11-05_Google_SeniorEngineer_ebenezer-isaac_CV.pdf`
- `2025-11-05_Acme_DataScientist_ebenezer-isaac_CoverLetter.txt`

Benefits:
- Easy identification of files by date and job
- No filename conflicts across different applications
- Professional organization of job application materials

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

## 💻 Installation & Usage

### Installation

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

4. Add your Google Gemini API key and username to `.env`:
```env
GEMINI_API_KEY=your_api_key_here
PORT=3000
USER_NAME=your-github-username
```

### Running the Application

**Production:**
```bash
npm start
```

**Development** (with auto-reload):
```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

### Using the Application

1. **Paste Job Description**: Copy the full job posting into the text area
2. **Generate**: Click "Generate Documents" 
3. **Wait**: AI processes through the complete workflow (1-2 minutes)
4. **Review**: Check the generated CV, cover letter, and cold email
5. **Refine** (optional): Provide feedback to improve any document
6. **Approve**: Lock the session when you're satisfied
7. **Download**: Access all files from the session directory

## 🔌 API Endpoints

### POST /api/generate
Generate CV, cover letter, and cold email using sophisticated AI prompts.

**Request:**
```json
{
  "jobDescription": "Full job posting text",
  "sessionId": "optional-existing-session-id"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "2025-11-05_Google_SeniorEngineer",
  "companyName": "Google",
  "jobTitle": "Senior Engineer",
  "results": {
    "cv": {
      "content": "\\documentclass...",
      "success": true,
      "pageCount": 2,
      "attempts": 1
    },
    "coverLetter": {
      "content": "Dear Hiring Manager..."
    },
    "coldEmail": {
      "content": "Subject: Senior Engineer at Google\n\nHi..."
    }
  }
}
```

### POST /api/refine
Refine content based on user feedback with chat history context.

**Request:**
```json
{
  "sessionId": "2025-11-05_Google_SeniorEngineer",
  "contentType": "cover_letter",
  "feedback": "Make it more formal and add metrics"
}
```

**Response:**
```json
{
  "success": true,
  "refinedContent": "Updated content..."
}
```

### POST /api/approve/:session_id
Approve and lock a session to prevent further changes.

**Response:**
```json
{
  "success": true,
  "message": "Session approved and locked"
}
```

### GET /api/history
List all generation sessions.

### GET /api/history/:session_id
Get detailed session information including chat history from file.

## 🛠️ Technical Details

### Services Architecture

#### AIService
Handles all interactions with Google Gemini API:
- Job details extraction with JSON parsing
- Advanced CV generation with word count heuristics
- Intelligent retry prompts for page count fixes
- Cover letter generation from validated CV
- Cold email generation with brevity focus
- Context-aware content refinement

#### FileService
Manages all file operations:
- Multi-format reading (.tex, .pdf, .doc, .docx, .txt)
- JSON data persistence
- Directory management
- File existence checks

#### DocumentService
Handles document generation and compilation:
- LaTeX to PDF compilation via pdflatex
- PDF page count validation
- PDF text extraction
- Advanced retry logic with logging callbacks
- Content cleaning (removes markdown artifacts)

#### SessionService
Manages application sessions:
- Smart directory naming (YYYY-MM-DD_Company_Title)
- Session creation and updates
- Chat history logging to separate JSON file
- Session locking on approval
- Session listing and retrieval

### File Support
Reads context from multiple formats:
- `.tex` - LaTeX files (direct read)
- `.pdf` - PDF documents (text extraction via pdf-parse)
- `.doc`/`.docx` - Word documents (via mammoth)
- `.txt` - Plain text

### Session Structure
Each session directory contains:
```
documents/2025-11-05_Google_SeniorEngineer/
├── session.json                                          # Session metadata
├── chat_history.json                                     # Detailed step-by-step log
├── 2025-11-05_Google_SeniorEngineer_username_CV.tex    # LaTeX source
├── 2025-11-05_Google_SeniorEngineer_username_CV.pdf    # Compiled PDF (if successful)
├── 2025-11-05_Google_SeniorEngineer_username_CoverLetter.txt  # Cover letter
└── 2025-11-05_Google_SeniorEngineer_username_ColdEmail.txt    # Cold email
```

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
