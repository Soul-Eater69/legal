import { NextRequest, NextResponse } from 'next/server';
import { processConversation } from '@/lib/ai-client';
import { Message } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { message, placeholders, conversationHistory } = await request.json();

    if (!message || !placeholders || !conversationHistory) {
      return NextResponse.json(
        { error: 'Missing required fields: message, placeholders, or conversationHistory' },
        { status: 400 }
      );
    }

    // Add user message to history
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    // Process conversation
    const result = await processConversation(
      message,
      placeholders
    );

    // Add assistant message to history
    const assistantMessage: Message = {
      role: 'assistant',
      content: result.response,
      timestamp: new Date(),
    };

    return NextResponse.json({
      message: result.response,
      updatedPlaceholders: result.updatedPlaceholders,
      isComplete: result.isComplete,
      conversationHistory: [...conversationHistory, userMessage, assistantMessage],
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}