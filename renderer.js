// renderer.js — Vibe Swarm Desktop (Multi‑tab + Custom AI Endpoints)
const { ipcRenderer } = require('electron');
const path = require('path');
const os = require('os');

let currentProjectPath = null;
let folderFiles = [];           // flat array of all loaded files (for compatibility)
let currentOpenTabs = [];       // { absolutePath, content, dirty, relativePath }
let activeTabIndex = -1;

// Lazy tree data (unchanged)
let treeRoot = null;
let nodeIdCounter = 0;
const nodeMap = new Map();

function createNode(name, fullPath, type, parentId = null) {
  return { id: ++nodeIdCounter, name, fullPath, type, parentId, children: null, expanded: false };
}

// ─────────────────────────────────────────────
// CodeMirror 6 — Notepad++ style editor
// Full language support + IntelliSense
// ─────────────────────────────────────────────
let cmView = null;

function getLanguageExtension(filename, CM) {
  if (!filename) return [];
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
      return CM.langJS ? [CM.langJS.javascript({ jsx: true })] : [];
    case 'ts':
    case 'tsx':
      return CM.langJS ? [CM.langJS.javascript({ typescript: true, jsx: true })] : [];
    case 'py':
      return CM.langPy ? [CM.langPy.python()] : [];
    case 'html':
    case 'htm':
      return CM.langHtml ? [CM.langHtml.html({ matchClosingTags: true, autoCloseTags: true })] : [];
    case 'css':
      return CM.langCss ? [CM.langCss.css()] : [];
    case 'json':
      return CM.langJson ? [CM.langJson.json()] : [];
    case 'md':
      return CM.langMd ? [CM.langMd.markdown()] : [];
    case 'xml':
    case 'svg':
      return CM.langXml ? [CM.langXml.xml()] : [];
    case 'sql':
      return CM.langSql ? [CM.langSql.sql()] : [];
    case 'c':
    case 'cpp':
    case 'cc':
    case 'cxx':
      return CM.langCpp ? [CM.langCpp.cpp()] : [];
    case 'go':
      return CM.langGo ? [CM.langGo.go()] : [];
    case 'rs':
      return CM.langRust ? [CM.langRust.rust()] : [];
    case 'java':
      return CM.langJava ? [CM.langJava.java()] : [];
    case 'php':
      return CM.langPhp ? [CM.langPhp.php()] : [];
    case 'rb':
      return CM.langRuby ? [CM.langRuby.ruby()] : [];
    case 'vue':
      return CM.langVue ? [CM.langVue.vue()] : [];
    case 'svelte':
      return CM.langSvelte ? [CM.langSvelte.svelte()] : [];
    case 'yaml':
    case 'yml':
      return CM.langYaml ? [CM.langYaml.yaml()] : [];
    case 'toml':
      return CM.langToml ? [CM.langToml.toml()] : [];
    case 'sh':
    case 'bash':
      return CM.langBash ? [CM.langBash.bash()] : [];
    case 'ps1':
    case 'psm1':
    case 'psd1':
      if (CM.langLegacy) {
        const { StreamLanguage } = CM.langLegacy;
        const { powerShell } = CM.langLegacy;
        return [StreamLanguage.define(powerShell)];
      }
      return [];
    case 'bat':
    case 'cmd':
    case 'com':
      if (CM.langLegacy) {
        const { StreamLanguage } = CM.langLegacy;
        const { shell } = CM.langLegacy;
        return [StreamLanguage.define(shell)];
      }
      return [];
    default:
      return [];
  }
}

async function initCodeMirror() {
  try {
    const ESM = 'https://esm.sh/';
    
    // Core packages (must succeed)
    const [
      cmView_mod,
      cmCommands_mod,
      cmState_mod,
      cmTheme_mod,
      cmAutocomplete_mod,
      cmSearch_mod,
      cmLang_mod,
      cmFold_mod,
      cmMatchBrackets_mod,
      cmRectSel_mod,
      cmLanguage_mod,
    ] = await Promise.all([
      import(ESM + '@codemirror/view@6'),
      import(ESM + '@codemirror/commands@6'),
      import(ESM + '@codemirror/state@6'),
      import(ESM + '@codemirror/theme-one-dark@6'),
      import(ESM + '@codemirror/autocomplete@6'),
      import(ESM + '@codemirror/search@6'),
      import(ESM + '@codemirror/language@6'),
      import(ESM + '@codemirror/language@6'),
      import(ESM + '@codemirror/language@6'),
      import(ESM + '@codemirror/view@6'),
      import(ESM + '@codemirror/language@6'),
    ]);

    // Helper to safely import optional language packs
    const safeImport = async (url) => {
      try {
        return await import(url);
      } catch (err) {
        console.warn(`Failed to load ${url}:`, err);
        return null;
      }
    };

    // Load all language packs individually (failures won’t break the editor)
    const [
      langJS_mod, langPy_mod, langHtml_mod, langCss_mod,
      langJson_mod, langMd_mod, langXml_mod, langSql_mod,
      langCpp_mod, langGo_mod, langJava_mod, langPhp_mod,
      langRuby_mod, langRust_mod, langVue_mod, langSvelte_mod,
      langYaml_mod, langToml_mod, langBash_mod, langLegacy_mod,
    ] = await Promise.all([
      safeImport(ESM + '@codemirror/lang-javascript@6'),
      safeImport(ESM + '@codemirror/lang-python@6'),
      safeImport(ESM + '@codemirror/lang-html@6'),
      safeImport(ESM + '@codemirror/lang-css@6'),
      safeImport(ESM + '@codemirror/lang-json@6'),
      safeImport(ESM + '@codemirror/lang-markdown@6'),
      safeImport(ESM + '@codemirror/lang-xml@6'),
      safeImport(ESM + '@codemirror/lang-sql@6'),
      safeImport(ESM + '@codemirror/lang-cpp@6'),
      safeImport(ESM + '@codemirror/lang-go@6'),
      safeImport(ESM + '@codemirror/lang-java@6'),
      safeImport(ESM + '@codemirror/lang-php@6'),
      safeImport(ESM + '@codemirror/lang-ruby@6'),
      safeImport(ESM + '@codemirror/lang-rust@6'),
      safeImport(ESM + '@codemirror/lang-vue@6'),
      safeImport(ESM + '@codemirror/lang-svelte@6'),
      safeImport(ESM + '@codemirror/lang-yaml@6'),
      safeImport(ESM + '@codemirror/lang-toml@6'),
      safeImport(ESM + '@codemirror/lang-bash@6'),
	  safeImport(ESM + '@codemirror/legacy-modes@6'),
    ]);

    window._CM = {
      EditorView:           cmView_mod.EditorView,
      keymap:               cmView_mod.keymap,
      lineNumbers:          cmView_mod.lineNumbers,
      highlightActiveLine:  cmView_mod.highlightActiveLine,
      highlightActiveLineGutter: cmView_mod.highlightActiveLineGutter,
      drawSelection:        cmView_mod.drawSelection,
      dropCursor:           cmView_mod.dropCursor,
      rectangularSelection: cmRectSel_mod.rectangularSelection,
      crosshairCursor:      cmRectSel_mod.crosshairCursor,
      defaultKeymap:        cmCommands_mod.defaultKeymap,
      indentWithTab:        cmCommands_mod.indentWithTab,
      history:              cmCommands_mod.history,
      historyKeymap:        cmCommands_mod.historyKeymap,
      EditorState:          cmState_mod.EditorState,
      oneDark:              cmTheme_mod.oneDark,
      autocompletion:       cmAutocomplete_mod.autocompletion,
      closeBrackets:        cmAutocomplete_mod.closeBrackets,
      closeBracketsKeymap:  cmAutocomplete_mod.closeBracketsKeymap,
      completionKeymap:     cmAutocomplete_mod.completionKeymap,
      search:               cmSearch_mod.search,
      searchKeymap:         cmSearch_mod.searchKeymap,
      foldGutter:           cmFold_mod.foldGutter,
      foldKeymap:           cmFold_mod.foldKeymap,
      bracketMatching:      cmMatchBrackets_mod.bracketMatching,
      indentOnInput:        cmLanguage_mod.indentOnInput,
      syntaxHighlighting:   cmLanguage_mod.syntaxHighlighting,
      defaultHighlightStyle: cmLanguage_mod.defaultHighlightStyle,
      // Language packs (null if failed to load)
      langJS:   langJS_mod,
      langPy:   langPy_mod,
      langHtml: langHtml_mod,
      langCss:  langCss_mod,
      langJson: langJson_mod,
      langMd:   langMd_mod,
      langXml:  langXml_mod,
      langSql:  langSql_mod,
      langCpp:   langCpp_mod,
      langGo:    langGo_mod,
      langJava:  langJava_mod,
      langPhp:   langPhp_mod,
      langRuby:  langRuby_mod,
      langRust:  langRust_mod,
      langVue:   langVue_mod,
      langSvelte: langSvelte_mod,
      langYaml:  langYaml_mod,
      langToml:  langToml_mod,
      langBash:  langBash_mod,
	  langLegacy: langLegacy_mod,
    };

    const host = document.getElementById('cmHost');
    if (!host) throw new Error('cmHost element not found');

    cmView = new window._CM.EditorView({
      state: window._CM.EditorState.create({ doc: '', extensions: buildExtensions('') }),
      parent: host
    });

    cmView.dom.addEventListener('input', () => markActiveTabDirty());
    console.log('✅ CodeMirror 6 loaded – syntax highlighting active');
  } catch (err) {
    console.error('CodeMirror core failed to load:', err);
    const host = document.getElementById('cmHost');
    if (host) host.innerHTML = '<textarea id="cmFallback" style="width:100%;height:100%;background:#161b22;color:#e6edf3;border:none;padding:12px;font-family:monospace;font-size:13px;"></textarea>';
    window._CM = null;
  }
}

