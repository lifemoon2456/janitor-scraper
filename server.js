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
      error: { message: 'Invalid API key', type: 'invalid_request_error' }
    });
  }
  next();
};

// ... [جميع دوال استخراج الشخصيات الأصلية تبقى كما هي] ...
function extractAllCharacters(messages) {
  const characters = [];
  const systemMessages = messages.filter(msg => msg.role === 'system');
  for (const message of systemMessages) {
    if (!message.content) continue;
    const contentWithoutSystem = message.content.replace(/<system>.*?<\/system>/gs, '');
    const tagMatches = Array.from(contentWithoutSystem.matchAll(/<([^>]+)>([^<]*|<(?!\/\1>))*<\/\1>/g));
    for (const match of tagMatches) {
      if (match && match[1]) {
        const tagName = match[1].trim();
        if (!['system', 'scenario', 'example_dialogs', 'roleplay_guidelines', '/'].includes(tagName.toLowerCase())) {
          const tagContent = match[0] || '';
          if (tagContent.includes('Name:') || tagContent.includes('Age:') || tagContent.includes('Personality:') || tagContent.includes('Character Details') || tagContent.length > 200) {
            characters.push(tagName);
          }
        }
      }
    }
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

function detectUserCharacter(messages, allCharacters) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'user' && message.content) {
      const prefixMatch = message.content.match(/^([^:]+):/);
      if (prefixMatch && prefixMatch[1]) {
        const potentialUserChar = prefixMatch[1].trim();
        for (const character of allCharacters) {
          const normalizedPotential = potentialUserChar.replace(/[^\w\s]/g, '').trim().toLowerCase();
          const normalizedCharacter = character.replace(/[^\w\s]/g, '').trim().toLowerCase();
          if (normalizedPotential === normalizedCharacter || normalizedPotential.includes(normalizedCharacter) || normalizedCharacter.includes(normalizedPotential)) {
            return character;
          }
        }
        return potentialUserChar;
      }
    }
  }
  return null;
}

function determineAICharacter(allCharacters, userCharacter) {
  if (!allCharacters.length) return "unknown";
  if (allCharacters.length === 1) return allCharacters[0];
  if (userCharacter) {
    for (const character of allCharacters) {
      const normalizedUser = userCharacter.replace(/[^\w\s]/g, '').trim().toLowerCase();
      const normalizedChar = character.replace(/[^\w\s]/g, '').trim().toLowerCase();
      if (normalizedUser !== normalizedChar && !normalizedUser.includes(normalizedChar) && !normalizedChar.includes(normalizedUser)) {
        return character;
      }
    }
  }
  for (const character of allCharacters) {
    if (character.length > 2) return character;
  }
  return allCharacters[0];
}

function anonymizeUserCharacter(text, userCharacter) {
  if (!userCharacter || !text.includes(userCharacter)) return text;
  const escapedChar = userCharacter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text.replace(new RegExp(`^${escapedChar}:`, 'gm'), '{{user}}:');
  text = text.replace(new RegExp(`\\b${escapedChar}\\b`, 'g'), '{{user}}');
  text = text.replace(new RegExp(escapedChar, 'g'), '{{user}}');
  return text;
}

function formatMessageContent(messages, userCharacter) {
  let formattedContent = '';
  for (const message of messages) {
    if (!message.content) continue;
    if (message.role === 'system') {
      formattedContent += `### SYSTEM MESSAGE ###\n\n`;
      const content = message.content;
      const tagPattern = /<([^>]+)>([\s\S]*?)<\/\1>/g;
      let match;
      let tagFound = false;
      while ((match = tagPattern.exec(content)) !== null) {
        tagFound = true;
        const tagName = match[1].trim();
        let tagContent = match[2];
        tagContent = tagContent.replace(/\\n/g, '\n');
        if (userCharacter) { tagContent = anonymizeUserCharacter(tagContent, userCharacter); }
        formattedContent += `<${tagName}>\n${tagContent}\n</${tagName}>\n\n`;
      }
      if (!tagFound) {
        let processedContent = content.replace(/\\n/g, '\n');
        if (userCharacter) { processedContent = anonymizeUserCharacter(processedContent, userCharacter); }
        formattedContent += processedContent + '\n\n';
      }
    } else if (message.role === 'assistant') {
      let content = message.content.replace(/\\n/g, '\n');
      if (userCharacter) { content = anonymizeUserCharacter(content, userCharacter); }
      formattedContent += `### ASSISTANT MESSAGE ###\n\n<firstmessage>\n${content}\n</firstmessage>\n\n`;
    } else if (message.role === 'user') {
      let content = message.content.replace(/\\n/g, '\n');
      if (userCharacter) { content = anonymizeUserCharacter(content, userCharacter); }
      formattedContent += `### USER MESSAGE ###\n\n${content}\n\n`;
    }
    formattedContent += `${'='.repeat(40)}\n\n`;
  }
  return formattedContent;
}

