import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocx, detectPlaceholders } from '@/lib/document-processor';
import { createSession } from '@/lib/session-manager';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.docx')) {
      return NextResponse.json(
        { error: 'Only .docx files are supported' },
        { status: 400 }
      );
    }

    // Define the uploads directory
    const uploadDir = path.join(process.cwd(), 'uploads');

    // Ensure the directory exists
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    // Extract text from document first
    const buffer = await file.arrayBuffer();
    const documentText = await extractTextFromDocx(buffer);

    // Detect placeholders
    const placeholders = detectPlaceholders(documentText);

    if (placeholders.length === 0) {
      return NextResponse.json(
        { error: 'No placeholders found in document. Please ensure your document contains placeholders in the format [PLACEHOLDER_NAME] or [____].' },
        { status: 400 }
      );
    }

    // Create a session
    const session = createSession(documentText, file.name, placeholders);

    // Save the uploaded file with session ID to avoid conflicts
    const fileName = `${session.id}_${file.name}`;
    const filePath = path.join(uploadDir, fileName);
    writeFileSync(filePath, Buffer.from(buffer));

    // Create preview (first 500 chars)
    const preview = documentText.substring(0, 500) + (documentText.length > 500 ? '...' : '');

    return NextResponse.json({
      sessionId: session.id,
      placeholders: session.placeholders,
      documentPreview: preview,
      fileName: file.name,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process document' },
      { status: 500 }
    );
  }
}