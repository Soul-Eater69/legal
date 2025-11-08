import { NextRequest, NextResponse } from 'next/server';
import { processConversation } from '@/lib/ai-client';
import { getSession, updateSessionPlaceholders, addMessageToSession } from '@/lib/session-manager';
import { Message } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message, placeholders } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    if (!message || !placeholders) {
      return NextResponse.json(
        { error: 'Missing required fields: message or placeholders' },
        { status: 400 }
      );
    }

    // Get the session
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or expired. Please upload the document again.' },
        { status: 404 }
      );
    }

    // Add user message to history
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    addMessageToSession(sessionId, userMessage);

    // Process conversation
    const result = await processConversation(
      message,
      placeholders
    );

    // Update session with new placeholders
    updateSessionPlaceholders(sessionId, result.updatedPlaceholders);

    // Add assistant message to history
    const assistantMessage: Message = {
      role: 'assistant',
      content: result.response,
      timestamp: new Date(),
    };
    const updatedSession = addMessageToSession(sessionId, assistantMessage);

    return NextResponse.json({
      message: result.response,
      updatedPlaceholders: result.updatedPlaceholders,
      isComplete: result.isComplete,
      conversationHistory: updatedSession?.conversationHistory || [],
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process message' },
      { status: 500 }
    );
  }
}