// App state
let currentSessionId = null;
let sessions = [];
let isGenerating = false;

// Constants
const PREVIEW_TRUNCATE_LENGTH = 500; // Characters to show in CV preview
const MAX_LOG_PREVIEW_LENGTH = 100; // Characters to show in log preview for debugging

// DOM Elements
const sidebar = document.getElementById('sidebar');
const collapseBtn = document.getElementById('collapse-btn');
const chatHistory = document.getElementById('chat-history');
const chatMessages = document.getElementById('chat-messages');
const chatTitle = document.getElementById('chat-title');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const modeToggle = document.getElementById('mode-toggle-checkbox');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsBtn = document.getElementById('settings-btn');
const chatView = document.getElementById('chat-view');
const settingsView = document.getElementById('settings-view');
const backToChatBtn = document.getElementById('back-to-chat-btn');

// Settings upload forms
const uploadOriginalCVForm = document.getElementById('upload-original-cv-form');
const uploadExtensiveCVForm = document.getElementById('upload-extensive-cv-form');
const originalCVInput = document.getElementById('original-cv-input');
const extensiveCVInput = document.getElementById('extensive-cv-input');
const originalCVStatus = document.getElementById('original-cv-status');
const extensiveCVStatus = document.getElementById('extensive-cv-status');



// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadChatHistory();
    setupEventListeners();
    adjustTextareaHeight();
    loadSidebarState();
});

// Setup event listeners
function setupEventListeners() {
    chatForm.addEventListener('submit', handleChatSubmit);
    chatInput.addEventListener('input', adjustTextareaHeight);
    newChatBtn.addEventListener('click', startNewChat);
    settingsBtn.addEventListener('click', showSettings);
    backToChatBtn.addEventListener('click', showChat);
    collapseBtn.addEventListener('click', toggleSidebar);
    
    // Mode toggle listener
    modeToggle.addEventListener('change', updatePlaceholder);
    
    // Settings upload forms
    uploadOriginalCVForm.addEventListener('submit', (e) => handleFileUpload(e, 'original_cv'));
    uploadExtensiveCVForm.addEventListener('submit', (e) => handleFileUpload(e, 'extensive_cv'));
    
    // Update file labels when files are selected
    originalCVInput.addEventListener('change', (e) => updateFileLabel(e, 'original-cv-input'));
    extensiveCVInput.addEventListener('change', (e) => updateFileLabel(e, 'extensive-cv-input'));
}

// Update placeholder based on mode
function updatePlaceholder() {
    if (modeToggle.checked) {
        chatInput.placeholder = 'Enter company name for cold outreach...';
    } else {
        chatInput.placeholder = 'Paste job description or URL...';
    }
}

// Get current generation preferences based on mode
function getCurrentPreferences() {
    const isColdOutreach = modeToggle.checked;
    
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

// Toggle sidebar collapse/expand
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    
    // Save state to localStorage
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
    
    // Update collapse button title
    collapseBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
}

// Load sidebar state from localStorage
function loadSidebarState() {
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        collapseBtn.title = 'Expand sidebar';
    }
}

// Auto-resize textarea
function adjustTextareaHeight() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
}

