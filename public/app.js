// Main application entry point
import * as State from './js/state.js';
import * as API from './js/api.js';
import * as UI from './js/ui.js';

// Get current generation preferences based on mode
function getCurrentPreferences() {
    const isColdOutreach = UI.elements.modeToggle.checked;
    console.log(`[BROWSER] Getting preferences for mode: ${isColdOutreach ? 'cold_outreach' : 'standard'}`);
    
    if (isColdOutreach) {
        // Cold outreach mode: no cover letter, has cold email, apollo enabled
        return {
            coverLetter: false,
            coldEmail: true,
            apollo: true
        };
    } else {
        // Hot outreach mode: has cover letter and cold email, apollo disabled
        return {
            coverLetter: true,
            coldEmail: true,
            apollo: false
        };
    }
}

// Load chat history from server
async function loadChatHistory() {
    const result = await API.loadChatHistory();
    
    if (result.success) {
        State.setSessions(result.sessions);
        UI.displayChatHistory(result.sessions);
    } else {
        UI.elements.chatHistory.innerHTML = `<div class="loading-history">${result.message}</div>`;
    }
}

// Load a specific session
async function loadSession(sessionId) {
    console.log(`[BROWSER] Loading session: ${sessionId}`);
    
    // Clean up any active polling from previous session
    State.clearActivePollInterval();
    
    // Remove any existing loading message
    UI.removeLoadingMessage();
    
    const result = await API.loadSession(sessionId);
    
    if (result.success) {
        const session = result.session;
        State.setCurrentSessionId(sessionId);
        console.log(`[BROWSER] Current session set to: ${sessionId}`);
        
        // Sync mode toggle with session mode (stateful UI toggle)
        const sessionMode = session.mode || 'standard';
        const isColdOutreach = sessionMode === 'cold_outreach';
        console.log(`[BROWSER] Session mode: ${sessionMode}, Cold outreach: ${isColdOutreach}`);
        UI.elements.modeToggle.checked = isColdOutreach;
        UI.updatePlaceholder(); // Update placeholder text based on mode
        
        // Update chat title with session info
        const title = session.companyInfo || session.id || 'Session';
        UI.updateChatTitle(title);
        console.log(`[BROWSER] Chat title updated to: ${title}`);
        
        // Check if session is still generating and resume if needed
        if (session.status === 'processing') {
            console.log('[BROWSER] Session is still processing, resuming generation...');
            UI.displaySessionMessages(session);
            // Resume live log polling for generating session
            await resumeGeneratingSession(sessionId);
        } else {
            console.log(`[BROWSER] Session status: ${session.status}, displaying messages`);
            UI.displaySessionMessages(session);
        }
        
        await loadChatHistory(); // Refresh to update active state
    }
}

