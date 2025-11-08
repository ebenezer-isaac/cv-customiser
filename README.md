# CV Customiser - AI Job Application Assistant

A sophisticated, modular AI-powered application that generates customized CVs, cover letters, and cold emails for job applications using Google's Gemini API with advanced prompting strategies.

## ✨ Key Features

- 🎯 **Dual-Mode Operation**: Support for both Hot (job posting) and Cold (company name) outreach workflows
- 🤖 **Sophisticated AI Prompting**: Multi-step generation with word count heuristics and intelligent retry logic
- 🎨 **Customizable AI Prompts**: All AI prompts stored in `src/prompts.json` for easy customization without code changes
- 🔄 **AI Service Failsafe**: Automatic retry mechanism with exponential backoff for 503 errors (3 attempts, 1s → 2s → 4s delays)
- 📡 **Real-Time Progress Streaming**: Server-Sent Events (SSE) for live generation progress updates
- 📋 **Collapsible Logs**: Generation logs displayed in expandable details section for clean UI
- 🎯 **Accurate Prompt Display**: Shows original user input (URLs) instead of scraped content
- 💾 **Rich Chat History**: Stores complete results, logs, and metadata for perfect session restoration
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
- 🔐 **Security**: SSRF protection with IP validation to prevent access to private networks
- ✉️ **Email Integration**: Mailto links for cold emails with auto-extracted recipient addresses
- 📥 **Document Downloads**: Download cover letters as .docx files
- 📝 **Editable Content**: Edit generated content directly in the UI with auto-save
- 🔍 **Company Profiling**: AI-powered company research for cold outreach
- 👥 **Target Persona Identification**: Automatically suggests relevant job titles based on your CV

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
│   ├── utils/               # Utility functions
│   │   └── urlUtils.js            # URL validation and scraping with SSRF protection
│   ├── errors/              # Custom error classes
│   │   └── AIFailureError.js      # AI service failure handling
│   ├── prompts.json         # Centralized AI prompt templates
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

The application supports two distinct modes of operation:

### 🔥 Standard Mode (Job Posting)

For when you have a specific job posting and want to tailor your application materials to it.

**Documents Generated**: CV + Cover Letter

**Generation Flow:**

1. **Job Analysis**: 
   - User pastes job description or URL
   - AI extracts company name and job title
   - Creates session directory: `documents/2025-11-05_Google_SeniorEngineer/`

2. **Source Loading**:
   - Loads `original_cv.tex` (2-page base CV)
   - Loads `extensive_cv.doc` (master CV with all projects)
   - Loads strategy guides (cv_strat.pdf, cover_letter.pdf)

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
   - Automatically includes current date

5. **Logging**:
   - All steps logged to `chat_history.json`
   - Session metadata saved to `session.json`

### ❄️ Cold Outreach Mode (Company Name)

For when you want to reach out to a company proactively without a specific job posting.

**Documents Generated**: CV + Cold Email

**Cold Outreach Flow:**

1. **Company Research**:
   - User provides company name
   - AI generates comprehensive company profile
   - Extracts or infers generic contact email

2. **Target Persona Identification**:
   - Loads your CV to analyze skills and experience
   - AI identifies 3-5 relevant job titles you could target at the company
   - Examples: "Senior Software Engineer", "Technical Lead", "Backend Developer"

3. **Contact Search** (Optional - if Apollo.io integration enabled):
   - Searches Apollo.io database for relevant contacts
   - Filters to contacts with verified/guessed emails
   - Selects best contact based on title match and email quality

4. **CV Generation**:
   - Uses company profile as synthetic "job description"
   - Tailors CV to company's industry and technology stack
   - Maintains 2-page format with validation

5. **Cold Email Generation**:
   - **If specific contact found**: Generates hyper-personalized email
     - References contact's name and title
     - Explains why reaching out to them specifically
     - Tailored to their role and company
   - **If no contact found**: Generates professional generic email
     - Addressed to hiring team or generic email
     - Professional but still personalized to company
   - Both formats under 150 words, scannable, with clear CTA