async function logRequest(messages, characterName = "unknown", userCharacter = null) {
  try {
    const timestamp = new Date().toISOString();
    const formattedContent = formatMessageContent(messages, userCharacter);
    const logEntry = `==== Request at ${timestamp} ====\n\n${formattedContent}\n\n`;
    const safeCharName = characterName.toLowerCase().replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').replace(/_+/g, '_');
    const filename = path.join(LOGS_DIR, `request_${safeCharName || 'unknown'}.log`);
    const isNewCharacter = !loggedCharacters.has(safeCharName);
    loggedCharacters.add(safeCharName);
    let fileExists = false;
    try { await fs.access(filename); fileExists = true; } catch { fileExists = false; }
    let fileContent = '';
    if (isNewCharacter || !fileExists) {
      fileContent = `===== LOG FILE FOR CHARACTER: ${characterName} =====\nCreated: ${timestamp}\n\n${logEntry}`;
    } else {
      fileContent = logEntry;
    }
    if (fileExists) { await fs.appendFile(filename, fileContent); } 
    else { await fs.writeFile(filename, fileContent); console.log(`Created new log file for character: ${characterName}`); }
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

// ===== مسارات عرض السجلات (أضيفت خصيصاً لـ Render) =====
app.get('/', (req, res) => {
  res.send('<h1>Mock OpenAI Server is Running!</h1><p>Go to <a href="/logs">/logs</a> to view scraped data.</p>');
});

app.get('/logs', async (req, res) => {
  try {
    const files = await fs.readdir(LOGS_DIR);
    const logFiles = files.filter(f => f.endsWith('.log'));
    let html = `<h1>Available Logs</h1>`;
    if (logFiles.length === 0) {
      html += `<p>No logs found yet. Send a message from JanitorAI first.</p>`;
    } else {
      html += `<ul>`;
      for (const file of logFiles) {
        html += `<li><a href="/logs/${file}" target="_blank">${file}</a></li>`;
      }
      html += `</ul>`;
    }
    res.send(html);
  } catch (error) {
    res.status(500).send("Error reading logs directory.");
  }
});

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
// =========================================================

app.get('/v1/models', apiKeyAuth, (req, res) => {
  res.json({
    object: 'list',
    data: [{ id: 'mock-model-1', object: 'model', created: Date.now(), owned_by: 'custom-owner' }]
  });
});

app.post('/v1/chat/completions', apiKeyAuth, async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: { message: 'Messages array is required', type: 'invalid_request_error' } });
  }
  const allCharacters = extractAllCharacters(messages);
  const userCharacter = detectUserCharacter(messages, allCharacters);
  const aiCharacter = determineAICharacter(allCharacters, userCharacter);
  const mockResponse = {
    id: 'mock-' + Math.random().toString(36).substr(2, 9),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-model-1',
    choices: [{ index: 0, message: { role: 'assistant', content: 'This is a mock response from the custom OpenAI-compatible server' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
  const { filename, isNewCharacter } = await logRequest(req.body.messages, aiCharacter, userCharacter);
  if (isNewCharacter) { console.log(`New character detected: ${aiCharacter} - Logs saved to '${filename}'`); } 
  else { console.log(`Logs for ${aiCharacter} appended to '${filename}'`); }
  res.json(mockResponse);
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: { message: 'Internal server error', type: 'server_error' } });
});

(async () => {
  try {
    await ensureLogsDirectory();
    app.listen(port, () => {
      console.log(`Mock OpenAI server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
})();