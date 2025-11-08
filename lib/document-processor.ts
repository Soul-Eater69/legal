import mammoth from 'mammoth';
import { Placeholder } from './types';

/**
 * Extracts plain text from a DOCX file
 */
export async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  try {
    // Convert ArrayBuffer to Node.js Buffer (required by mammoth)
    const nodeBuffer = Buffer.from(buffer);
    
    // Extract raw text from the document
    const result = await mammoth.extractRawText({ buffer: nodeBuffer });
    
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('Document appears to be empty');
    }
    
    return result.value;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    throw new Error('Failed to extract text from document. Please ensure it is a valid .docx file.');
  }
}

/**
 * Detects placeholders in document text
 * Supports: [PLACEHOLDER], [____] blank fields
 */
export function detectPlaceholders(text: string): Placeholder[] {
  const placeholders: Map<string, Placeholder> = new Map();
  const seenPositions = new Set<number>();

  // Find all bracket patterns: [something]
  const bracketPattern = /\[([^\]]+)\]/g;
  let match;

  while ((match = bracketPattern.exec(text)) !== null) {
    // Skip duplicates at same position
    if (seenPositions.has(match.index)) continue;
    seenPositions.add(match.index);

    const content = match[1].trim();
    
    // Skip empty content
    if (!content) continue;

    // Check if it's a blank field (only underscores/spaces)
    const isBlank = /^[_\s]+$/.test(content);
    
    // Get surrounding context (80 chars before, 20 after)
    const contextStart = Math.max(0, match.index - 80);
    const contextEnd = Math.min(text.length, match.index + match[0].length + 20);
    const context = text.substring(contextStart, contextEnd).toLowerCase();

    let name: string;
    let description: string;
    let type: Placeholder['type'] = 'text';

    if (isBlank) {
      // Infer placeholder from context for blank fields
      const inference = inferFromContext(context, placeholders.size);
      if (!inference) continue; // Skip if we can't infer
      
      name = inference.name;
      description = inference.description;
      type = inference.type;
    } else {
      // Named placeholder - normalize the name
      name = content
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      if (!name) continue; // Skip invalid names

      // Determine type and description from name
      const details = getPlaceholderDetails(name);
      description = details.description;
      type = details.type;
    }

    // Add to map (prevents duplicates)
    if (!placeholders.has(name)) {
      placeholders.set(name, {
        name,
        value: null,
        type,
        description
      });
    }
  }

  return Array.from(placeholders.values());
}

/**
 * Infers placeholder info from surrounding context
 */
function inferFromContext(context: string, currentCount: number): { name: string; description: string; type: Placeholder['type'] } | null {
  // Check for company name
  if (context.includes('company') && (context.includes('name') || context.includes('corporation'))) {
    return { name: 'COMPANY_NAME', description: 'Company name', type: 'text' };
  }
  
  // Check for investor name
  if (context.includes('investor') && context.includes('name')) {
    return { name: 'INVESTOR_NAME', description: 'Investor name', type: 'text' };
  }
  
  // Check for purchase amount
  if (context.includes('$') || context.includes('purchase amount') || context.includes('investment')) {
    return { name: 'PURCHASE_AMOUNT', description: 'Investment amount', type: 'number' };
  }
  
  // Check for date
  if (context.includes('date') || context.includes('day of')) {
    return { name: 'DATE', description: 'Date', type: 'date' };
  }
  
  // Check for valuation cap
  if (context.includes('valuation cap') || context.includes('post-money')) {
    return { name: 'VALUATION_CAP', description: 'Valuation cap', type: 'number' };
  }
  
  // Check for state
  if (context.includes('state of') || context.includes('incorporated in')) {
    return { name: 'STATE', description: 'State', type: 'text' };
  }
  
  // Can't determine - return null to skip
  return null;
}

/**
 * Gets type and description for a named placeholder
 */
function getPlaceholderDetails(name: string): { description: string; type: Placeholder['type'] } {
  const lower = name.toLowerCase();
  
  // Check for date fields
  if (lower.includes('date') || lower.includes('deadline')) {
    return { description: 'Date', type: 'date' };
  }
  
  // Check for email fields
  if (lower.includes('email') || lower.includes('mail')) {
    return { description: 'Email address', type: 'email' };
  }
  
  // Check for number fields
  if (lower.includes('amount') || lower.includes('price') || 
      lower.includes('valuation') || lower.includes('cap') ||
      lower.includes('value') || lower.includes('cost')) {
    const desc = name.replace(/_/g, ' ')
      .split(' ')
      .map(w => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
    return { description: desc, type: 'number' };
  }
  
  // Check for state
  if (lower.includes('state')) {
    return { description: 'State', type: 'text' };
  }
  
  // Default to text - convert SNAKE_CASE to Title Case
  const description = name
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
  
  return { description, type: 'text' };
}

/**
 * Replaces placeholders in text with their values
 */
export function replacePlaceholders(text: string, placeholders: Placeholder[]): string {
  let result = text;
  
  // Phase 1: Replace named placeholders [PLACEHOLDER_NAME]
  for (const placeholder of placeholders) {
    if (!placeholder.value) continue;
    
    const pattern = new RegExp(escapeRegex(`[${placeholder.name}]`), 'g');
    result = result.replace(pattern, placeholder.value);
  }
  
  // Phase 2: Replace blank fields [____] using context matching
  const blankPattern = /\[_+\]/g;
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  
  let blankMatch;
  while ((blankMatch = blankPattern.exec(result)) !== null) {
    const start = blankMatch.index;
    const end = start + blankMatch[0].length;
    
    // Get context around this blank field
    const contextStart = Math.max(0, start - 80);
    const contextEnd = Math.min(result.length, end + 20);
    const context = result.substring(contextStart, contextEnd).toLowerCase();
    
    // Find matching placeholder by context
    const matched = findMatchingPlaceholder(context, placeholders);
    
    if (matched && matched.value) {
      replacements.push({ start, end, value: matched.value });
    }
  }
  
  // Apply replacements in reverse order (to preserve indices)
  replacements.reverse();
  for (const { start, end, value } of replacements) {
    result = result.substring(0, start) + value + result.substring(end);
  }
  
  return result;
}

/**
 * Finds the placeholder that matches the given context
 */
function findMatchingPlaceholder(context: string, placeholders: Placeholder[]): Placeholder | null {
  // Try to match based on context keywords
  if (context.includes('company') && (context.includes('name') || context.includes('corporation'))) {
    return placeholders.find(p => p.name === 'COMPANY_NAME' && p.value) || null;
  }
  
  if (context.includes('investor') && context.includes('name')) {
    return placeholders.find(p => p.name === 'INVESTOR_NAME' && p.value) || null;
  }
  
  if (context.includes('$') || context.includes('purchase amount')) {
    return placeholders.find(p => p.name === 'PURCHASE_AMOUNT' && p.value) || null;
  }
  
  if (context.includes('date') && !context.includes('update')) {
    return placeholders.find(p => p.name === 'DATE' && p.value) || null;
  }
  
  if (context.includes('valuation cap') || context.includes('post-money')) {
    return placeholders.find(p => p.name === 'VALUATION_CAP' && p.value) || null;
  }
  
  if (context.includes('state of') || context.includes('incorporated')) {
    return placeholders.find(p => p.name === 'STATE' && p.value) || null;
  }
  
  return null;
}

/**
 * Escapes special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}