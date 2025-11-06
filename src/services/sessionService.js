const { v4: uuidv4 } = require('uuid');
const path = require('path');

class SessionService {
  constructor(fileService) {
    this.fileService = fileService;
    this.sessionsDir = path.join(process.cwd(), 'documents');
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
  }

  /**
   * Save session data
   * @param {string} sessionId - Session ID
   * @param {Object} sessionData - Session data to save
   */
  async saveSession(sessionId, sessionData) {
    console.log(`[DEBUG] SessionService: Saving session ${sessionId}`);
    const sessionFile = path.join(this.sessionsDir, sessionId, 'session.json');
    sessionData.updatedAt = new Date().toISOString();
    await this.fileService.writeJsonFile(sessionFile, sessionData);
    console.log(`[DEBUG] SessionService: Session ${sessionId} saved`);
  }

  /**
   * Update session data
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Data to update
   * @returns {Promise<Object>} Updated session
   */
  async updateSession(sessionId, updates) {
    console.log(`[DEBUG] SessionService: Updating session ${sessionId} with keys: ${Object.keys(updates).join(', ')}`);
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const updatedSession = {
      ...session,
      ...updates,
      id: sessionId, // Prevent ID from being changed
      createdAt: session.createdAt // Prevent creation date from being changed
    };
    
    await this.saveSession(sessionId, updatedSession);
    
    return updatedSession;
  }

  /**
   * Initialize chat history file for a session
   * @param {string} sessionId - Session ID
   */
  async initializeChatHistory(sessionId) {
    const chatHistoryFile = path.join(this.sessionsDir, sessionId, 'chat_history.json');
    await this.fileService.writeJsonFile(chatHistoryFile, []);
  }

  /**
   * Log message to chat history file
   * @param {string} sessionId - Session ID
   * @param {string} message - Message to log
   * @param {string} level - Log level (info, success, error)
   */
  async logToChatHistory(sessionId, message, level = 'info') {
    const chatHistoryFile = path.join(this.sessionsDir, sessionId, 'chat_history.json');
    
    let history = [];
    try {
      history = await this.fileService.readJsonFile(chatHistoryFile);
    } catch (error) {
      // File doesn't exist yet, start fresh
      history = [];
    }
    
    history.push({
      timestamp: new Date().toISOString(),
      level,
      message
    });
    
    await this.fileService.writeJsonFile(chatHistoryFile, history);
  }

  /**
   * Get chat history from file
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Chat history array
   */
  async getChatHistoryFromFile(sessionId) {
    console.log(`[DEBUG] SessionService: ===== GETTING CHAT HISTORY FROM FILE: ${sessionId} =====`);
    console.log(`[DEBUG] SessionService: Step 1: Constructing chat history file path`);
    const chatHistoryFile = path.join(this.sessionsDir, sessionId, 'chat_history.json');
    console.log(`[DEBUG] SessionService: Step 2: Chat history file path: ${chatHistoryFile}`);
    
    try {
      console.log(`[DEBUG] SessionService: Step 3: Reading chat history JSON file...`);
      const readStartTime = Date.now();
      const chatHistory = await this.fileService.readJsonFile(chatHistoryFile);
      const readDuration = Date.now() - readStartTime;
      console.log(`[DEBUG] SessionService: Step 4: Chat history read in ${readDuration}ms`);
      console.log(`[DEBUG] SessionService: Step 5: Chat history structure:`, {
        isArray: Array.isArray(chatHistory),
        length: chatHistory?.length || 0,
        type: typeof chatHistory
      });
      if (chatHistory && chatHistory.length > 0) {
        console.log(`[DEBUG] SessionService: Step 6: Sample of first entry:`, {
          message: chatHistory[0].message?.substring(0, 50),
          level: chatHistory[0].level,
          timestamp: chatHistory[0].timestamp
        });
      }
      console.log(`[DEBUG] SessionService: ===== CHAT HISTORY RETRIEVAL COMPLETE =====`);
      return chatHistory;
    } catch (error) {
      console.error(`[DEBUG] SessionService: ✗ Error reading chat history file:`, error);
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
    return await this.updateSession(sessionId, {
      approved: true,
      locked: true,
      status: 'approved'
    });
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
    return await this.updateSession(sessionId, {
      status: 'completed',
      generatedFiles
    });
  }

  /**
   * Mark session as failed
   * @param {string} sessionId - Session ID
   * @param {string} errorMessage - Error message
   * @returns {Promise<Object>} Updated session
   */
  async failSession(sessionId, errorMessage) {
    return await this.updateSession(sessionId, {
      status: 'failed',
      errorMessage
    });
  }
}

module.exports = SessionService;