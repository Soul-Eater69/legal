import { Placeholder } from './types';
import PizZip from "pizzip"
import Docxtemplater from 'docxtemplater';

/**
 * Generates filled DOCX by directly modifying the original file
 * This preserves all formatting, styles, headers, footers, etc.
 */
export async function generateDocx(
  originalBuffer: ArrayBuffer,
  placeholders: Placeholder[]
): Promise<Buffer> {
  try {
    // Validate buffer is not empty
    if (!originalBuffer || originalBuffer.byteLength === 0) {
      throw new Error('Original buffer is empty or invalid');
    }

    console.log('Buffer size:', originalBuffer.byteLength);

    // Convert ArrayBuffer to Buffer correctly
    const uint8Array = new Uint8Array(originalBuffer);
    const nodeBuffer = Buffer.from(uint8Array);
    
    console.log('Node buffer size:', nodeBuffer.length);

    // Create a PizZip instance with the original file
    const zip = new PizZip(nodeBuffer);
    
    // Create docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Build data object from placeholders
    const data: Record<string, string> = {};
    for (const placeholder of placeholders) {
      if (placeholder.value) {
        data[placeholder.name] = placeholder.value;
        data[placeholder.name.toLowerCase()] = placeholder.value;
      }
    }

    console.log('Placeholder data:', data);

    // Set the template data
    doc.setData(data);

    // Render the document (replace placeholders)
    doc.render();

    // Get the filled document as a buffer
    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    return buffer;
  } catch (error) {
    console.error('Error generating DOCX:', error);
    throw new Error('Failed to generate document. Please try again.');
  }
}