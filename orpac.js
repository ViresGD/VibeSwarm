const modelSelect = document.getElementById('modelSelect');
const messagesDiv = document.getElementById('messages');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const applyBtn = document.getElementById('applyToFileBtn');
const newChatBtn = document.getElementById('newChatBtn');
const copyCodeBtn = document.getElementById('copyLastCodeBtn');
const modelFilter = document.getElementById('modelFilter');

let currentConversation = [];
let isStreaming = false; 
let lastCodeBlock = '';
let allModels = [];
let targetFile = null;

const urlParams = new URLSearchParams(window.location.search);
const projectBase = urlParams.get('project') || '';

const SYSTEM_PROMPT =
  "You are a coding assistant with direct access to the user's filesystem. " +
  "You MUST create and modify files using diff blocks. NEVER tell the user to create files manually. " +
  "To create a NEW file, you MUST respond with ONLY this format:\n" +
  "```diff:filename.py\n" +
  "@@ -0,0 +1,N @@\n" +
  "+line1\n" +
  "+line2\n" +
  "```\n" +
  "To modify an EXISTING file, respond with a unified diff. " +
  "NEVER say you cannot access the filesystem. NEVER give manual instructions. " +
  "ALWAYS use the diff block format to create or edit files. This is mandatory.";
  
  
// ── Model loading & filtering ──
async function loadModels() {
  try {
    allModels = await window.orpacAPI.getModels();
    allModels.sort((a, b) => a.name.localeCompare(b.name));
    applyModelFilter();
  } catch (e) {
    modelSelect.innerHTML = `<option>Error loading models: ${e.message}</option>`;
  }
}
function applyModelFilter() {
  const filterText = modelFilter.value.toLowerCase();
  const filtered = allModels.filter(m =>
    m.name.toLowerCase().includes(filterText) ||
    m.id.toLowerCase().includes(filterText)
  );
  modelSelect.innerHTML = '';
  if (filtered.length === 0) {
    modelSelect.innerHTML = '<option>No matching models</option>';
    return;
  }
  filtered.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.id})`;
    modelSelect.appendChild(opt);
  });
}
modelFilter.addEventListener('input', applyModelFilter);
loadModels();

// ── UI helpers ──
function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  if (role === 'assistant') {
    const codeRegex = /```(\w*)\n?([\s\S]*?)```/g;
    let match, lastIndex = 0;
    const parts = [];
    while ((match = codeRegex.exec(text)) !== null) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      parts.push({ type: 'code', lang: match[1], content: match[2] });
      lastIndex = match.index + match[0].length;
    }
    parts.push({ type: 'text', content: text.slice(lastIndex) });
    div.innerHTML = '';
    parts.forEach(p => {
      if (p.type === 'text') div.appendChild(document.createTextNode(p.content));
      else {
        const pre = document.createElement('pre');
        pre.textContent = p.content;
        div.appendChild(pre);
      }
    });
    const codeBlocks = [...text.matchAll(/```(?:\w*\n)?([\s\S]*?)```/g)];
    if (codeBlocks.length > 0) {
      lastCodeBlock = codeBlocks[codeBlocks.length - 1][1];
    }
  }
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendToLastAssistant(text) {
  const lastMsg = messagesDiv.querySelector('.msg.assistant:last-child');
  if (lastMsg) {
    lastMsg.textContent += text;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } else {
    addMessage('assistant', text);
  }
}

function newChat() {
  currentConversation = [{ role: 'system', content: SYSTEM_PROMPT }];
  messagesDiv.innerHTML = '';
}
newChatBtn.addEventListener('click', newChat);
newChat();

// ── File path extraction ──
function extractFilePath(userText) {
  const regex = /\b(?:modify|use|edit|change|update)\s+([^\s,]+)/i;
  const match = userText.match(regex);
  return match ? match[1] : null;
}

// ── Build a compact skeleton for large files ──
function compressCode(content, maxLines = 100) {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content; // small enough
  const skeleton = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Keep import statements, function/class definitions, and decorators
    if (/^(import |from |def |class |@)/.test(line.trim())) {
      skeleton.push(line);
    }
    i++;
  }
  return `(File skeleton – ${lines.length} lines total)\n` + skeleton.join('\n') + 
    `\n(To see specific lines, request them with [REQUEST lines start-end of filename])`;
}

// ── Handle AI line requests ──
async function handleAssistantRequests(responseText) {
  const requestRegex = /\[REQUEST lines (\d+)-(\d+) of ([^\]]+)\]/g;
  let match;
  const promises = [];
  while ((match = requestRegex.exec(responseText)) !== null) {
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    const file = match[3].trim();
    if (projectBase) {
      promises.push((async () => {
        const res = await window.orpacAPI.readFileLines(projectBase, file, start, end);
        if (res.success) {
          // Inject the lines into the conversation as a user message
          currentConversation.push({ role: 'user', content: `[SYSTEM] Content of ${file} lines ${start}-${end}:\n\`\`\`\n${res.content}\n\`\`\`` });
          // Also display a note in chat
          const note = document.createElement('div');
          note.className = 'msg assistant';
          note.textContent = `📎 Fetched lines ${start}-${end} from ${file}`;
          messagesDiv.appendChild(note);
        }
      })());
    }
  }
  await Promise.all(promises);
}

