// UI management and DOM manipulation
import { getCurrentSessionId } from './state.js';

// DOM Elements
export const elements = {
    sidebar: document.getElementById('sidebar'),
    collapseBtn: document.getElementById('collapse-btn'),
    chatHistory: document.getElementById('chat-history'),
    chatMessages: document.getElementById('chat-messages'),
    chatTitle: document.getElementById('chat-title'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    modeToggle: document.getElementById('mode-toggle-checkbox'),
    newChatBtn: document.getElementById('new-chat-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    chatView: document.getElementById('chat-view'),
    settingsView: document.getElementById('settings-view'),
    backToChatBtn: document.getElementById('back-to-chat-btn'),
    originalCVTextarea: document.getElementById('original-cv-textarea'),
    extensiveCVTextarea: document.getElementById('extensive-cv-textarea'),
    saveOriginalCVBtn: document.getElementById('save-original-cv-btn'),
    saveExtensiveCVBtn: document.getElementById('save-extensive-cv-btn'),
    originalCVStatus: document.getElementById('original-cv-status'),
    extensiveCVStatus: document.getElementById('extensive-cv-status')
};

// Toggle sidebar collapse/expand
export function toggleSidebar() {
    console.log('[BROWSER] Toggling sidebar');
    elements.sidebar.classList.toggle('collapsed');
    
    // Save state to localStorage
    const isCollapsed = elements.sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
    
    // Update collapse button title
    elements.collapseBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
}

// Load sidebar state from localStorage
export function loadSidebarState() {
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        elements.sidebar.classList.add('collapsed');
        elements.collapseBtn.title = 'Expand sidebar';
    }
}

// Auto-resize textarea
export function adjustTextareaHeight() {
    elements.chatInput.style.height = 'auto';
    elements.chatInput.style.height = Math.min(elements.chatInput.scrollHeight, 200) + 'px';
}

// Show toast notification
export function showToast(message, type = 'info') {
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
export function updateFileLabel(event, inputId) {
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

// Display chat history in sidebar
export function displayChatHistory(sessions) {
    console.log(`[BROWSER] Displaying ${sessions.length} sessions in sidebar`);
    if (sessions.length === 0) {
        elements.chatHistory.innerHTML = '<div class="loading-history">No conversations yet</div>';
        return;
    }
    
    elements.chatHistory.innerHTML = '';
    
    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.dataset.sessionId = session.id;
        item.dataset.status = session.status || 'completed'; // Add status data attribute
        if (session.id === getCurrentSessionId()) {
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
        
        elements.chatHistory.appendChild(item);
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
export function updateSessionStatus(sessionId, status) {
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
export function updateChatTitle(title = 'New Conversation') {
    if (elements.chatTitle) {
        elements.chatTitle.textContent = title;
    }
}

// Display session messages in chat window
export function displaySessionMessages(session) {
    elements.chatMessages.innerHTML = '';
    
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

// Display welcome screen
export function displayWelcomeScreen() {
    elements.chatMessages.innerHTML = `
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
}

// Add message to chat
export function addMessage(role, content, isHTML = false) {
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
    const welcomeScreen = elements.chatMessages.querySelector('.welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.remove();
    }
    
    elements.chatMessages.appendChild(message);
    scrollToBottom();
}

// Show loading message
export function showLoadingMessage(message = 'Generating documents...') {
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
    elements.chatMessages.appendChild(loadingDiv);
    scrollToBottom();
    return loadingDiv;
}

// Remove loading message
export function removeLoadingMessage() {
    const loadingMsg = document.getElementById('loading-message');
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

// Create logs container
export function createLogsContainer(loadingElement) {
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
export function appendLogToContainer(container, logEntry) {
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

// Format results with logs as HTML
export function formatResultsWithLogs(results, logs) {
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
export function formatResults(results) {
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
        html += `<button class="btn-download" onclick="window.downloadCoverLetter('${getCurrentSessionId()}')">📥 Download (.docx)</button>`;
        html += '</div>';
        html += '<div class="result-content">';
        html += `<textarea class="editable-content" data-session="${getCurrentSessionId()}" data-type="coverLetter" rows="15">${escapeHtml(results.coverLetter.content)}</textarea>`;
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
        html += `<button class="btn-download" onclick="window.downloadColdEmail('${getCurrentSessionId()}')">📥 Download (.txt)</button>`;
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
        html += `<textarea class="editable-content" data-session="${getCurrentSessionId()}" data-type="coldEmail" rows="10">${escapeHtml(coldEmailContent)}</textarea>`;
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
export function scrollToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Escape HTML to prevent XSS
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show settings view
export function showSettings() {
    elements.chatView.classList.add('hidden');
    elements.settingsView.classList.remove('hidden');
    
    // Load CV content when showing settings
    loadCVContent('original_cv');
    loadCVContent('extensive_cv');
}

// Show chat view
export function showChat() {
    elements.settingsView.classList.add('hidden');
    elements.chatView.classList.remove('hidden');
}

// Update placeholder based on mode
export function updatePlaceholder() {
    console.log(`[BROWSER] Mode toggle changed: Cold outreach = ${elements.modeToggle.checked}`);
    if (elements.modeToggle.checked) {
        elements.chatInput.placeholder = 'Enter company name and website, plus any other info to help the AI find contacts...';
    } else {
        elements.chatInput.placeholder = 'Paste job description or URL...';
    }
}

// Update upload status
export function updateUploadStatus(docType, success, message) {
    const statusDiv = docType === 'original_cv' ? elements.originalCVStatus : elements.extensiveCVStatus;
    statusDiv.className = success ? 'upload-status success' : 'upload-status error';
    statusDiv.textContent = message;
}

// Load CV content into textarea
export async function loadCVContent(docType) {
    const textarea = docType === 'original_cv' ? elements.originalCVTextarea : elements.extensiveCVTextarea;
    const statusDiv = docType === 'original_cv' ? elements.originalCVStatus : elements.extensiveCVStatus;
    
    try {
        const response = await fetch(`/api/load-source-cv/${docType}`);
        const data = await response.json();
        
        if (data.success && data.content) {
            textarea.value = data.content;
            console.log(`[BROWSER] Loaded ${docType} content`);
        } else {
            textarea.value = '';
            console.log(`[BROWSER] No existing ${docType} content found`);
        }
    } catch (error) {
        console.error(`[BROWSER] Error loading ${docType}:`, error);
        statusDiv.className = 'upload-status error';
        statusDiv.textContent = `Failed to load ${docType}`;
    }
}