// Resume generating session when navigating back to an active generation
async function resumeGeneratingSession(sessionId) {
    console.log(`[BROWSER] Resuming generation for session: ${sessionId}`);
    
    // Show loading indicator with "Resuming..." message
    const loadingMessageEl = UI.showLoadingMessage('Resuming generation...');
    const logsContainer = UI.createLogsContainer(loadingMessageEl);
    
    State.setIsGenerating(true);
    UI.elements.sendBtn.disabled = true;
    
    // Track the number of logs we've already displayed to avoid duplicates
    let lastLogCount = 0;
    
    // Fetch initial logs from the new logs endpoint to populate the container
    const logsResult = await API.fetchSessionLogs(sessionId);
    if (logsResult.success) {
        const logs = logsResult.logs;
        // Display all existing logs
        logs.forEach(log => {
            UI.appendLogToContainer(logsContainer, log);
        });
        lastLogCount = logs.length;
    }
    
    console.log(`[BROWSER] Setting up polling interval to check for new logs (every 3 seconds)`);
    // Set up polling to check session status and update logs
    const pollInterval = setInterval(async () => {
        try {
            const result = await API.loadSession(sessionId);
            
            if (result.success) {
                const session = result.session;
                
                // Update session status in sidebar
                UI.updateSessionStatus(sessionId, session.status);
                
                // Update logs with any new entries
                if (session.fileHistory && session.fileHistory.length > lastLogCount) {
                    const newLogs = session.fileHistory.slice(lastLogCount);
                    console.log(`[BROWSER] ✓ Found ${newLogs.length} new log(s), appending to display`);
                    newLogs.forEach(log => {
                        UI.appendLogToContainer(logsContainer, log);
                    });
                    lastLogCount = session.fileHistory.length;
                }
                
                // If session completed or failed, stop polling
                if (session.status !== 'processing') {
                    console.log(`[BROWSER] Session status changed to '${session.status}', stopping polling`);
                    clearInterval(pollInterval);
                    State.setActivePollInterval(null);
                    UI.removeLoadingMessage();
                    
                    // Reload session to display final results
                    UI.displaySessionMessages(session);
                    
                    State.setIsGenerating(false);
                    UI.elements.sendBtn.disabled = false;
                    
                    await loadChatHistory();
                }
            }
        } catch (error) {
            console.error('[BROWSER] Error polling session status:', error);
            clearInterval(pollInterval);
            State.setActivePollInterval(null);
            UI.removeLoadingMessage();
            State.setIsGenerating(false);
            UI.elements.sendBtn.disabled = false;
        }
    }, 3000); // Poll every 3 seconds
    
    State.setActivePollInterval(pollInterval);
    console.log(`[BROWSER] Resume complete - now polling for updates`);
}

// Start a new chat
function startNewChat() {
    console.log('[BROWSER] Starting new chat');
    State.setCurrentSessionId(null);
    UI.updateChatTitle('New Conversation');
    UI.displayWelcomeScreen();
    UI.elements.chatInput.value = '';
    loadChatHistory(); // Refresh to clear active state
}

// Handle chat form submission
async function handleChatSubmit(e) {
    e.preventDefault();
    console.log('[BROWSER] Chat form submitted');
    
    if (State.isGenerating() || !UI.elements.chatInput.value.trim()) {
        console.log('[BROWSER] Ignoring submit - already generating or empty input');
        return;
    }
    
    const userInput = UI.elements.chatInput.value.trim();
    console.log(`[BROWSER] User input: "${userInput.substring(0, 100)}..."`);
    UI.elements.chatInput.value = '';
    UI.adjustTextareaHeight();
    
    // Add user message to chat
    UI.addMessage('user', userInput);
    
    // Show loading indicator with progress logs
    const loadingMessageEl = UI.showLoadingMessage();
    const logsContainer = UI.createLogsContainer(loadingMessageEl);
    
    State.setIsGenerating(true);
    UI.elements.sendBtn.disabled = true;
    console.log('[BROWSER] Generation started, send button disabled');
    
    try {
        // Get current generation preferences
        const preferences = getCurrentPreferences();
        const isColdOutreach = UI.elements.modeToggle.checked;
        const mode = isColdOutreach ? 'cold_outreach' : undefined;
        console.log(`[BROWSER] Cold outreach mode: ${isColdOutreach}`);
        console.log(`[BROWSER] Preferences:`, preferences);
        
        const response = await API.generateDocuments(userInput, State.getCurrentSessionId(), preferences, mode);

        // Handle SSE stream
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            console.log('[BROWSER] Handling SSE stream...');
            await handleSSEStream(response, logsContainer);
        } else {
            // Fallback to non-SSE response
            const data = await response.json();
            UI.removeLoadingMessage();
            
            if (response.ok && data.success) {
                State.setCurrentSessionId(data.sessionId);
                // Update chat title based on mode
                let title;
                if (isColdOutreach) {
                    title = data.companyName 
                        ? `Cold Outreach - ${data.companyName}`
                        : 'Cold Outreach';
                } else {
                    title = data.companyName && data.jobTitle 
                        ? `${data.jobTitle} at ${data.companyName}`
                        : data.sessionId;
                }
                UI.updateChatTitle(title);
                const resultHtml = UI.formatResults(data.results);
                UI.addMessage('assistant', resultHtml, true);
                await loadChatHistory();
            } else {
                UI.addMessage('assistant', `Error: ${data.message || data.error || 'Failed to generate documents'}`);
            }
        }
    } catch (error) {
        console.error('Error:', error);
        UI.removeLoadingMessage();
        UI.addMessage('assistant', 'Failed to generate documents. Please try again.');
    } finally {
        State.setIsGenerating(false);
        UI.elements.sendBtn.disabled = false;
    }
}