function buildExtensions(filename) {
  const CM = window._CM;
  const {
    EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
    drawSelection, dropCursor,
    defaultKeymap, indentWithTab, history, historyKeymap,
    EditorState,
    oneDark,
    autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap,
    search, searchKeymap,
    foldGutter, foldKeymap,
    bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle,
  } = CM;

  const langExts = getLanguageExtension(filename, CM);

  return [
    // ── Theme ──
    oneDark,
    EditorView.theme({
      '&': { height: '100%', background: '#0d1117', fontSize: '13px' },
      '.cm-content': {
        fontFamily: "'Cascadia Code','Fira Code','Consolas','Courier New',monospace",
        fontSize: '13px',
        lineHeight: '1.6',
        caretColor: '#58a6ff',
      },
      '.cm-gutters': {
        background: '#0a0c10',
        borderRight: '1px solid #21262d',
        color: '#4d5566',
        minWidth: '48px',
      },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px' },
      '.cm-activeLine': { backgroundColor: '#1c2128' },
      '.cm-activeLineGutter': { backgroundColor: '#161b22' },
      '.cm-selectionBackground, ::selection': { backgroundColor: '#2d4f7c !important' },
      '.cm-matchingBracket': {
        backgroundColor: '#3b4d2d',
        outline: '1px solid #6ea832',
        borderRadius: '2px',
      },
      '.cm-foldPlaceholder': {
        background: '#21262d',
        border: '1px solid #30363d',
        borderRadius: '4px',
        padding: '0 6px',
        color: '#8b949e',
      },
      '.cm-tooltip-autocomplete': {
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        background: '#2d4f7c',
        color: '#e6edf3',
      },
      '.cm-tooltip-autocomplete ul li': {
        padding: '3px 10px',
        color: '#c9d1d9',
      },
      '.cm-completionIcon': { marginRight: '6px' },
      '.cm-searchMatch': { backgroundColor: '#2d4f2d', outline: '1px solid #4caf50' },
      '.cm-searchMatch-selected': { backgroundColor: '#4d2d2d', outline: '1px solid #f44336' },
      '.cm-cursor': { borderLeftColor: '#58a6ff', borderLeftWidth: '2px' },
      '.cm-indentationMark': { borderLeft: '1px solid #21262d' },
    }),

    // ── Core view features ──
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.lineWrapping,

    // ── History (undo/redo) ──
    history(),
    keymap.of(historyKeymap),

    // ── Bracket matching + auto-close ──
    bracketMatching(),
    closeBrackets(),

    // ── Code folding ──
    foldGutter(),
    keymap.of(foldKeymap),

    // ── Language-aware indentation ──
    indentOnInput(),

    // ── Syntax highlighting ──
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

    // ── Autocompletion (IntelliSense) ──
    autocompletion({
      activateOnTyping: true,
      maxRenderedOptions: 12,
      defaultKeymap: true,
    }),

    // ── Built-in search panel (Ctrl+F) ──
    search({ top: false }),
    keymap.of(searchKeymap),

    // ── Key bindings ──
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),

    // ── Language pack ──
    ...langExts,
  ];
}

function cmSetContent(content, filename) {
  if (!window._CM || !cmView) {
    const fb = document.getElementById('cmFallback');
    if (fb) fb.value = content;
    return;
  }
  const { EditorState } = window._CM;
  cmView.setState(EditorState.create({
    doc: content,
    extensions: buildExtensions(filename || '')
  }));
}

function cmGetContent() {
  if (!window._CM || !cmView) {
    const fb = document.getElementById('cmFallback');
    return fb ? fb.value : '';
  }
  return cmView.state.doc.toString();
}

let htmlPreviewDebounce = null;

function markActiveTabDirty() {
  if (activeTabIndex >= 0 && currentOpenTabs[activeTabIndex]) {
    const newContent = cmGetContent();
    if (currentOpenTabs[activeTabIndex].content !== newContent) {
      currentOpenTabs[activeTabIndex].dirty = true;
      renderTabs();

      // Live HTML preview update (debounced 600ms)
      if (htmlPreviewOpen) {
        const ext = path.extname(currentOpenTabs[activeTabIndex].relativePath).slice(1).toLowerCase();
        if (ext === 'html' || ext === 'htm') {
          clearTimeout(htmlPreviewDebounce);
          htmlPreviewDebounce = setTimeout(async () => {
            await ipcRenderer.invoke('update-html-preview', newContent);
          }, 600);
        }
      }
    }
  }
}

// DOM references
const leftPanel = document.getElementById('leftPanel');
const divider = document.getElementById('divider');
const folderInfo = document.getElementById('folderInfo');
const attachFolderBtn = document.getElementById('attachFolderBtn');
const refreshBtn = document.getElementById('refreshBtn');
const selectAllFiles = document.getElementById('selectAllFiles');
const selectNoneFiles = document.getElementById('selectNoneFiles');
const generateContextBtn = document.getElementById('generateContextBtn');
const fileTreeDiv = document.getElementById('fileTree');
const editorArea = document.getElementById('editorArea');
const saveBtn = document.getElementById('saveBtn');
const restoreBtn = document.getElementById('restoreBtn');
const deleteBtn = document.getElementById('deleteBtn');
const openBtn = document.getElementById('openBtn');
const diskOpenBtn = document.getElementById('diskOpenBtn');
const diskFileInput = document.getElementById('diskFileInput');
const runCmdBtn = document.getElementById('runCmdBtn');
const statusMsg = document.getElementById('statusMsg');
const tokenEstimate = document.getElementById('tokenEstimate');
const aiWebview = document.getElementById('aiWebview');
const aiNav = document.getElementById('aiNav');
const dropOverlay = document.getElementById('dropOverlay');
const rightPanel = document.getElementById('rightPanel');
const tabsContainer = document.getElementById('tabsContainer');

// New file UI
const newFileBtn = document.getElementById('newFileBtn');
const newFileOverlay = document.getElementById('newFileOverlay');
const newFileNameInput = document.getElementById('newFileNameInput');
const newFileFolderEl = document.getElementById('newFileFolder');
const newFileCancelBtn = document.getElementById('newFileCancelBtn');
const newFileCreateBtn = document.getElementById('newFileCreateBtn');

// Context menus (unchanged)
const treeContextMenu = document.getElementById('treeContextMenu');
const ctxRename = document.getElementById('ctxRename');
const ctxDelete = document.getElementById('ctxDelete');
const ctxSendToAI = document.getElementById('ctxSendToAI');
let ctxTargetFile = null;
let renameOverlay = null;
const folderContextMenu = document.getElementById('folderContextMenu');
const ctxFolderRename = document.getElementById('ctxFolderRename');
const ctxFolderDelete = document.getElementById('ctxFolderDelete');
let ctxTargetFolderNode = null;

// Helper functions
function setStatus(msg, duration = 2500) {
  statusMsg.innerText = msg;
  if (duration > 0) setTimeout(() => { statusMsg.innerText = ''; }, duration);
}
function waitForWebviewLoad() {
  return new Promise((resolve) => {
    const url = aiWebview.getURL();
    if (url && url !== 'about:blank' && url.startsWith('http')) resolve();
    else aiWebview.addEventListener('did-finish-load', resolve, { once: true });
  });
}
function createRenameModal() {
  const modal = document.createElement('div');
  modal.id = 'renameModal';
  modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; z-index: 1001;`;
  modal.innerHTML = `<div style="background:#161b22; border:1px solid #30363d; border-radius:16px; padding:24px; min-width:320px;">
    <div style="font-size:0.95rem; font-weight:600; margin-bottom:12px;">✏️ Rename</div>
    <input id="renameInput" type="text" style="width:100%; background:#0d1117; border:1px solid #30363d; border-radius:8px; padding:8px 12px; color:#e6edf3;">
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
      <button id="renameCancelBtn">Cancel</button><button id="renameConfirmBtn" class="primary">Rename</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  return modal;
}

