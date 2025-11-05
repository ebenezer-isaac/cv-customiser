// App state
let currentSessionId = null;
let sessions = [];

// DOM Elements
const generateTab = document.getElementById('generate-tab');
const historyTab = document.getElementById('history-tab');
const generateForm = document.getElementById('generate-form');
const newChatBtn = document.getElementById('new-chat-btn');
const generateBtn = document.getElementById('generate-btn');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const resultsContent = document.getElementById('results-content');
const historyList = document.getElementById('history-list');
const sessionDetail = document.getElementById('session-detail');
const sessionContent = document.getElementById('session-content');

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    if (tabName === 'generate') {
        generateTab.classList.add('active');
    } else if (tabName === 'history') {
        historyTab.classList.add('active');
        loadHistory();
    }
}

// New chat button
newChatBtn.addEventListener('click', () => {
    currentSessionId = null;
    generateForm.reset();
    results.classList.add('hidden');
    generateForm.scrollIntoView({ behavior: 'smooth' });
});

// Generate form submission
generateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(generateForm);
    
    if (currentSessionId) {
        formData.append('sessionId', currentSessionId);
    }

    // Show loading state
    loading.classList.remove('hidden');
    results.classList.add('hidden');
    generateBtn.disabled = true;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            currentSessionId = data.sessionId;
            displayResults(data.results, data.sessionId);
            results.classList.remove('hidden');
        } else {
            alert('Error: ' + (data.message || data.error || 'Failed to generate documents'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to generate documents. Please try again.');
    } finally {
        loading.classList.add('hidden');
        generateBtn.disabled = false;
    }
});

// Display results
function displayResults(resultsData, sessionId) {
    resultsContent.innerHTML = '';

    // CV Result
    const cvDiv = document.createElement('div');
    cvDiv.className = 'result-item';
    
    const cvStatus = resultsData.cv.success ? 'success' : 'warning';
    const cvStatusText = resultsData.cv.success 
        ? `✓ Success (${resultsData.cv.pageCount} pages, ${resultsData.cv.attempts} attempt${resultsData.cv.attempts > 1 ? 's' : ''})`
        : `⚠ Generated with warnings (${resultsData.cv.attempts} attempts)`;
    
    cvDiv.innerHTML = `
        <h4>
            CV (LaTeX)
            <span class="status-badge status-${cvStatus}">${cvStatusText}</span>
        </h4>
        <div class="result-content">${escapeHtml(resultsData.cv.content)}</div>
        ${resultsData.cv.error ? `<p class="text-muted mt-20">Note: ${resultsData.cv.error}</p>` : ''}
    `;
    resultsContent.appendChild(cvDiv);

    // Cover Letter Result
    const coverLetterDiv = document.createElement('div');
    coverLetterDiv.className = 'result-item';
    coverLetterDiv.innerHTML = `
        <h4>
            Cover Letter
            <span class="status-badge status-success">✓ Generated</span>
        </h4>
        <div class="result-content">${escapeHtml(resultsData.coverLetter.content)}</div>
    `;
    resultsContent.appendChild(coverLetterDiv);

    // Cold Email Result
    const emailDiv = document.createElement('div');
    emailDiv.className = 'result-item';
    emailDiv.innerHTML = `
        <h4>
            Cold Email
            <span class="status-badge status-success">✓ Generated</span>
        </h4>
        <div class="result-content">${escapeHtml(resultsData.coldEmail.content)}</div>
    `;
    resultsContent.appendChild(emailDiv);

    // Session info
    const sessionInfo = document.createElement('div');
    sessionInfo.className = 'session-info mt-20';
    sessionInfo.innerHTML = `
        <p><strong>Session ID:</strong> ${sessionId}</p>
        <p class="text-muted">All files have been saved to the session directory.</p>
        <button class="btn btn-success btn-small mt-20" onclick="approveSession('${sessionId}')">
            Approve Session
        </button>
    `;
    resultsContent.appendChild(sessionInfo);
}

