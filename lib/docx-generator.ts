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
    
    // Create docxtemplater instance with custom delimiters
    // Use square brackets [PLACEHOLDER] instead of default curly braces {PLACEHOLDER}
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '[',
        end: ']'
      }
    });

    // Log the document XML content to see actual placeholders
    const documentXml = zip.files['word/document.xml']?.asText();
    console.log('Document XML sample (first 1000 chars):', documentXml?.substring(0, 1000));

    // Count how many placeholders docxtemplater will find
    const foundPlaceholders = documentXml?.match(/\[([^\]]+)\]/g) || [];
    console.log('Placeholders found in XML:', foundPlaceholders);

    // Build data object from placeholders
    const data: Record<string, string> = {};
    for (const placeholder of placeholders) {
      if (placeholder.value) {
        data[placeholder.name] = placeholder.value;
        data[placeholder.name.toLowerCase()] = placeholder.value;
      }
    }

    console.log('Placeholder data to inject:', data);
    console.log('Number of filled placeholders:', Object.keys(data).length);

    // Set the template data
    doc.setData(data);

    try {
      // Render the document (replace placeholders)
      doc.render();
    } catch (renderError: any) {
      console.error('Render error details:', {
        message: renderError.message,
        properties: renderError.properties,
        stack: renderError.stack
      });
      throw renderError;
    }

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