// ----- Tab Management -----
function renderTabs() {
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';
  currentOpenTabs.forEach((tab, idx) => {
    const tabDiv = document.createElement('div');
    tabDiv.className = `tab ${idx === activeTabIndex ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`;
    const filenameSpan = document.createElement('span');
    filenameSpan.className = 'tab-filename';
    filenameSpan.textContent = path.basename(tab.relativePath);
    const closeSpan = document.createElement('span');
    closeSpan.className = 'tab-close';
    closeSpan.textContent = '✕';
    closeSpan.onclick = (e) => {
      e.stopPropagation();
      closeTab(idx);
    };
    tabDiv.appendChild(filenameSpan);
    tabDiv.appendChild(closeSpan);
    tabDiv.onclick = () => setActiveTab(idx);
    tabsContainer.appendChild(tabDiv);
  });
  if (currentOpenTabs.length === 0) {
    editorArea.style.display = 'none';
    currentFileAbsolutePath = null;
  } else {
    editorArea.style.display = 'flex';
  }
}
async function openFileInTab(file) {
  // Check if already open
  const existingIdx = currentOpenTabs.findIndex(t => t.absolutePath === file.absolutePath);
  if (existingIdx !== -1) {
    setActiveTab(existingIdx);
    return;
  }
  let content = file.content;
  if (!content) content = await ipcRenderer.invoke('read-file', file.absolutePath);
  const newTab = {
    absolutePath: file.absolutePath,
    relativePath: file.relativePath,
    content: content,
    dirty: false
  };
  currentOpenTabs.push(newTab);
  setActiveTab(currentOpenTabs.length - 1);
}
function setActiveTab(index) {
  if (index < 0 || index >= currentOpenTabs.length) return;
  activeTabIndex = index;
  const tab = currentOpenTabs[index];
  currentFileAbsolutePath = tab.absolutePath;
  cmSetContent(tab.content, path.basename(tab.relativePath));
  renderTabs();
}
async function closeTab(index) {
  const tab = currentOpenTabs[index];
  if (tab.dirty) {
    const confirmClose = confirm(`File "${path.basename(tab.relativePath)}" has unsaved changes. Close anyway?`);
    if (!confirmClose) return;
  }
  currentOpenTabs.splice(index, 1);
  if (currentOpenTabs.length === 0) {
    activeTabIndex = -1;
    currentFileAbsolutePath = null;
    editorArea.style.display = 'none';
  } else if (activeTabIndex >= index) {
    activeTabIndex = Math.max(0, activeTabIndex - 1);
    setActiveTab(activeTabIndex);
  } else {
    setActiveTab(activeTabIndex);
  }
}
async function saveCurrentTab() {
  if (activeTabIndex === -1) return;
  const tab = currentOpenTabs[activeTabIndex];
  const newContent = cmGetContent();
  await ipcRenderer.invoke('save-file', tab.absolutePath, newContent);
  tab.content = newContent;
  tab.dirty = false;
  // Update folderFiles cache
  const f = folderFiles.find(f => f.absolutePath === tab.absolutePath);
  if (f) f.content = newContent;
  setStatus('✅ Saved');
  renderTabs();
}

// ----- File tree lazy loading (unchanged except openFileInTab) -----
attachFolderBtn.onclick = async () => {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    currentProjectPath = folderPath;
    folderInfo.innerText = `📁 ${folderPath}`;
    await loadRootDirectory();
    if (ptyId) {
      await ipcRenderer.invoke('pty-cd', ptyId, folderPath);
      document.getElementById('terminalCwd').textContent = folderPath;
    }
  }
};
async function loadRootDirectory() {
  if (!currentProjectPath) return;
  const children = await ipcRenderer.invoke('read-directory-children', currentProjectPath);
  treeRoot = {
    id: 0, name: path.basename(currentProjectPath), fullPath: currentProjectPath, type: 'root',
    parentId: null, children: children.map(c => createNode(c.name, c.fullPath, c.type, 0)), expanded: true
  };
  nodeMap.clear(); nodeMap.set(0, treeRoot);
  for (let child of treeRoot.children) nodeMap.set(child.id, child);
  renderFileTreeLazy();
  rebuildFolderFilesArray();
  updateTokenEstimate();
}
async function loadDirectoryChildren(node) {
  if (node.children && node.children.length > 0) return;
  if (node.loading) return;
  node.loading = true;
  renderFileTreeLazy();
  const children = await ipcRenderer.invoke('read-directory-children', node.fullPath);
  node.children = children.map(c => createNode(c.name, c.fullPath, c.type, node.id));
  node.expanded = true; node.loading = false;
  for (let child of node.children) nodeMap.set(child.id, child);
  renderFileTreeLazy();
  rebuildFolderFilesArray();
  updateTokenEstimate();
}
function renderFileTreeLazy() {
  if (!treeRoot) { fileTreeDiv.innerHTML = '<div>No folder selected</div>'; return; }
  fileTreeDiv.innerHTML = '';
  function renderNode(node, container, indent = 0) {
    const isFolder = (node.type === 'root' || node.type === 'folder');
    const div = document.createElement('div'); div.style.marginLeft = `${indent}px`;
    if (isFolder) {
      div.className = 'tree-item-folder';
      const toggleSpan = document.createElement('span');
      toggleSpan.style.cursor = 'pointer'; toggleSpan.style.marginRight = '4px';
      toggleSpan.textContent = node.expanded ? '📂 ' : '📁 ';
      toggleSpan.onclick = async (e) => {
        e.stopPropagation();
        if (node.expanded) node.expanded = false;
        else { if (!node.children || node.children.length === 0) await loadDirectoryChildren(node); else node.expanded = true; }
        renderFileTreeLazy();
      };
      const nameSpan = document.createElement('span'); nameSpan.textContent = node.name;
      div.appendChild(toggleSpan); div.appendChild(nameSpan);
      if (node.type === 'folder') {
		  
		  
		div.addEventListener('contextmenu', (e) => {
		  e.preventDefault();
		  e.stopPropagation();
		  ctxTargetFolderNode = node;
		  // Hide the other context menu if visible
		  treeContextMenu.style.display = 'none';
		  folderContextMenu.style.display = 'block';
		  // Position exactly like the file menu (using the same window edge offsets)
		  folderContextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 160)}px`;
		  folderContextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 120)}px`;
		});
		
      }
      container.appendChild(div);
      if (node.expanded) {
        if (node.loading) { const ld = document.createElement('div'); ld.style.marginLeft = `${indent+20}px`; ld.textContent = '⏳ Loading...'; container.appendChild(ld); }
        else if (node.children && node.children.length) for (let child of node.children) renderNode(child, container, indent+20);
        else { const empty = document.createElement('div'); empty.style.marginLeft = `${indent+20}px`; empty.textContent = '(empty)'; container.appendChild(empty); }
      }
    } else {
      div.className = 'tree-item-file'; div.draggable = true; div.title = 'Drag to AI panel • Right-click';
      div.setAttribute('data-file-id', node.id);
	  div.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/vibe-tree-file-id', node.id.toString()); if (aiWebviewElem) aiWebviewElem.style.pointerEvents = 'none'; });
      div.addEventListener('dragend', () => { if (aiWebviewElem) aiWebviewElem.style.pointerEvents = ''; dropOverlay.classList.remove('active'); });
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        const fileObj = folderFiles.find(f => f.absolutePath === node.fullPath);
        if (fileObj) ctxTargetFile = fileObj;
        treeContextMenu.style.display = 'block';
        treeContextMenu.style.left = `${Math.min(e.clientX, window.innerWidth-160)}px`;
        treeContextMenu.style.top = `${Math.min(e.clientY, window.innerHeight-120)}px`;
      });
      const cb = document.createElement('input'); cb.type = 'checkbox';
      const fileObj = folderFiles.find(f => f.absolutePath === node.fullPath);
      cb.checked = fileObj ? fileObj.selected : false;
      cb.onchange = async () => {
        if (cb.checked) {
          let content = fileObj?.content;
          if (!content) content = await ipcRenderer.invoke('read-file', node.fullPath);
          const newFile = { relativePath: path.relative(currentProjectPath, node.fullPath), absolutePath: node.fullPath, content: content, selected: true };
          const existing = folderFiles.find(f => f.absolutePath === node.fullPath);
          if (existing) existing.selected = true; else folderFiles.push(newFile);
        } else {
          const idx = folderFiles.findIndex(f => f.absolutePath === node.fullPath);
          if (idx !== -1) folderFiles[idx].selected = false;
        }
        updateTokenEstimate();
      };
      const label = document.createElement('span'); label.textContent = node.name; label.style.cursor = 'pointer';
      if (node.name.startsWith('project_context_') && node.name.endsWith('.md')) { label.style.color = '#e67e22'; label.style.fontWeight = '600'; }
      label.onclick = async (e) => {
        e.stopPropagation();
        let file = folderFiles.find(f => f.absolutePath === node.fullPath);
        if (!file) {
          const content = await ipcRenderer.invoke('read-file', node.fullPath);
          file = { relativePath: path.relative(currentProjectPath, node.fullPath), absolutePath: node.fullPath, content: content, selected: true };
          folderFiles.push(file);
          cb.checked = true;
        } else if (!file.content) file.content = await ipcRenderer.invoke('read-file', node.fullPath);
        openFileInTab(file);
      };
      div.appendChild(cb); div.appendChild(label); container.appendChild(div);
    }
  }
  renderNode(treeRoot, fileTreeDiv, 0);
}
function rebuildFolderFilesArray() {
  const newFiles = [];
  function collect(node) {
    if (node.type === 'file') {
      const existing = folderFiles.find(f => f.absolutePath === node.fullPath);
      if (existing) newFiles.push(existing);
      else newFiles.push({ relativePath: path.relative(currentProjectPath, node.fullPath), absolutePath: node.fullPath, content: null, selected: false });
    }
    if (node.children) for (let child of node.children) collect(child);
  }
  if (treeRoot) collect(treeRoot);
  folderFiles = newFiles;
}
refreshBtn.onclick = async () => { if (currentProjectPath) await loadRootDirectory(); };
selectAllFiles.onclick = () => { folderFiles.forEach(f => f.selected = true); renderFileTreeLazy(); updateTokenEstimate(); setStatus('Selected all loaded files'); };
selectNoneFiles.onclick = () => { folderFiles.forEach(f => f.selected = false); renderFileTreeLazy(); updateTokenEstimate(); setStatus('All selections cleared'); };
async function buildProjectContext() {
  if (!folderFiles.length) return '';
  let context = '# Project Files\n\n## Folder Structure\n```\n';
  function getTreeStructure(node, indent = '') {
    let lines = [];
    if (node.type === 'root' || node.type === 'folder') {
      for (let child of (node.children || [])) {
        if (child.type === 'folder') { lines.push(indent + '├─ ' + child.name + '/'); lines.push(...getTreeStructure(child, indent + '   ')); }
        else if (child.type === 'file') lines.push(indent + '├─ ' + child.name);
      }
    }
    return lines;
  }
  if (treeRoot) context += getTreeStructure(treeRoot).join('\n') + '\n```\n\n';
  context += '## Selected Files\n\n';
  for (let file of folderFiles) {
    if (!file.selected) continue;
    const ext = path.extname(file.relativePath).slice(1).toLowerCase();
    if (!file.content) file.content = await ipcRenderer.invoke('read-file', file.absolutePath);
    context += `### ${file.relativePath}\n\n\`\`\`${ext}\n${file.content}\n\`\`\`\n\n`;
  }
  return context;
}
async function updateTokenEstimate() {
  const ctx = await buildProjectContext();
  const tokens = Math.ceil(ctx.length / 4);
  tokenEstimate.style.display = tokens > 100000 ? 'block' : 'none';
  if (tokens > 100000) tokenEstimate.innerText = `⚠️ Context size: ~${tokens} tokens.`;
}
generateContextBtn.onclick = async () => {
  if (!currentProjectPath) { setStatus('⚠️ Select a project folder first.'); return; }
  const context = await buildProjectContext();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0,19);
  const contextFilePath = path.join(currentProjectPath, `project_context_${timestamp}.md`);
  await ipcRenderer.invoke('save-file', contextFilePath, context);
  setStatus(`📄 ${path.basename(contextFilePath)} generated`);
  await loadRootDirectory();
};

