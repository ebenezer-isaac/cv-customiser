const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Mutex } = require('async-mutex');
const fs = require('fs').promises;

class SessionService {
  constructor(fileService) {
    this.fileService = fileService;
    this.sessionsDir = path.join(process.cwd(), 'documents');
    // Map of session-specific mutexes to prevent race conditions
    this.sessionMutexes = new Map();
  }

  /**
   * Get or create a mutex for a specific session
   * @param {string} sessionId - Session ID
   * @returns {Mutex} Session-specific mutex
   */
  getSessionMutex(sessionId) {
    if (!this.sessionMutexes.has(sessionId)) {
      this.sessionMutexes.set(sessionId, new Mutex());
    }
    return this.sessionMutexes.get(sessionId);
  }

  /**
   * Validate and sanitize session ID to prevent path traversal attacks
   * @param {string} sessionId - Session ID to validate
   * @returns {string} Sanitized session ID
   * @throws {Error} If session ID is invalid
   */
  validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session ID: must be a non-empty string');
    }
    
    // Remove any path traversal attempts and ensure it's a safe filename
    const sanitized = path.basename(sessionId);
    
    // Check if sanitization changed the ID (indicating path traversal attempt)
    if (sanitized !== sessionId) {
      throw new Error('Invalid session ID: contains path traversal characters');
    }
    
    // Additional check: ensure it doesn't start with a dot (hidden files)
    if (sanitized.startsWith('.')) {
      throw new Error('Invalid session ID: cannot start with a dot');
    }
    
    return sanitized;
  }

  /**
   * Clean up mutex for a completed session to prevent memory leaks
   * Should be called when a session is finalized (completed/failed/approved)
   * @param {string} sessionId - Session ID
   */
  cleanupSessionMutex(sessionId) {
    if (this.sessionMutexes.has(sessionId)) {
      this.sessionMutexes.delete(sessionId);
      console.log(`[DEBUG] SessionService: Cleaned up mutex for session ${sessionId}`);
    }
  }

  /**
   * Initialize session directory
   */
  async initialize() {
    await this.fileService.ensureDirectory(this.sessionsDir);
  }

  /**
   * Create session directory name from date and job info
   * @param {string} companyName - Company name
   * @param {string} jobTitle - Job title
   * @returns {string} Directory name
   */
  createSessionDirName(companyName, jobTitle) {
    const timestamp = new Date().toISOString()
      .replace('T', '_')
      .replace(/:/g, '')
      .substring(0, 17); // YYYY-MM-DD_HHmmss
    const cleanCompany = companyName.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const cleanTitle = jobTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    return `${timestamp}_${cleanCompany}_${cleanTitle}`;
  }

  /**
   * Create a new session
   * @param {Object} initialData - Initial session data
   * @returns {Promise<Object>} Session object
   */
  async createSession(initialData = {}) {
    console.log('[DEBUG] SessionService: Creating new session');
    console.log(`[DEBUG] SessionService: Initial data - Company: ${initialData.companyName || 'N/A'}, Title: ${initialData.jobTitle || 'N/A'}, Mode: ${initialData.mode || 'standard'}`);
    
    let sessionDirName;
    
    if (initialData.companyName && initialData.jobTitle) {
      sessionDirName = this.createSessionDirName(initialData.companyName, initialData.jobTitle);
      console.log(`[DEBUG] SessionService: Generated session dir name: ${sessionDirName}`);
    } else {
      sessionDirName = uuidv4();
      console.log(`[DEBUG] SessionService: Using UUID for session: ${sessionDirName}`);
    }
    
    const sessionDir = path.join(this.sessionsDir, sessionDirName);
    console.log(`[DEBUG] SessionService: Session directory path: ${sessionDir}`);
    
    await this.fileService.ensureDirectory(sessionDir);
    console.log('[DEBUG] SessionService: Session directory created');
    
    const session = {
      id: sessionDirName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'processing', // Start in processing state
      approved: false,
      locked: false,
      jobDescription: initialData.jobDescription || '',
      companyInfo: initialData.companyInfo || '',
      companyName: initialData.companyName || '',
      jobTitle: initialData.jobTitle || '',
      cvSourceFile: initialData.cvSourceFile || '',
      chatHistory: [],
      generatedFiles: {},
      mode: initialData.mode || 'standard' // Track mode: 'standard' or 'cold_outreach'
    };
    
    await this.saveSession(sessionDirName, session);
    console.log('[DEBUG] SessionService: Session metadata saved');
    
    await this.initializeChatHistory(sessionDirName);
    console.log('[DEBUG] SessionService: Chat history initialized');
    
    console.log(`[DEBUG] SessionService: ✓ Session created successfully with ID: ${sessionDirName}`);
    return session;
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session object or null
   */
  async getSession(sessionId) {
    console.log(`[DEBUG] SessionService: ===== GETTING SESSION: ${sessionId} =====`);
    const mutex = this.getSessionMutex(sessionId);
    
    return await mutex.runExclusive(async () => {
      console.log(`[DEBUG] SessionService: Step 1: Constructing session file path`);
      const sessionFile = path.join(this.sessionsDir, sessionId, 'session.json');
      console.log(`[DEBUG] SessionService: Step 2: Session file path: ${sessionFile}`);
      
      console.log(`[DEBUG] SessionService: Step 3: Checking if session file exists...`);
      const exists = await this.fileService.fileExists(sessionFile);
      console.log(`[DEBUG] SessionService: Step 4: File exists check result: ${exists}`);
      
      if (!exists) {
        console.log(`[DEBUG] SessionService: Step 5: ✗ Session ${sessionId} not found - returning null`);
        return null;
      }
      
      console.log(`[DEBUG] SessionService: Step 5: ✓ Session ${sessionId} found, reading JSON file...`);
      const readStartTime = Date.now();
      const sessionData = await this.fileService.readJsonFile(sessionFile);
      const readDuration = Date.now() - readStartTime;
      console.log(`[DEBUG] SessionService: Step 6: Session data read in ${readDuration}ms`);
      console.log(`[DEBUG] SessionService: Step 7: Session data structure:`, {
        id: sessionData?.id,
        status: sessionData?.status,
        mode: sessionData?.mode,
        hasFiles: !!sessionData?.generatedFiles,
        hasChatHistory: !!sessionData?.chatHistory,
        chatHistoryLength: sessionData?.chatHistory?.length || 0
      });
      console.log(`[DEBUG] SessionService: ===== SESSION RETRIEVAL COMPLETE =====`);
      return sessionData;
    });
  }

  /**
   * Save session data
   * @param {string} sessionId - Session ID
   * @param {Object} sessionData - Session data to save
   */
  async saveSession(sessionId, sessionData) {
    console.log(`[DEBUG] SessionService: Saving session ${sessionId}`);
    const mutex = this.getSessionMutex(sessionId);
    
    await mutex.runExclusive(async () => {
      const sessionFile = path.join(this.sessionsDir, sessionId, 'session.json');
      sessionData.updatedAt = new Date().toISOString();
      await this.fileService.writeJsonFile(sessionFile, sessionData);
      console.log(`[DEBUG] SessionService: Session ${sessionId} saved`);
    });
  }

  /**
   * Update session data
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Data to update
   * @returns {Promise<Object>} Updated session
   */
  async updateSession(sessionId, updates) {
    console.log(`[DEBUG] SessionService: Updating session ${sessionId} with keys: ${Object.keys(updates).join(', ')}`);
    
    const mutex = this.getSessionMutex(sessionId);
    return await mutex.runExclusive(async () => {
      const sessionFile = path.join(this.sessionsDir, sessionId, 'session.json');
      const exists = await this.fileService.fileExists(sessionFile);
      
      if (!exists) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      const session = await this.fileService.readJsonFile(sessionFile);
      
      const updatedSession = {
        ...session,
        ...updates,
        id: sessionId, // Prevent ID from being changed
        createdAt: session.createdAt, // Prevent creation date from being changed
        updatedAt: new Date().toISOString()
      };
      
      await this.fileService.writeJsonFile(sessionFile, updatedSession);
      console.log(`[DEBUG] SessionService: Session ${sessionId} updated`);
      
      return updatedSession;
    });
  }

  /**
   * Initialize logs file for a session (JSON Lines format)
   * @param {string} sessionId - Session ID
   */
  async initializeChatHistory(sessionId) {
    // Validate session ID to prevent path traversal
    const validatedSessionId = this.validateSessionId(sessionId);
    const logsFile = path.join(this.sessionsDir, validatedSessionId, 'logs.jsonl');
    // Create an empty file - logs will be appended as JSON Lines
    await this.fileService.writeFile(logsFile, '');
  }

  /**
   * Log message to logs file (JSON Lines format)
   * Atomic append operation - each log is a complete JSON object on one line
   * Protected by mutex for consistency with other session operations
   * @param {string} sessionId - Session ID
   * @param {string} message - Message to log
   * @param {string} level - Log level (info, success, error)
   */
  async logToChatHistory(sessionId, message, level = 'info') {
    // Validate session ID to prevent path traversal
    const validatedSessionId = this.validateSessionId(sessionId);
    const logsFile = path.join(this.sessionsDir, validatedSessionId, 'logs.jsonl');
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };
    
    // Append as a single JSON line (atomic operation, protected by mutex)
    let logLine;
    try {
      logLine = JSON.stringify(logEntry) + '\n';
    } catch (stringifyError) {
      // Fallback for non-serializable data (circular references, etc.)
      console.error('[DEBUG] SessionService: Failed to stringify log entry:', stringifyError);
      logLine = JSON.stringify({
        timestamp: logEntry.timestamp,
        level: logEntry.level,
        message: '[Error: Unable to serialize log message]',
        error: stringifyError.message
      }) + '\n';
    }
    
    const mutex = this.getSessionMutex(validatedSessionId);
    await mutex.runExclusive(async () => {
      await fs.appendFile(logsFile, logLine, 'utf-8');
    });
  }

  /**
   * Get chat history from logs file (JSON Lines format)
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Chat history array
   */
  async getChatHistoryFromFile(sessionId) {
    console.log(`[DEBUG] SessionService: ===== GETTING CHAT HISTORY FROM FILE: ${sessionId} =====`);
    
    try {
      // Validate session ID to prevent path traversal
      const validatedSessionId = this.validateSessionId(sessionId);
      
      console.log(`[DEBUG] SessionService: Step 1: Constructing logs file path`);
      const logsFile = path.join(this.sessionsDir, validatedSessionId, 'logs.jsonl');
      console.log(`[DEBUG] SessionService: Step 2: Logs file path: ${logsFile}`);
      
      console.log(`[DEBUG] SessionService: Step 3: Reading logs.jsonl file...`);
      const readStartTime = Date.now();
      
      // Check if file exists
      const exists = await this.fileService.fileExists(logsFile);
      if (!exists) {
        console.log(`[DEBUG] SessionService: Step 4: Logs file does not exist yet, returning empty array`);
        return [];
      }
      
      // Read the entire file content as text
      const content = await fs.readFile(logsFile, 'utf-8');
      const readDuration = Date.now() - readStartTime;
      console.log(`[DEBUG] SessionService: Step 4: Logs file read in ${readDuration}ms`);
      
      // Split into lines and parse each JSON line
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      const logs = [];
      
      for (const line of lines) {
        try {
          const logEntry = JSON.parse(line);
          logs.push(logEntry);
        } catch (parseError) {
          console.error(`[DEBUG] SessionService: Failed to parse log line:`, line.substring(0, 100));
          console.error(`[DEBUG] SessionService: Parse error:`, parseError.message);
          // Skip invalid lines
        }
      }
      
      console.log(`[DEBUG] SessionService: Step 5: Parsed ${logs.length} log entries`);
      console.log(`[DEBUG] SessionService: Step 6: Logs structure:`, {
        isArray: Array.isArray(logs),
        length: logs.length,
        type: typeof logs
      });
      if (logs.length > 0) {
        console.log(`[DEBUG] SessionService: Step 7: Sample of first entry:`, {
          message: logs[0].message?.substring(0, 50),
          level: logs[0].level,
          timestamp: logs[0].timestamp
        });
      }
      console.log(`[DEBUG] SessionService: ===== CHAT HISTORY RETRIEVAL COMPLETE =====`);
      return logs;
    } catch (error) {
      console.error(`[DEBUG] SessionService: ✗ Error reading logs file:`, error);
      console.error(`[DEBUG] SessionService: Error stack:`, error.stack);
      console.log(`[DEBUG] SessionService: Returning empty array as fallback`);
      return [];
    }
  }

  /**
   * Add message to chat history
   * @param {string} sessionId - Session ID
   * @param {Object} message - Message object (can include content, logs, results, etc.)
   */
  async addChatMessage(sessionId, message) {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.chatHistory.push({
      ...message,
      timestamp: new Date().toISOString()
    });
    
    await this.saveSession(sessionId, session);
  }

  /**
   * Get session directory path
   * @param {string} sessionId - Session ID
   * @returns {string} Directory path
   */
  getSessionDirectory(sessionId) {
    return path.join(this.sessionsDir, sessionId);
  }

  /**
   * List all sessions
   * @returns {Promise<Object[]>} Array of session summaries
   */
  async listSessions() {
    const sessionDirs = await this.fileService.listFiles(this.sessionsDir);
    
    const sessions = [];
    
    for (const dir of sessionDirs) {
      const sessionFile = path.join(this.sessionsDir, dir, 'session.json');
      const exists = await this.fileService.fileExists(sessionFile);
      
      if (exists) {
        const session = await this.fileService.readJsonFile(sessionFile);
        // Return summary only
        sessions.push({
          id: session.id,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          status: session.status,
          approved: session.approved,
          companyInfo: session.companyInfo,
          hasFiles: Object.keys(session.generatedFiles || {}).length > 0
        });
      }
    }
    
    // Sort by creation date, newest first
    sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return sessions;
  }

  /**
   * Approve a session and lock it
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Updated session
   */
  async approveSession(sessionId) {
    const result = await this.updateSession(sessionId, {
      approved: true,
      locked: true,
      status: 'approved'
    });
    // Cleanup mutex to prevent memory leak
    this.cleanupSessionMutex(sessionId);
    return result;
  }

  /**
   * Check if session is locked
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if locked
   */
  async isSessionLocked(sessionId) {
    const session = await this.getSession(sessionId);
    return session ? session.locked === true : false;
  }

  /**
   * Mark session as complete
   * @param {string} sessionId - Session ID
   * @param {Object} generatedFiles - Generated files metadata
   * @returns {Promise<Object>} Updated session
   */
  async completeSession(sessionId, generatedFiles) {
    const result = await this.updateSession(sessionId, {
      status: 'completed',
      generatedFiles
    });
    // Cleanup mutex to prevent memory leak
    this.cleanupSessionMutex(sessionId);
    return result;
  }

  /**
   * Mark session as failed
   * @param {string} sessionId - Session ID
   * @param {string} errorMessage - Error message
   * @returns {Promise<Object>} Updated session
   */
  async failSession(sessionId, errorMessage) {
    const result = await this.updateSession(sessionId, {
      status: 'failed',
      errorMessage
    });
    // Cleanup mutex to prevent memory leak
    this.cleanupSessionMutex(sessionId);
    return result;
  }
}

module.exports = SessionService;