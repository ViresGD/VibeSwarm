const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const os = require('os');

let mainWindow;
const ptyProcesses = {};


// Settings persistence
const settingsPath = path.join(app.getPath('userData'), 'vibe-settings.json');
async function loadSettings() {
  try { return JSON.parse(await fs.readFile(settingsPath, 'utf8')); } catch { return {}; }
}
async function saveSettings(data) { await fs.writeFile(settingsPath, JSON.stringify(data), 'utf8'); }
ipcMain.handle('load-settings', async () => loadSettings());
ipcMain.handle('save-settings', async (e, data) => { await saveSettings(data); return true; });

function createWindow() {
  let iconPath;
  if (process.platform === 'win32') {
    iconPath = path.join(__dirname, 'icon.ico');
  } else if (process.platform === 'darwin') {
    iconPath = path.join(__dirname, 'icon.icns');
  } else {
    iconPath = path.join(__dirname, 'icon.png');
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webviewTag: true,
      partition: "persist:main"
    },
    title: "Vibe Swarm"
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}

ipcMain.handle('reset-window-focus', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Force blur and refocus (like alt+tab away and back)
    mainWindow.blur();
    await new Promise(resolve => setTimeout(resolve, 50));
    mainWindow.focus();
    // Also ensure webview content gets focus
    if (mainWindow.webContents) {
      mainWindow.webContents.focus();
    }
    return true;
  }
  return false;
});

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.vibeswarm.desktop');
  }
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'icon.icns'));
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC Handlers (File System) ----------
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('read-directory-children', async (event, dirPath) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result = [];
  
  // Full list of editable text file extensions (including your original ones)
  const textExtensions = new Set([
    // Languages & code
    'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'php', 'go', 'rs', 'java',
    'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx', 'cs', 'fs', 'fsx', 'vb', 'vbs',
    'swift', 'kt', 'kts', 'scala', 'clj', 'cljs', 'cljc', 'edn', 'groovy', 'gradle',
    'lua', 'r', 'pl', 'pm', 't', 'raku', 'nix', 'dhall', 'erl', 'hrl', 'ex', 'exs',
    'elm', 'hs', 'lhs', 'ml', 'mli', 'sml', 'rs', 's', 'asm', 'vue', 'svelte', 'astro',
    // Web & markup
    'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less', 'stylus', 'styl',
    'xml', 'xsd', 'xsl', 'xslt', 'svg', 'rss', 'atom', 'wsdl', 'soap', 'plist',
    // Data & config
    'json', 'json5', 'hjson', 'toml', 'yaml', 'yml', 'csv', 'tsv', 'ini', 'cfg', 'conf',
    'config', 'properties', 'env', 'example', 'sample', 'log', 'lock', 'gitignore',
    'dockerignore', 'npmignore', 'eslintignore', 'prettierignore', 'editorconfig',
    'prettierrc', 'eslintrc', 'babelrc', 'stylelintrc', 'lintstagedrc', 'huskyrc',
    'commitlintrc', 'renovate', 'dependabot', 'gitleaks', 'markdownlint', 'textlint',
    'cspell', 'gitattributes', 'gitmodules', 'mailmap', 'pre-commit',
    // Documentation & text
    'md', 'markdown', 'rst', 'tex', 'bib', 'sty', 'cls', 'latex', 'ltx', 'mmd', 'org',
    'wiki', 'mediawiki', 'adoc', 'asciidoc', 'pod', 'rdoc', 'txt', 'text', 'rtf',
    // Shell & scripts
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'psd1', 'bat', 'cmd', 'com', 'awk', 'sed',
    'makefile', 'mk', 'cmake', 'ninja', 'dockerfile', 'containerfile',
    // Other common formats
    'sql', 'graphql', 'gql', 'proto', 'thrift', 'avro', 'grpc', 'dot',
    'terraform', 'tf', 'tfvars', 'hcl', 'nomad', 'packer', 'vagrantfile',
    // Add more as needed
  ]);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      result.push({ name: entry.name, fullPath, type: 'folder' });
    } else {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (textExtensions.has(ext)) {
        result.push({ name: entry.name, fullPath, type: 'file' });
      }
    }
  }
  return result;
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  const files = [];
  const textExtensions = new Set([
    // Languages & code
    'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'php', 'go', 'rs', 'java',
    'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx', 'cs', 'fs', 'fsx', 'vb', 'vbs',
    'swift', 'kt', 'kts', 'scala', 'clj', 'cljs', 'cljc', 'edn', 'groovy', 'gradle',
    'lua', 'r', 'pl', 'pm', 't', 'raku', 'nix', 'dhall', 'erl', 'hrl', 'ex', 'exs',
    'elm', 'hs', 'lhs', 'ml', 'mli', 'sml', 'rs', 's', 'asm', 'vue', 'svelte', 'astro',
    // Web & markup
    'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less', 'stylus', 'styl',
    'xml', 'xsd', 'xsl', 'xslt', 'svg', 'rss', 'atom', 'wsdl', 'soap', 'plist',
    // Data & config
    'json', 'json5', 'hjson', 'toml', 'yaml', 'yml', 'csv', 'tsv', 'ini', 'cfg', 'conf',
    'config', 'properties', 'env', 'example', 'sample', 'log', 'lock', 'gitignore',
    'dockerignore', 'npmignore', 'eslintignore', 'prettierignore', 'editorconfig',
    'prettierrc', 'eslintrc', 'babelrc', 'stylelintrc', 'lintstagedrc', 'huskyrc',
    'commitlintrc', 'renovate', 'dependabot', 'gitleaks', 'markdownlint', 'textlint',
    'cspell', 'gitattributes', 'gitmodules', 'mailmap', 'pre-commit',
    // Documentation & text
    'md', 'markdown', 'rst', 'tex', 'bib', 'sty', 'cls', 'latex', 'ltx', 'mmd', 'org',
    'wiki', 'mediawiki', 'adoc', 'asciidoc', 'pod', 'rdoc', 'txt', 'text', 'rtf',
    // Shell & scripts
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'psd1', 'bat', 'cmd', 'com', 'awk', 'sed',
    'makefile', 'mk', 'cmake', 'ninja', 'dockerfile', 'containerfile',
    // Other common formats
    'sql', 'graphql', 'gql', 'proto', 'thrift', 'avro', 'grpc', 'dot',
    'terraform', 'tf', 'tfvars', 'hcl', 'nomad', 'packer', 'vagrantfile',
    // Add more as needed
  ]);
  
  