// ========== Drag & drop to AI – works on webview by disabling its pointer events ==========
// Right panel handles the overlay and drop (covers terminal and webview)
function onDragEnter(e) {
  e.preventDefault();
  // Only show overlay if dragging over the webview area (rightTop), not terminal/nav
  const rightTop = document.getElementById('rightTop');
  if (rightTop && rightTop.contains(e.target)) {
    dropOverlay.classList.add('active');
  }
}

function onDragLeave(e) {
  // Only hide overlay if leaving the right panel entirely (not just entering a child)
  if (!rightPanel.contains(e.relatedTarget)) {
    dropOverlay.classList.remove('active');
    if (aiWebviewElem) aiWebviewElem.style.pointerEvents = '';
  }
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

// Reusable drop handler
async function handleFileDrop(e) {
  e.preventDefault();
  dropOverlay.classList.remove('active');
  // Re-enable webview pointer events if they were disabled
  if (aiWebviewElem) aiWebviewElem.style.pointerEvents = '';

  const fileId = e.dataTransfer.getData('text/vibe-tree-file-id');
  if (fileId) {
    const node = nodeMap.get(parseInt(fileId, 10));
    if (node && node.type === 'file') {
      const fileObj = folderFiles.find(f => f.absolutePath === node.fullPath);
      if (fileObj) {
        if (!fileObj.content) fileObj.content = await ipcRenderer.invoke('read-file', node.fullPath);
        const ext = path.extname(fileObj.relativePath).slice(1).toLowerCase();
        const prompt = `## File: ${fileObj.relativePath}\n\`\`\`${ext}\n${fileObj.content}\n\`\`\`\n\n[USER QUERY]\nPlease help me with this file.`;
        await injectPromptIntoAI(prompt);
        setStatus(`✅ Sent "${fileObj.relativePath}" to AI`, 3000);
        return;
      }
    }
  }

  const files = Array.from(e.dataTransfer.files);
  if (!files.length) return;

  setStatus(`📎 Reading ${files.length} file(s)…`, 0);
  const parts = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const ext = file.name.split('.').pop().toLowerCase();
      parts.push(`## File: ${file.name}\n\`\`\`${ext}\n${text}\n\`\`\``);
    } catch {
      parts.push(`## File: ${file.name}\n*(Could not read)*`);
    }
  }
  const prompt = `[DROPPED FILES]\n\n${parts.join('\n\n')}\n\n[USER QUERY]\nPlease help me with these files.`;
  await injectPromptIntoAI(prompt);
  setStatus(`✅ ${files.length} file(s) sent to AI`, 3000);
}

// Right panel events (covers terminal and also the area behind webview when webview is transparent)
rightPanel.addEventListener('dragenter', onDragEnter);
rightPanel.addEventListener('dragleave', onDragLeave);
rightPanel.addEventListener('dragover', onDragOver);
rightPanel.addEventListener('drop', handleFileDrop);

// Webview: temporarily disable its pointer events so drag events reach the right panel
const aiWebviewElem = document.getElementById('aiWebview');


