// API communication with backend

// Load chat history from server
export async function loadChatHistory() {
    console.log('[BROWSER] Loading chat history from server...');
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        console.log(`[BROWSER] Chat history response: ${response.status}`, data);
        
        if (response.ok && data.success) {
            console.log(`[BROWSER] Loaded ${data.sessions.length} sessions`);
            return { success: true, sessions: data.sessions };
        } else {
            console.warn('[BROWSER] No history available');
            return { success: false, message: 'No history available' };
        }
    } catch (error) {
        console.error('[BROWSER] Error loading chat history:', error);
        return { success: false, message: 'Failed to load history' };
    }
}

// Load a specific session
export async function loadSession(sessionId) {
    console.log(`[BROWSER] [API] ===== LOADING SESSION: ${sessionId} =====`);
    console.log(`[BROWSER] [API] Step 1: Initiating fetch request to /api/history/${sessionId}`);
    try {
        const fetchStartTime = Date.now();
        const response = await fetch(`/api/history/${sessionId}`);
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`[BROWSER] [API] Step 2: Fetch completed in ${fetchDuration}ms, status: ${response.status}`);
        console.log(`[BROWSER] [API] Step 3: Parsing JSON response...`);
        
        const parseStartTime = Date.now();
        const data = await response.json();
        const parseDuration = Date.now() - parseStartTime;
        console.log(`[BROWSER] [API] Step 4: JSON parsed in ${parseDuration}ms`);
        console.log(`[BROWSER] [API] Step 5: Response data structure:`, {
            success: data.success,
            hasSession: !!data.session,
            sessionId: data.session?.id,
            sessionStatus: data.session?.status,
            sessionMode: data.session?.mode,
            hasFileHistory: !!data.session?.fileHistory,
            fileHistoryLength: data.session?.fileHistory?.length || 0,
            hasChatHistory: !!data.session?.chatHistory,
            chatHistoryLength: data.session?.chatHistory?.length || 0
        });
        
        if (response.ok && data.success) {
            console.log(`[BROWSER] [API] Step 6: Session loaded successfully`);
            console.log(`[BROWSER] [API] Session details:`, {
                id: data.session.id,
                status: data.session.status,
                mode: data.session.mode,
                companyInfo: data.session.companyInfo,
                hasFiles: !!data.session.generatedFiles,
                fileHistoryCount: data.session.fileHistory?.length || 0
            });
            return { success: true, session: data.session };
        } else {
            console.error('[BROWSER] [API] Step 6: Failed to load session - response not OK or success=false');
            console.error('[BROWSER] [API] Error details:', data);
            return { success: false, message: 'Failed to load session' };
        }
    } catch (error) {
        console.error('[BROWSER] [API] ✗ Exception during session load:', error);
        console.error('[BROWSER] [API] Error stack:', error.stack);
        return { success: false, message: 'Error loading session' };
    }
}

// Fetch session logs
export async function fetchSessionLogs(sessionId) {
    console.log(`[BROWSER] [API] ===== FETCHING SESSION LOGS: ${sessionId} =====`);
    console.log(`[BROWSER] [API] Step 1: Initiating fetch request to /api/history/${sessionId}/logs`);
    try {
        const fetchStartTime = Date.now();
        const response = await fetch(`/api/history/${sessionId}/logs`);
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`[BROWSER] [API] Step 2: Fetch completed in ${fetchDuration}ms, status: ${response.status}`);
        console.log(`[BROWSER] [API] Step 3: Parsing JSON response...`);
        
        const parseStartTime = Date.now();
        const data = await response.json();
        const parseDuration = Date.now() - parseStartTime;
        console.log(`[BROWSER] [API] Step 4: JSON parsed in ${parseDuration}ms`);
        console.log(`[BROWSER] [API] Step 5: Response data structure:`, {
            success: data.success,
            hasLogs: !!data.logs,
            logsLength: data.logs?.length || 0,
            logsType: Array.isArray(data.logs) ? 'array' : typeof data.logs
        });
        
        if (response.ok && data.success && data.logs) {
            console.log(`[BROWSER] [API] Step 6: ✓ Successfully fetched ${data.logs.length} existing log(s)`);
            if (data.logs.length > 0) {
                console.log(`[BROWSER] [API] First log sample:`, data.logs[0]);
                console.log(`[BROWSER] [API] Last log sample:`, data.logs[data.logs.length - 1]);
            }
            return { success: true, logs: data.logs };
        } else {
            console.warn(`[BROWSER] [API] Step 6: Failed to fetch logs - ${data.error || 'Unknown error'}`);
            console.warn('[BROWSER] [API] Response data:', data);
            return { success: false, logs: [] };
        }
    } catch (error) {
        console.error('[BROWSER] [API] ✗ Exception during log fetch:', error);
        console.error('[BROWSER] [API] Error stack:', error.stack);
        return { success: false, logs: [] };
    }
}

// Generate documents (POST to /api/generate)
export async function generateDocuments(userInput, sessionId, mode) {
    const requestBody = {
        input: userInput,
        sessionId: sessionId
    };
    
    // Add mode if specified (for cold outreach)
    if (mode) {
        requestBody.mode = mode;
    }
    
    console.log('[BROWSER] Sending POST request to /api/generate');
    console.log('[BROWSER] Request body:', requestBody);
    
    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
            'Accept': 'text/event-stream',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    console.log(`[BROWSER] Response received: ${response.status} ${response.statusText}`);
    console.log(`[BROWSER] Response content-type: ${response.headers.get('content-type')}`);

    return response;
}

// Handle file upload
export async function uploadFile(file, docType) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('docType', docType);
    
    try {
        const response = await fetch('/api/upload-source-doc', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            return { success: true, message: data.message };
        } else {
            return { success: false, message: data.message || data.error };
        }
    } catch (error) {
        console.error('Upload error:', error);
        return { success: false, message: 'Upload failed. Please try again.' };
    }
}

// Save CV content
export async function saveCVContent(docType, content) {
    try {
        const response = await fetch('/api/save-source-cv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                docType,
                content
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            return { success: true, message: data.message };
        } else {
            return { success: false, message: data.message || data.error };
        }
    } catch (error) {
        console.error('Save CV content error:', error);
        return { success: false, message: 'Failed to save CV content. Please try again.' };
    }
}

// Load CV content
export async function loadCVContent(docType) {
    try {
        const response = await fetch(`/api/load-source-cv/${docType}`);
        const data = await response.json();
        
        if (response.ok && data.success) {
            return { success: true, content: data.content || '' };
        } else {
            return { success: false, content: '', message: data.message || data.error };
        }
    } catch (error) {
        console.error('Load CV content error:', error);
        return { success: false, content: '', message: 'Failed to load CV content.' };
    }
}

// Save content
export async function saveContent(sessionId, contentType, content) {
    try {
        const response = await fetch('/api/save-content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                contentType,
                content
            })
        });
        
        if (response.ok) {
            console.log(`✓ Auto-saved ${contentType} for session ${sessionId}`);
            return { success: true };
        } else {
            console.error(`Failed to auto-save ${contentType}`);
            return { success: false };
        }
    } catch (error) {
        console.error('Auto-save error:', error);
        return { success: false };
    }
}

// Download cover letter
export function downloadCoverLetter(sessionId) {
    window.location.href = `/api/download/cover-letter/${sessionId}`;
}

// Download cold email
export function downloadColdEmail(sessionId) {
    window.location.href = `/api/download/cold-email/${sessionId}`;
}
