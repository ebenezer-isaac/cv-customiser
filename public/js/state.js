// Application state management
export const state = {
    currentSessionId: null,
    sessions: [],
    isGenerating: false,
    activePollInterval: null
};

// Constants
export const PREVIEW_TRUNCATE_LENGTH = 500; // Characters to show in CV preview
export const MAX_LOG_PREVIEW_LENGTH = 100; // Characters to show in log preview for debugging

// State getters and setters
export function setCurrentSessionId(id) {
    state.currentSessionId = id;
}

export function getCurrentSessionId() {
    return state.currentSessionId;
}

export function setSessions(sessionsList) {
    state.sessions = sessionsList;
}

export function getSessions() {
    return state.sessions;
}

export function setIsGenerating(generating) {
    state.isGenerating = generating;
}

export function isGenerating() {
    return state.isGenerating;
}

export function setActivePollInterval(interval) {
    state.activePollInterval = interval;
}

export function getActivePollInterval() {
    return state.activePollInterval;
}

export function clearActivePollInterval() {
    if (state.activePollInterval) {
        clearInterval(state.activePollInterval);
        state.activePollInterval = null;
    }
}

// Chat mode persistence
export function getLastChatMode() {
    const saved = localStorage.getItem('lastChatMode');
    return saved === 'cold_outreach' ? 'cold_outreach' : 'standard';
}

export function setLastChatMode(mode) {
    localStorage.setItem('lastChatMode', mode);
}

export function isColdOutreachMode() {
    return getLastChatMode() === 'cold_outreach';
}