async function walk(currentPath, relativePath = '') {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (textExtensions.has(ext)) {
          const content = await fs.readFile(fullPath, 'utf8');
          files.push({
            relativePath: relPath,
            absolutePath: fullPath,
            content: content,
            selected: true
          });
        }
      }
    }
  }
  await walk(dirPath);
  return files;
});

ipcMain.handle('read-file', async (event, absolutePath) => {
  return await fs.readFile(absolutePath, 'utf8');
});

ipcMain.handle('save-file', async (event, absolutePath, content) => {
  await fs.writeFile(absolutePath, content, 'utf8');
  return true;
});

ipcMain.handle('delete-file', async (event, absolutePath) => {
  await fs.unlink(absolutePath);
  return true;
});

ipcMain.handle('create-file', async (event, absolutePath, content = '') => {
  await fs.writeFile(absolutePath, content, 'utf8');
  return true;
});

ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
  await fs.rename(oldPath, newPath);
  return true;
});

ipcMain.handle('rename-folder', async (event, oldPath, newPath) => {
  await fs.rename(oldPath, newPath);
  return true;
});

ipcMain.handle('delete-folder', async (event, folderPath) => {
  await fs.rm(folderPath, { recursive: true, force: true });
  return true;
});

ipcMain.handle('run-terminal', async (event, command, cwd) => {
  const terminalCommand = process.platform === 'win32' 
    ? `start cmd.exe /k "cd /d "${cwd}" && ${command}"`
    : `gnome-terminal --working-directory="${cwd}" -- bash -c "${command}; exec bash"`;
  exec(terminalCommand, (error) => {
    if (error) console.error('Terminal error:', error);
  });
  return true;
});

ipcMain.handle('open-file', async (event, absolutePath) => {
  await shell.openPath(absolutePath);
  return true;
});

