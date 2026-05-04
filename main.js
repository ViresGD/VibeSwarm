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