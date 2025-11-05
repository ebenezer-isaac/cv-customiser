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
            addMessage(msg.role, msg.content, false);
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
    
    // Show loading indicator
    showLoadingMessage();
    
    isGenerating = true;
    sendBtn.disabled = true;
    
    try {
        // Send to /api/generate with single input field
        const formData = new FormData();
        formData.append('input', userInput);
        
        if (currentSessionId) {
            formData.append('sessionId', currentSessionId);
        }
        
        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        removeLoadingMessage();
        
        if (response.ok && data.success) {
            currentSessionId = data.sessionId;
            
            // Display results as assistant message
            const resultHtml = formatResults(data.results);
            addMessage('assistant', resultHtml, true);
            
            // Reload chat history to show new session
            await loadChatHistory();
        } else {
            addMessage('assistant', `Error: ${data.message || data.error || 'Failed to generate documents'}`);
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
}

// Remove loading message
function removeLoadingMessage() {
    const loadingMsg = document.getElementById('loading-message');
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

// Format results as HTML
function formatResults(results) {
    let html = '<div class="results-container">';
    html += '<p><strong>Documents generated successfully!</strong></p>';
    
    // CV
    if (results.cv && results.cv.content) {
        html += '<div class="result-card">';
        html += '<h4>CV (LaTeX)';
        if (results.cv.success) {
            html += ` <span class="result-badge success">✓ Success (${results.cv.pageCount} pages)</span>`;
        } else {
            html += ` <span class="result-badge warning">⚠ Generated with warnings</span>`;
        }
        html += '</h4>';
        const preview = results.cv.content.length > PREVIEW_TRUNCATE_LENGTH 
            ? `${escapeHtml(results.cv.content.substring(0, PREVIEW_TRUNCATE_LENGTH))}...\n\n[Content truncated for display]`
            : escapeHtml(results.cv.content);
        html += `<div class="result-content">${preview}</div>`;
        html += '</div>';
    }
    
    // Cover Letter
    if (results.coverLetter && results.coverLetter.content) {
        html += '<div class="result-card">';
        html += '<h4>Cover Letter <span class="result-badge success">✓ Generated</span></h4>';
        html += `<div class="result-content">${escapeHtml(results.coverLetter.content)}</div>`;
        html += '</div>';
    }
    
    // Cold Email
    if (results.coldEmail && results.coldEmail.content) {
        html += '<div class="result-card">';
        html += '<h4>Cold Email <span class="result-badge success">✓ Generated</span></h4>';
        html += `<div class="result-content">${escapeHtml(results.coldEmail.content)}</div>`;
        html += '</div>';
    }
    
    html += '</div>';
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