// Wire up AI nav buttons
aiNav.querySelectorAll('button[data-url]').forEach(btn => {
  btn.addEventListener('click', () => {
    aiWebview.src = btn.getAttribute('data-url');
    aiNav.querySelectorAll('button[data-url]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});




async function injectPromptIntoAI(prompt) {
  await waitForWebviewLoad();
  const currentUrl = aiWebview.getURL();
  const escaped = prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  let script = '';
  if (currentUrl.includes('claude.ai')) {
    script = `(function() { let a=0; const i=setInterval(()=>{const d=document.querySelector('div[contenteditable="true"]'); if(d||a++>20){clearInterval(i);if(!d)return;d.focus();d.innerText=\`${escaped}\`;d.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(()=>{document.querySelector('button[type="submit"]')?.click();},300);}},500);})();`;
  } else if (currentUrl.includes('chatgpt.com')) {
    script = `(function(){const t=\`${escaped}\`;let a=0;const i=setInterval(()=>{let inp=document.querySelector('div#prompt-textarea[contenteditable="true"]')||document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]')||document.querySelector('div[contenteditable="true"]')||document.querySelector('textarea');if(inp||a++>30){clearInterval(i);if(!inp)return;inp.focus();if(inp.tagName==='TEXTAREA'){const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(s)s.call(inp,t);else inp.value=t;inp.dispatchEvent(new Event('input',{bubbles:true}));}else{document.execCommand('selectAll',false,null);document.execCommand('delete',false,null);const dt=new DataTransfer();dt.setData('text/plain',t);inp.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));setTimeout(()=>{if(!inp.textContent.trim()){inp.focus();document.execCommand('insertText',false,t);}},150);}setTimeout(()=>{const btn=document.querySelector('button[data-testid="send-button"]')||document.querySelector('button[aria-label="Send message"]');if(btn&&!btn.disabled)btn.click();else inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));},700);}},500);})();`;
  } else {
    script = `(function(){let a=0;const i=setInterval(()=>{const inp=document.querySelector('textarea, [contenteditable="true"]');if(inp||a++>20){clearInterval(i);if(!inp)return;inp.focus();if(inp.tagName==='TEXTAREA'){const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;s?s.call(inp,\`${escaped}\`):inp.value=\`${escaped}\`;inp.dispatchEvent(new Event('input',{bubbles:true}));}else{inp.innerText=\`${escaped}\`;inp.dispatchEvent(new Event('input',{bubbles:true}));}setTimeout(()=>{const btn=document.querySelector('button[type="submit"], button[aria-label="Send"]');if(btn)btn.click();else inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));},300);}},500);})();`;
  }
  try { await aiWebview.executeJavaScript(script); }
  catch (err) { console.error('Injection error:', err); setStatus('❌ Failed to inject.', 4000); }
}

// New file
newFileBtn.onclick = () => {
  if (!currentProjectPath) { setStatus('⚠️ Select a project folder first.'); return; }
  newFileFolderEl.innerText = currentProjectPath;
  newFileNameInput.value = '';
  newFileOverlay.style.display = 'flex';
};
newFileCancelBtn.onclick = () => newFileOverlay.style.display = 'none';
newFileCreateBtn.onclick = async () => {
  const fileName = newFileNameInput.value.trim();
  if (!fileName) { setStatus('❌ Please enter a file name'); return; }
  const fullPath = path.join(currentProjectPath, fileName);
  try {
    await ipcRenderer.invoke('create-file', fullPath, '');
    setStatus(`✅ Created ${fileName}`);
    newFileOverlay.style.display = 'none';
    await loadRootDirectory();
  } catch (err) { setStatus(`❌ Failed: ${err.message}`); }
};

// Restore (works with tabs: updates tab content if needed)
restoreBtn.onclick = async () => {
  if (activeTabIndex === -1) { setStatus('⚠️ No file open to restore from.'); return; }
  const currentFilePath = currentOpenTabs[activeTabIndex].absolutePath;
  if (!currentFilePath.includes('project_context_') || !currentFilePath.endsWith('.md')) {
    setStatus('❌ Restore works only with project_context_*.md files.');
    return;
  }
  const content = cmGetContent();
  const lines = content.split('\n');
  const filesToRestore = [];
  let currentFile = null, inCodeBlock = false, codeContent = [];
  for (let line of lines) {
    if (line.startsWith('### ')) {
      if (currentFile && codeContent.length) filesToRestore.push({ path: currentFile, content: codeContent.join('\n') });
      currentFile = line.slice(4).trim(); inCodeBlock = false; codeContent = [];
    } else if (line.trim().startsWith('```')) inCodeBlock = !inCodeBlock;
    else if (inCodeBlock) codeContent.push(line);
  }
  if (currentFile && codeContent.length) filesToRestore.push({ path: currentFile, content: codeContent.join('\n') });
  if (filesToRestore.length === 0) { setStatus('⚠️ No files found.'); return; }
  const contextFileName = path.basename(currentFilePath);
  const filteredFiles = filesToRestore.filter(f => path.basename(f.path) !== contextFileName);
  if (filteredFiles.length === 0) { setStatus('⚠️ No files to restore (only the context file itself).'); return; }
  const fs = require('fs').promises;
  const pathNode = require('path');
  let backupCounter = 1;
  while (true) {
    const backupFolderPath = pathNode.join(currentProjectPath, `Backup${String(backupCounter).padStart(4,'0')}`);
    try { await fs.access(backupFolderPath); backupCounter++; } catch { break; }
  }
  const backupFolder = pathNode.join(currentProjectPath, `Backup${String(backupCounter).padStart(4,'0')}`);
  await fs.mkdir(backupFolder, { recursive: true });
  setStatus(`📦 Creating backup in ${pathNode.basename(backupFolder)}...`, 0);
  let movedCount = 0, restoredCount = 0, restoredPaths = [];
  for (const file of filteredFiles) {
    const targetPath = pathNode.join(currentProjectPath, file.path);
    const targetDir = pathNode.dirname(targetPath);
    await fs.mkdir(targetDir, { recursive: true });
    try {
      await fs.access(targetPath);
      const backupTarget = pathNode.join(backupFolder, file.path);
      await fs.mkdir(pathNode.dirname(backupTarget), { recursive: true });
      await fs.rename(targetPath, backupTarget);
      movedCount++;
    } catch (err) {}
    await fs.writeFile(targetPath, file.content, 'utf8');
    restoredCount++; restoredPaths.push(targetPath);
    const cached = folderFiles.find(f => f.absolutePath === targetPath);
    if (cached) cached.content = null;
    // Update open tab content if the restored file is already open
    const openTab = currentOpenTabs.find(t => t.absolutePath === targetPath);
    if (openTab) {
      openTab.content = file.content;
      openTab.dirty = false;
    }
  }
  await loadRootDirectory();
  if (currentFileAbsolutePath && restoredPaths.includes(currentFileAbsolutePath)) {
    const tab = currentOpenTabs.find(t => t.absolutePath === currentFileAbsolutePath);
    if (tab) { tab.content = file.content; setActiveTab(currentOpenTabs.indexOf(tab)); }
  }
  setStatus(`✅ Restored ${restoredCount} files (backed up ${movedCount} replaced files to ${pathNode.basename(backupFolder)})`);
};

// Context menu actions (mostly unchanged, adapt to tabs)
function hideContextMenu() { treeContextMenu.style.display = 'none'; }
async function performRename(oldPath, newName) {
  if (!newName || newName === path.basename(oldPath)) return false;
  const newPath = path.join(path.dirname(oldPath), newName);
  try {
    await ipcRenderer.invoke('rename-file', oldPath, newPath);
    setStatus(`✏️ Renamed to ${newName}`);
    await loadRootDirectory();
    const tab = currentOpenTabs.find(t => t.absolutePath === oldPath);
    if (tab) {
      tab.absolutePath = newPath;
      tab.relativePath = path.relative(currentProjectPath, newPath);
      if (activeTabIndex !== -1 && currentOpenTabs[activeTabIndex].absolutePath === newPath) currentFileAbsolutePath = newPath;
      renderTabs();
    }
    return true;
  } catch (err) { setStatus(`❌ Rename failed: ${err.message}`); return false; }
}
ctxRename.onclick = async (e) => {
  e.stopPropagation();
  if (!ctxTargetFile) { setStatus('No file selected'); hideContextMenu(); return; }
  const oldPath = ctxTargetFile.absolutePath;
  if (!renameOverlay) renameOverlay = createRenameModal();
  const input = renameOverlay.querySelector('#renameInput');
  input.value = path.basename(oldPath);
  renameOverlay.style.display = 'flex';
  setTimeout(() => { input.focus(); input.select(); }, 50);
  const confirmBtn = renameOverlay.querySelector('#renameConfirmBtn');
  const cancelBtn = renameOverlay.querySelector('#renameCancelBtn');
  const cleanup = () => {
    renameOverlay.style.display = 'none';
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    window.removeEventListener('keydown', onKeyDown);
  };
  const onConfirm = async () => { const newName = input.value.trim(); cleanup(); await performRename(oldPath, newName); hideContextMenu(); ctxTargetFile = null; };
  const onCancel = () => { cleanup(); hideContextMenu(); ctxTargetFile = null; };
  const onKeyDown = (event) => { if (event.key === 'Enter') onConfirm(); if (event.key === 'Escape') onCancel(); };
  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  window.addEventListener('keydown', onKeyDown);
};


ctxDelete.onclick = async () => {
  if (!ctxTargetFile) return;
  if (!confirm(`Delete "${path.basename(ctxTargetFile.absolutePath)}" permanently?`)) { 
    hideContextMenu(); 
    return; 
  }
  
  const deletedPath = ctxTargetFile.absolutePath;
  const wasOpenTab = currentOpenTabs.some(tab => tab.absolutePath === deletedPath);
  
  // Perform deletion
  await ipcRenderer.invoke('delete-file', deletedPath);
  
  // If the deleted file was open in a tab, close that tab
  if (wasOpenTab) {
    const tabIndex = currentOpenTabs.findIndex(tab => tab.absolutePath === deletedPath);
    if (tabIndex !== -1) closeTab(tabIndex);
  }
  
  await loadRootDirectory();
  setStatus(`🗑️ Deleted ${path.basename(deletedPath)}`);
  
  // Hide any lingering menus
  hideContextMenu();
  if (folderContextMenu) folderContextMenu.style.display = 'none';
  
  // 🔥 Force window focus reset (same as Delete button fix)
  await ipcRenderer.invoke('reset-window-focus');
  
  // Restore focus
  setTimeout(() => {
    if (currentOpenTabs.length > 0 && activeTabIndex !== -1) {
      if (cmView) cmView.focus();
    } else {
      aiWebview.focus();
      aiWebview.executeJavaScript(`
        (function() {
          const el = document.querySelector('textarea, input, [contenteditable="true"]');
          if (el) { el.focus(); el.click(); }
        })();
      `).catch(()=>{});
    }
  }, 100);
  
  ctxTargetFile = null;
};


ctxSendToAI.onclick = async () => {
  if (!ctxTargetFile) return;
  if (!ctxTargetFile.content) ctxTargetFile.content = await ipcRenderer.invoke('read-file', ctxTargetFile.absolutePath);
  const ext = path.extname(ctxTargetFile.relativePath).slice(1).toLowerCase();
  const prompt = `## File: ${ctxTargetFile.relativePath}\n\`\`\`${ext}\n${ctxTargetFile.content}\n\`\`\`\n\n[USER QUERY]\nPlease help me with this file.`;
  await injectPromptIntoAI(prompt);
  setStatus(`🤖 Sent "${ctxTargetFile.relativePath}" to AI`);
  hideContextMenu(); ctxTargetFile = null;
};
document.addEventListener('click', (e) => { if (!treeContextMenu.contains(e.target)) hideContextMenu(); if (folderContextMenu && !folderContextMenu.contains(e.target)) folderContextMenu.style.display = 'none'; });

// Folder context menu
ctxFolderRename.onclick = async (e) => {
  e.stopPropagation();
  if (!ctxTargetFolderNode) { folderContextMenu.style.display = 'none'; return; }
  const oldPath = ctxTargetFolderNode.fullPath;
  if (!renameOverlay) renameOverlay = createRenameModal();
  const input = renameOverlay.querySelector('#renameInput');
  input.value = path.basename(oldPath);
  renameOverlay.style.display = 'flex';
  setTimeout(() => { input.focus(); input.select(); }, 50);
  const confirmBtn = renameOverlay.querySelector('#renameConfirmBtn');
  const cancelBtn = renameOverlay.querySelector('#renameCancelBtn');
  const cleanup = () => {
    renameOverlay.style.display = 'none';
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    window.removeEventListener('keydown', onKeyDown);
  };
  const onConfirm = async () => {
    const newName = input.value.trim(); cleanup(); folderContextMenu.style.display = 'none';
    if (!newName || newName === path.basename(oldPath)) { ctxTargetFolderNode = null; return; }
    const newPath = path.join(path.dirname(oldPath), newName);
    try {
      await ipcRenderer.invoke('rename-file', oldPath, newPath);
      setStatus(`✏️ Folder renamed to ${newName}`);
      for (let tab of currentOpenTabs) {
        if (tab.absolutePath.startsWith(oldPath)) {
          tab.absolutePath = tab.absolutePath.replace(oldPath, newPath);
          tab.relativePath = path.relative(currentProjectPath, tab.absolutePath);
          if (activeTabIndex !== -1 && currentOpenTabs[activeTabIndex].absolutePath === tab.absolutePath) currentFileAbsolutePath = tab.absolutePath;
        }
      }
      await loadRootDirectory();
    } catch (err) { setStatus(`❌ Rename failed: ${err.message}`); }
    ctxTargetFolderNode = null;
  };
  const onCancel = () => { cleanup(); folderContextMenu.style.display = 'none'; ctxTargetFolderNode = null; };
  const onKeyDown = (ev) => { if (ev.key === 'Enter') onConfirm(); if (ev.key === 'Escape') onCancel(); };
  confirmBtn.addEventListener('click', onConfirm); cancelBtn.addEventListener('click', onCancel);
  window.addEventListener('keydown', onKeyDown);
};
ctxFolderDelete.onclick = async () => {
  if (!ctxTargetFolderNode) { folderContextMenu.style.display = 'none'; return; }
  const folderName = path.basename(ctxTargetFolderNode.fullPath);
  if (!confirm(`Delete folder "${folderName}" and ALL its contents permanently?`)) { folderContextMenu.style.display = 'none'; return; }
  try {
    const fs = require('fs').promises; await fs.rm(ctxTargetFolderNode.fullPath, { recursive: true, force: true });
    setStatus(`🗑️ Deleted folder: ${folderName}`);
    // Close any tabs inside this folder
    for (let i = currentOpenTabs.length-1; i >= 0; i--) {
      if (currentOpenTabs[i].absolutePath.startsWith(ctxTargetFolderNode.fullPath)) closeTab(i);
    }
    await loadRootDirectory();
  } catch (err) { setStatus(`❌ Delete failed: ${err.message}`); }
  folderContextMenu.style.display = 'none'; ctxTargetFolderNode = null;
};

// Resizable panels (unchanged)
let isResizing = false;
divider.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'col-resize'; });
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = e.clientX;
  if (newWidth > 300 && newWidth < window.innerWidth - 300) leftPanel.style.width = `${newWidth}px`;
});
document.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = ''; });

