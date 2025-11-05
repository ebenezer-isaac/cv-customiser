# CV Customiser Next.js Architecture

## File Storage and Processing Pipeline

### Storage Architecture

#### Firebase Storage Structure
```
users/
  {userId}/
    source_files/
      original_cv.tex          # User's base CV template
      extensive_cv.txt         # Extended CV with all experiences
      cv_strategy.txt          # CV writing guidelines
      cover_letter_strategy.txt # Cover letter guidelines
      cold_email_strategy.txt  # Cold email guidelines
    sessions/
      {sessionId}/
        session.json           # Session metadata
        chat_history.json      # Conversation logs
        generated_files/
          {date}_{company}_{title}_CV.tex
          {date}_{company}_{title}_CV.pdf
          {date}_{company}_{title}_CoverLetter.txt
          {date}_{company}_{title}_ColdEmail.txt
```

### Processing Pipeline

#### Document Generation Flow

1. **Initial Request** (`POST /api/generate`)
   - User submits job description or URL
   - Server validates authentication (Firebase ID token)

2. **Source Files Loading**
   - Source files are **downloaded from Firebase Storage into memory** (as text strings)
   - This happens once per generation request
   - No local file caching between requests
   - Files are read using FileService.readFileFromStorage()

3. **AI Processing**
   - Source file contents (strings) are passed to Gemini API
   - Gemini returns generated content as text strings
   - No files involved in AI communication

4. **LaTeX Compilation** (CV only)
   - Generated LaTeX content is written to a **temporary local directory** (`/tmp/cv-gen-{timestamp}/`)
   - `pdflatex` runs locally to compile .tex → .pdf (requires local filesystem)
   - Compilation is synchronous and happens during the request

5. **Result Upload**
   - Generated .tex and .pdf files are **uploaded to Firebase Storage**
   - Stored at: `users/{userId}/sessions/{sessionId}/generated_files/`
   - Original temp directory is deleted

6. **Response**
   - API returns content as JSON (for immediate display)
   - File paths in Firebase Storage are stored in session metadata

#### File Download Flow

1. **User Request** (`GET /api/download/cv/{sessionId}`)
   - User clicks download button in UI
   - Server validates authentication

2. **Generate Signed URL**
   - Server retrieves file path from session metadata
   - Generates temporary signed URL (15 minutes expiry)
   - Returns redirect to signed URL

3. **Direct Download**
   - User's browser downloads directly from Firebase Storage CDN
   - No server bandwidth used for file transfer

### Key Design Decisions

#### Why No Local File Caching?
- **Stateless API**: Each request is independent
- **Horizontal Scaling**: Multiple server instances don't share filesystem
- **Simplified Deployment**: No persistent local storage needed
- **Security**: Files are always pulled from authoritative source

#### Why Temp Directory for Compilation?
- **pdflatex Requirement**: LaTeX compiler requires local filesystem
- **Process Isolation**: Each compilation in separate directory
- **Automatic Cleanup**: OS handles temp directory cleanup

#### Why Upload Generated Files to Firebase?
- **Persistence**: Files survive server restarts
- **User Access**: Users can re-download files later
- **History**: Full session history with all generated documents
- **Sharing**: Could enable file sharing via signed URLs

### Performance Considerations

#### Source File Downloads
- **Per-Request**: ~5 files × 50KB average = 250KB download
- **Time**: ~100-200ms for all files (Firebase CDN is fast)
- **Acceptable**: Compared to AI generation (5-30 seconds)

#### Generated File Uploads
- **CV PDF**: ~100KB
- **Cover Letter**: ~5KB
- **Cold Email**: ~2KB
- **Total**: ~107KB upload per generation
- **Time**: ~50-100ms (Firebase CDN)

#### Temporary Storage
- **Local Disk**: ~5MB per active compilation
- **Cleanup**: Automatic after each request
- **Concurrent**: Limited by server capacity, not filesystem

### Scalability

This architecture supports:
- **Horizontal Scaling**: Add more Next.js server instances
- **No Shared State**: Each instance is independent
- **Cloud Functions**: Could move to serverless if needed
- **CDN Benefits**: Firebase Storage provides global CDN

### Security

- **Authentication**: All API routes protected by Firebase Auth
- **Authorization**: Users can only access their own files
- **Isolation**: User files stored in user-specific paths
- **Temporary Access**: Download URLs expire after 15 minutes
- **No File Listing**: Users can't browse other users' files

### Future Optimizations

If source files become larger or download time becomes an issue:

1. **In-Memory Cache** (Single Instance)
   - Cache source files per user for 5-10 minutes
   - Invalidate on file upload
   - Not shared across instances

2. **Redis Cache** (Multi-Instance)
   - Shared cache across all server instances
   - Invalidate on file upload
   - Adds infrastructure complexity

3. **Edge Caching**
   - Use Firebase Storage CDN caching headers
   - Already implemented by Firebase

Currently, no optimization needed - the simple approach works well.

## Privacy & GDPR Compliance

### Data Minimization

We follow strict data minimization principles:

- **No analytics**: No tracking, no third-party analytics tools
- **No IP logging**: Server doesn't log IP addresses
- **Minimal metadata**: Only essential session information stored
- **No data mining**: User content never analyzed for other purposes
- **Temporary processing**: Files deleted immediately after compilation

### Data Subject Rights

All GDPR rights are implemented via API endpoints:

1. **Right to Access**: `GET /api/history` - view all your sessions
2. **Right to Data Portability**: `GET /api/user/export-data` - export all data as JSON
3. **Right to Erasure**: `DELETE /api/user/delete-account` - delete all data
4. **Right to Rectification**: Replace files anytime via upload API
5. **Right to Restrict Processing**: Don't upload files you don't want processed

### Data Flow & Privacy

```
User Upload → Firebase Storage (encrypted) → Download to memory (API server)
                                           ↓
                                    Process with Gemini API
                                           ↓
                                    Temp files (local /tmp)
                                           ↓
                                    Upload to Firebase Storage
                                           ↓
                                    Delete temp files
```

**Key privacy features:**
- Files never stored on server permanently
- Temp directory isolated per request
- No cross-contamination between users
- Automatic cleanup after processing

### Third-Party Data Sharing

1. **Firebase/Google Cloud**: Stores encrypted files
2. **Google Gemini API**: Processes job descriptions and CV content
   - Not used for model training (per Google AI terms)
   - Data not retained by Google

**No other third parties** have access to user data.

### Security Measures

- **Authentication**: Required on all API routes
- **Authorization**: User can only access own files
- **Encryption**: HTTPS in transit, Firebase encryption at rest
- **Signed URLs**: 15-minute expiry for downloads
- **No shared access**: User-specific storage paths
- **Audit logging**: Failed auth attempts logged (not file access)

See [PRIVACY.md](./PRIVACY.md) for complete privacy policy.