// Show toast notification
function showToast(message, type = 'info') {
    // Validate type parameter to prevent CSS class injection
    const validTypes = ['info', 'success', 'error'];
    const safeType = validTypes.includes(type) ? type : 'info';
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${safeType}`;
    toast.textContent = message;
    
    // Add to body
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Update file label with selected filename
function updateFileLabel(event, inputId) {
    const input = event.target;
    const label = document.querySelector(`label[for="${inputId}"]`);
    
    if (input.files.length > 0) {
        const fileName = input.files[0].name;
        const svg = label.querySelector('svg');
        label.innerHTML = '';
        label.appendChild(svg);
        label.appendChild(document.createTextNode(fileName));
    }
}

// Load chat history from server
async function loadChatHistory() {
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        
        if (response.ok && data.success) {
            sessions = data.sessions;
            displayChatHistory(sessions);
        } else {
            chatHistory.innerHTML = '<div class="loading-history">No history available</div>';
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
        chatHistory.innerHTML = '<div class="loading-history">Failed to load history</div>';
    }
}

// Display chat history in sidebar
function displayChatHistory(sessions) {
    if (sessions.length === 0) {
        chatHistory.innerHTML = '<div class="loading-history">No conversations yet</div>';
        return;
    }
    
    chatHistory.innerHTML = '';
    
    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.dataset.sessionId = session.id;
        item.dataset.status = session.status || 'completed'; // Add status data attribute
        if (session.id === currentSessionId) {
            item.classList.add('active');
        }
        
        // Add status icon
        const statusIcon = document.createElement('div');
        statusIcon.className = 'history-item-icon';
        statusIcon.innerHTML = getStatusIcon(session.status);
        
        const content = document.createElement('div');
        content.className = 'history-item-content';
        
        const title = document.createElement('div');
        title.className = 'history-item-title';
        title.textContent = session.companyInfo || 'New Conversation';
        
        const date = document.createElement('div');
        date.className = 'history-item-date';
        date.textContent = new Date(session.createdAt).toLocaleDateString();
        
        content.appendChild(title);
        content.appendChild(date);
        
        item.appendChild(statusIcon);
        item.appendChild(content);
        
        item.addEventListener('click', () => loadSession(session.id));
        
        chatHistory.appendChild(item);
    });
}

// Get status icon based on session status
function getStatusIcon(status) {
    switch(status) {
        case 'processing':
            return '<div class="spinner"></div>';
        case 'completed':
            return '✓';
        case 'failed':
            return '✗';
        default:
            return '📄';
    }
}

// Update session status in sidebar
function updateSessionStatus(sessionId, status) {
    const sessionItem = document.querySelector(`.history-item[data-session-id="${sessionId}"]`);
    if (sessionItem) {
        // Update status data attribute for CSS styling
        sessionItem.dataset.status = status;
        
        // Update icon
        const iconEl = sessionItem.querySelector('.history-item-icon');
        if (iconEl) {
            iconEl.innerHTML = getStatusIcon(status);
        }
    }
}

// Update chat title
function updateChatTitle(title = 'New Conversation') {
    if (chatTitle) {
        chatTitle.textContent = title;
    }
}

// Load a specific session
async function loadSession(sessionId) {
    try {
        const response = await fetch(`/api/history/${sessionId}`);
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentSessionId = sessionId;
            
            // Sync mode toggle with session mode (stateful UI toggle)
            const sessionMode = data.session.mode || 'standard';
            const isColdOutreach = sessionMode === 'cold_outreach';
            modeToggle.checked = isColdOutreach;
            updatePlaceholder(); // Update placeholder text based on mode
            
            // Update chat title with session info
            const title = data.session.companyInfo || data.session.id || 'Session';
            updateChatTitle(title);
            
            // Check if session is still generating and resume if needed
            if (data.session.status === 'processing') {
                displaySessionMessages(data.session);
                // Resume live log polling for generating session
                resumeGeneratingSession(sessionId);
            } else {
                displaySessionMessages(data.session);
            }
            
            loadChatHistory(); // Refresh to update active state
        } else {
            console.error('Failed to load session');
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
}

// Resume generating session when navigating back to an active generation
async function resumeGeneratingSession(sessionId) {
    // Show loading indicator with "Resuming..." message
    const loadingMessageEl = showLoadingMessage('Resuming generation...');
    const logsContainer = createLogsContainer(loadingMessageEl);
    
    isGenerating = true;
    sendBtn.disabled = true;
    
    // Set up polling to check session status and update logs
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/history/${sessionId}`);
            const data = await response.json();
            
            if (response.ok && data.success) {
                const session = data.session;
                
                // Update session status in sidebar
                updateSessionStatus(sessionId, session.status);
                
                // If session completed or failed, stop polling
                if (session.status !== 'processing') {
                    clearInterval(pollInterval);
                    removeLoadingMessage();
                    
                    // Reload session to display final results
                    displaySessionMessages(session);
                    
                    isGenerating = false;
                    sendBtn.disabled = false;
                    
                    await loadChatHistory();
                }
            }
        } catch (error) {
            console.error('Error polling session status:', error);
            clearInterval(pollInterval);
            removeLoadingMessage();
            isGenerating = false;
            sendBtn.disabled = false;
        }
    }, 3000); // Poll every 3 seconds
}