// ---------- PTY Terminal Handlers ----------
ipcMain.handle('pty-create', async (event, cwd, cols, rows) => {
  const nodePty = require('@lydell/node-pty');
  const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
  const id = Date.now().toString();
  const pty = nodePty.spawn(shell, [], {
    name: 'xterm-color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color' }
  });

  ptyProcesses[id] = pty;

  pty.onData(data => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty-data', { id, data });
    }
    if (terminalDetachWindow && !terminalDetachWindow.isDestroyed()) {
      terminalDetachWindow.webContents.send('pty-data', { id, data });
    }
  });

  pty.onExit(() => {
    delete ptyProcesses[id];
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty-exit', { id });
    }
  });

  return { id };
});

ipcMain.handle('pty-write', async (event, id, data) => {
  if (ptyProcesses[id]) ptyProcesses[id].write(data);
  return true;
});

ipcMain.handle('pty-resize', async (event, id, cols, rows) => {
  if (ptyProcesses[id]) ptyProcesses[id].resize(cols, rows);
  return true;
});

ipcMain.handle('pty-cd', async (event, id, cwd) => {
  if (ptyProcesses[id]) {
    const cdCmd = process.platform === 'win32' ? `cd "${cwd}"\r` : `cd "${cwd}"\n`;
    ptyProcesses[id].write(cdCmd);
  }
  return true;
});

ipcMain.handle('pty-kill', async (event, id) => {
  if (ptyProcesses[id]) {
    ptyProcesses[id].kill();
    delete ptyProcesses[id];
  }
  return true;  
  
});


// ---------- Detachable Panels ----------
let webviewDetachWindow = null;
let terminalDetachWindow = null;
let detachedWebviewUrl = null;
let webviewDetachBounds = null;
let termDetachBounds = null;

ipcMain.handle('detach-webview', async (event, url) => {
  if (webviewDetachWindow && !webviewDetachWindow.isDestroyed()) {
    webviewDetachWindow.focus(); return;
  }
  const bounds = webviewDetachBounds || { width: 1000, height: 750 };
  webviewDetachWindow = new BrowserWindow({
    ...bounds,
    title: '🌐 AI Browser',
	alwaysOnTop: true,   // <-- add this
    webPreferences: { nodeIntegration: true, contextIsolation: false, webviewTag: true, partition: 'persist:main' }
  });
  webviewDetachWindow.loadFile('webview-detached.html');
  webviewDetachWindow.webContents.once('did-finish-load', async () => {
    const settings = await loadSettings();                // load current settings
    webviewDetachWindow.webContents.send('detach-init', { url, settings }); // send both
  });
  webviewDetachWindow.on('resize', () => { webviewDetachBounds = webviewDetachWindow.getBounds(); });
  webviewDetachWindow.on('move', () => { webviewDetachBounds = webviewDetachWindow.getBounds(); });
  webviewDetachWindow.on('closed', () => {
    webviewDetachWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('webview-reattached');
  });
});

ipcMain.handle('detach-terminal', async (event, ptyId) => {
  if (terminalDetachWindow && !terminalDetachWindow.isDestroyed()) {
    terminalDetachWindow.focus(); return;
  }
  const bounds = termDetachBounds || { width: 800, height: 500 };
  terminalDetachWindow = new BrowserWindow({
    ...bounds,
    title: '⚡ Terminal',
	alwaysOnTop: true,   // <-- add this
    webPreferences: { nodeIntegration: true, contextIsolation: false, partition: 'persist:main' }
  });
  terminalDetachWindow.loadFile('terminal-detached.html');
  terminalDetachWindow.webContents.once('did-finish-load', () => {
    terminalDetachWindow.webContents.send('detach-term-init', { ptyId });
  });
  terminalDetachWindow.on('resize', () => { termDetachBounds = terminalDetachWindow.getBounds(); });
  terminalDetachWindow.on('move', () => { termDetachBounds = terminalDetachWindow.getBounds(); });
  terminalDetachWindow.on('closed', () => {
    terminalDetachWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('terminal-reattached');
  });
});

// Reattach signals from detached windows
const { ipcMain: ipc2 } = require('electron');
require('electron').ipcMain.on('reattach-webview', (event) => {
  if (webviewDetachWindow && !webviewDetachWindow.isDestroyed()) webviewDetachWindow.close();
});
require('electron').ipcMain.on('reattach-terminal', (event) => {
  if (terminalDetachWindow && !terminalDetachWindow.isDestroyed()) terminalDetachWindow.close();
});
require('electron').ipcMain.on('term-new-pty', (event, newPtyId) => {
  // Relay pty-data from new pty back to detached window
});


