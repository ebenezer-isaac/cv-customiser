const { v4: uuidv4 } = require('uuid');
const path = require('path');

class SessionService {
  constructor(fileService) {
    this.fileService = fileService;
    this.sessionsDir = path.join(process.cwd(), 'sessions');
  }

  /**
   * Initialize session directory
   */
  async initialize() {
    await this.fileService.ensureDirectory(this.sessionsDir);
  }

  /**
   * Create a new session
   * @param {Object} initialData - Initial session data
   * @returns {Promise<Object>} Session object
   */
  async createSession(initialData = {}) {
    const sessionId = uuidv4();
    const sessionDir = path.join(this.sessionsDir, sessionId);
    
    await this.fileService.ensureDirectory(sessionDir);
    
    const session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      approved: false,
      jobDescription: initialData.jobDescription || '',
      companyInfo: initialData.companyInfo || '',
      cvSourceFile: initialData.cvSourceFile || '',
      chatHistory: [],
      generatedFiles: {}
    };
    
    await this.saveSession(sessionId, session);
    
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
   * Add message to chat history
   * @param {string} sessionId - Session ID
   * @param {Object} message - Message object
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
   * Approve a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Updated session
   */
  async approveSession(sessionId) {
    return await this.updateSession(sessionId, {
      approved: true,
      status: 'approved'
    });
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