// Display session messages in chat window
function displaySessionMessages(session) {
    chatMessages.innerHTML = '';
    
    if (session.chatHistory && session.chatHistory.length > 0) {
        session.chatHistory.forEach(msg => {
            if (msg.role === 'assistant' && msg.results) {
                // Rich content with results and logs
                const resultHtml = formatResultsWithLogs(msg.results, msg.logs || []);
                addMessage(msg.role, resultHtml, true);
            } else if (msg.role === 'user' && msg.isURL) {
                // Display original URL for user messages
                addMessage(msg.role, msg.content, false);
            } else {
                // Regular text content
                addMessage(msg.role, msg.content, false);
            }
        });
    }
    
    scrollToBottom();
}

// Start a new chat
function startNewChat() {
    currentSessionId = null;
    updateChatTitle('New Conversation');
    chatMessages.innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-icon">📄</div>
            <h2>CV Customiser</h2>
            <p>AI-Powered Job Application Assistant</p>
            <div class="welcome-cards">
                <div class="welcome-card">
                    <div class="card-icon">🔗</div>
                    <h3>Paste a URL</h3>
                    <p>Job posting link to automatically extract the description</p>
                </div>
                <div class="welcome-card">
                    <div class="card-icon">📝</div>
                    <h3>Paste Job Description</h3>
                    <p>Copy and paste the full job description text</p>
                </div>
                <div class="welcome-card">
                    <div class="card-icon">💬</div>
                    <h3>Refine Content</h3>
                    <p>Chat to refine your generated documents</p>
                </div>
            </div>
        </div>
    `;
    chatInput.value = '';
    loadChatHistory(); // Refresh to clear active state
}

// Handle chat form submission
async function handleChatSubmit(e) {
    e.preventDefault();
    
    if (isGenerating || !chatInput.value.trim()) {
        return;
    }
    
    const userInput = chatInput.value.trim();
    chatInput.value = '';
    adjustTextareaHeight();
    
    // Add user message to chat
    addMessage('user', userInput);
    
    // Show loading indicator with progress logs
    const loadingMessageEl = showLoadingMessage();
    const logsContainer = createLogsContainer(loadingMessageEl);
    
    isGenerating = true;
    sendBtn.disabled = true;
    
    try {
        // Get current generation preferences
        const preferences = getCurrentPreferences();
        const isColdOutreach = modeToggle.checked;
        
        // Use fetch with SSE support
        const requestBody = {
            input: userInput,
            sessionId: currentSessionId,
            preferences: preferences
        };
        
        // Add mode if cold outreach
        if (isColdOutreach) {
            requestBody.mode = 'cold_outreach';
        }
        
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Accept': 'text/event-stream',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        // Handle SSE stream
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            await handleSSEStream(response, logsContainer);
        } else {
            // Fallback to non-SSE response
            const data = await response.json();
            removeLoadingMessage();
            
            if (response.ok && data.success) {
                currentSessionId = data.sessionId;
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
                updateChatTitle(title);
                const resultHtml = formatResults(data.results);
                addMessage('assistant', resultHtml, true);
                await loadChatHistory();
            } else {
                addMessage('assistant', `Error: ${data.message || data.error || 'Failed to generate documents'}`);
            }
        }
    } catch (error) {
        console.error('Error:', error);
        removeLoadingMessage();
        addMessage('assistant', 'Failed to generate documents. Please try again.');
    } finally {
        isGenerating = false;
        sendBtn.disabled = false;
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
                    console.warn('Failed to parse SSE event:', line.substring(0, MAX_LOG_PREVIEW_LENGTH));
                    continue;
                }
                
                const [, eventType, dataStr] = eventMatch;
                let data;
                try {
                    data = JSON.parse(dataStr);
                } catch (e) {
                    console.error('Failed to parse SSE data:', e, dataStr.substring(0, MAX_LOG_PREVIEW_LENGTH));
                    continue;
                }
                
                if (eventType === 'log') {
                    logs.push(data);
                    appendLogToContainer(logsContainer, data);
                } else if (eventType === 'session') {
                    sessionIdFromStream = data.sessionId;
                    currentSessionId = sessionIdFromStream;
                    // Immediately reload history to show the new processing session
                    await loadChatHistory();
                } else if (eventType === 'complete') {
                    sessionIdFromStream = data.sessionId;
                    finalResults = data.results;
                    // Update session status to completed
                    updateSessionStatus(sessionIdFromStream, 'completed');
                } else if (eventType === 'error') {
                    appendLogToContainer(logsContainer, { 
                        message: data.error || data.message, 
                        level: 'error',
                        timestamp: new Date().toISOString()
                    });
                    // Update session status to failed if we have a session ID
                    if (sessionIdFromStream) {
                        updateSessionStatus(sessionIdFromStream, 'failed');
                    }
                }
            }
        }
        
        removeLoadingMessage();
        
        if (finalResults) {
            currentSessionId = sessionIdFromStream;
            // Update chat title with company and job title
            const title = finalResults.companyName && finalResults.jobTitle 
                ? `${finalResults.jobTitle} at ${finalResults.companyName}`
                : sessionIdFromStream;
            updateChatTitle(title);
            const resultHtml = formatResultsWithLogs(finalResults, logs);
            addMessage('assistant', resultHtml, true);
            await loadChatHistory();
        }
    } catch (error) {
        console.error('SSE stream error:', error);
        removeLoadingMessage();
        addMessage('assistant', 'Error during generation. Please try again.');
    }
}

// Create logs container
function createLogsContainer(loadingElement) {
    const logsDiv = document.createElement('div');
    logsDiv.className = 'generation-logs';
    logsDiv.style.marginTop = '10px';
    logsDiv.style.fontSize = '12px';
    logsDiv.style.fontFamily = 'monospace';
    logsDiv.style.maxHeight = '200px';
    logsDiv.style.overflowY = 'auto';
    logsDiv.style.background = '#f5f5f5';
    logsDiv.style.padding = '8px';
    logsDiv.style.borderRadius = '4px';
    loadingElement.appendChild(logsDiv);
    return logsDiv;
}

// Append log to container
function appendLogToContainer(container, logEntry) {
    const logLine = document.createElement('div');
    logLine.style.marginBottom = '2px';
    
    const levelColors = {
        info: '#666',
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107'
    };
    
    const levelIcons = {
        info: 'ℹ️',
        success: '✓',
        error: '✗',
        warning: '⚠'
    };
    
    const icon = levelIcons[logEntry.level] || 'ℹ️';
    const color = levelColors[logEntry.level] || '#666';
    
    // Create icon span
    const iconSpan = document.createElement('span');
    iconSpan.style.color = color;
    iconSpan.textContent = `${icon} ${logEntry.message}`;
    
    logLine.appendChild(iconSpan);
    container.appendChild(logLine);
    container.scrollTop = container.scrollHeight;
}

// Add message to chat
function addMessage(role, content, isHTML = false) {
    const message = document.createElement('div');
    message.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    if (isHTML) {
        messageContent.innerHTML = content;
    } else {
        messageContent.textContent = content;
    }
    
    message.appendChild(avatar);
    message.appendChild(messageContent);
    
    // Remove welcome screen if present
    const welcomeScreen = chatMessages.querySelector('.welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.remove();
    }
    
    chatMessages.appendChild(message);
    scrollToBottom();
}

// Show loading message
function showLoadingMessage(message = 'Generating documents...') {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message-loading';
    loadingDiv.id = 'loading-message';
    loadingDiv.innerHTML = `
        <div class="loading-dots">
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
        </div>
        <span>${message}</span>
    `;
    chatMessages.appendChild(loadingDiv);
    scrollToBottom();
    return loadingDiv;
}

// Remove loading message
function removeLoadingMessage() {
    const loadingMsg = document.getElementById('loading-message');
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

// Format results with logs as HTML
function formatResultsWithLogs(results, logs) {
    let html = '<div class="results-container">';
    
    // Add collapsible logs section
    if (logs && logs.length > 0) {
        html += '<details class="generation-logs-details">';
        html += '<summary>🔍 View Generation Logs</summary>';
        html += '<div class="logs-content">';
        
        logs.forEach(log => {
            const levelIcons = {
                info: 'ℹ️',
                success: '✓',
                error: '✗',
                warning: '⚠'
            };
            const icon = levelIcons[log.level] || 'ℹ️';
            const levelClass = log.level || 'info';
            // Use escapeHtml for safety and ensure proper escaping
            const escapedMessage = escapeHtml(log.message || '');
            html += `<div class="log-entry log-${levelClass}">${icon} ${escapedMessage}</div>`;
        });
        
        html += '</div>';
        html += '</details>';
    }
    
    // Add results sections
    html += formatResults(results);
    
    html += '</div>';
    return html;
}

// Format results as HTML
function formatResults(results) {
    let html = '';
    
    // CV Section
    if (results.cv) {
        html += '<div class="result-section cv-section">';
        html += '<h3 class="result-section-title">📄 CV</h3>';
        
        if (results.cv.success) {
            html += `<div class="result-status success">✓ Generated successfully (${results.cv.pageCount} pages)</div>`;
        } else {
            html += `<div class="result-status warning">⚠ Generated with warnings</div>`;
        }
        
        // Display change summary if available
        if (results.cv.changeSummary) {
            html += '<div class="cv-changes">';
            html += '<h4>Changes Made:</h4>';
            html += `<div class="change-summary">${escapeHtml(results.cv.changeSummary).replace(/\n/g, '<br>')}</div>`;
            html += '</div>';
        }
        
        // Embed PDF viewer if PDF path is available
        if (results.cv.pdfPath) {
            html += '<div class="pdf-viewer-container">';
            html += '<h4>Preview:</h4>';
            html += `<embed src="${results.cv.pdfPath}" type="application/pdf" width="100%" height="600px" />`;
            html += '</div>';
        }
        
        html += '</div>';
    } else if (results.cv === null) {
        html += '<div class="result-section cv-section">';
        html += '<h3 class="result-section-title">📄 CV</h3>';
        html += '<div class="result-status error">✗ Failed to generate</div>';
        html += '</div>';
    }
    
    // Cover Letter Section
    if (results.coverLetter) {
        html += '<div class="result-section cover-letter-section">';
        html += '<h3 class="result-section-title">📧 Cover Letter</h3>';
        html += '<div class="result-status success">✓ Generated</div>';
        html += '<div class="result-actions">';
        html += `<button class="btn-download" onclick="downloadCoverLetter('${currentSessionId}')">📥 Download (.docx)</button>`;
        html += '</div>';
        html += '<div class="result-content">';
        html += `<textarea class="editable-content" data-session="${currentSessionId}" data-type="coverLetter" rows="15">${escapeHtml(results.coverLetter.content)}</textarea>`;
        html += '</div>';
        html += '</div>';
    } else if (results.coverLetter === null) {
        html += '<div class="result-section cover-letter-section">';
        html += '<h3 class="result-section-title">📧 Cover Letter</h3>';
        html += '<div class="result-status error">✗ Failed to generate</div>';
        html += '</div>';
    }
    
    // Cold Email Section
    if (results.coldEmail) {
        const emailAddresses = results.emailAddresses || results.coldEmail.emailAddresses || [];
        
        // Parse cold email to extract subject and body
        let subject = '';
        let body = '';
        const coldEmailContent = results.coldEmail.content || '';
        
        // Split by "Subject:" to extract subject line and body (case-insensitive, flexible spacing)
        const subjectMatch = coldEmailContent.match(/^Subject\s*:\s*(.+?)(?:\n|$)/im);
        if (subjectMatch) {
            subject = subjectMatch[1].trim();
            // Get everything after the subject line as the body
            body = coldEmailContent.substring(coldEmailContent.indexOf(subjectMatch[0]) + subjectMatch[0].length).trim();
        } else {
            // If no subject found, use entire content as body
            body = coldEmailContent;
        }
        
        // Create mailto link with subject and body
        let mailtoLink = '';
        if (emailAddresses.length > 0) {
            const recipient = encodeURIComponent(emailAddresses[0]);
            const encodedSubject = encodeURIComponent(subject);
            
            // Truncate body if URL would be too long (browser limit is ~2048 chars)
            const MAX_URL_LENGTH = 2000;
            let encodedBody = encodeURIComponent(body);
            const baseUrl = `mailto:${recipient}?subject=${encodedSubject}&body=`;
            
            if ((baseUrl + encodedBody).length > MAX_URL_LENGTH) {
                // Calculate how much body content we can include
                const maxBodyLength = MAX_URL_LENGTH - baseUrl.length - 20; // Leave some buffer
                let truncatedBody = body;
                while (encodeURIComponent(truncatedBody).length > maxBodyLength && truncatedBody.length > 0) {
                    truncatedBody = truncatedBody.substring(0, truncatedBody.length - 10);
                }
                encodedBody = encodeURIComponent(truncatedBody + '...');
            }
            
            mailtoLink = `${baseUrl}${encodedBody}`;
        }
        
        html += '<div class="result-section cold-email-section">';
        html += '<h3 class="result-section-title">✉️ Cold Email</h3>';
        html += '<div class="result-status success">✓ Generated</div>';
        html += '<div class="result-actions">';
        html += `<button class="btn-download" onclick="downloadColdEmail('${currentSessionId}')">📥 Download (.txt)</button>`;
        if (mailtoLink) {
            html += `<a href="${mailtoLink}" class="btn-mailto">📧 Open in Email Client</a>`;
        }
        html += '</div>';
        if (emailAddresses.length > 0) {
            html += '<div class="email-addresses">';
            html += '<strong>Email(s) found:</strong> ';
            html += emailAddresses.map(email => `<a href="mailto:${email}">${escapeHtml(email)}</a>`).join(', ');
            html += '</div>';
        }
        html += '<div class="result-content">';
        html += `<textarea class="editable-content" data-session="${currentSessionId}" data-type="coldEmail" rows="10">${escapeHtml(coldEmailContent)}</textarea>`;
        html += '</div>';
        html += '</div>';
    } else if (results.coldEmail === null) {
        html += '<div class="result-section cold-email-section">';
        html += '<h3 class="result-section-title">✉️ Cold Email</h3>';
        html += '<div class="result-status error">✗ Failed to generate</div>';
        html += '</div>';
    }
    
    return html;
}

// Scroll to bottom of chat
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show settings view
function showSettings() {
    chatView.classList.add('hidden');
    settingsView.classList.remove('hidden');
}

// Show chat view
function showChat() {
    settingsView.classList.add('hidden');
    chatView.classList.remove('hidden');
}

// Handle file upload
async function handleFileUpload(e, docType) {
    e.preventDefault();
    
    const form = e.target;
    const input = docType === 'original_cv' ? originalCVInput : extensiveCVInput;
    const statusDiv = docType === 'original_cv' ? originalCVStatus : extensiveCVStatus;
    
    if (!input.files || input.files.length === 0) {
        statusDiv.className = 'upload-status error';
        statusDiv.textContent = 'Please select a file first';
        return;
    }
    
    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('docType', docType);
    
    statusDiv.className = 'upload-status';
    statusDiv.textContent = 'Uploading...';
    
    try {
        const response = await fetch('/api/upload-source-doc', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            statusDiv.className = 'upload-status success';
            statusDiv.textContent = `✓ ${data.message}`;
            form.reset();
            
            // Reset label
            const label = form.querySelector('.file-label');
            const svg = label.querySelector('svg');
            label.innerHTML = '';
            label.appendChild(svg);
            label.appendChild(document.createTextNode(docType === 'original_cv' ? 'Choose .tex file' : 'Choose .doc/.docx file'));
        } else {
            statusDiv.className = 'upload-status error';
            statusDiv.textContent = `✗ ${data.message || data.error}`;
        }
    } catch (error) {
        console.error('Upload error:', error);
        statusDiv.className = 'upload-status error';
        statusDiv.textContent = '✗ Upload failed. Please try again.';
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
            showToast(`Saving ${contentTypeName}...`, 'info');
            
            // Save the content
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
                    textarea.dataset.modified = 'false';
                    showToast(`${contentTypeName} saved!`, 'success');
                    console.log(`✓ Auto-saved ${contentType} for session ${sessionId}`);
                } else {
                    showToast(`Failed to save ${contentTypeName}`, 'error');
                    console.error(`Failed to auto-save ${contentType}`);
                }
            } catch (error) {
                showToast(`Error saving ${contentTypeName}`, 'error');
                console.error('Auto-save error:', error);
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

// Download cover letter as .docx
async function downloadCoverLetter(sessionId) {
    // First, auto-save if modified
    const textarea = document.querySelector(`.editable-content[data-session="${sessionId}"][data-type="coverLetter"]`);
    if (textarea && textarea.dataset.modified === 'true') {
        await fetch('/api/save-content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                contentType: 'coverLetter',
                content: textarea.value
            })
        });
    }
    
    // Trigger download
    window.location.href = `/api/download/cover-letter/${sessionId}`;
}

// Download cold email as .txt
async function downloadColdEmail(sessionId) {
    // First, auto-save if modified
    const textarea = document.querySelector(`.editable-content[data-session="${sessionId}"][data-type="coldEmail"]`);
    if (textarea && textarea.dataset.modified === 'true') {
        await fetch('/api/save-content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                contentType: 'coldEmail',
                content: textarea.value
            })
        });
    }
    
    // Trigger download
    window.location.href = `/api/download/cold-email/${sessionId}`;
}

console.log('CV Customiser App initialized');
