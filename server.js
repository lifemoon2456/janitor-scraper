const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');

const app = express();
const port = process.env.PORT || 3000;

// Directory for storing logs
const LOGS_DIR = path.join(__dirname, 'logs');

// Ensure logs directory exists
async function ensureLogsDirectory() {
  try {
    await fs.access(LOGS_DIR);
    console.log(`Logs directory exists at: ${LOGS_DIR}`);
  } catch (error) {
    console.log(`Creating logs directory at: ${LOGS_DIR}`);
    await fs.mkdir(LOGS_DIR, { recursive: true });
  }
}

// Configure your custom API keys here
const VALID_API_KEYS = new Set([
  process.env.API_KEY || 'custom-key'
]);

// Keep track of character names we've seen
const loggedCharacters = new Set();

// Middleware to check API key
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey || !VALID_API_KEYS.has(apiKey)) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'invalid_request_error'
      }
    });
  }
  next();
};

// Function to extract all character names from system messages
function extractAllCharacters(messages) {
  const characters = [];
  
  // Process system messages to find all character tags
  const systemMessages = messages.filter(msg => msg.role === 'system');
  
  for (const message of systemMessages) {
    if (!message.content) continue;
    
    // Remove system tags to avoid matching them
    const contentWithoutSystem = message.content.replace(/<system>.*?<\/system>/gs, '');
    
    // Find all character tags in the content - match even with emojis and special chars
    const tagMatches = Array.from(contentWithoutSystem.matchAll(/<([^>]+)>([^<]*|<(?!\/\1>))*<\/\1>/g));
    
    for (const match of tagMatches) {
      if (match && match[1]) {
        const tagName = match[1].trim();
        // Filter out common non-character tags
if (!['system', 'scenario', 'example_dialogs', 'roleplay_guidelines', '/', 'system_instructions', "narrator's persona"].includes(tagName.toLowerCase())) {          // Check if this looks like a character tag (has content describing a character)
          const tagContent = match[0] || '';
          if (tagContent.includes('Name:') || 
              tagContent.includes('Age:') || 
              tagContent.includes('Personality:') ||
              tagContent.includes('Character Details') ||
              tagContent.length > 200) { // Long content is likely a character description
            characters.push(tagName);
          }
        }
      }
    }
    
    // Try to find Name ("Character Name") pattern as well
    const nameQuotesMatches = contentWithoutSystem.match(/Name\s*\(\s*"([^"]+)"\s*\)/g);
    if (nameQuotesMatches) {
      for (const nameMatch of nameQuotesMatches) {
        const name = nameMatch.match(/Name\s*\(\s*"([^"]+)"\s*\)/)[1].trim();
        characters.push(name);
      }
    }
  }
  
  return characters;
}

// Function to detect user's roleplay character from messages
function detectUserCharacter(messages, allCharacters) {
  // Check recent user messages for character prefix pattern
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'user' && message.content) {
      // Look for a character name prefix followed by colon
      // This regex matches even complex names with emojis
      const prefixMatch = message.content.match(/^([^:]+):/);
      if (prefixMatch && prefixMatch[1]) {
        const potentialUserChar = prefixMatch[1].trim();
        
        // Check if this matches closely with any known character
        for (const character of allCharacters) {
          // Compare without emojis and special chars for better matching
          const normalizedPotential = potentialUserChar.replace(/[^\w\s]/g, '').trim().toLowerCase();
          const normalizedCharacter = character.replace(/[^\w\s]/g, '').trim().toLowerCase();
          
          // If the normalized versions match, this is the user's character
          if (normalizedPotential === normalizedCharacter || 
              normalizedPotential.includes(normalizedCharacter) || 
              normalizedCharacter.includes(normalizedPotential)) {
            return character;
          }
        }
        
        // If no exact match but we have a prefix, use it
        return potentialUserChar;
      }
    }
  }
  
  return null;
}

