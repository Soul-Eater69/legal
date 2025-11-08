import { Placeholder, Message } from './types';

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const AI_ENABLED = Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN);

/**
 * Calls Cloudflare Workers AI for conversational extraction
 */
async function callCloudflareAI(messages: { role: string; content: string }[]): Promise<string> {
  if (!AI_ENABLED) {
    throw new Error('Cloudflare AI not configured');
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloudflare AI error:', response.status, errorText);
      throw new Error(`Cloudflare AI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result?.response || '';
  } catch (error) {
    console.error('Cloudflare AI call failed:', error);
    throw error;
  }
}

/**
 * Uses AI to extract value from conversational input
 */
async function extractWithAI(
  userMessage: string,
  placeholder: Placeholder,
  conversationHistory: Message[]
): Promise<string | null> {
  if (!AI_ENABLED) {
    return null; // Fallback to pattern matching
  }

  try {
    // Build context for AI
    const systemPrompt = `You are a precise data extractor for legal documents. Extract ONLY the ${placeholder.description} from the user's message.

Field to extract: ${placeholder.description}
Field type: ${placeholder.type}
${placeholder.type === 'number' ? 'Format: Pure number without commas or $ (e.g., 500000)' : ''}
${placeholder.type === 'date' ? 'Format: MM/DD/YYYY' : ''}
${placeholder.type === 'state' ? 'Format: 2-letter US state code (e.g., CA)' : ''}

Rules:
1. If you can extract the value, respond ONLY with: EXTRACTED:<value>
2. If multiple values could match, extract the most relevant one
3. If unclear or not found, respond with: UNCLEAR
4. Do NOT add explanations, just follow the format above

Examples:
User: "The company is called Acme Corp"
You: EXTRACTED:Acme Corp

User: "We're based in California, looking for 2 million"
You: EXTRACTED:CA (if extracting state) or EXTRACTED:2000000 (if extracting amount)

User: "What do you mean?"
You: UNCLEAR`;

    // Build message history (last 3 exchanges for context)
    const recentHistory = conversationHistory.slice(-6).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: userMessage }
    ];

    const aiResponse = await callCloudflareAI(messages);

    // Parse AI response
    if (aiResponse.includes('EXTRACTED:')) {
      const extracted = aiResponse.split('EXTRACTED:')[1].trim().split('\n')[0].trim();
      return extracted || null;
    }

    return null; // AI couldn't extract
  } catch (error) {
    console.error('AI extraction failed:', error);
    return null; // Fallback to pattern matching
  }
}

/**
 * Generates a natural clarification question using AI
 */
async function generateClarificationWithAI(
  userMessage: string,
  placeholder: Placeholder
): Promise<string | null> {
  if (!AI_ENABLED) {
    return null;
  }

  try {
    const systemPrompt = `You are a helpful assistant helping users fill legal documents. The user's last message was unclear.

Current field needed: ${placeholder.description} (type: ${placeholder.type})
User said: "${userMessage}"

Generate a brief (max 30 words), friendly clarification question to get the ${placeholder.description}.
${placeholder.type === 'number' ? 'Hint they should provide a number.' : ''}
${placeholder.type === 'date' ? 'Hint they should use MM/DD/YYYY format.' : ''}
${placeholder.type === 'state' ? 'Hint they should use a 2-letter state code.' : ''}

Be conversational and helpful. Do not use markdown or formatting.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate the clarification question.' }
    ];

    const response = await callCloudflareAI(messages);
    return response.trim();
  } catch (error) {
    console.error('AI clarification failed:', error);
    return null;
  }
}

/**
 * Validates extracted value and returns feedback if invalid
 */
function validateValue(value: string, placeholder: Placeholder): { valid: boolean; feedback?: string } {
  if (placeholder.type === 'number') {
    const num = parseFloat(value.replace(/,/g, ''));
    if (isNaN(num)) {
      return { valid: false, feedback: 'That does not look like a valid number. Please enter digits only (e.g., 500000).' };
    }
    if (num <= 0) {
      return { valid: false, feedback: 'The amount should be greater than zero. Please enter a valid amount.' };
    }
    if (placeholder.name.includes('AMOUNT') && num < 1000) {
      return { valid: false, feedback: 'That seems quite low for an investment amount. Did you mean to enter a larger number? (e.g., 50000)' };
    }
  }

  if (placeholder.type === 'date') {
    const datePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    if (!datePattern.test(value)) {
      return { valid: false, feedback: 'Please use MM/DD/YYYY format for the date (e.g., 12/31/2024).' };
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { valid: false, feedback: 'That does not look like a valid date. Please use MM/DD/YYYY format.' };
    }
  }

  if (placeholder.type === 'text' && placeholder.name.includes('STATE')) {
    const validStates = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
    const upperValue = value.toUpperCase();

    if (value.length === 2 && !validStates.includes(upperValue)) {
      return { valid: false, feedback: `"${value}" is not a valid US state code. Please enter a valid 2-letter state code (e.g., CA, NY, TX).` };
    }
  }

  if (placeholder.type === 'text' && value.length < 2) {
    return { valid: false, feedback: 'That seems too short. Could you provide a complete answer?' };
  }

  return { valid: true };
}