const vDivider = document.getElementById('vDivider'); const rightTop = document.getElementById('rightTop'); const rightBottom = document.getElementById('rightBottom');
let isVResizing = false;
vDivider.addEventListener('mousedown', (e) => { e.preventDefault(); isVResizing = true; vDivider.classList.add('dragging'); document.body.style.cursor = 'row-resize'; });
document.addEventListener('mousemove', (e) => {
  if (!isVResizing) return;
  const rpRect = document.getElementById('rightPanel').getBoundingClientRect();
  const topH = e.clientY - rpRect.top; const totalH = rpRect.height - 6;
  if (topH > 80 && topH < totalH - 60) {
    rightTop.style.flex = 'none'; rightTop.style.height = `${topH}px`;
    rightBottom.style.flex = 'none'; rightBottom.style.height = `${totalH - topH}px`;
  }
});
document.addEventListener('mouseup', () => {
  if (isVResizing) { isVResizing = false; vDivider.classList.remove('dragging'); document.body.style.cursor = ''; fitTerminal(); }
});
window.addEventListener('resize', fitTerminal);

// Terminal (unchanged)
let term = null, ptyId = null, termReady = false;
async function initTerminal(cwd) {
  try {
    const { Terminal } = require('xterm'); const { FitAddon } = require('xterm-addon-fit');
    const host = document.getElementById('terminalHost'); host.innerHTML = '';
    term = new Terminal({ theme: { background: '#0d0f13', foreground: '#e6edf3', cursor: '#58a6ff' }, fontFamily: "'Cascadia Code','Consolas',monospace", fontSize: 12, cursorBlink: true, allowProposedApi: true });
    window._fitAddon = new FitAddon(); term.loadAddon(window._fitAddon); term.open(host);
    await new Promise(resolve => setTimeout(resolve, 150)); window._fitAddon.fit(); termReady = true;
    const cols = term.cols || 80, rows = term.rows || 24;
    const result = await ipcRenderer.invoke('pty-create', cwd || os.homedir(), cols, rows);
    if (result.error) { term.write(`\r\n\x1b[31m${result.error}\x1b[0m\r\n`); return; }
    ptyId = result.id;
    term.onData(data => { if (ptyId) ipcRenderer.invoke('pty-write', ptyId, data); });
    ipcRenderer.on('pty-data', (event, { id, data }) => { if (id === ptyId && term) term.write(data); });
    ipcRenderer.on('pty-exit', (event, { id }) => { if (id === ptyId) { term.write('\r\n\x1b[33m[Process exited — click New to restart]\x1b[0m\r\n'); ptyId = null; } });
    term.onResize(({ cols, rows }) => { if (ptyId) ipcRenderer.invoke('pty-resize', ptyId, cols, rows); });
  } catch (err) { console.error('Terminal init error:', err); document.getElementById('terminalHost').innerHTML = `<div style="padding:12px;color:#f85149;">Terminal error: ${err.message}<br>Run: npm install @lydell/node-pty xterm xterm-addon-fit</div>`; }
}
function fitTerminal() { if (termReady && window._fitAddon) { try { window._fitAddon.fit(); if (ptyId && term) ipcRenderer.invoke('pty-resize', ptyId, term.cols, term.rows); } catch(e) {} } }
setTimeout(() => initTerminal(currentProjectPath), 800);
document.getElementById('termClearBtn').onclick = () => { if (term) term.clear(); };
document.getElementById('termNewBtn').onclick = async () => { if (ptyId) await ipcRenderer.invoke('pty-kill', ptyId); ptyId = null; term = null; termReady = false; await initTerminal(currentProjectPath); };