// Function to determine which character the AI is roleplaying as
function determineAICharacter(allCharacters, userCharacter) {
  if (!allCharacters.length) return "unknown";
  
  // If there's only one character, use it
  if (allCharacters.length === 1) return allCharacters[0];
  
  // If we know the user's character, the AI character is likely different
  if (userCharacter) {
    // Find a character that's different from the user character
    for (const character of allCharacters) {
      // Compare without emojis and special chars
      const normalizedUser = userCharacter.replace(/[^\w\s]/g, '').trim().toLowerCase();
      const normalizedChar = character.replace(/[^\w\s]/g, '').trim().toLowerCase();
      
      // If they're different, this is likely the AI character
      if (normalizedUser !== normalizedChar && 
          !normalizedUser.includes(normalizedChar) && 
          !normalizedChar.includes(normalizedUser)) {
        return character;
      }
    }
  }
  
  // If we couldn't determine, use the first character that isn't likely the user
  for (const character of allCharacters) {
    // Skip very short names which might be user-typed
    if (character.length > 2) return character;
  }
  
  // Fallback to first character
  return allCharacters[0];
}

// Replace user character with {{user}} in text
function anonymizeUserCharacter(text, userCharacter) {
  if (!userCharacter || !text.includes(userCharacter)) return text;
  
  // Escape special chars in the user character for regex
  const escapedChar = userCharacter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Replace at start of lines (Character: message)
  text = text.replace(new RegExp(`^${escapedChar}:`, 'gm'), '{{user}}:');
  
  // Replace as a whole word with word boundaries
  text = text.replace(new RegExp(`\\b${escapedChar}\\b`, 'g'), '{{user}}');
  
  // Also try without word boundaries for names with special chars
  text = text.replace(new RegExp(escapedChar, 'g'), '{{user}}');
  
  return text;
}

// Process message content and format it for logs
function formatMessageContent(messages, userCharacter) {
  let formattedContent = '';
  
  for (const message of messages) {
    if (!message.content) continue;
    
    // Process based on role
    if (message.role === 'system') {
      formattedContent += `### SYSTEM MESSAGE ###\n\n`;
      
      // Process content to extract tagged sections
      const content = message.content;
      
      // Find all XML-like tags and their content
      const tagPattern = /<([^>]+)>([\s\S]*?)<\/\1>/g;
      let match;
      let tagFound = false;
      
      while ((match = tagPattern.exec(content)) !== null) {
        tagFound = true;
        const tagName = match[1].trim();
        let tagContent = match[2];
        
        // Convert escaped newlines to actual newlines
        tagContent = tagContent.replace(/\\n/g, '\n');
        
        // Anonymize user character in content
        if (userCharacter) {
          tagContent = anonymizeUserCharacter(tagContent, userCharacter);
        }
        
        formattedContent += `<${tagName}>\n${tagContent}\n</${tagName}>\n\n`;
      }
      
      // If no tags found, output the raw content with newlines converted
      if (!tagFound) {
        let processedContent = content.replace(/\\n/g, '\n');
        if (userCharacter) {
          processedContent = anonymizeUserCharacter(processedContent, userCharacter);
        }
        formattedContent += processedContent + '\n\n';
      }
    } 
    else if (message.role === 'assistant') {
      // For assistant messages, wrap in firstmessage tags
      let content = message.content.replace(/\\n/g, '\n');
      if (userCharacter) {
        content = anonymizeUserCharacter(content, userCharacter);
      }
      formattedContent += `### ASSISTANT MESSAGE ###\n\n<firstmessage>\n${content}\n</firstmessage>\n\n`;
    }
    else if (message.role === 'user') {
      // For user messages, include as is with proper newlines
      let content = message.content.replace(/\\n/g, '\n');
      if (userCharacter) {
        content = anonymizeUserCharacter(content, userCharacter);
      }
      formattedContent += `### USER MESSAGE ###\n\n${content}\n\n`;
    }
    
    formattedContent += `${'='.repeat(40)}\n\n`;
  }
  
  return formattedContent;
}

