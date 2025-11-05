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
    let sessionDirName;
    
    if (initialData.companyName && initialData.jobTitle) {
      sessionDirName = this.createSessionDirName(initialData.companyName, initialData.jobTitle);
    } else {
      sessionDirName = uuidv4();
    }
    
    const sessionDir = path.join(this.sessionsDir, sessionDirName);
    
    await this.fileService.ensureDirectory(sessionDir);
    
    const session = {
      id: sessionDirName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      approved: false,
      locked: false,
      jobDescription: initialData.jobDescription || '',
      companyInfo: initialData.companyInfo || '',
      companyName: initialData.companyName || '',
      jobTitle: initialData.jobTitle || '',
      cvSourceFile: initialData.cvSourceFile || '',
      chatHistory: [],
      generatedFiles: {}
    };
    
    await this.saveSession(sessionDirName, session);
    await this.initializeChatHistory(sessionDirName);
    
    return session;
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session object or null
   */
  async getSession(sessionId) {
    const sessionFile = path.join(this.sessionsDir, sessionId, 'session.json');
    const exists = await this.fileService.fileExists(sessionFile);
    
    if (!exists) {
      return null;
    }
    
    return await this.fileService.readJsonFile(sessionFile);
  }

  /**
   * Save session data
   * @param {string} sessionId - Session ID
   * @param {Object} sessionData - Session data to save
   */
  async saveSession(sessionId, sessionData) {
    const sessionFile = path.join(this.sessionsDir, sessionId, 'session.json');
    sessionData.updatedAt = new Date().toISOString();
    await this.fileService.writeJsonFile(sessionFile, sessionData);
  }

  /**
   * Update session data
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Data to update
   * @returns {Promise<Object>} Updated session
   */
  async updateSession(sessionId, updates) {
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
    const chatHistoryFile = path.join(this.sessionsDir, sessionId, 'chat_history.json');
    
    try {
      return await this.fileService.readJsonFile(chatHistoryFile);
    } catch (error) {
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
}

module.exports = SessionService;