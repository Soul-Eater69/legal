export interface Placeholder {
  name: string;
  value: string | null;
  type: 'text' | 'date' | 'number' | 'email' | 'state';
  description?: string;
}

export interface Session {
  id: string;
  documentText: string;
  originalFileName: string;
  placeholders: Placeholder[];
  conversationHistory: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface UploadResponse {
  sessionId: string;
  placeholders: Placeholder[];
  documentPreview: string;
}

export interface ChatResponse {
  message: string;
  updatedPlaceholders: Placeholder[];
  isComplete: boolean;
}