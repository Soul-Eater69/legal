import { NextRequest, NextResponse } from 'next/server';
import { generateDocx } from '@/lib/docx-generator';
import { getSession } from '@/lib/session-manager';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    // Parse JSON body
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
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

    // Check if all placeholders are filled
    const unfilledPlaceholders = session.placeholders.filter(p => !p.value);
    if (unfilledPlaceholders.length > 0) {
      return NextResponse.json(
        { error: `Please fill all placeholders. Missing: ${unfilledPlaceholders.map(p => p.description).join(', ')}` },
        { status: 400 }
      );
    }

    // Define the directory where uploaded files are stored
    const uploadDir = path.join(process.cwd(), 'uploads');
    const fileName = `${session.id}_${session.originalFileName}`;
    const filePath = path.join(uploadDir, fileName);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Original file not found. Please upload the document again.' },
        { status: 404 }
      );
    }

    // Read the original document
    const originalBuffer = readFileSync(filePath);
    const arrayBuffer = originalBuffer.buffer.slice(
      originalBuffer.byteOffset,
      originalBuffer.byteOffset + originalBuffer.byteLength
    );

    console.log('Original document size:', arrayBuffer.byteLength);

    // Validate the buffer
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: 'Original document is empty' },
        { status: 400 }
      );
    }

    // Generate the filled document
    const filledBuffer = await generateDocx(arrayBuffer, session.placeholders);

    console.log('Generated document size:', filledBuffer.length);

    // Validate the generated buffer
    if (filledBuffer.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate document - output is empty' },
        { status: 500 }
      );
    }

    // Convert Buffer to Uint8Array for compatibility with NextResponse
    const filledArrayBuffer = new Uint8Array(filledBuffer);

    // Create a clean filename for download
    const baseName = session.originalFileName.replace('.docx', '');
    const timestamp = new Date().toISOString().split('T')[0];
    const downloadFileName = `${baseName}_completed_${timestamp}.docx`;

    // Return the filled document as a blob
    return new NextResponse(filledArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${downloadFileName}"`,
        'Content-Length': filledBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate document. Please try again.' },
      { status: 500 }
    );
  }
}