6. **Session Storage**:
   - Saves CV, email, and all metadata
   - Logs complete workflow for reference

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

The application uses 12 specialized AI prompts stored in `src/prompts.json` for maximum quality and customizability:

### Hot Outreach Prompts

**1. Job Details Extraction**
- Parses job description
- Extracts company name and exact job title
- Returns structured JSON

**2. Advanced CV Generation**
- Step-by-step surgical editing
- Keyword mirroring from job description
- Word count heuristic (±10%) to preserve layout
- Replaces weak points with strong matches from extensive CV

**3. CV Page Count Fix**
- Triggered if compilation ≠ 2 pages
- Provides actual page count feedback
- Instructs conciseness without truncation
- Prioritizes job-relevant content

**4. Advanced Cover Letter**
- Uses validated CV as only source
- Targets 2-3 critical job requirements
- Includes quantifiable achievements
- Professional business format

**5. Advanced Cold Email (Hot Outreach)**
- Maximum 150 words
- Compelling 5-7 word subject line
- One killer achievement
- Low-friction call-to-action

**6. Chat-Based Refinement**
- Context-aware with conversation history
- Applies specific user feedback
- Maintains document structure
- Respects layout constraints for CVs

### Cold Outreach Prompts

**7. Company Profile Generation**
- Researches company based on name
- Generates comprehensive business overview
- Identifies industry, products, tech stack
- Infers or suggests generic contact email

**8. Target Persona Identification**
- Analyzes candidate's CV skills and experience
- Identifies 3-5 relevant job titles for the target company
- Considers both technical and leadership roles
- Returns realistic, achievable positions

**9. Personalized Cold Email**
- Hyper-personalized for specific contact
- References contact's name and title
- Explains why reaching out to them specifically
- Under 150 words, compelling subject line

**10. Generic Cold Email**
- Professional email for general company contact
- Addressed to hiring team or generic email
- Shows genuine interest in company
- Clear, low-friction call-to-action

### Utility Prompts

**11. CV Change Summary**
- Compares original and new CV
- Generates bullet-pointed summary
- Highlights added, removed, modified content
- Focuses on significant changes

**12. Job Description Extraction**
- Cleans scraped web content
- Extracts only relevant job description
- Removes navigation, headers, footers
- Returns clean job posting text

### 🎨 Customizing AI Prompts

All AI prompts are stored in `src/prompts.json` for easy customization without modifying code:

**Structure:**
```json
{
  "promptKey": "Your prompt template with {{placeholders}}",
  "anotherPrompt": "Template with {{variable1}} and {{variable2}}"
}
```

**How to Customize:**

1. Open `src/prompts.json` in your editor
2. Find the prompt you want to customize (e.g., `generateColdEmailAdvanced`)
3. Modify the template text while keeping `{{placeholder}}` syntax intact
4. Save the file - changes take effect on next server restart
5. No code changes required!

**Example Customization:**

Original prompt for cold emails might emphasize brevity. You could modify it to:
- Be more formal or casual
- Include specific call-to-action language
- Emphasize different aspects of your background
- Change the subject line style

**Available Placeholders:**

Each prompt has specific placeholders like `{{companyName}}`, `{{jobTitle}}`, `{{validatedCVText}}`, etc. Check the existing prompt to see which placeholders are available.

## 🔐 Security Features

### SSRF Protection
The application includes comprehensive Server-Side Request Forgery (SSRF) protection:
- **IP Validation**: All URLs are resolved to IP addresses before making requests
- **Private Network Blocking**: Blocks access to:
  - Loopback addresses (127.0.0.0/8, ::1)
  - Private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - Link-local addresses (169.254.0.0/16, fe80::/10)
  - Reserved ranges
- **DNS Resolution**: Uses Node.js DNS module to resolve hostnames
- **ipaddr.js Library**: Validates IP address ranges for both IPv4 and IPv6

