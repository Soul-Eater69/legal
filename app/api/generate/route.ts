import { NextRequest, NextResponse } from 'next/server';
import { generateDocx } from '@/lib/docx-generator';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    // Parse JSON body
    const { placeholders, fileName } = await request.json();

    if (!placeholders || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: placeholders or fileName' },
        { status: 400 }
      );
    }

    // Define the directory where uploaded files are stored
    const uploadDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, fileName);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
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
    const filledBuffer = await generateDocx(arrayBuffer, placeholders);

    console.log('Generated document size:', filledBuffer.length);

    // Convert Buffer to Uint8Array for compatibility with NextResponse
    const filledArrayBuffer = new Uint8Array(filledBuffer);

    // Return the filled document as a blob
    return new NextResponse(filledArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="filled-${fileName}"`,
      },
    });

  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json(
      { error: 'Failed to generate document. Please try again.' },
      { status: 500 }
    );
  }
}