/**
 * Formats value for storage
 */
function formatValue(value: string, placeholder: Placeholder): string {
  if (placeholder.type === 'number') {
    const num = parseFloat(value.replace(/,/g, ''));
    if (!isNaN(num)) {
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      });
    }
  }

  if (placeholder.type === 'state') {
    return value.toUpperCase();
  }

  return value.trim();
}

/**
 * Extracts value from user message using pattern matching (FAST TIER)
 */
function extractValueFromMessage(message: string, placeholder: Placeholder): string | null {
  const trimmedMsg = message.trim();

  // For numbers/amounts
  if (placeholder.type === 'number') {
    // Match: $500,000 or $500000 or 500000 or 500,000
    const dollarMatch = trimmedMsg.match(/\$\s*([0-9,]+(?:\.[0-9]{2})?)/);
    if (dollarMatch) return dollarMatch[1].replace(/,/g, '');

    const numberMatch = trimmedMsg.match(/\b([0-9,]+(?:\.[0-9]+)?)\b/);
    if (numberMatch) return numberMatch[1].replace(/,/g, '');
  }

  // For dates
  if (placeholder.type === 'date') {
    const datePatterns = [
      /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,                    // MM/DD/YYYY
      /\b(\d{1,2}-\d{1,2}-\d{4})\b/,                      // MM-DD-YYYY
      /\b([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})\b/i,      // Month DD, YYYY
    ];

    for (const pattern of datePatterns) {
      const match = trimmedMsg.match(pattern);
      if (match) {
        try {
          const date = new Date(match[1]);
          if (!isNaN(date.getTime())) {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            return `${month}/${day}/${year}`;
          }
        } catch (e) {
          // Invalid date, continue
        }
      }
    }
  }

  // For text fields
  if (placeholder.type === 'text') {
    // Remove common filler words to get the actual value
    let cleaned = trimmedMsg
      .replace(/^(it'?s?|the|my|our|is|are|will be|should be)\s+/i, '')
      .replace(/^(company name is|investor name is|name is)\s+/i, '')
      .replace(/[.!?]$/g, '')
      .trim();

    // Look for quoted text first
    const quotedMatch = cleaned.match(/["']([^"']+)["']/);
    if (quotedMatch) return quotedMatch[1].trim();

    // For names, try to extract capitalized words
    if (placeholder.name.includes('NAME')) {
      const nameMatch = cleaned.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|LLC|Corp|Ltd)\.?)?)\b/);
      if (nameMatch) return nameMatch[1];

      // If no capitalized match, return cleaned message if it looks reasonable
      if (cleaned.length > 0 && cleaned.length < 100) {
        return cleaned;
      }
    }

    // For state, try to match state names or abbreviations
    if (placeholder.name.includes('STATE')) {
      const stateMatch = cleaned.match(/\b([A-Z]{2})\b/);
      if (stateMatch) return stateMatch[1];

      const stateNameMatch = cleaned.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
      if (stateNameMatch) return stateNameMatch[1];
    }

    // General text extraction
    if (cleaned.length > 0 && cleaned.length < 200) {
      return cleaned;
    }
  }

  return null;
}

/**
 * Processes user message and updates placeholders
 * HYBRID APPROACH: Pattern matching first, AI fallback for complex cases
 */