require('electron').ipcMain.on('open-main-settings', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.webContents.send('trigger-settings-open');
  }
});



// ---------- Live HTML Preview Window ----------
const http = require('http');
let previewWindow = null;
let previewHtmlContent = '';
let previewServer = null;
const PREVIEW_PORT = 51209;

function startPreviewServer() {
  if (previewServer) return;
  previewServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(previewHtmlContent);
  });
  previewServer.listen(PREVIEW_PORT);
}

ipcMain.on('update-detached-settings', async (event, settings) => {
  if (webviewDetachWindow && !webviewDetachWindow.isDestroyed()) {
    webviewDetachWindow.webContents.send('apply-settings', settings);
  }
});

ipcMain.handle('open-html-preview', async (event, filePath, content) => {
  previewHtmlContent = content;
  startPreviewServer();

  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.reload();
    previewWindow.focus();
    return true;
  }

  previewWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: '🌐 Preview — ' + path.basename(filePath),
	alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  previewWindow.loadURL(`http://localhost:${PREVIEW_PORT}`);
  previewWindow.on('closed', () => { previewWindow = null; });
  return true;
});

ipcMain.handle('update-html-preview', async (event, content) => {
  previewHtmlContent = content;
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.reload();
  }
  return true;
});


// ─── ORPAC local UI server ───
const orpacServer = http.createServer((req, res) => {
  let filePath = '';
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '/orpac.html') {
    filePath = path.join(__dirname, 'orpac.html');
  } else if (urlPath === '/orpac.js') {
    filePath = path.join(__dirname, 'orpac.js');
  } else {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  const fsSync = require('fs'); // use sync version for simplicity
  fsSync.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading file');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript' };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});
orpacServer.listen(51210);

ipcMain.handle('orpac-get-models', async () => {
  try {
    const settings = await loadSettings();
    if (!settings.openRouterKey) throw new Error('OpenRouter key not set');
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${settings.openRouterKey}` }
    });
    const data = await res.json();
    return (data.data || []).map(m => ({ id: m.id, name: m.name }));
  } catch (e) {
    return [];
  }
});

// Stop a stream
ipcMain.on('orpac-stop-stream', (event, streamId) => {
  const controller = global._activeStreams?.[streamId];
  if (controller) controller.abort();
});

ipcMain.on('orpac-chat', async (event, { streamId, model, messages }) => {
  const settings = await loadSettings();
  if (!settings.openRouterKey) {
    event.reply('orpac-stream-error', { id: streamId, error: 'No API key' });
    return;
  }

  const abortController = new AbortController();
  global._activeStreams = global._activeStreams || {};
  global._activeStreams[streamId] = abortController;

  let retryCount = 0;
  const maxRetries = 5;
  const baseDelay = 1000; // 1 second

  while (retryCount <= maxRetries) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openRouterKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
        signal: abortController.signal,
      });

      // Handle 429 with retry
      if (response.status === 429 && retryCount < maxRetries) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, retryCount);
        console.log(`Rate limited. Retry ${retryCount + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Successful response – stream as before
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;
          try {
            const json = JSON.parse(dataStr);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              event.reply('orpac-stream-data', { id: streamId, chunk: content });
            }
          } catch (e) { /* skip */ }
        }
      }
      event.reply('orpac-stream-end', { id: streamId });
      return; // success

    } catch (err) {
      if (err.name === 'AbortError') {
        event.reply('orpac-stream-end', { id: streamId });
        return;
      }
      // If we've exhausted retries or got a non-429 error, fail
      if (retryCount >= maxRetries || (err.message && !err.message.includes('429'))) {
        event.reply('orpac-stream-error', { id: streamId, error: err.message });
        return;
      }
      // Otherwise, treat as retryable (unlikely, but safe)
      retryCount++;
    }
  }

  // Final fallback error
  event.reply('orpac-stream-error', { id: streamId, error: 'Max retries exceeded' });
  delete global._activeStreams[streamId];
});


ipcMain.on('orpac-apply-code', (event, codeContent) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orpac-set-file-content', codeContent);
  }
});

