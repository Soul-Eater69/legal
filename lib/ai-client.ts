import { Placeholder, Message } from './types';

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';

async function callCloudflareAI(messages: { role: string; content: string }[]) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-2-7b-chat-int8`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare AI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.result.response || '';
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
 * Extracts value from user message using pattern matching
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
 */
export async function processConversation(
  userMessage: string,
  placeholders: Placeholder[],
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
  
  // Step 1: Try simple extraction first (faster and more reliable)
  const currentPlaceholder = updatedPlaceholders.find(p => !p.value);
  
  if (currentPlaceholder) {
    const extractedValue = extractValueFromMessage(userMessage, currentPlaceholder);
    
    if (extractedValue) {
      // Validate the extracted value
      const validation = validateValue(extractedValue, currentPlaceholder);
      
      if (!validation.valid) {
        // Return validation feedback
        return {
          response: `⚠️ ${validation.feedback}`,
          updatedPlaceholders,
          isComplete: false
        };
      }
      
      // Format the value appropriately
      let formattedValue = extractedValue;
      
      if (currentPlaceholder.type === 'number') {
        const num = parseFloat(extractedValue);
        if (!isNaN(num)) {
          formattedValue = num.toLocaleString('en-US', { 
            minimumFractionDigits: 0,
            maximumFractionDigits: 2 
          });
        }
      }
      
      currentPlaceholder.value = formattedValue;
      
      // Build response
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
  }
  
  // Step 2: If simple extraction fails, DON'T use AI - just ask for clarification
  // The AI is unreliable and causes false completions
  const unfilledCount = updatedPlaceholders.filter(p => !p.value).length;
  
  let clarificationResponse = "I'm not sure I caught that. ";
  
  if (currentPlaceholder) {
    clarificationResponse += `Could you provide the **${currentPlaceholder.description}**?`;
    
    if (currentPlaceholder.type === 'number') {
      clarificationResponse += ' Just enter the number (e.g., 500000).';
    } else if (currentPlaceholder.type === 'date') {
      clarificationResponse += ' Please use MM/DD/YYYY format (e.g., 12/23/2024).';
    } else if (currentPlaceholder.name.includes('STATE')) {
      clarificationResponse += ' Please use a 2-letter state code (e.g., CA, NY, TX).';
    } else {
      clarificationResponse += ' Please enter the value clearly.';
    }
  }
  
  return {
    response: clarificationResponse,
    updatedPlaceholders,
    isComplete: false
  };
}