// ── Process code blocks after AI response ──
async function processCodeBlocks(text, originalFilePath) {
  const codeBlockRegex = /```(\w+(?::[^\n]+)?)\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const langWithPath = match[1];
    const code = match[2];
    const [type, filePath] = langWithPath.split(':');
    if (!filePath || !projectBase) continue;

    if (type === 'diff') {
      // Apply diff
      window.orpacAPI.applyDiff(projectBase, filePath.trim(), code);
      const note = document.createElement('div');
      note.className = 'msg assistant';
      note.textContent = `🔄 Diff applied to ${filePath.trim()}`;
      messagesDiv.appendChild(note);
    } else {
      // Full file write (for small files)
      const shouldBackup = originalFilePath === filePath.trim();
      window.orpacAPI.writeFile(projectBase, filePath.trim(), code, shouldBackup);
      const note = document.createElement('div');
      note.className = 'msg assistant';
      note.textContent = `📄 File ${filePath.trim()} ${shouldBackup ? 'updated' : 'written'}`;
      messagesDiv.appendChild(note);
    }
    lastCodeBlock = code;
  }
}

// ── Send handler ──
sendBtn.addEventListener('click', async () => {
  const originalPrompt = promptInput.value.trim();
  if (!originalPrompt || isStreaming) return;
  const model = modelSelect.value;
  if (!model) return;

  let finalPrompt = originalPrompt;
  targetFile = null;

  const filePath = extractFilePath(originalPrompt);
  if (filePath && projectBase) {
    targetFile = filePath;
    const res = await window.orpacAPI.readFile(projectBase, filePath);
    if (res.success) {
      const compressed = compressCode(res.content);
      finalPrompt = `I want you to modify the file "${filePath}".\n` +
        `Here is its current content (or skeleton):\n\`\`\`\n${compressed}\n\`\`\`\n\n` +
        `My request: ${originalPrompt}`;
    } else {
      finalPrompt = `I want you to create a new file named "${filePath}".\n` +
        `My request: ${originalPrompt}`;
    }
  }

  addMessage('user', originalPrompt);
  currentConversation.push({ role: 'user', content: finalPrompt });
  promptInput.value = '';
  sendBtn.style.display = 'none';
  stopBtn.style.display = 'inline-block';
  isStreaming = true;

  const assistantMsgDiv = document.createElement('div');
  assistantMsgDiv.className = 'msg assistant';
  assistantMsgDiv.textContent = '';
  messagesDiv.appendChild(assistantMsgDiv);

  const streamId = `stream-${Date.now()}`;
  window.orpacAPI.sendChat(streamId, model, currentConversation);

  const onData = ({ id, chunk }) => {
    if (id === streamId) appendToLastAssistant(chunk);
  };
  const onEnd = async ({ id }) => {
    if (id !== streamId) return;
    cleanup();
    const fullText = assistantMsgDiv.textContent;
    currentConversation.push({ role: 'assistant', content: fullText });
    isStreaming = false;
    sendBtn.style.display = '';
    stopBtn.style.display = 'none';

    // Check for line requests and process them
    await handleAssistantRequests(fullText);
    // If requests were made, we need to automatically resubmit the last user prompt to continue
    const lastUser1 = [...currentConversation].reverse().find(m => m.role === 'user');
	if (lastUser1 && lastUser1.content.startsWith('[SYSTEM] Content')) {
      // Auto-send a continuation message so the AI can now complete the diff
      const continuationMsg = 'Now that you have the requested lines, please provide the diff.';
      currentConversation.push({ role: 'user', content: continuationMsg });
      // Re-trigger send (but avoid UI duplication)
      // We'll call a helper to resend without user interaction
      resendConversation(model);
      return;
    }

    await processCodeBlocks(fullText, targetFile);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  };
  const onError = ({ id, error }) => {
    if (id !== streamId) return;
    cleanup();
    appendToLastAssistant(`\n[Error: ${error}]`);
    isStreaming = false;
    sendBtn.style.display = '';
    stopBtn.style.display = 'none';
  };

  window.orpacAPI.onStreamData(onData);
  window.orpacAPI.onStreamEnd(onEnd);
  window.orpacAPI.onStreamError(onError);

  const cleanup = () => {
    window.orpacAPI.removeListeners();
  };

  stopBtn.onclick = () => {
    window.orpacAPI.stopChat(streamId);
    cleanup();
    currentConversation.push({ role: 'assistant', content: assistantMsgDiv.textContent });
    isStreaming = false;
    sendBtn.style.display = '';
    stopBtn.style.display = 'none';
  };
});