// Approve session
async function approveSession(sessionId) {
    try {
        const response = await fetch(`/api/approve/${sessionId}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert('Session approved successfully!');
        } else {
            alert('Error: ' + (data.message || data.error || 'Failed to approve session'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to approve session. Please try again.');
    }
}

// Load history
async function loadHistory() {
    historyList.innerHTML = '<p class="text-muted">Loading sessions...</p>';
    sessionDetail.classList.add('hidden');

    try {
        const response = await fetch('/api/history');
        const data = await response.json();

        if (response.ok && data.success) {
            sessions = data.sessions;
            displayHistory(sessions);
        } else {
            historyList.innerHTML = '<p class="text-muted">Failed to load history.</p>';
        }
    } catch (error) {
        console.error('Error:', error);
        historyList.innerHTML = '<p class="text-muted">Failed to load history.</p>';
    }
}

// Display history
function displayHistory(sessions) {
    if (sessions.length === 0) {
        historyList.innerHTML = '<p class="text-muted">No sessions found. Start by generating documents!</p>';
        return;
    }

    historyList.innerHTML = '';

    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.onclick = () => loadSessionDetail(session.id);

        const createdDate = new Date(session.createdAt).toLocaleString();
        const approvedBadge = session.approved 
            ? '<span class="status-badge status-success">Approved</span>' 
            : '';

        item.innerHTML = `
            <div class="history-item-header">
                <h4>${session.companyInfo || 'Untitled Session'} ${approvedBadge}</h4>
                <span class="status-badge status-info">${session.status}</span>
            </div>
            <div class="history-item-meta">
                <p>Created: ${createdDate}</p>
                <p>ID: ${session.id}</p>
                ${session.hasFiles ? '<p>✓ Has generated files</p>' : ''}
            </div>
        `;

        historyList.appendChild(item);
    });
}

// Load session detail
async function loadSessionDetail(sessionId) {
    try {
        const response = await fetch(`/api/history/${sessionId}`);
        const data = await response.json();

        if (response.ok && data.success) {
            displaySessionDetail(data.session);
            sessionDetail.classList.remove('hidden');
            sessionDetail.scrollIntoView({ behavior: 'smooth' });
        } else {
            alert('Failed to load session details.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to load session details.');
    }
}

// Display session detail
function displaySessionDetail(session) {
    const createdDate = new Date(session.createdAt).toLocaleString();
    const updatedDate = new Date(session.updatedAt).toLocaleString();

    let html = `
        <div class="session-info">
            <p><strong>Session ID:</strong> ${session.id}</p>
            <p><strong>Company:</strong> ${session.companyInfo || 'N/A'}</p>
            <p><strong>Status:</strong> 
                <span class="status-badge status-info">${session.status}</span>
                ${session.approved ? '<span class="status-badge status-success">Approved</span>' : ''}
            </p>
            <p><strong>Created:</strong> ${createdDate}</p>
            <p><strong>Updated:</strong> ${updatedDate}</p>
        </div>

        <h3>Job Description</h3>
        <div class="result-content mb-20">
            ${escapeHtml(session.jobDescription || 'N/A')}
        </div>
    `;

    if (session.generatedFiles && Object.keys(session.generatedFiles).length > 0) {
        html += `<h3>Generated Files</h3>`;
        
        if (session.generatedFiles.cv) {
            html += `
                <div class="session-info">
                    <p><strong>CV:</strong></p>
                    <p>LaTeX: ${session.generatedFiles.cv.texPath || 'N/A'}</p>
                    ${session.generatedFiles.cv.pdfPath ? `<p>PDF: ${session.generatedFiles.cv.pdfPath}</p>` : ''}
                    <p>Page Count: ${session.generatedFiles.cv.pageCount || 'N/A'}</p>
                    <p>Attempts: ${session.generatedFiles.cv.attempts || 'N/A'}</p>
                    <p>Status: ${session.generatedFiles.cv.success ? '✓ Success' : '⚠ Generated with warnings'}</p>
                </div>
            `;
        }

        if (session.generatedFiles.coverLetter) {
            html += `
                <div class="session-info">
                    <p><strong>Cover Letter:</strong> ${session.generatedFiles.coverLetter.path || 'N/A'}</p>
                </div>
            `;
        }

        if (session.generatedFiles.coldEmail) {
            html += `
                <div class="session-info">
                    <p><strong>Cold Email:</strong> ${session.generatedFiles.coldEmail.path || 'N/A'}</p>
                </div>
            `;
        }
    }

    if (session.chatHistory && session.chatHistory.length > 0) {
        html += `<h3>Chat History</h3>`;
        session.chatHistory.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString();
            html += `
                <div class="chat-message ${msg.role}">
                    <div class="chat-message-header">${msg.role === 'user' ? 'You' : 'Assistant'}</div>
                    <div class="chat-message-content">${escapeHtml(msg.content)}</div>
                    <div class="chat-message-time">${time}</div>
                </div>
            `;
        });
    }

    if (!session.approved) {
        html += `
            <button class="btn btn-success mt-20" onclick="approveSession('${session.id}')">
                Approve Session
            </button>
        `;
    }

    sessionContent.innerHTML = html;
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize app
console.log('CV Customiser App initialized');
