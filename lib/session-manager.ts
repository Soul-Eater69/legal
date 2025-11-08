import { Session, Placeholder, Message } from './types';
import { randomBytes } from 'crypto';

// In-memory session store (serverless-compatible)
const sessions: Map<string, Session> = new Map();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generates a unique session ID
 */
export function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Creates a new session
 */
export function createSession(
  documentText: string,
  originalFileName: string,
  originalFileBuffer: string,
  placeholders: Placeholder[]
): Session {
  const sessionId = generateSessionId();
  const now = new Date();

  const session: Session = {
    id: sessionId,
    documentText,
    originalFileName,
    originalFileBuffer,
    placeholders,
    conversationHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  // Store in memory
  sessions.set(sessionId, session);

  // Clean up old sessions
  cleanupOldSessions();

  return session;
}

/**
 * Retrieves a session by ID
 */
export function getSession(sessionId: string): Session | null {
  // Check in-memory store
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  return null;
}

/**
 * Updates a session
 */
export function updateSession(sessionId: string, updates: Partial<Session>): Session | null {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  const updatedSession: Session = {
    ...session,
    ...updates,
    updatedAt: new Date(),
  };

  sessions.set(sessionId, updatedSession);

  return updatedSession;
}

/**
 * Updates placeholders in a session
 */
export function updateSessionPlaceholders(
  sessionId: string,
  placeholders: Placeholder[]
): Session | null {
  return updateSession(sessionId, { placeholders });
}

/**
 * Adds a message to session conversation history
 */
export function addMessageToSession(
  sessionId: string,
  message: Message
): Session | null {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  const updatedHistory = [...session.conversationHistory, message];
  return updateSession(sessionId, { conversationHistory: updatedHistory });
}

/**
 * Deletes a session
 */
export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Cleans up old sessions (older than 24 hours)
 */
function cleanupOldSessions(): void {
  try {
    const now = Date.now();

    // Clean up in-memory sessions
    for (const [sessionId, session] of sessions.entries()) {
      if (now - session.updatedAt.getTime() > SESSION_TIMEOUT) {
        sessions.delete(sessionId);
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old sessions:', error);
  }
}

/**
 * Gets all active sessions (for debugging/admin purposes)
 */
export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}

/**
 * Checks if a session exists and is valid
 */
export function isValidSession(sessionId: string): boolean {
  const session = getSession(sessionId);
  if (!session) {
    return false;
  }

  const now = Date.now();
  return now - session.updatedAt.getTime() < SESSION_TIMEOUT;
}