### XSS Prevention
- Log rendering uses DOM methods instead of innerHTML
- All user content properly escaped before display
- Template literals sanitized

### Input Validation
- Session IDs sanitized before use in URLs
- Content length checks prevent DoS attacks
- URL validation with `validator` library
- Filename sanitization for secure file operations

## 📋 Prerequisites

- Node.js (v14 or higher)
- pdflatex (for LaTeX compilation)
- Poppler utilities (for PDF text extraction)
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

### Installing Poppler (for PDF text extraction)

The application uses `pdftotext` from Poppler utilities to extract text from PDF files.

**Ubuntu/Debian:**
```bash
sudo apt-get install poppler-utils
```

**macOS:**
```bash
brew install poppler
```

**Windows:**
1. Download Poppler for Windows from [this link](https://blog.alivate.com.au/poppler-windows/)
2. Extract the archive to a location (e.g., `C:\Program Files\poppler`)
3. Add the `bin` directory to your system PATH
4. Restart your terminal/command prompt

**Verify Installation:**
```bash
pdftotext -v
```

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

**Standard Mode (Job Posting):**

1. **Paste Job Description**: Copy the full job posting or URL into the text area
2. **Generate**: Click send to start generation
3. **Wait**: AI processes through the complete workflow (1-2 minutes)
4. **Review**: Check the generated CV and cover letter
5. **Edit**: Modify content directly in the UI with auto-save
6. **Refine** (optional): Provide feedback to improve any document
7. **Download**: Download cover letter as .docx
8. **Approve**: Lock the session when you're satisfied

**Cold Outreach Mode:**

1. **Toggle Mode**: Switch to cold outreach mode using the toggle
2. **Enter Company Name**: Type the company name (e.g., "Google", "Microsoft")
3. **Generate**: Click send to start cold outreach workflow
4. **AI Research**: System researches company and identifies target personas from your CV
5. **Contact Search** (if Apollo.io enabled): Searches for relevant contacts
6. **Review**: Check the tailored CV and personalized/generic cold email
7. **Edit & Send**: Modify if needed, then use the email client button to send
8. **Track**: Session saved with all details for follow-up reference

## 🔌 API Endpoints

### POST /api/generate
Generate documents using sophisticated AI prompts.

**Supports two modes:**
1. **Standard Mode**: Generates CV + Cover Letter (default)
2. **Cold Outreach Mode**: Generates CV + Cold Email (set `mode: "cold_outreach"`)

**Streaming:**
- **Server-Sent Events (SSE)**: Real-time progress streaming (set `Accept: text/event-stream` header)
- **Regular JSON Response**: Standard response format

**Request:**
```json
{
  "input": "Job posting URL or full job description text (or company name for cold outreach)",
  "sessionId": "optional-existing-session-id",
  "mode": "cold_outreach" // Optional: omit for standard mode
}
```

### POST /api/refine
Refine content based on user feedback with chat history context.

### POST /api/approve/:session_id
Approve and lock a session to prevent further changes.

### POST /api/save-content
Save edited cover letter or cold email content.

### GET /api/download/cover-letter/:sessionId
Download cover letter as .docx file.

### GET /api/download/cold-email/:sessionId
Download cold email as .txt file.

### GET /api/history
List all generation sessions.

### GET /api/history/:session_id
Get detailed session information including chat history.

### POST /api/upload-source-doc
Upload and replace source documents (original_cv.tex or extensive_cv.doc).

## 🛠️ Technical Details

### Services Architecture

#### AIService
Handles all interactions with Google Gemini API:
- **Centralized prompts**: Loads all AI prompts from `src/prompts.json`
- **Hot Outreach Functions**:
  - Job details extraction with JSON parsing
  - Advanced CV generation with word count heuristics
  - Intelligent retry prompts for page count fixes
  - Cover letter generation from validated CV
  - Cold email generation with brevity focus
  - Context-aware content refinement
  - Email address extraction from job descriptions
- **Cold Outreach Functions**:
  - Company profile generation and research
  - Target persona identification from CV
  - Personalized cold email for specific contacts
  - Generic cold email for general outreach
- **Utility Functions**:
  - CV change summary generation
  - Job description content extraction
  - Template injection with `getPrompt()` helper
- Automatic retry mechanism with exponential backoff for 503 errors

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
- Descriptive filename generation

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
- `.pdf` - PDF documents (text extraction via pdftotext)
- `.doc`/`.docx` - Word documents (via mammoth)
- `.txt` - Plain text

### Session Structure
Each session directory contains:
```
documents/2025-11-05_Google_SeniorEngineer/
├── session.json                                          # Session metadata
├── chat_history.json                                     # Detailed step-by-step log
├── 2025-11-05_Google_SeniorEngineer_username_CV.tex    # LaTeX source
├── 2025-11-05_Google_SeniorEngineer_username_CV.pdf    # Compiled PDF
├── 2025-11-05_Google_SeniorEngineer_username_CoverLetter.txt
└── 2025-11-05_Google_SeniorEngineer_username_ColdEmail.txt
```

## 🎨 User Interface Features

### Real-Time Progress Streaming
- Live log display during document generation
- Collapsible details section for clean UI
- Visual indicators (ℹ️, ✓, ✗, ⚠)
- Shows original user input (URLs) instead of scraped content

### Rich Content Display
- **CV Section**: Change summary and embedded PDF preview
- **Cover Letter Section**: Editable textarea with auto-save and download
- **Cold Email Section**: Editable textarea with mailto link and download
- Visual status badges (success/warning/error)

### Session Management
- Sidebar with chat history
- Session titles show company and job title
- Click to load previous sessions
- New chat button to start fresh
- Settings panel for document preferences

### Generation Preferences
- Toggle switches in Settings panel
- Per-request overrides with input area toggles
- Choose which documents to generate
- Preferences saved to localStorage

### Content Editing
- Direct editing of cover letters and cold emails
- Auto-save when clicking outside textarea
- Download buttons for finalized content
- Copy-paste friendly formatting

### Email Integration
- Automatic email address extraction
- "Open in Email Client" button
- Pre-filled mailto links with:
  - To: Extracted recipient email(s)
  - Subject: From cold email
  - Body: Cold email content

## 📚 Development

The codebase is organized for easy maintenance and extension:

- **Modular Services**: Each service has a single responsibility
- **Decoupled Routes**: API routes are separate from server configuration
- **Clear Interfaces**: Services communicate through well-defined methods
- **Error Handling**: Comprehensive error handling at all levels
- **Async/Await**: Modern async patterns throughout
- **Security Best Practices**: Input validation, sanitization, and SSRF protection

## 🧪 Testing

The repository includes test files:
- `test/aiService.test.js` - Unit tests for AI service
- `test/api_routes_integration.test.js` - Integration tests for API routes
- `test/file_reading_and_rate_limit.test.js` - File handling and rate limit tests

Run tests with:
```bash
npm test
```

## 🤝 Contributing

Contributions are welcome! Please ensure:
- Code follows the existing modular structure
- New features include appropriate error handling
- Security best practices are maintained
- Documentation is updated for API changes

## 📄 License

MIT

## 🔒 Security Summary

### Security Improvements
- SSRF protection with IP validation
- XSS prevention in log rendering
- Input sanitization for session IDs and filenames
- Content length limits to prevent DoS
- URL validation before scraping
- Proper error handling without information leakage
- Configurable credentials via environment variables

### Known Issues
Pre-existing path injection vulnerabilities in `fileService.js` should be addressed in future updates. These are not related to the recent feature additions but should be prioritized for security hardening.

## 🙏 Acknowledgments

Built with:
- Google Gemini API for AI generation
- Express.js for the backend
- Axios for HTTP requests
- Cheerio for web scraping
- Mammoth for Word document parsing
- Multer for file uploads
- ipaddr.js for IP validation
- validator for URL validation
