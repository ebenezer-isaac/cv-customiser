// App state
let currentSessionId = null;
let sessions = [];
let isGenerating = false;

// Constants
const PREVIEW_TRUNCATE_LENGTH = 500; // Characters to show in CV preview

// DOM Elements
const chatHistory = document.getElementById('chat-history');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
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
});

// Setup event listeners
function setupEventListeners() {
    chatForm.addEventListener('submit', handleChatSubmit);
    chatInput.addEventListener('input', adjustTextareaHeight);
    newChatBtn.addEventListener('click', startNewChat);
    settingsBtn.addEventListener('click', showSettings);
    backToChatBtn.addEventListener('click', showChat);
    
    // Settings upload forms
    uploadOriginalCVForm.addEventListener('submit', (e) => handleFileUpload(e, 'original_cv'));
    uploadExtensiveCVForm.addEventListener('submit', (e) => handleFileUpload(e, 'extensive_cv'));
    
    // Update file labels when files are selected
    originalCVInput.addEventListener('change', (e) => updateFileLabel(e, 'original-cv-input'));
    extensiveCVInput.addEventListener('change', (e) => updateFileLabel(e, 'extensive-cv-input'));
}

// Auto-resize textarea
function adjustTextareaHeight() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
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
        if (session.id === currentSessionId) {
            item.classList.add('active');
        }
        
        const title = document.createElement('div');
        title.className = 'history-item-title';
        title.textContent = session.companyInfo || 'New Conversation';
        
        const date = document.createElement('div');
        date.className = 'history-item-date';
        date.textContent = new Date(session.createdAt).toLocaleDateString();
        
        item.appendChild(title);
        item.appendChild(date);
        
        item.addEventListener('click', () => loadSession(session.id));
        
        chatHistory.appendChild(item);
    });
}

// Load a specific session
async function loadSession(sessionId) {
    try {
        const response = await fetch(`/api/history/${sessionId}`);
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentSessionId = sessionId;
            displaySessionMessages(data.session);
            loadChatHistory(); // Refresh to update active state
        } else {
            console.error('Failed to load session');
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
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
        // Use EventSource for SSE
        const formData = new FormData();
        formData.append('input', userInput);
        
        if (currentSessionId) {
            formData.append('sessionId', currentSessionId);
        }
        
        // Convert FormData to URLSearchParams for GET-like request with SSE
        const params = new URLSearchParams();
        params.append('input', userInput);
        if (currentSessionId) {
            params.append('sessionId', currentSessionId);
        }
        
        // Use fetch with SSE support
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Accept': 'text/event-stream',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: userInput,
                sessionId: currentSessionId
            })
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
                
                const eventMatch = line.match(/^event: (.+)\ndata: (.+)$/s);
                if (!eventMatch) continue;
                
                const [, eventType, dataStr] = eventMatch;
                const data = JSON.parse(dataStr);
                
                if (eventType === 'log') {
                    logs.push(data);
                    appendLogToContainer(logsContainer, data);
                } else if (eventType === 'session') {
                    sessionIdFromStream = data.sessionId;
                } else if (eventType === 'complete') {
                    sessionIdFromStream = data.sessionId;
                    finalResults = data.results;
                } else if (eventType === 'error') {
                    appendLogToContainer(logsContainer, { 
                        message: data.error || data.message, 
                        level: 'error',
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }
        
        removeLoadingMessage();
        
        if (finalResults) {
            currentSessionId = sessionIdFromStream;
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
    
    logLine.innerHTML = `<span style="color: ${color}">${icon} ${escapeHtml(logEntry.message)}</span>`;
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
function showLoadingMessage() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message-loading';
    loadingDiv.id = 'loading-message';
    loadingDiv.innerHTML = `
        <div class="loading-dots">
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
        </div>
        <span>Generating documents...</span>
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
            html += `<div class="log-entry log-${levelClass}">${icon} ${escapeHtml(log.message)}</div>`;
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
        html += '<div class="result-content">';
        html += `<pre>${escapeHtml(results.coverLetter.content)}</pre>`;
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
        html += '<div class="result-section cold-email-section">';
        html += '<h3 class="result-section-title">✉️ Cold Email</h3>';
        html += '<div class="result-status success">✓ Generated</div>';
        html += '<div class="result-content">';
        html += `<pre>${escapeHtml(results.coldEmail.content)}</pre>`;
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

console.log('CV Customiser App initialized');