// ─── Insert Snippet Popup ───
const termInsertBtn = document.getElementById('termInsertBtn');
const insertPopup = document.getElementById('insertPopup');
const insertPopupContent = document.getElementById('insertPopupContent');
const insertPopupClose = document.getElementById('insertPopupClose');

insertPopupClose.onclick = () => insertPopup.style.display = 'none';

// Close if clicking outside
document.addEventListener('click', (e) => {
  if (insertPopup.style.display !== 'none' &&
      !insertPopup.contains(e.target) &&
      e.target !== termInsertBtn) {
    insertPopup.style.display = 'none';
  }
});

termInsertBtn.onclick = async () => {
  // Toggle off if already open
  if (insertPopup.style.display !== 'none') {
    insertPopup.style.display = 'none';
    return;
  }

  // Read insert.json fresh every click (live updateable)
  let snippets = [];
  try {
    const insertPath = path.join(__dirname, 'insert.json');
    const raw = await ipcRenderer.invoke('read-file', insertPath);
    const parsed = JSON.parse(raw);
    snippets = parsed.snippets || [];
  } catch (err) {
    insertPopupContent.innerHTML = '<div style="color:#f85149; font-size:0.75rem;">❌ Could not load insert.json</div>';
    positionInsertPopup();
    insertPopup.style.display = 'block';
    return;
  }

  
  
  // Flatten all items into a single list keeping group headers
  const allItems = [];
  for (const group of snippets) {
    allItems.push({ type: 'header', text: group.header });
    for (const cmd of group.commands) allItems.push({ type: 'cmd', text: cmd });
    allItems.push({ type: 'divider' });
  }
  // Remove trailing divider
  if (allItems.length && allItems[allItems.length-1].type === 'divider') allItems.pop();

  // Split into columns of max 15 items
  const COL_SIZE = 15;
  const columns = [];
  for (let i = 0; i < allItems.length; i += COL_SIZE) columns.push(allItems.slice(i, i + COL_SIZE));

  insertPopupContent.innerHTML = '';

  // Title row already in popup header, now build column layout
  const colWrapper = document.createElement('div');
  colWrapper.style.cssText = 'display:flex; gap:16px; align-items:flex-start;';

  for (let c = 0; c < columns.length; c++) {
    const col = document.createElement('div');
    col.style.cssText = 'display:flex; flex-direction:column; min-width:200px;';

    // Add vertical divider between columns
    if (c > 0) {
      const vDivider = document.createElement('div');
      vDivider.style.cssText = 'width:1px; background:#30363d; align-self:stretch; margin-right:16px; flex-shrink:0;';
      colWrapper.appendChild(vDivider);
    }

    for (const item of columns[c]) {
      if (item.type === 'header') {
        const header = document.createElement('div');
        header.style.cssText = 'font-size:0.7rem; font-weight:700; color:#58a6ff; margin:8px 0 4px; text-transform:uppercase; letter-spacing:0.05em;';
        header.textContent = item.text;
        col.appendChild(header);
      } else if (item.type === 'divider') {
        const hr = document.createElement('div');
        hr.style.cssText = 'border-top:1px solid #21262d; margin:6px 0;';
        col.appendChild(hr);
      } else {
        const div = document.createElement('div');
        div.style.cssText = 'font-size:0.78rem; padding:5px 10px; border-radius:6px; cursor:pointer; color:#e6edf3; font-family:monospace;';
        div.textContent = item.text;
        div.title = item.text;
        div.onmouseenter = () => div.style.background = '#21262d';
        div.onmouseleave = () => div.style.background = 'transparent';
        div.onclick = async () => {
          insertPopup.style.display = 'none';
          if (ptyId) await ipcRenderer.invoke('pty-write', ptyId, item.text);
        };
        col.appendChild(div);
      }
    }
    colWrapper.appendChild(col);
  }

  insertPopupContent.appendChild(colWrapper);
  positionInsertPopup();
  
  
  
  insertPopup.style.display = 'block';
};

function positionInsertPopup() {
  // Centered via CSS transform, nothing to calculate
}


// AI navigation (including custom URL from settings)
function updateActiveButton(url) {
  aiNav.querySelectorAll('button[data-url]').forEach(btn => btn.classList.remove('active'));
  let matched = false;
  aiNav.querySelectorAll('button[data-url]').forEach(btn => {
    if (url.startsWith(btn.getAttribute('data-url'))) { btn.classList.add('active'); matched = true; }
  });
  if (!matched && url !== 'about:blank') {
    const customBtn = Array.from(aiNav.querySelectorAll('button')).find(b => b.id === 'customAiBtn');
    if (customBtn) customBtn.classList.add('active');
  }
}










// ── Settings ──────────────────────────────────────────────

async function applySettings(s) {
  // ── Custom AI button ──
  let customBtn = document.getElementById('customAiBtn');
  if (s.customAiName && s.customAiUrl) {
    if (!customBtn) {
      customBtn = document.createElement('button');
      customBtn.id = 'customAiBtn';
      // Insert before the right-side div (settings/detach buttons)
      const rightDiv = aiNav.querySelector('div[style*="margin-left:auto"]');
      aiNav.insertBefore(customBtn, rightDiv);
      customBtn.addEventListener('click', () => {
        aiNav.querySelectorAll('button[data-url]').forEach(b => b.classList.remove('active'));
        customBtn.classList.add('active');
        aiWebview.src = s.customAiUrl;
      });
    }
    customBtn.setAttribute('data-url', s.customAiUrl);
    customBtn.textContent = s.customAiName;
  } else if (customBtn) {
    customBtn.remove();
  }

  // ── ORPAC button ──
  let orpacBtn = document.getElementById('orpacBtn');
  if (s.openRouterKey) {
    if (!orpacBtn) {
      orpacBtn = document.createElement('button');
      orpacBtn.id = 'orpacBtn';
      orpacBtn.textContent = 'ORPAC';
      orpacBtn.style.background = '#6a3ea1';
      orpacBtn.title = 'OpenRouter Personal Artificial Coder';
      orpacBtn.addEventListener('click', () => { /* future */ });
      const rightDiv = aiNav.querySelector('div[style*="margin-left:auto"]');
      aiNav.insertBefore(orpacBtn, rightDiv);
    }
  } else if (orpacBtn) {
    orpacBtn.remove();
  }

  // ── Forward settings to detached webview if it’s open ──
  if (webviewDetached) {
    ipcRenderer.send('update-detached-settings', s);
  }
}

// Load settings on startup
ipcRenderer.invoke('load-settings').then(s => {
  applySettings(s);
});

document.getElementById('settingsBtn').addEventListener('click', async () => {
  const s = await ipcRenderer.invoke('load-settings');
  document.getElementById('customAiName').value = s.customAiName || '';
  document.getElementById('customAiUrl').value = s.customAiUrl || '';
  document.getElementById('openRouterKey').value = s.openRouterKey || '';
  document.getElementById('settingsOverlay').style.display = 'flex';
});

document.getElementById('settingsCancelBtn').addEventListener('click', () => {
  document.getElementById('settingsOverlay').style.display = 'none';
});

document.getElementById('settingsSaveBtn').addEventListener('click', async () => {
  const s = {
    customAiName: document.getElementById('customAiName').value.trim(),
    customAiUrl:  document.getElementById('customAiUrl').value.trim(),
    openRouterKey: document.getElementById('openRouterKey').value.trim(),
  };
  await ipcRenderer.invoke('save-settings', s);
  applySettings(s);
  document.getElementById('settingsOverlay').style.display = 'none';
});

document.getElementById('settingsClearBtn').addEventListener('click', async () => {
  document.getElementById('customAiName').value = '';
  document.getElementById('customAiUrl').value = '';
  document.getElementById('openRouterKey').value = '';
  await ipcRenderer.invoke('save-settings', {});
  applySettings({});
  document.getElementById('settingsOverlay').style.display = 'none';
});










// Disk open, save, delete, open, run (adapted to tabs)
diskOpenBtn.onclick = () => diskFileInput.click();
diskFileInput.onchange = async () => {
  const file = diskFileInput.files[0];
  if (!file) return;
  try {
    const content = await file.text();
    const fakeFile = { absolutePath: file.path, relativePath: file.name, content: content };
    openFileInTab(fakeFile);
    setStatus(`📁 Opened: ${file.name}`);
  } catch (err) { setStatus('❌ Could not read file: ' + err.message); }
  diskFileInput.value = '';
};
saveBtn.onclick = async () => { await saveCurrentTab(); };





