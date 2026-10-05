import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  currentSong: null,
  isPlaying: false,
  queue: [],
  queueIndex: -1,
  volume: 80,
  currentTime: 0,
  duration: 0,
  playMode: 'sequential', // 'sequential' | 'shuffle' | 'repeat-one'
  audioQuality: 'standard', // 'standard' | 'high' | 'lossless'
  showQueuePanel: false,
  showMV: false,
  showLyrics: false,
  showVisualizer: false,
  previewClipDetected: false, // set when backend serves a 30–60s preview instead of full song
};

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    playSong(state, action) {
      const { song, queue, index } = action.payload;
      state.currentSong = song;
      state.isPlaying = true;
      if (queue) {
        state.queue = queue;
        state.queueIndex = index ?? 0;
      }
      state.currentTime = 0;
    },
    togglePlay(state) {
      state.isPlaying = !state.isPlaying;
    },
    setPlaying(state, action) {
      state.isPlaying = action.payload;
    },
    nextSong(state) {
      if (state.queue.length === 0) return;
      if (state.playMode === 'repeat-one') {
        state.currentTime = 0;
        state.isPlaying = true;
        return;
      }
      let nextIndex;
      if (state.playMode === 'shuffle') {
        const available = Array.from({ length: state.queue.length }, (_, i) => i)
          .filter(i => i !== state.queueIndex || state.queue.length === 1);
        const ri = Math.floor(Math.random() * available.length);
        nextIndex = available[ri];
      } else {
        nextIndex = (state.queueIndex + 1) % state.queue.length;
      }
      state.queueIndex = nextIndex;
      state.currentSong = state.queue[nextIndex];
      state.currentTime = 0;
      state.isPlaying = true;
    },
    prevSong(state) {
      if (state.queue.length === 0) return;
      if (state.playMode === 'repeat-one') {
        state.currentTime = 0;
        state.isPlaying = true;
        return;
      }
      const prevIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
      state.queueIndex = prevIndex;
      state.currentSong = state.queue[prevIndex];
      state.currentTime = 0;
      state.isPlaying = true;
    },
    setPlayMode(state, action) {
      state.playMode = action.payload;
    },
    setAudioQuality(state, action) {
      state.audioQuality = action.payload;
    },
    toggleQueuePanel(state) {
      state.showQueuePanel = !state.showQueuePanel;
    },
    setQueuePanel(state, action) {
      state.showQueuePanel = action.payload;
    },
    playFromQueue(state, action) {
      const idx = action.payload;
      if (idx >= 0 && idx < state.queue.length) {
        state.queueIndex = idx;
        state.currentSong = state.queue[idx];
        state.currentTime = 0;
        state.isPlaying = true;
      }
    },
    toggleMV(state) {
      state.showMV = !state.showMV;
    },
    setShowMV(state, action) {
      state.showMV = action.payload;
    },
    toggleLyrics(state) {
      state.showLyrics = !state.showLyrics;
    },
    setShowLyrics(state, action) {
      state.showLyrics = action.payload;
    },
    toggleVisualizer(state) {
      state.showVisualizer = !state.showVisualizer;
    },
    setShowVisualizer(state, action) {
      state.showVisualizer = action.payload;
    },
    setVolume(state, action) {
      state.volume = action.payload;
    },
    setCurrentTime(state, action) {
      state.currentTime = action.payload;
    },
    setDuration(state, action) {
      state.duration = action.payload;
    },
    setQueue(state, action) {
      state.queue = action.payload;
    },
    addToQueue(state, action) {
      state.queue.push(action.payload);
    },
    removeFromQueue(state, action) {
      state.queue.splice(action.payload, 1);
      if (action.payload < state.queueIndex) {
        state.queueIndex -= 1;
      }
    },
    clearQueue(state) {
      state.queue = [];
      state.queueIndex = -1;
    },
    setPreviewClipDetected(state, action) {
      state.previewClipDetected = action.payload;
    },
    // 局部更新 currentSong 的字段（如歌词保存后同步）
    updateCurrentSong(state, action) {
      if (!state.currentSong) return;
      const updates = action.payload;
      Object.assign(state.currentSong, updates);
      // 同时更新队列中对应歌曲
      if (state.queue[state.queueIndex]?.id === state.currentSong.id) {
        Object.assign(state.queue[state.queueIndex], updates);
      }
    },
  },
});

export const {
  playSong,
  togglePlay,
  setPlaying,
  nextSong,
  prevSong,
  setVolume,
  setCurrentTime,
  setDuration,
  setQueue,
  addToQueue,
  removeFromQueue,
  clearQueue,
  setPlayMode,
  setAudioQuality,
  toggleQueuePanel,
  setQueuePanel,
  playFromQueue,
  toggleMV,
  setShowMV,
  toggleLyrics,
  setShowLyrics,
  toggleVisualizer,
  setShowVisualizer,
  setPreviewClipDetected,
  updateCurrentSong,
} = playerSlice.actions;

export default playerSlice.reducer;
