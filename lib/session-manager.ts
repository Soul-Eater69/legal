import { Session, Placeholder, Message } from './types';
import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

// In-memory session store with persistent file backup
const sessions: Map<string, Session> = new Map();
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

// Ensure sessions directory exists
if (!existsSync(SESSIONS_DIR)) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

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
  placeholders: Placeholder[]
): Session {
  const sessionId = generateSessionId();
  const now = new Date();

  const session: Session = {
    id: sessionId,
    documentText,
    originalFileName,
    placeholders,
    conversationHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  // Store in memory
  sessions.set(sessionId, session);

  // Persist to disk
  persistSession(session);

  // Clean up old sessions
  cleanupOldSessions();

  return session;
}

/**
 * Retrieves a session by ID
 */
export function getSession(sessionId: string): Session | null {
  // Check in-memory first
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  // Try loading from disk
  const session = loadSessionFromDisk(sessionId);
  if (session) {
    sessions.set(sessionId, session);
    return session;
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
  persistSession(updatedSession);

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
  sessions.delete(sessionId);

  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
  if (existsSync(sessionFile)) {
    const fs = require('fs');
    fs.unlinkSync(sessionFile);
    return true;
  }

  return false;
}

/**
 * Persists a session to disk
 */
function persistSession(session: Session): void {
  try {
    const sessionFile = path.join(SESSIONS_DIR, `${session.id}.json`);
    writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to persist session ${session.id}:`, error);
  }
}

/**
 * Loads a session from disk
 */
function loadSessionFromDisk(sessionId: string): Session | null {
  try {
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (!existsSync(sessionFile)) {
      return null;
    }

    const data = readFileSync(sessionFile, 'utf-8');
    const session = JSON.parse(data);

    // Convert date strings back to Date objects
    session.createdAt = new Date(session.createdAt);
    session.updatedAt = new Date(session.updatedAt);
    session.conversationHistory = session.conversationHistory.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));

    return session;
  } catch (error) {
    console.error(`Failed to load session ${sessionId}:`, error);
    return null;
  }
}

/**
 * Cleans up old sessions (older than 24 hours)
 */
function cleanupOldSessions(): void {
  try {
    const now = Date.now();
    const fs = require('fs');

    // Clean up in-memory sessions
    for (const [sessionId, session] of sessions.entries()) {
      if (now - session.updatedAt.getTime() > SESSION_TIMEOUT) {
        sessions.delete(sessionId);
      }
    }

    // Clean up disk sessions
    if (existsSync(SESSIONS_DIR)) {
      const files = fs.readdirSync(SESSIONS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(SESSIONS_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > SESSION_TIMEOUT) {
          fs.unlinkSync(filePath);
        }
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
