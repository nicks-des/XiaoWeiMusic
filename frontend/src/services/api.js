import axios from 'axios';

const DEFAULT_API_BASE =
  typeof window !== 'undefined' && window.location.protocol === 'file:'
    ? 'http://localhost:3000/api'
    : '/api';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE;

const ABSOLUTE_URL_RE = /^(https?:|data:|blob:)/i;

function backendOrigin() {
  if (/^https?:\/\//i.test(API_BASE)) {
    return new URL(API_BASE).origin;
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://localhost:3000';
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function resolveApiUrl(path) {
  if (!path) return API_BASE;
  if (ABSOLUTE_URL_RE.test(path)) return path;

  const cleanPath = path.replace(/^\/+/, '');
  if (/^https?:\/\//i.test(API_BASE)) {
    const base = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;
    return new URL(cleanPath, base).toString();
  }

  const base = API_BASE.replace(/\/$/, '');
  return `${base}/${cleanPath}`;
}

export function resolveMediaUrl(url) {
  if (!url || ABSOLUTE_URL_RE.test(url)) return url;

  if (url.startsWith('/')) {
    if (/^https?:\/\//i.test(API_BASE) || (typeof window !== 'undefined' && window.location.protocol === 'file:')) {
      return `${backendOrigin()}${url}`;
    }
    return url;
  }

  return url;
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(resolveApiUrl('/auth/refresh'), { refreshToken });
          localStorage.setItem('token', data.data.accessToken);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.hash = '#/login';
        }
      }
    }
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timed out';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
};

// Songs API
export const songsAPI = {
  list: (params) => api.get('/songs', { params }),
  detail: (id) => api.get(`/songs/${id}`),
  delete: (id) => api.delete(`/songs/${id}`),
  search: (params) => api.get('/songs/search', { params }),
  update: (id, data) => api.put(`/songs/${id}`, data),
  quickAdd: (data) => api.post('/songs/quick-add', data),
  upload: (formData) => api.post('/songs/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }),
  uploadVideo: (formData, config) => api.post('/songs/upload-video', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
    ...config,
  }),
};

// Local songs scan & stream
export const localSongsAPI = {
  scan: (directory) => api.post('/local-songs/scan', { directory }, { timeout: 120000 }),
  streamUrl: (id) => `${backendOrigin()}/api/local-songs/stream/${id}`,
};

// Recommendations API
export const recommendationsAPI = {
  get: (params) => api.get('/recommendations', { params }),
};

// AI Recommendations API
export const aiRecommendationsAPI = {
  get: (params) => api.get('/ai-recommendations', { params }),
};

// Playlists API
export const playlistsAPI = {
  list: (params) => api.get('/playlists', { params }),
  create: (data) => api.post('/playlists', data),
  detail: (id) => api.get(`/playlists/${id}`),
  update: (id, data) => api.put(`/playlists/${id}`, data),
  delete: (id) => api.delete(`/playlists/${id}`),
  addSong: (id, songId) => api.post(`/playlists/${id}/songs`, { songId }),
};

// Music Source API (Netease Cloud Music)
export const musicSourceAPI = {
  search: (params) => api.get('/music-source/search', { params, timeout: 15000 }),
  songDetail: (id) => api.get(`/music-source/song/${id}`, { timeout: 15000 }),
  getUrl: (id) => api.get(`/music-source/get-url/${id}`, { timeout: 15000 }),
  hotPlaylists: (limit) => api.get('/music-source/hot-playlists', { params: { limit } }),
  playlistTracks: (id) => api.get(`/music-source/playlist/${id}/tracks`, { timeout: 15000 }),
  recommend: (limit) => api.get('/music-source/recommend', { params: { limit }, timeout: 15000 }),
  mvUrl: (id) => api.get(`/music-source/mv-url/${id}`, { timeout: 15000 }),
  lyric: (id) => api.get(`/music-source/lyric/${id}`, { timeout: 15000 }),
  // Netease VIP auth
  neteaseAuth: {
    status: () => api.get('/music-source/auth/status'),
    login: (data) => api.post('/music-source/auth/login', data),
    setCookie: (cookie) => api.post('/music-source/auth/cookie', { cookie }),
    refresh: () => api.post('/music-source/auth/refresh'),
    clear: () => api.delete('/music-source/auth/cookie'),
  },
  // QQ Music VIP auth
  qqmusicAuth: {
    status: () => api.get('/music-source/qq-auth/status'),
    login: (data) => api.post('/music-source/qq-auth/login', data),
    setCookie: (cookie) => api.post('/music-source/qq-auth/cookie', { cookie }),
    clear: () => api.delete('/music-source/qq-auth/cookie'),
    validate: () => api.post('/music-source/qq-auth/validate'),
  },
  // Kugou VIP auth (仅支持Cookie粘贴)
  kugouAuth: {
    status: () => api.get('/music-source/kg-auth/status'),
    setCookie: (cookie) => api.post('/music-source/kg-auth/cookie', { cookie }),
    clear: () => api.delete('/music-source/kg-auth/cookie'),
  },
  // Kuwo VIP auth (仅支持Cookie粘贴)
  kuwoAuth: {
    status: () => api.get('/music-source/kw-auth/status'),
    setCookie: (cookie) => api.post('/music-source/kw-auth/cookie', { cookie }),
    clear: () => api.delete('/music-source/kw-auth/cookie'),
  },
};

// Users API
export const usersAPI = {
  me: () => api.get('/users/me'),
  favorites: () => api.get('/users/favorites'),
  addFavorite: (songId, meta) => api.post(`/users/favorites/${songId}`, meta || {}),
  removeFavorite: (songId) => api.delete(`/users/favorites/${songId}`),
  history: () => api.get('/users/history'),
  addHistory: (songId, meta) => api.post(`/users/history/${songId}`, meta || {}),
};

// Platform Login API (扫码登录 + 账号绑定)
export const platformLoginAPI = {
  listPlatforms: () => api.get('/platform-login/platforms'),
  generateQrcode: (platform) => api.post(`/platform-login/${platform}/qrcode`, {}, { timeout: 15000 }),
  checkQrcodeStatus: (platform) => api.get(`/platform-login/${platform}/qrcode/status`, { timeout: 10000 }),
  bind: (platform) => api.post(`/platform-login/${platform}/bind`, {}, { timeout: 15000 }),
  myBindings: () => api.get('/platform-login/me/bindings'),
  unbind: (platform) => api.delete(`/platform-login/${platform}/unbind`),
  refresh: (platform) => api.post(`/platform-login/${platform}/refresh`),
};

export default api;
