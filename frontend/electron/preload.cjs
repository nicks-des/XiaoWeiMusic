const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Generic send for main→renderer IPC
  send: (channel, data) => ipcRenderer.send(channel, data),

  // Floating panels
  openLyrics: () => ipcRenderer.send('open-lyrics'),
  closeLyrics: () => ipcRenderer.send('close-lyrics'),
  openVisualizer: () => ipcRenderer.send('open-visualizer'),
  closeVisualizer: () => ipcRenderer.send('close-visualizer'),

  // Song data sync (main window → floating windows)
  onSongUpdate: (callback) => {
    ipcRenderer.on('song-update', (_event, data) => callback(data));
  },
  onPlayStateUpdate: (callback) => {
    ipcRenderer.on('play-state-update', (_event, data) => callback(data));
  },
  onTimeUpdate: (callback) => {
    ipcRenderer.on('time-update', (_event, data) => callback(data));
  },

  // Song data sync (floating windows request current data)
  requestSongData: () => ipcRenderer.invoke('request-song-data'),

  // Panel status
  onPanelStatus: (callback) => {
    ipcRenderer.on('panel-status', (_event, data) => callback(data));
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
