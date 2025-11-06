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
    console.log(`[BROWSER] Fetching session data from /api/history/${sessionId}`);
    try {
        const response = await fetch(`/api/history/${sessionId}`);
        const data = await response.json();
        console.log(`[BROWSER] Session data received:`, data);
        
        if (response.ok && data.success) {
            return { success: true, session: data.session };
        } else {
            console.error('[BROWSER] Failed to load session:', data);
            return { success: false, message: 'Failed to load session' };
        }
    } catch (error) {
        console.error('[BROWSER] Error loading session:', error);
        return { success: false, message: 'Error loading session' };
    }
}

// Fetch session logs
export async function fetchSessionLogs(sessionId) {
    console.log(`[BROWSER] Fetching initial logs from /api/history/${sessionId}/logs`);
    try {
        const response = await fetch(`/api/history/${sessionId}/logs`);
        const data = await response.json();
        
        if (response.ok && data.success && data.logs) {
            console.log(`[BROWSER] ✓ Successfully fetched ${data.logs.length} existing logs`);
            return { success: true, logs: data.logs };
        } else {
            console.warn(`[BROWSER] Failed to fetch logs: ${data.error || 'Unknown error'}`);
            return { success: false, logs: [] };
        }
    } catch (error) {
        console.error('[BROWSER] Error fetching initial logs:', error);
        return { success: false, logs: [] };
    }
}

// Generate documents (POST to /api/generate)
export async function generateDocuments(userInput, sessionId, preferences, mode) {
    const requestBody = {
        input: userInput,
        sessionId: sessionId,
        preferences: preferences
    };
    
    // Add mode if specified
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
