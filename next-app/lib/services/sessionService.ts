import { FileService } from './fileService';

interface ChatMessage {
  role: string;
  content: string;
  timestamp?: string;
}

interface GeneratedFiles {
  cv?: {
    texPath: string;
    pdfPath: string | null;
  };
  coverLetter?: {
    path: string;
  };
  coldEmail?: {
    path: string;
  };
}

interface SessionData {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  approved: boolean;
  locked: boolean;
  jobDescription: string;
  companyInfo?: string;
  companyName: string;
  jobTitle: string;
  cvSourceFile?: string;
  chatHistory: ChatMessage[];
  generatedFiles: GeneratedFiles;
}

export class SessionService {
  private fileService: FileService;

  constructor(fileService: FileService) {
    this.fileService = fileService;
  }

  /**
   * Get session directory path in Firebase Storage
   */
  getSessionStoragePath(userId: string, sessionId: string): string {
    return `users/${userId}/sessions/${sessionId}`;
  }

  /**
   * Get session JSON file path
   */
  private getSessionFilePath(userId: string, sessionId: string): string {
    return `${this.getSessionStoragePath(userId, sessionId)}/session.json`;
  }

  /**
   * Get chat history file path
   */
  private getChatHistoryFilePath(userId: string, sessionId: string): string {
    return `${this.getSessionStoragePath(userId, sessionId)}/chat_history.json`;
  }

  /**
   * Create session directory name from date and job info
   */
  createSessionDirName(companyName: string, jobTitle: string): string {
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
   */
  async createSession(userId: string, initialData: Partial<SessionData> = {}): Promise<SessionData> {
    let sessionDirName: string;
    
    if (initialData.companyName && initialData.jobTitle) {
      sessionDirName = this.createSessionDirName(initialData.companyName, initialData.jobTitle);
    } else {
      // Fallback to UUID-like timestamp
      sessionDirName = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    
    const session: SessionData = {
      id: sessionDirName,
      userId,
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
    
    await this.saveSession(userId, sessionDirName, session);
    await this.initializeChatHistory(userId, sessionDirName);
    
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(userId: string, sessionId: string): Promise<SessionData | null> {
    try {
      const sessionFilePath = this.getSessionFilePath(userId, sessionId);
      const exists = await this.fileService.fileExistsInStorage(sessionFilePath);
      
      if (!exists) {
        return null;
      }
      
      const content = await this.fileService.readFileFromStorage(sessionFilePath);
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error getting session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save session data
   */
  async saveSession(userId: string, sessionId: string, sessionData: SessionData): Promise<void> {
    sessionData.updatedAt = new Date().toISOString();
    const sessionFilePath = this.getSessionFilePath(userId, sessionId);
    const content = JSON.stringify(sessionData, null, 2);
    await this.fileService.writeFileToStorage(sessionFilePath, content);
  }

  /**
   * Update session data
   */
  async updateSession(userId: string, sessionId: string, updates: Partial<SessionData>): Promise<SessionData> {
    const session = await this.getSession(userId, sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const updatedSession: SessionData = {
      ...session,
      ...updates,
      id: sessionId, // Prevent ID from being changed
      userId, // Prevent userId from being changed
      createdAt: session.createdAt // Prevent creation date from being changed
    };
    
    await this.saveSession(userId, sessionId, updatedSession);
    
    return updatedSession;
  }

  /**
   * Initialize chat history file for a session
   */
  async initializeChatHistory(userId: string, sessionId: string): Promise<void> {
    const chatHistoryFilePath = this.getChatHistoryFilePath(userId, sessionId);
    await this.fileService.writeFileToStorage(chatHistoryFilePath, JSON.stringify([], null, 2));
  }

  /**
   * Log message to chat history file
   */
  async logToChatHistory(userId: string, sessionId: string, message: string, level: string = 'info'): Promise<void> {
    const chatHistoryFilePath = this.getChatHistoryFilePath(userId, sessionId);
    
    let history: Array<{ timestamp: string; level: string; message: string }> = [];
    try {
      const content = await this.fileService.readFileFromStorage(chatHistoryFilePath);
      history = JSON.parse(content);
    } catch (error) {
      // File doesn't exist yet, start fresh
      history = [];
    }
    
    history.push({
      timestamp: new Date().toISOString(),
      level,
      message
    });
    
    await this.fileService.writeFileToStorage(chatHistoryFilePath, JSON.stringify(history, null, 2));
  }

  /**
   * Get chat history from file
   */
  async getChatHistoryFromFile(userId: string, sessionId: string): Promise<Array<{ timestamp: string; level: string; message: string }>> {
    try {
      const chatHistoryFilePath = this.getChatHistoryFilePath(userId, sessionId);
      const content = await this.fileService.readFileFromStorage(chatHistoryFilePath);
      return JSON.parse(content);
    } catch (error) {
      return [];
    }
  }

  /**
   * Add message to chat history
   */
  async addChatMessage(userId: string, sessionId: string, message: ChatMessage): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.chatHistory.push({
      ...message,
      timestamp: new Date().toISOString()
    });
    
    await this.saveSession(userId, sessionId, session);
  }

  /**
   * List all sessions for a user
   */
  async listSessions(userId: string): Promise<Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    approved: boolean;
    companyInfo?: string;
    companyName: string;
    jobTitle: string;
    hasFiles: boolean;
  }>> {
    try {
      const sessionsPrefix = `users/${userId}/sessions/`;
      const files = await this.fileService.listFilesInStorage(sessionsPrefix);
      
      // Extract unique session IDs
      const sessionIds = new Set<string>();
      for (const file of files) {
        // Extract session ID from path like users/{userId}/sessions/{sessionId}/...
        const match = file.match(/users\/[^/]+\/sessions\/([^/]+)/);
        if (match && match[1]) {
          sessionIds.add(match[1]);
        }
      }
      
      const sessions = [];
      
      for (const sessionId of sessionIds) {
        const session = await this.getSession(userId, sessionId);
        if (session) {
          // Return summary only
          sessions.push({
            id: session.id,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            status: session.status,
            approved: session.approved,
            companyInfo: session.companyInfo,
            companyName: session.companyName,
            jobTitle: session.jobTitle,
            hasFiles: Object.keys(session.generatedFiles || {}).length > 0
          });
        }
      }
      
      // Sort by creation date, newest first
      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return sessions;
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    }
  }

  /**
   * Approve a session and lock it
   */
  async approveSession(userId: string, sessionId: string): Promise<SessionData> {
    return await this.updateSession(userId, sessionId, {
      approved: true,
      locked: true,
      status: 'approved'
    });
  }

  /**
   * Check if session is locked
   */
  async isSessionLocked(userId: string, sessionId: string): Promise<boolean> {
    const session = await this.getSession(userId, sessionId);
    return session ? session.locked === true : false;
  }

  /**
   * Mark session as complete
   */
  async completeSession(userId: string, sessionId: string, generatedFiles: GeneratedFiles): Promise<SessionData> {
    return await this.updateSession(userId, sessionId, {
      status: 'completed',
      generatedFiles
    });
  }
}