deleteBtn.onclick = async () => {
  if (activeTabIndex === -1) return;
  const tab = currentOpenTabs[activeTabIndex];
  if (!confirm(`Delete "${path.basename(tab.relativePath)}" permanently?`)) return;

  // Perform deletion
  await ipcRenderer.invoke('delete-file', tab.absolutePath);
  closeTab(activeTabIndex);
  await loadRootDirectory();
  setStatus('🗑️ File deleted');

  // Hide all overlays/modals
  hideContextMenu();
  if (folderContextMenu) folderContextMenu.style.display = 'none';
  ['renameModal','newFileOverlay','searchOverlay','settingsOverlay'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  });
  dropOverlay.classList.remove('active');

  // 🔥 Force window to lose and regain focus from main process
  await ipcRenderer.invoke('reset-window-focus');

  // Now refocus the correct component
  setTimeout(() => {
    if (currentOpenTabs.length > 0 && activeTabIndex !== -1) {
      if (cmView) cmView.focus();
    } else {
      aiWebview.focus();
      // Also try to focus the first input inside the webview
      aiWebview.executeJavaScript(`
        (function() {
          const el = document.querySelector('textarea, input, [contenteditable="true"]');
          if (el) {
            el.focus();
            el.click();
          }
        })();
      `).catch(()=>{});
    }
  }, 100);
};




openBtn.onclick = async () => {
  if (activeTabIndex === -1) return;
  await ipcRenderer.invoke('open-file', currentOpenTabs[activeTabIndex].absolutePath);
  setStatus('🔗 Opened in default app');
};


// Track if HTML preview is open
let htmlPreviewOpen = false;

runCmdBtn.onclick = async () => {
  if (activeTabIndex === -1) return;
  const tab = currentOpenTabs[activeTabIndex];
  const fileDir = path.dirname(tab.absolutePath);
  const fileName = path.basename(tab.absolutePath);
  const ext = path.extname(fileName).slice(1).toLowerCase();

  if (ext === 'html' || ext === 'htm') {
    // Save first so preview has latest content
    await saveCurrentTab();
    const content = cmGetContent();
    await ipcRenderer.invoke('open-html-preview', tab.absolutePath, content);
    htmlPreviewOpen = true;
    setStatus('🌐 HTML preview opened — live updates active', 3000);
    return;
  }

  // Run scripts in built-in terminal
  const commands = {
    py: `python "${fileName}"`,
    js: `node "${fileName}"`,
    ts: `npx ts-node "${fileName}"`,
    cpp: `g++ "${fileName}" -o out && ./out`,
    c: `gcc "${fileName}" -o out && ./out`,
    sh: `bash "${fileName}"`,
    bash: `bash "${fileName}"`,
    ps1: `powershell -ExecutionPolicy Bypass -File "${fileName}"`,
    rb: `ruby "${fileName}"`,
    php: `php "${fileName}"`,
    go: `go run "${fileName}"`,
    rs: `rustc "${fileName}" -o out && ./out`,
    lua: `lua "${fileName}"`,
    r: `Rscript "${fileName}"`,
  };
  const command = commands[ext] || `echo "No runner configured for .${ext}"`;

  // cd to file dir then run
  if (ptyId) {
    await ipcRenderer.invoke('pty-write', ptyId, command + (process.platform === 'win32' ? '\r' : '\n'));
    setStatus(`▶️ Running ${fileName} in terminal`);
  } else {
    setStatus('❌ Terminal not ready', 3000);
  }
};


// ─── Detachable Panels ───
let webviewDetached = false;
let terminalDetached = false;

const detachWebviewBtn = document.getElementById('detachWebviewBtn');
const detachTermBtn = document.getElementById('detachTermBtn');
const vDividerEl = document.getElementById('vDivider');
const mainDivider = document.getElementById('divider');


function updateLayout() {
  if (webviewDetached && terminalDetached) {
    // Both detached — editor fills everything
    rightPanel.style.display = 'none';
    mainDivider.style.display = 'none';
    leftPanel.style.width = '100%';
    leftPanel.style.maxWidth = '100%';
  } else if (webviewDetached && !terminalDetached) {
    // Only terminal remains on right
    rightPanel.style.display = 'flex';
    mainDivider.style.display = '';
    leftPanel.style.width = '';
    leftPanel.style.maxWidth = '';
    document.getElementById('rightTop').style.display = 'none';
    vDividerEl.style.display = 'none';
    document.getElementById('rightBottom').style.display = 'flex';
    document.getElementById('rightBottom').style.flex = '1';
    document.getElementById('rightBottom').style.height = '100%';
    fitTerminal();
  } else if (!webviewDetached && terminalDetached) {
    // Only webview remains on right
    rightPanel.style.display = 'flex';
    mainDivider.style.display = '';
    leftPanel.style.width = '';
    leftPanel.style.maxWidth = '';
    document.getElementById('rightTop').style.display = 'flex';
    document.getElementById('rightTop').style.flex = '1';
    document.getElementById('rightTop').style.height = '100%';
    vDividerEl.style.display = 'none';
    document.getElementById('rightBottom').style.display = 'none';
  } else {
    // Both attached — original layout
    rightPanel.style.display = 'flex';
    mainDivider.style.display = '';
    leftPanel.style.width = '';
    leftPanel.style.maxWidth = '';
    document.getElementById('rightTop').style.display = 'flex';
    document.getElementById('rightTop').style.flex = '1 1 60%';
    document.getElementById('rightTop').style.height = '';
    vDividerEl.style.display = 'flex';
    document.getElementById('rightBottom').style.display = 'flex';
    document.getElementById('rightBottom').style.flex = '0 0 220px';
    document.getElementById('rightBottom').style.height = '';
    fitTerminal();
  }
}

detachWebviewBtn.onclick = async () => {
  if (webviewDetached) return;
  const currentUrl = aiWebview.getURL() || 'https://claude.ai/';
  await ipcRenderer.invoke('detach-webview', currentUrl);
  webviewDetached = true;
  detachWebviewBtn.textContent = '📍';
  detachWebviewBtn.title = 'Browser is detached';
  updateLayout();
};

detachTermBtn.onclick = async () => {
  if (terminalDetached) return;
  await ipcRenderer.invoke('detach-terminal', ptyId);
  terminalDetached = true;
  detachTermBtn.textContent = '📍';
  detachTermBtn.title = 'Terminal is detached';
  ipcRenderer.removeAllListeners('pty-data');
  if (term) { term.dispose(); term = null; termReady = false; }
  document.getElementById('terminalHost').innerHTML = '';
  updateLayout();
};

ipcRenderer.on('webview-reattached', () => {
  webviewDetached = false;
  detachWebviewBtn.textContent = '📌';
  detachWebviewBtn.title = 'Detach browser to own window';
  updateLayout();
});

ipcRenderer.on('trigger-settings-open', async () => {
  const s = await ipcRenderer.invoke('load-settings');
  document.getElementById('customAiName').value = s.customAiName || '';
  document.getElementById('customAiUrl').value = s.customAiUrl || '';
  document.getElementById('openRouterKey').value = s.openRouterKey || '';
  settingsOverlay.style.display = 'flex';
});

ipcRenderer.on('terminal-reattached', async () => {
  terminalDetached = false;
  detachTermBtn.textContent = '📌';
  detachTermBtn.title = 'Detach terminal to own window';
  // Reinit terminal reconnecting to same pty
  const host = document.getElementById('terminalHost');
  host.innerHTML = '';
  const { Terminal } = require('xterm');
  const { FitAddon } = require('xterm-addon-fit');
  term = new Terminal({ theme:{ background:'#0d0f13', foreground:'#e6edf3', cursor:'#58a6ff' }, fontFamily:"'Cascadia Code','Consolas',monospace", fontSize:12, cursorBlink:true, allowProposedApi:true });
  window._fitAddon = new FitAddon();
  term.loadAddon(window._fitAddon);
  updateLayout(); // layout first so host has correct dimensions
  await new Promise(r => setTimeout(r, 100));
  term.open(host);
  await new Promise(r => setTimeout(r, 150));
  window._fitAddon.fit();
  termReady = true;
  term.onData(data => { if (ptyId) ipcRenderer.invoke('pty-write', ptyId, data); });
  ipcRenderer.on('pty-data', (event, { id, data }) => { if (id === ptyId && term) term.write(data); });
  term.onResize(({ cols, rows }) => { if (ptyId) ipcRenderer.invoke('pty-resize', ptyId, cols, rows); });
  await ipcRenderer.invoke('pty-resize', ptyId, term.cols, term.rows);
  term.write('\r\n\x1b[33m[Terminal reattached]\x1b[0m\r\n');
  fitTerminal();
});


// Final init
aiWebview.addEventListener('did-finish-load', () => updateActiveButton(aiWebview.getURL()));
editorArea.style.display = 'none';
editorArea.style.flexDirection = 'column';
document.getElementById('cmHost').style.height = '400px';
initCodeMirror();
ipcRenderer.invoke('load-settings').then(s => applySettings(s));