// Read specific lines of a file (for AI context requests)
ipcMain.handle('orpac-read-file-lines', async (event, { projectBase, relativePath, startLine, endLine }) => {
  const absPath = path.join(projectBase, relativePath);
  try {
    const data = await fs.readFile(absPath, 'utf8');
    const lines = data.split('\n');
    const selected = lines.slice(startLine - 1, endLine).join('\n');
    return { success: true, content: selected };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


// Read a whole file (for AI context injection)
ipcMain.handle('orpac-read-file', async (event, { projectBase, relativePath }) => {
  const absPath = path.join(projectBase, relativePath);
  try {
    const content = await fs.readFile(absPath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Write a full file (with optional backup)
ipcMain.on('orpac-write-file', async (event, { projectBase, relativePath, content, backup }) => {
  const absPath = path.join(projectBase, relativePath);
  const dir = path.dirname(absPath);
  await fs.mkdir(dir, { recursive: true });

  if (backup) {
    try {
      const existing = await fs.readFile(absPath, 'utf8');
      await fs.writeFile(absPath + '.bak', existing, 'utf8');
    } catch {}
  }

  await fs.writeFile(absPath, content, 'utf8');

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orpac-file-created', { absolutePath: absPath, content });
  }
});

// Apply a unified diff to a file
ipcMain.on('orpac-apply-diff', async (event, { projectBase, relativePath, diffText }) => {
  const absPath = path.join(projectBase, relativePath);
  try {
    let original = '';
    try { original = await fs.readFile(absPath, 'utf8'); } catch {}

    // For new files, extract + lines directly (avoids hunk count mismatch issues)
    const isNewFile = !original && diffText.includes('-0,0');
	
let patched;
if (!original && (diffText.includes('@@ -0,0') || diffText.includes('-0,0'))) {
  // Extract everything after the hunk header (@@ ... @@)
  const lines = diffText.split('\n');
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('@@')) {
      startLine = i + 1;
      break;
    }
  }
  // Take all lines after the hunk header, ignore the closing ```
  let contentLines = lines.slice(startLine).filter(l => !l.trim().startsWith('```'));
  // Clean trailing empty lines
  while (contentLines.length && contentLines[contentLines.length-1].trim() === '') {
    contentLines.pop();
  }
  // If lines start with '+', strip them; otherwise use as‑is
  if (contentLines.length && contentLines[0].startsWith('+')) {
    patched = contentLines.map(l => l.startsWith('+') ? l.slice(1) : l).join('\n');
  } else {
    patched = contentLines.join('\n');
  }
  // Fallback: capture raw code block content
  if (!patched.trim()) {
    const match = diffText.match(/```(?:diff?:[^\n]*)?\n([\s\S]*?)```/);
    if (match) patched = match[1];
  }
} else {
  // existing file handling (your existing diff logic)
  await fs.writeFile(absPath + '.bak', original, 'utf8');
  patched = applyUnifiedDiff(original, diffText);
}

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, patched, 'utf8');
	console.log('ORPAC wrote:', absPath);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('orpac-file-created', { absolutePath: absPath, content: patched });
    }
  } catch (err) {
    console.error('Diff application failed:', err);
  }
});

// Minimal unified diff applier (handles context, deletions, additions)
function applyUnifiedDiff(original, diff) {
  const originalLines = original.split(/\r?\n/);
  const diffLines = diff.split(/\r?\n/);
  let result = [...originalLines];
  let i = 0;

  while (i < diffLines.length) {
    const line = diffLines[i];
    if (line.startsWith('@@')) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const oldStart = parseInt(match[1], 10) - 1; // zero‑based
        const oldCount = match[2] ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3], 10) - 1;
        const newCount = match[4] ? parseInt(match[4], 10) : 1;
        
        // Collect hunk body lines
        i++;
        const hunkLines = [];
        while (i < diffLines.length && !diffLines[i].startsWith('@@') && !diffLines[i].startsWith('diff --git')) {
          hunkLines.push(diffLines[i]);
          i++;
        }

        // Apply this hunk
        const before = result.slice(0, oldStart);
        const after = result.slice(oldStart + oldCount);
        
        // Build the replacement lines from the hunk
        const replacement = [];
        for (const hline of hunkLines) {
          if (hline.startsWith('+')) {
            replacement.push(hline.slice(1));
          } else if (hline.startsWith('-')) {
            // removed line – skip
            continue;
          } else {
            // context line – keep as is (should already exist in the original)
            replacement.push(hline);
          }
        }
        
        result = [...before, ...replacement, ...after];
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  return result.join('\n');
}