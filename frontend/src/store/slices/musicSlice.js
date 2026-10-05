import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  recommendations: [],
  hotSongs: [],
  dailySongs: [],
  searchResults: [],
  playlists: [],
  currentPlaylist: null,
  favorites: [],
  history: [],
  loading: false,
};

const musicSlice = createSlice({
  name: 'music',
  initialState,
  reducers: {
    setRecommendations(state, action) {
      state.recommendations = action.payload;
    },
    setHotSongs(state, action) {
      state.hotSongs = action.payload;
    },
    setDailySongs(state, action) {
      state.dailySongs = action.payload;
    },
    setSearchResults(state, action) {
      state.searchResults = action.payload;
    },
    setPlaylists(state, action) {
      state.playlists = action.payload;
    },
    addPlaylist(state, action) {
      state.playlists.unshift(action.payload);
    },
    updatePlaylist(state, action) {
      const idx = state.playlists.findIndex(p => p.id === action.payload.id);
      if (idx >= 0) state.playlists[idx] = action.payload;
    },
    removePlaylist(state, action) {
      state.playlists = state.playlists.filter(p => p.id !== action.payload);
    },
    setCurrentPlaylist(state, action) {
      state.currentPlaylist = action.payload;
    },
    setFavorites(state, action) {
      state.favorites = action.payload;
    },
    toggleFavorite(state, action) {
      const payload = action.payload;
      const songId = typeof payload === 'object' ? (payload.song_id ?? payload.id) : payload;
      const idx = state.favorites.findIndex(f => (f.song_id ?? f.id) === songId);
      if (idx >= 0) {
        state.favorites.splice(idx, 1);
      } else {
        state.favorites.unshift(payload);
      }
    },
    setHistory(state, action) {
      state.history = action.payload;
    },
    setLoading(state, action) {
      state.loading = action.payload;
    },
  },
});

export const {
  setRecommendations,
  setHotSongs,
  setDailySongs,
  setSearchResults,
  setPlaylists,
  addPlaylist,
  updatePlaylist,
  removePlaylist,
  setCurrentPlaylist,
  setFavorites,
  toggleFavorite,
  setHistory,
  setLoading,
} = musicSlice.actions;

export default musicSlice.reducer;
