const { contextBridge, ipcRenderer } = require('electron');

if (window.location.href.startsWith('http://localhost:51210/orpac')) {
  contextBridge.exposeInMainWorld('orpacAPI', {
    getModels: () => ipcRenderer.invoke('orpac-get-models'),
    sendChat: (streamId, model, messages) => {
      ipcRenderer.send('orpac-chat', { streamId, model, messages });
    },
    stopChat: (streamId) => {
      ipcRenderer.send('orpac-stop-stream', streamId);
    },
    applyCode: (code) => {
      ipcRenderer.send('orpac-apply-code', code);
    },
    // New
    readFile: (projectBase, relativePath) => 
      ipcRenderer.invoke('orpac-read-file', { projectBase, relativePath }),
    readFileLines: (projectBase, relativePath, startLine, endLine) => 
      ipcRenderer.invoke('orpac-read-file-lines', { projectBase, relativePath, startLine, endLine }),
    writeFile: (projectBase, relativePath, content, backup) => {
      ipcRenderer.send('orpac-write-file', { projectBase, relativePath, content, backup });
    },
    applyDiff: (projectBase, relativePath, diffText) => {
      ipcRenderer.send('orpac-apply-diff', { projectBase, relativePath, diffText });
    },
    // Stream listeners unchanged
    onStreamData: (callback) => {
      ipcRenderer.on('orpac-stream-data', (event, { id, chunk }) => {
        callback({ id, chunk });
      });
    },
    onStreamEnd: (callback) => {
      ipcRenderer.on('orpac-stream-end', (event, { id }) => {
        callback({ id });
      });
    },
    onStreamError: (callback) => {
      ipcRenderer.on('orpac-stream-error', (event, { id, error }) => {
        callback({ id, error });
      });
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('orpac-stream-data');
      ipcRenderer.removeAllListeners('orpac-stream-end');
      ipcRenderer.removeAllListeners('orpac-stream-error');
    }
  });
}