// Handle SSE stream
async function handleSSEStream(response, logsContainer) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sessionIdFromStream = null;
    let finalResults = null;
    const logs = [];
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop(); // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                // Parse SSE format: event: type\ndata: json
                const eventMatch = line.match(/^event:\s*(.+?)\s*\ndata:\s*(.+?)$/s);
                if (!eventMatch) {
                    console.warn('Failed to parse SSE event:', line.substring(0, State.MAX_LOG_PREVIEW_LENGTH));
                    continue;
                }
                
                const [, eventType, dataStr] = eventMatch;
                let data;
                try {
                    data = JSON.parse(dataStr);
                } catch (e) {
                    console.error('Failed to parse SSE data:', e, dataStr.substring(0, State.MAX_LOG_PREVIEW_LENGTH));
                    continue;
                }
                
                if (eventType === 'log') {
                    logs.push(data);
                    UI.appendLogToContainer(logsContainer, data);
                } else if (eventType === 'session') {
                    sessionIdFromStream = data.sessionId;
                    State.setCurrentSessionId(sessionIdFromStream);
                    // Immediately reload history to show the new processing session
                    await loadChatHistory();
                } else if (eventType === 'complete') {
                    sessionIdFromStream = data.sessionId;
                    finalResults = data.results;
                    // Update session status to completed
                    UI.updateSessionStatus(sessionIdFromStream, 'completed');
                } else if (eventType === 'error') {
                    UI.appendLogToContainer(logsContainer, { 
                        message: data.error || data.message, 
                        level: 'error',
                        timestamp: new Date().toISOString()
                    });
                    // Update session status to failed if we have a session ID
                    if (sessionIdFromStream) {
                        UI.updateSessionStatus(sessionIdFromStream, 'failed');
                    }
                }
            }
        }
        
        UI.removeLoadingMessage();
        
        if (finalResults) {
            State.setCurrentSessionId(sessionIdFromStream);
            // Update chat title with company and job title
            const title = finalResults.companyName && finalResults.jobTitle 
                ? `${finalResults.jobTitle} at ${finalResults.companyName}`
                : sessionIdFromStream;
            UI.updateChatTitle(title);
            const resultHtml = UI.formatResultsWithLogs(finalResults, logs);
            UI.addMessage('assistant', resultHtml, true);
            await loadChatHistory();
        }
    } catch (error) {
        console.error('SSE stream error:', error);
        UI.removeLoadingMessage();
        UI.addMessage('assistant', 'Error during generation. Please try again.');
    }
}

// Handle file upload
async function handleFileUpload(e, docType) {
    e.preventDefault();
    
    const form = e.target;
    const input = docType === 'original_cv' ? UI.elements.originalCVInput : UI.elements.extensiveCVInput;
    
    if (!input.files || input.files.length === 0) {
        UI.updateUploadStatus(docType, false, 'Please select a file first');
        return;
    }
    
    UI.updateUploadStatus(docType, true, 'Uploading...');
    
    const result = await API.uploadFile(input.files[0], docType);
    
    if (result.success) {
        UI.updateUploadStatus(docType, true, `✓ ${result.message}`);
        UI.resetUploadForm(docType);
    } else {
        UI.updateUploadStatus(docType, false, `✗ ${result.message}`);
    }
}

