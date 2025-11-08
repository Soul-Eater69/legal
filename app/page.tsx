'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, MessageSquare, Download, FileText, Loader2, CheckCircle2, Circle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Placeholder {
  name: string;
  value: string | null;
  type: string;
  description: string;
}

export default function DocumentFillerPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Check if all placeholders are filled
    if (placeholders.length > 0) {
      const allFilled = placeholders.every(p => p.value);
      setIsComplete(allFilled);
    }
  }, [placeholders]);

  const handleFileSelect = async (selectedFile: File | null) => {
    if (!selectedFile) return;

    setError(null);
    setFile(selectedFile);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      setPlaceholders(data.placeholders);

      const unfilledPlaceholder = data.placeholders.find((p: Placeholder) => !p.value);
      const initialMessage = `I've analyzed your document and found ${data.placeholders.length} field${data.placeholders.length !== 1 ? 's' : ''} to fill.\n\n${unfilledPlaceholder ? `Let's start! What's the **${unfilledPlaceholder.description}**?` : 'All fields are ready to fill!'}`;

      setMessages([{ role: 'assistant', content: initialMessage }]);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload document');
      setFile(null);
      setSessionId(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.docx')) {
      handleFileSelect(droppedFile);
    } else {
      setError('Please upload a .docx file');
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isChatting || !sessionId) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatting(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
          placeholders,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Chat request failed');
      }

      const data = await response.json();
      setPlaceholders(data.updatedPlaceholders);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsChatting(false);
    }
  };

  const handleDownload = async () => {
    if (!sessionId) {
      setError('No active session. Please upload a document first.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      const blob = await response.blob();

      // Validate that we actually got a document
      if (blob.size === 0) {
        throw new Error('Generated document is empty');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Extract filename from Content-Disposition header if available
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${file?.name.replace('.docx', '') || 'document'}_completed_${new Date().toISOString().split('T')[0]}.docx`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      setMessages(prev => [...prev, { role: 'assistant', content: `🎉 Your document has been downloaded successfully! The file "${filename}" should be in your downloads folder.` }]);
    } catch (err) {
      console.error('Download error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate document');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setSessionId(null);
    setFile(null);
    setPlaceholders([]);
    setMessages([]);
    setInput('');
    setIsComplete(false);
    setError(null);
  };

  // Format message content with markdown-style formatting
  const formatMessageContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, lineIdx) => {
      // Handle bullet points
      if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
        const bulletContent = line.replace(/^[•\-]\s*/, '');
        return (
          <div key={lineIdx} className="flex gap-2 ml-2">
            <span className="text-foreground/70">•</span>
            <span>{formatInlineContent(bulletContent)}</span>
          </div>
        );
      }

      // Handle numbered lists
      if (/^\d+\.\s/.test(line.trim())) {
        return (
          <div key={lineIdx} className="ml-2">
            {formatInlineContent(line)}
          </div>
        );
      }

      // Regular line
      return (
        <div key={lineIdx}>
          {formatInlineContent(line)}
        </div>
      );
    });
  };

  // Format inline content (bold, italic, code)
  const formatInlineContent = (text: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    // Pattern for **bold**, *italic*, and `code`
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const matched = match[0];
      if (matched.startsWith('**') && matched.endsWith('**')) {
        // Bold
        parts.push(
          <strong key={match.index} className="font-semibold text-foreground">
            {matched.slice(2, -2)}
          </strong>
        );
      } else if (matched.startsWith('*') && matched.endsWith('*')) {
        // Italic
        parts.push(
          <em key={match.index} className="italic">
            {matched.slice(1, -1)}
          </em>
        );
      } else if (matched.startsWith('`') && matched.endsWith('`')) {
        // Code
        parts.push(
          <code key={match.index} className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
            {matched.slice(1, -1)}
          </code>
        );
      }

      lastIndex = match.index + matched.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const filledCount = placeholders.filter(p => p.value).length;
  const progress = placeholders.length > 0 ? (filledCount / placeholders.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-foreground" />
              <div>
                <h1 className="text-2xl font-bold">Document Assistant</h1>
                <p className="text-sm text-muted-foreground">AI-powered form filling</p>
              </div>
            </div>
            {file && (
              <Button variant="outline" size="sm" onClick={handleReset}>
                <X className="w-4 h-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-destructive hover:text-destructive/80 transition-colors flex-shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Upload Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!file ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-foreground/50 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium mb-2">Drop your .docx file here</p>
                    <p className="text-xs text-muted-foreground">or click to browse</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".docx"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <FileText className="w-5 h-5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                )}
                
                {isUploading && (
                  <div className="mt-4 flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Processing...</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {placeholders.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Fields completed</span>
                      <span className="font-medium">{filledCount}/{placeholders.length}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-600 dark:bg-green-500 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {placeholders.map((placeholder, index) => (
                      <div 
                        key={index} 
                        className={cn(
                          "flex items-start gap-3 text-sm p-2 rounded-lg transition-colors",
                          placeholder.value && "bg-green-50 dark:bg-green-950/20"
                        )}
                      >
                        {placeholder.value ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{placeholder.description}</p>
                          {placeholder.value && (
                            <p className="text-sm text-foreground mt-1 font-mono bg-white dark:bg-gray-900 px-2 py-1 rounded border">
                              {placeholder.value}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {isComplete && (
                    <Button
                      onClick={handleDownload}
                      disabled={isGenerating}
                      className="w-full mt-6 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                      size="lg"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Download Completed Document
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2">
            <Card className="h-[calc(100vh-200px)] flex flex-col">
              <CardHeader className="border-b">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Conversation
                </CardTitle>
              </CardHeader>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Upload a document to start</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex",
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-lg p-4",
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-muted text-foreground'
                          )}
                        >
                          <div className="text-sm leading-relaxed space-y-1">
                            {formatMessageContent(msg.content)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {isChatting && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg p-4">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    placeholder={file ? "Type your response..." : "Upload a document first"}
                    disabled={!file || isChatting}
                    className="flex-1 px-4 py-3 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || !file || isChatting}
                    size="lg"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}