async function logRequest(messages, characterName = "unknown", userCharacter = null) {
  try {
    // Format timestamp
    const timestamp = new Date().toISOString();
    
    // Process and format message content
    const formattedContent = formatMessageContent(messages, userCharacter);
    
    // Create a readable log entry
    const logEntry = `==== Request at ${timestamp} ====\n\n${formattedContent}\n\n`;
    
    // Create a sanitized version of the character name for the filename
    const safeCharName = characterName.toLowerCase()
      .replace(/[^\w\s]/g, '')  // Remove all non-alphanumeric chars including emojis
      .trim()
      .replace(/\s+/g, '_')     // Replace spaces with underscores
      .replace(/_+/g, '_');     // Collapse multiple underscores
    
    // Create filename based on character name (in logs directory)
    const filename = path.join(LOGS_DIR, `request_${safeCharName || 'unknown'}.log`);
    
    // Check if we've seen this character before
    const isNewCharacter = !loggedCharacters.has(safeCharName);
    
    // Add to our set of logged characters
    loggedCharacters.add(safeCharName);
    
    // Check if file exists
    let fileExists = false;
    try {
      await fs.access(filename);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    
    // Create header for new file
    let fileContent = '';
    if (isNewCharacter || !fileExists) {
      fileContent = `===== LOG FILE FOR CHARACTER: ${characterName} =====\nCreated: ${timestamp}\n\n${logEntry}`;
    } else {
      fileContent = logEntry;
    }
    
    // Write the content (append or create new)
    if (fileExists) {
      await fs.appendFile(filename, fileContent);
    } else {
      await fs.writeFile(filename, fileContent);
      console.log(`Created new log file for character: ${characterName}`);
    }
    
    // Also save the raw JSON for debugging purposes
    const rawFilename = path.join(LOGS_DIR, `request_${safeCharName || 'unknown'}_raw.json`);
    await fs.writeFile(rawFilename, JSON.stringify(messages, null, 2));
    
    return { filename, isNewCharacter };
  } catch (error) {
    console.error('Failed to log request:', error);
    return { filename: path.join(LOGS_DIR, 'error-log.log'), isNewCharacter: false };
  }
}

app.use(bodyParser.json());
app.use(cors());

// ==========================================
// Front-End & Logs API Routes
// ==========================================

// Serve Front-End files from 'public' folder
app.use(express.static('public'));

// API endpoint to get list of log files for the Front-End
app.get('/api/logs', async (req, res) => {
  try {
    const files = await fs.readdir(LOGS_DIR);
    const logFiles = files.filter(f => f.endsWith('.log'));
    res.json(logFiles);
  } catch (error) {
    res.status(500).json([]);
  }
});

// Endpoint to serve raw log file content
app.get('/logs/:filename', async (req, res) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(LOGS_DIR, safeFilename);
    const content = await fs.readFile(filePath, 'utf8');
    res.type('text/plain').send(content);
  } catch (error) {
    res.status(404).send("Log file not found.");
  }
});

// ==========================================
// Mock OpenAI API Routes
// ==========================================

// Mock models endpoint
app.get('/v1/models', apiKeyAuth, (req, res) => {
  res.json({
    object: 'list',
    data: [{
      id: 'mock-model-1',
      object: 'model',
      created: Date.now(),
      owned_by: 'custom-owner'
    }]
  });
});

// Mock chat completion endpoint
app.post('/v1/chat/completions', apiKeyAuth, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        message: 'Messages array is required',
        type: 'invalid_request_error'
      }
    });
  }

  // First, extract ALL characters from the system messages
  const allCharacters = extractAllCharacters(messages);
  
  // Then detect which character the user is roleplaying as
  const userCharacter = detectUserCharacter(messages, allCharacters);
  
  // Finally, determine which character the AI should be roleplaying as
  const aiCharacter = determineAICharacter(allCharacters, userCharacter);

  // Generate mock response
  const mockResponse = {
    id: 'mock-' + Math.random().toString(36).substr(2, 9),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-model-1',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: 'This is a mock response from the custom OpenAI-compatible server'
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };

  // Log request with proper formatting using util.inspect
  console.log(util.inspect(req.body, { depth: null, colors: true, maxArrayLength: null }));
  
  // Log debug info about characters
  console.log(`Detected characters: ${allCharacters.join(', ')}`);
  console.log(`User character: ${userCharacter || 'Unknown'}`);
  console.log(`AI character: ${aiCharacter}`);
  
  // Log to file with character name and formatted content
  const { filename, isNewCharacter } = await logRequest(req.body.messages, aiCharacter, userCharacter);
  
  // Enhanced console message
  if (isNewCharacter) {
    console.log(`New character detected: ${aiCharacter} - Logs saved to '${filename}'`);
  } else {
    console.log(`Logs for ${aiCharacter} appended to '${filename}'`);
  }
  
  res.json(mockResponse);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'server_error'
    }
  });
});

// Ensure logs directory exists before starting the server
(async () => {
  try {
    await ensureLogsDirectory();
    
    app.listen(port, () => {
      console.log(`Mock OpenAI server running on port ${port}`);
      console.log(`Valid API keys: ${Array.from(VALID_API_KEYS).join(', ')}`);
      console.log(`Log files will be stored in: ${LOGS_DIR}`);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
})();
