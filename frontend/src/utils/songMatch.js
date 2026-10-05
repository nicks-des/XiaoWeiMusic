// Song ID normalization & matching utilities
// Backend music source returns songs with these id formats:
//   - id: "wy_12345" (synthetic id with wy_ prefix for online songs)
//   - neteaseId / netease_id: "12345" (raw Netease id)
//   - For local songs: numeric id from database
//
// Different code paths may set different fields, so we extract a canonical
// "match key" for each song and compare keys — this prevents active-state
// highlight from breaking when id formats differ between contexts.

const ONLINE_SOURCES = new Set(['netease', 'qqmusic', 'kugou', 'kuwo']);

/**
 * True for songs that should be streamed through the backend proxy.
 */
export function isOnlineSong(song) {
  return !!song && ONLINE_SOURCES.has(song.source);
}

/**
 * Build the stable backend proxy URL for an online song id.
 * The proxy avoids CORS issues and re-fetches the (often expiring) CDN URL.
 * @param {string} songId - song identifier (e.g. "wy_12345")
 * @param {string} quality - audio quality tier: 'standard' | 'high' | 'lossless'
 */
export function buildProxyUrl(songId, quality = 'standard') {
  return `/api/music-source/download/${String(songId)}?quality=${quality}`;
}

/**
 * Ensure a single song has an audio_url / stream_url set.
 * For online songs, always returns the proxy URL. For local songs, keeps
 * whatever URL was already on the song.
 * @param {object} song - song object
 * @param {string} quality - audio quality tier
 */
export function ensureStreamUrl(song, quality = 'standard') {
  if (!song) return song;
  if (isOnlineSong(song)) {
    const url = buildProxyUrl(song.id, quality);
    return { ...song, audio_url: url, stream_url: url };
  }
  return {
    ...song,
    audio_url: song.audio_url || song.stream_url,
    stream_url: song.stream_url || song.audio_url,
  };
}

/**
 * Map a list of songs through `ensureStreamUrl` so every entry in the
 * queue has a usable URL when playback advances to it.
 * @param {array} songs - list of song objects
 * @param {string} quality - audio quality tier
 */
export function ensureQueueUrls(songs = [], quality = 'standard') {
  return songs.map(s => ensureStreamUrl(s, quality));
}

/**
 * Extract a stable match key for a song. For online songs, this is the
 * raw netease id (without wy_ prefix). For local songs, this is the
 * numeric database id. Returns null if no usable id is found.
 */
export function getSongMatchKey(song) {
  if (!song) return null;

  // Multi-platform online songs: use source + id
  if (song.source && ONLINE_SOURCES.has(song.source) && song.id) {
    return `${song.source}:${String(song.id)}`;
  }

  // Legacy NetEase: use neteaseId field
  const neteaseId = song.neteaseId ?? song.netease_id;
  if (neteaseId) {
    return `netease:${String(neteaseId)}`;
  }

  // Local songs: use the numeric id
  if (song.id != null) {
    return `local:${String(song.id)}`;
  }

  return null;
}

/**
 * Check whether `target` song is the same as `current` song.
 * Uses normalized match keys to handle different id formats.
 */
export function isSameSong(target, current) {
  if (!target || !current) return false;
  const a = getSongMatchKey(target);
  const b = getSongMatchKey(current);
  if (!a || !b) return false;
  return a === b;
}