// ── Resend after context injection ──
function resendConversation(model) {
  isStreaming = true;
  sendBtn.style.display = 'none';
  stopBtn.style.display = 'inline-block';

  const assistantMsgDiv = document.createElement('div');
  assistantMsgDiv.className = 'msg assistant';
  assistantMsgDiv.textContent = '';
  messagesDiv.appendChild(assistantMsgDiv);

  const streamId = `stream-${Date.now()}`;
  window.orpacAPI.sendChat(streamId, model, currentConversation);

  const onData = ({ id, chunk }) => {
    if (id === streamId) appendToLastAssistant(chunk);
  };
  const onEnd = async ({ id }) => {
    if (id !== streamId) return;
    cleanup();
    const fullText = assistantMsgDiv.textContent;
    currentConversation.push({ role: 'assistant', content: fullText });
    isStreaming = false;
    sendBtn.style.display = '';
    stopBtn.style.display = 'none';

    await handleAssistantRequests(fullText);
    // If more requests appear, continue again (max recursion not shown – fine for now)
    const lastUser2 = [...currentConversation].reverse().find(m => m.role === 'user');
	if (lastUser2 && lastUser2.content.startsWith('[SYSTEM] Content')) {
      currentConversation.push({ role: 'user', content: 'Now that you have the requested lines, please provide the diff.' });
      resendConversation(model);
      return;
    }
    await processCodeBlocks(fullText, targetFile);   // targetFile is the original file (must pass it somehow)
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  };
  const onError = ({ id, error }) => {
    if (id !== streamId) return;
    cleanup();
    appendToLastAssistant(`\n[Error: ${error}]`);
    isStreaming = false;
    sendBtn.style.display = '';
    stopBtn.style.display = 'none';
  };

  window.orpacAPI.onStreamData(onData);
  window.orpacAPI.onStreamEnd(onEnd);
  window.orpacAPI.onStreamError(onError);

  const cleanup = () => {
    window.orpacAPI.removeListeners();
  };

  stopBtn.onclick = () => {
    window.orpacAPI.stopChat(streamId);
    cleanup();
    currentConversation.push({ role: 'assistant', content: assistantMsgDiv.textContent });
    isStreaming = false;
    sendBtn.style.display = '';
    stopBtn.style.display = 'none';
  };
}

// ── Manual buttons ──
applyBtn.addEventListener('click', () => {
  if (!lastCodeBlock) {
    alert('No code block found in the last AI reply.');
    return;
  }
  window.orpacAPI.applyCode(lastCodeBlock);
});

copyCodeBtn.addEventListener('click', () => {
  if (!lastCodeBlock) return;
  navigator.clipboard.writeText(lastCodeBlock);
});

promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});