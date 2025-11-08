import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocx, detectPlaceholders } from '@/lib/document-processor';
import { createSession } from '@/lib/session-manager';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    console.log('[UPLOAD] Starting upload process...');

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('[UPLOAD] No file in request');
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('[UPLOAD] File received:', file.name, 'Size:', file.size);

    if (!file.name.endsWith('.docx')) {
      console.error('[UPLOAD] Invalid file type:', file.name);
      return NextResponse.json(
        { error: 'Only .docx files are supported' },
        { status: 400 }
      );
    }

    // Define the uploads directory
    const uploadDir = path.join(process.cwd(), 'uploads');
    console.log('[UPLOAD] Upload directory:', uploadDir);

    // Ensure the directory exists
    if (!existsSync(uploadDir)) {
      console.log('[UPLOAD] Creating uploads directory...');
      mkdirSync(uploadDir, { recursive: true });
    }

    // Extract text from document first
    console.log('[UPLOAD] Extracting text from DOCX...');
    const buffer = await file.arrayBuffer();
    const documentText = await extractTextFromDocx(buffer);
    console.log('[UPLOAD] Extracted text length:', documentText.length);

    // Detect placeholders
    console.log('[UPLOAD] Detecting placeholders...');
    const placeholders = detectPlaceholders(documentText);
    console.log('[UPLOAD] Found placeholders:', placeholders.length, JSON.stringify(placeholders));

    if (placeholders.length === 0) {
      console.error('[UPLOAD] No placeholders detected in document');
      return NextResponse.json(
        { error: 'No placeholders found in document. Please ensure your document contains placeholders in the format [PLACEHOLDER_NAME] or [____].' },
        { status: 400 }
      );
    }

    // Create a session
    console.log('[UPLOAD] Creating session...');
    const session = createSession(documentText, file.name, placeholders);
    console.log('[UPLOAD] Session created:', session.id);

    // Save the uploaded file with session ID to avoid conflicts
    // Sanitize filename to prevent issues with special characters
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${session.id}_${sanitizedFileName}`;
    const filePath = path.join(uploadDir, fileName);
    console.log('[UPLOAD] Saving file to:', filePath);

    writeFileSync(filePath, Buffer.from(buffer));
    console.log('[UPLOAD] File saved successfully');

    // Create preview (first 500 chars)
    const preview = documentText.substring(0, 500) + (documentText.length > 500 ? '...' : '');

    console.log('[UPLOAD] Upload complete, returning response');
    return NextResponse.json({
      sessionId: session.id,
      placeholders: session.placeholders,
      documentPreview: preview,
      fileName: file.name,
    });
  } catch (error) {
    console.error('[UPLOAD] ERROR:', error);
    console.error('[UPLOAD] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process document' },
      { status: 500 }
    );
  }
}