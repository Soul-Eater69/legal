import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocx, detectPlaceholders } from '@/lib/document-processor';
import { Session } from '@/lib/types';
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
      mkdirSync(uploadDir);
    }

    // Save the uploaded file
    const filePath = path.join(uploadDir, file.name);
    writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));

    // Extract text from document
    const buffer = await file.arrayBuffer();
    const documentText = await extractTextFromDocx(buffer);

    // Detect placeholders
    const placeholders = detectPlaceholders(documentText);

    if (placeholders.length === 0) {
      return NextResponse.json(
        { error: 'No placeholders found in document' },
        { status: 400 }
      );
    }

    // Create preview (first 500 chars)
    const preview = documentText.substring(0, 500) + (documentText.length > 500 ? '...' : '');

    return NextResponse.json({
      placeholders,
      documentPreview: preview,
      fileName: file.name,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process document' },
      { status: 500 }
    );
  }
}