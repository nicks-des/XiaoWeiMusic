function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePagination(query, options = {}) {
  const defaultLimit = options.defaultLimit || 20;
  const maxLimit = options.maxLimit || 100;
  const page = toPositiveInt(query.page, 1);
  const requestedLimit = query.limit ?? query.pageSize;
  const limit = Math.min(toPositiveInt(requestedLimit, defaultLimit), maxLimit);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function safeJsonParse(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function parseFeatures(row) {
  const source = row.source
    || (row.netease_id && !row.audio_url ? 'netease'
    : row.audio_url ? 'local'
    : undefined);

  // 本地歌曲若存的是绝对文件路径，转为流代理URL供前端播放
  let audio_url = row.audio_url;
  if (audio_url && /^[A-Za-z]:[\\/]/.test(audio_url)) {
    audio_url = `/api/local-songs/stream/${row.id}`;
  }

  return {
    ...row,
    features: safeJsonParse(row.features, null),
    source,
    audio_url,
  };
}

function normalizeSongIds(values) {
  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const ids = [];

  for (const value of values) {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) continue;
    if (/^\d+$/.test(id) || /^(wy|qq|kg|kw)_.+/.test(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

// Generate next local song ID as string (e.g. "75", "76")
async function getNextSongId(db) {
  const [rows] = await db.query(
    "SELECT MAX(CAST(id AS UNSIGNED)) as max_id FROM songs WHERE id REGEXP '^[0-9]+$'"
  );
  const nextId = (rows[0].max_id || 0) + 1;
  return String(nextId);
}

module.exports = {
  normalizePagination,
  parseFeatures,
  safeJsonParse,
  uniquePositiveIds: normalizeSongIds,
  normalizeSongIds,
  getNextSongId,
};