// Auto-save editable content when clicking outside
document.addEventListener('click', async (e) => {
    const editableAreas = document.querySelectorAll('.editable-content');
    editableAreas.forEach(async (textarea) => {
        // If clicking outside the textarea and it has been modified
        if (!textarea.contains(e.target) && textarea.dataset.modified === 'true') {
            const sessionId = textarea.dataset.session;
            const contentType = textarea.dataset.type;
            const content = textarea.value;
            
            // Show "Saving..." toast
            const contentTypeName = contentType === 'coverLetter' ? 'Cover Letter' : 'Cold Email';
            UI.showToast(`Saving ${contentTypeName}...`, 'info');
            
            // Save the content
            const result = await API.saveContent(sessionId, contentType, content);
            
            if (result.success) {
                textarea.dataset.modified = 'false';
                UI.showToast(`${contentTypeName} saved!`, 'success');
            } else {
                UI.showToast(`Failed to save ${contentTypeName}`, 'error');
            }
        }
    });
});

// Track modifications to editable content
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('editable-content')) {
        e.target.dataset.modified = 'true';
    }
});

// Global download functions (called from inline onclick handlers)
window.downloadCoverLetter = async function(sessionId) {
    // First, auto-save if modified
    const textarea = document.querySelector(`.editable-content[data-session="${sessionId}"][data-type="coverLetter"]`);
    if (textarea && textarea.dataset.modified === 'true') {
        await API.saveContent(sessionId, 'coverLetter', textarea.value);
    }
    
    // Trigger download
    API.downloadCoverLetter(sessionId);
};

window.downloadColdEmail = async function(sessionId) {
    // First, auto-save if modified
    const textarea = document.querySelector(`.editable-content[data-session="${sessionId}"][data-type="coldEmail"]`);
    if (textarea && textarea.dataset.modified === 'true') {
        await API.saveContent(sessionId, 'coldEmail', textarea.value);
    }
    
    // Trigger download
    API.downloadColdEmail(sessionId);
};

// Setup event listeners
function setupEventListeners() {
    console.log('[BROWSER] Setting up event listeners');
    UI.elements.chatForm.addEventListener('submit', handleChatSubmit);
    UI.elements.chatInput.addEventListener('input', UI.adjustTextareaHeight);
    UI.elements.newChatBtn.addEventListener('click', startNewChat);
    UI.elements.settingsBtn.addEventListener('click', UI.showSettings);
    UI.elements.backToChatBtn.addEventListener('click', UI.showChat);
    UI.elements.collapseBtn.addEventListener('click', UI.toggleSidebar);
    
    // Mode toggle listener
    UI.elements.modeToggle.addEventListener('change', UI.updatePlaceholder);
    
    // Settings upload forms
    UI.elements.uploadOriginalCVForm.addEventListener('submit', (e) => handleFileUpload(e, 'original_cv'));
    UI.elements.uploadExtensiveCVForm.addEventListener('submit', (e) => handleFileUpload(e, 'extensive_cv'));
    
    // Update file labels when files are selected
    UI.elements.originalCVInput.addEventListener('change', (e) => UI.updateFileLabel(e, 'original-cv-input'));
    UI.elements.extensiveCVInput.addEventListener('change', (e) => UI.updateFileLabel(e, 'extensive-cv-input'));
    
    // Add click handlers for history items
    UI.elements.chatHistory.addEventListener('click', (e) => {
        const historyItem = e.target.closest('.history-item');
        if (historyItem) {
            const sessionId = historyItem.dataset.sessionId;
            loadSession(sessionId);
        }
    });
    
    console.log('[BROWSER] Event listeners set up complete');
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('[BROWSER] App initializing...');
    loadChatHistory();
    setupEventListeners();
    UI.adjustTextareaHeight();
    UI.loadSidebarState();
    console.log('[BROWSER] App initialization complete');
});

console.log('CV Customiser App initialized');