export async function processConversation(
  userMessage: string,
  placeholders: Placeholder[],
  conversationHistory: Message[] = []
): Promise<{ response: string; updatedPlaceholders: Placeholder[]; isComplete: boolean }> {
  const updatedPlaceholders = [...placeholders];

  // Check for simple yes/no confirmation responses
  const lowerMsg = userMessage.toLowerCase().trim();
  const isConfirmation = ['yes', 'yeah', 'yep', 'correct', 'right', 'sure', 'ok', 'okay'].includes(lowerMsg);

  // If it's just a confirmation, move to next unfilled field
  if (isConfirmation) {
    const nextPlaceholder = updatedPlaceholders.find(p => !p.value);

    if (nextPlaceholder) {
      let response = `Great! Now, what's the **${nextPlaceholder.description}**?`;

      if (nextPlaceholder.type === 'number') {
        response += ' (enter a number, e.g., 500000)';
      } else if (nextPlaceholder.type === 'date') {
        response += ' (MM/DD/YYYY format)';
      } else if (nextPlaceholder.name.includes('STATE')) {
        response += ' (2-letter state code, e.g., CA)';
      }

      return {
        response,
        updatedPlaceholders,
        isComplete: false
      };
    } else {
      // Actually complete
      return {
        response: "🎉 Perfect! All fields are complete. Review the values on the left, then click **'Download Completed Document'** when ready.",
        updatedPlaceholders,
        isComplete: true
      };
    }
  }

  const currentPlaceholder = updatedPlaceholders.find(p => !p.value);

  if (!currentPlaceholder) {
    return {
      response: "🎉 All fields are complete! Click **'Download Completed Document'** when ready.",
      updatedPlaceholders,
      isComplete: true
    };
  }

  // TIER 1: Try pattern matching first (instant, free)
  let extractedValue = extractValueFromMessage(userMessage, currentPlaceholder);

  // TIER 2: If pattern matching fails, try AI extraction (if enabled)
  if (!extractedValue && AI_ENABLED) {
    console.log(`Pattern matching failed, trying AI for: ${currentPlaceholder.description}`);
    extractedValue = await extractWithAI(userMessage, currentPlaceholder, conversationHistory);

    if (extractedValue) {
      console.log(`AI extracted: ${extractedValue}`);
    }
  }

  // If we extracted something, validate and update
  if (extractedValue) {
    const validation = validateValue(extractedValue, currentPlaceholder);

    if (!validation.valid) {
      return {
        response: `⚠️ ${validation.feedback}`,
        updatedPlaceholders,
        isComplete: false
      };
    }

    // Format and store the value
    const formattedValue = formatValue(extractedValue, currentPlaceholder);
    currentPlaceholder.value = formattedValue;

    // Check if complete
    const isComplete = updatedPlaceholders.every(p => p.value);
    let response = `✓ Got it! **${currentPlaceholder.description}**: ${formattedValue}`;

    if (isComplete) {
      response += "\n\n🎉 Perfect! All fields are complete. Review the values on the left, then click **'Download Completed Document'** when ready.";
    } else {
      const nextPlaceholder = updatedPlaceholders.find(p => !p.value);
      if (nextPlaceholder) {
        response += `\n\nNext, what's the **${nextPlaceholder.description}**?`;

        if (nextPlaceholder.type === 'number') {
          response += ' (enter a number, e.g., 500000)';
        } else if (nextPlaceholder.type === 'date') {
          response += ' (MM/DD/YYYY format)';
        } else if (nextPlaceholder.name.includes('STATE')) {
          response += ' (2-letter state code, e.g., CA)';
        }
      }
    }

    return {
      response,
      updatedPlaceholders,
      isComplete
    };
  }

  // TIER 3: Extraction failed - generate clarification
  let clarificationResponse: string;

  if (AI_ENABLED) {
    const aiClarification = await generateClarificationWithAI(userMessage, currentPlaceholder);
    if (aiClarification) {
      clarificationResponse = aiClarification;
    } else {
      clarificationResponse = buildDefaultClarification(currentPlaceholder);
    }
  } else {
    clarificationResponse = buildDefaultClarification(currentPlaceholder);
  }

  return {
    response: clarificationResponse,
    updatedPlaceholders,
    isComplete: false
  };
}

/**
 * Builds a default clarification message
 */
function buildDefaultClarification(placeholder: Placeholder): string {
  let response = `I'm not sure I caught that. Could you provide the **${placeholder.description}**?`;

  if (placeholder.type === 'number') {
    response += ' Just enter the number (e.g., 500000).';
  } else if (placeholder.type === 'date') {
    response += ' Please use MM/DD/YYYY format (e.g., 12/23/2024).';
  } else if (placeholder.name.includes('STATE')) {
    response += ' Please use a 2-letter state code (e.g., CA, NY, TX).';
  } else {
    response += ' Please enter the value clearly.';
  }

  return response;
}

/**
 * Returns AI configuration status (for debugging/logging)
 */
export function getAIStatus(): { enabled: boolean; provider: string } {
  return {
    enabled: AI_ENABLED,
    provider: AI_ENABLED ? 'Cloudflare Workers AI (Llama 3.1 8B)' : 'Pattern Matching Only'
  };
}
