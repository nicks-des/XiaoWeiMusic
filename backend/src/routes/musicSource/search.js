﻿﻿﻿﻿﻿﻿const { search, song_detail, mv_url: neteaseMvUrl, lyric: neteaseLyric } = require('NeteaseCloudMusicApi');
const qqmusic = require('../platforms/qqmusic');
const kugou = require('../platforms/kugou');
const kuwo = require('../platforms/kuwo');
const {
  getUserIdFromReq,
  getPlatformCookie,
  urlCache,
  URL_CACHE_TTL,
  songMetaCache,
  parsePlatformId,
  PLATFORM_MAP,
  mapSearchSong,
  ncmAuth,
} = require('./shared');
const { fetchNeteaseUrl } = require('./neteaseUrl');
const axios = require('axios');
const path = require('path');
const { pool } = require('../../config/db');

// Search helpers for each platform

function cacheSongMetadata(songs = []) {
  for (const song of songs) {
    if (!song?.id) continue;
    if (song._albumAudioId) {
      songMetaCache.set(song.id, { albumAudioId: song._albumAudioId });
    }
  }
}

// Batch pre-fetch stream URLs for search results (runs in parallel for first 5 songs)
async function preFetchStreamUrls(songs, platform, cookie) {
  if (!songs || songs.length === 0) return;
  const batch = songs.filter(s => !s.stream_url && !s.audio_url).slice(0, 5);
  if (batch.length === 0) return;
  await Promise.allSettled(
    batch.map(async (song) => {
      const parsed = parsePlatformId(song.id);
      if (!parsed) return;
      try {
        let url = '';
        if (parsed.platform === 'qq') {
          const result = await qqmusic.getSongUrl(parsed.rawId, 'standard', cookie);
          url = result.url || '';
        } else if (parsed.platform === 'kg') {
          const result = await kugou.getSongUrl(parsed.rawId, cookie, song._albumAudioId || 0);
          url = result.url || '';
        } else if (parsed.platform === 'kw') {
          const result = await kuwo.getSongUrl(parsed.rawId, cookie);
          url = result.url || '';
        }
        if (url) {
          song.stream_url = url;
          urlCache.set(song.id, { url, expires: Date.now() + URL_CACHE_TTL });
        }
      } catch (_) { /* skip failed pre-fetches */ }
    })
  );
}

async function searchNetease(keyword, page, limit, offset, cookieOverride) {
  if (offset === undefined) offset = (page - 1) * limit;
  const cookie = cookieOverride !== undefined ? cookieOverride : ncmAuth.getCookie();
  const result = await search({ keywords: keyword, limit, offset, type: 1, cookie });
  if (result.status !== 200 || !result.body?.result?.songs) {
    return { songs: [], total: 0 };
  }
  const songs = result.body.result.songs || [];
  const songCount = result.body.result.songCount || 0;

  // Batch-fetch song_detail to enrich with album covers and MV ids
  let coverMap = {};
  let mvMap = {};
  if (songs.length > 0) {
    try {
      const ids = songs.map(s => s.id).join(',');
      const detailRes = await song_detail({ ids, cookie });
      if (detailRes.status === 200 && detailRes.body?.songs) {
        for (const ds of detailRes.body.songs) {
          if (ds.al?.picUrl) coverMap[ds.id] = ds.al.picUrl;
          if (ds.mv) mvMap[ds.id] = ds.mv;
        }
      }
    } catch (e) { /* ignore */ }
  }

  const list = songs.map(s => {
    const mapped = mapSearchSong(s);
    if (coverMap[s.id]) mapped.cover_url = coverMap[s.id];
    if (mvMap[s.id]) mapped.mv_id = mvMap[s.id];
    return mapped;
  });

  return { songs: list, total: songCount };
}

async function searchQQMusic(keyword, page, limit, cookie = '') {
  const result = await qqmusic.search(keyword, page, limit, cookie);
  return { songs: result.songs || [], total: result.total || 0 };
}

async function searchKuGou(keyword, page, limit, cookie = '') {
  const result = await kugou.search(keyword, page, limit, cookie);
  return { songs: result.songs || [], total: result.total || 0 };
}

async function searchKuWo(keyword, page, limit, cookie = '') {
  const result = await kuwo.search(keyword, page, limit, cookie);
  return { songs: result.songs || [], total: result.total || 0 };
}

function registerSearchRoutes(router) {
  // GET /api/music-source/search?keyword=xxx&page=1&limit=20&platform=netease|qqmusic|kugou|kuwo|all
  router.get('/search', async (req, res) => {
    try {
      const keyword = String(req.query.keyword || '').trim();
      if (!keyword) {
        return res.status(400).json({ code: 400, message: '请提供搜索关键词' });
      }
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const platform = req.query.platform || 'netease';
      const userId = getUserIdFromReq(req);

      // 鑾峰彇鍚勫钩鍙扮敤鎴?cookie
      const ncmCookie = await getPlatformCookie(userId, 'netease');
      const qqCookie = await getPlatformCookie(userId, 'qqmusic');
      const kgCookie = await getPlatformCookie(userId, 'kugou');
      const kwCookie = await getPlatformCookie(userId, 'kuwo');

      // Multi-platform search
      if (platform === 'all') {
        const offset = (page - 1) * limit;
        const perPlatform = Math.ceil(limit / 4); // split limit between 4 platforms

        const results = await Promise.allSettled([
          searchNetease(keyword, page, perPlatform, offset, ncmCookie),
          searchQQMusic(keyword, page, perPlatform, qqCookie),
          searchKuGou(keyword, page, perPlatform, kgCookie),
          searchKuWo(keyword, page, perPlatform, kwCookie),
        ]);

        let allSongs = [];
        let totalCount = 0;
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const result = r.value;
            const songs = result.songs || result;
            if (Array.isArray(songs) && songs.length > 0) {
              allSongs.push(...songs);
              totalCount += result.total || songs.length;
            }
          }
        }
        cacheSongMetadata(allSongs);

        res.json({
          code: 200,
          message: 'success',
          data: { list: allSongs, total: totalCount, page, limit, platform: 'all' },
        });
        return;
      }

      // Single platform search
      let list = [];
      let total = 0;

      if (platform === 'qqmusic') {
        const result = await searchQQMusic(keyword, page, limit, qqCookie);
        list = result.songs;
        total = result.total;
        await preFetchStreamUrls(list, 'qq', qqCookie);
      } else if (platform === 'kugou') {
        const result = await searchKuGou(keyword, page, limit, kgCookie);
        list = result.songs;
        total = result.total;
        await preFetchStreamUrls(list, 'kg', kgCookie);
      } else if (platform === 'kuwo') {
        const result = await searchKuWo(keyword, page, limit, kwCookie);
        list = result.songs;
        total = result.total;
        await preFetchStreamUrls(list, 'kw', kwCookie);
      } else {
        // Default: netease
        const offset = (page - 1) * limit;
        const result = await searchNetease(keyword, page, limit, offset, ncmCookie);
        list = result.songs;
        total = result.total;
      }
      cacheSongMetadata(list);

      res.json({
        code: 200,
        message: 'success',
        data: { list, total, page, limit, platform },
      });
    } catch (err) {
      console.error('Music source search error:', err);
      res.status(500).json({ code: 500, message: '搜索失败: ' + err.message });
    }
  });

  // GET /api/music-source/song/:id - get song detail + streaming URL (multi-platform)
  router.get('/song/:id', async (req, res) => {
    try {
      const rawId = req.params.id;
      const parsed = parsePlatformId(rawId);
      const userId = getUserIdFromReq(req);

      // ── Handle non-NetEase platforms ──
      if (parsed && parsed.platform !== 'wy') {
        const { platform, rawId: id } = parsed;
        const platformName = PLATFORM_MAP[platform] || platform;

        // Build basic song info from the ID — frontend should have full metadata
        // from search results; this endpoint provides the minimum for the detail view.
        const song = {
          id: rawId,
          title: id || '未知歌曲',
          artist: '',
          album: '',
          duration: 0,
          cover_url: '',
          mv_id: null,
          stream_url: '',
          source: platformName,
        };

        // Try to enrich with cached metadata if available
        const meta = songMetaCache.get(rawId);
        if (meta) {
          if (meta.albumAudioId !== undefined) song._albumAudioId = meta.albumAudioId;
          if (meta.title) song.title = meta.title;
          if (meta.artist) song.artist = meta.artist;
          if (meta.cover_url) song.cover_url = meta.cover_url;
          if (meta.duration) song.duration = meta.duration;
        }

        // Optionally fetch stream URL
        try {
          let streamUrl = '';
          const cookie = await getPlatformCookie(userId, platformName);
          if (platform === 'qq') {
            const result = await qqmusic.getSongUrl(id, 'standard', cookie);
            streamUrl = result.url || '';
          } else if (platform === 'kg') {
            const result = await kugou.getSongUrl(id, cookie, meta?.albumAudioId || 0);
            streamUrl = result.url || '';
          } else if (platform === 'kw') {
            const result = await kuwo.getSongUrl(id, cookie);
            streamUrl = result.url || '';
          }
          song.stream_url = streamUrl;
        } catch (e) {
          console.warn(`[SongDetail] Failed to fetch stream URL for ${rawId}:`, e.message);
        }

        return res.json({ code: 200, message: 'success', data: song });
      }

      // ── NetEase platform (default/legacy) ──
      const neteaseId = String(rawId).replace(/^wy_/, '');
      if (!/^\d+$/.test(neteaseId)) {
        return res.status(400).json({ code: 400, message: 'Invalid song ID' });
      }

      const cookie = await getPlatformCookie(userId, 'netease');
      const [detailRes, urlResult] = await Promise.all([
        song_detail({ ids: neteaseId, cookie }),
        fetchNeteaseUrl(neteaseId, cookie),
      ]);

      if (detailRes.status !== 200) {
        return res.status(502).json({ code: 502, message: 'Music source returned an error' });
      }

      const songs = detailRes.body?.songs || [];
      if (songs.length === 0) {
        return res.status(404).json({ code: 404, message: 'Song not found' });
      }

      const s = songs[0];
      const artists = (s.ar || []).map(a => a.name).join(' / ');

      const streamUrl = urlResult?.url || '';

      const song = {
        id: 'wy_' + s.id,
        neteaseId: s.id,
        title: s.name,
        artist: artists || '未知歌手',
        album: (s.al || {}).name || '',
        duration: Math.floor((s.dt || 0) / 1000),
        cover_url: (s.al || {}).picUrl || '',
        mv_id: s.mv || 0,
        stream_url: streamUrl,
        source: 'netease',
      };

      res.json({ code: 200, message: 'success', data: song });
    } catch (err) {
      console.error('Music source song detail error:', err);
      res.status(500).json({ code: 500, message: 'Failed to get song detail: ' + err.message });
    }
  });

  // GET /api/music-source/get-url/:id - get streaming URL only (multi-platform)
  // Query params: ?quality=standard|high|lossless
  router.get('/get-url/:id', async (req, res) => {
    try {
      const rawId = req.params.id;
      const quality = ['standard', 'high', 'lossless'].includes(req.query.quality)
        ? req.query.quality
        : 'standard';
      const parsed = parsePlatformId(rawId) || { platform: 'wy', rawId: String(rawId).replace(/^wy_/, '') };
      const userId = getUserIdFromReq(req);
      const { platform, rawId: id } = parsed;
      let streamUrl = '';
      let cacheHasCookie;

      if (platform === 'wy') {
        if (!/^\d+$/.test(id)) {
          return res.status(400).json({ code: 400, message: 'Invalid song ID' });
        }
        const cookie = await getPlatformCookie(userId, 'netease');
        const result = await fetchNeteaseUrl(id, cookie, quality);
        streamUrl = result?.url || '';
        cacheHasCookie = result?.hasCookie;
      } else if (platform === 'qq') {
        const cookie = await getPlatformCookie(userId, 'qqmusic');
        const qqQuality = quality === 'lossless' ? 'lossless' : quality === 'high' ? 'hires' : 'standard';
        const result = await qqmusic.getSongUrl(id, qqQuality, cookie);
        streamUrl = result.url || '';
      } else if (platform === 'kg') {
        const cookie = await getPlatformCookie(userId, 'kugou');
        const meta = songMetaCache.get(rawId);
        const result = await kugou.getSongUrl(id, cookie, meta?.albumAudioId || 0);
        streamUrl = result.url || '';
      } else if (platform === 'kw') {
        const cookie = await getPlatformCookie(userId, 'kuwo');
        const result = await kuwo.getSongUrl(id, cookie);
        streamUrl = result.url || '';
      }

      if (!streamUrl) {
        return res.status(404).json({ code: 404, message: 'No playable URL for this song', data: { stream_url: '' } });
      }

      urlCache.set(rawId, { url: streamUrl, hasCookie: cacheHasCookie, expires: Date.now() + URL_CACHE_TTL });
      res.json({ code: 200, message: 'success', data: { stream_url: streamUrl } });
    } catch (err) {
      console.error('Music source get-url error:', err);
      res.status(500).json({ code: 500, message: 'Failed to get playable URL: ' + err.message });
    }
  });

  // GET /api/music-source/lyric/:id - get song lyrics (multi-platform: Netease, QQ, Kugou, Kuwo)
  router.get('/lyric/:id', async (req, res) => {
    try {
      const rawId = String(req.params.id);
      const parsed = parsePlatformId(rawId);

      if (parsed) {
        const { platform, rawId: id } = parsed;
        const userId = getUserIdFromReq(req);

        // ── QQ Music lyrics ──
        if (platform === 'qq') {
          const lyric = await qqmusic.getLyric(id);
          return res.json({
            code: 200, message: 'success',
            data: { id: rawId, lyric: lyric || '', translatedLyric: '', source: 'qqmusic' },
          });
        }

        // ── Kugou lyrics ──
        if (platform === 'kg') {
          const lyric = await kugou.getLyric(id);
          return res.json({
            code: 200, message: 'success',
            data: { id: rawId, lyric: lyric || '', translatedLyric: '', source: 'kugou' },
          });
        }

        // ── Kuwo lyrics ──
        if (platform === 'kw') {
          const lyric = await kuwo.getLyric(id);
          return res.json({
            code: 200, message: 'success',
            data: { id: rawId, lyric: lyric || '', translatedLyric: '', source: 'kuwo' },
          });
        }
      }

      // ── NetEase (default / wy_ prefix) ──
      const songId = rawId.replace(/^wy_/, '');
      if (!/^\d+$/.test(songId)) {
        return res.status(400).json({ code: 400, message: '无效的歌曲ID' });
      }

      const userId = getUserIdFromReq(req);
      const cookie = await getPlatformCookie(userId, 'netease');
      const result = await neteaseLyric({ id: songId, cookie });

      if (result.status !== 200) {
        return res.status(502).json({ code: 502, message: '获取歌词失败' });
      }

      const lrc = result.body?.lrc?.lyric || '';
      const tlyric = result.body?.tlyric?.lyric || '';
      const lyricUser = result.body?.lyricUser || null;

      res.json({
        code: 200,
        message: 'success',
        data: {
          id: songId,
          lyric: lrc,
          translatedLyric: tlyric,
          lyricUser: lyricUser,
          source: 'netease',
        },
      });
    } catch (err) {
      console.error('Lyric fetch error:', err);
      res.status(500).json({ code: 500, message: '获取歌词失败: ' + err.message });
    }
  });

  // GET /api/music-source/mv-url/:id - get MV playback URL (multi-platform: Netease, QQ Music)
  router.get('/mv-url/:id', async (req, res) => {
    try {
      const rawId = String(req.params.id);
      const parsed = parsePlatformId(rawId);

      // ── QQ Music MV (vid starts with letter like w, x, y, z) ──
      if (parsed && parsed.platform === 'qq') {
        const vid = parsed.rawId;
        if (!vid) {
          return res.status(400).json({ code: 400, message: '无效的MV ID' });
        }
        const mvData = await qqmusic.getMvUrl(vid);
        if (!mvData?.url) {
          return res.status(502).json({ code: 502, message: '获取QQ音乐MV链接失败' });
        }
        return res.json({
          code: 200, message: 'success',
          data: { id: vid, url: mvData.url, cover: mvData.cover, source: 'qqmusic' },
        });
      }

      // ── Kugou MV (via parsed prefix or raw mvhash) ──
      if ((parsed && parsed.platform === 'kg') || (!parsed && rawId && /^[a-f0-9]{32}$/i.test(rawId))) {
        const mvhash = parsed ? parsed.rawId : rawId;
        const mvData = await kugou.getMvUrl(mvhash);
        if (!mvData?.url) {
          return res.status(502).json({ code: 502, message: '获取酷狗MV链接失败' });
        }
        return res.json({
          code: 200, message: 'success',
          data: { id: mvhash, url: mvData.url, cover: mvData.cover, source: 'kugou' },
        });
      }

      // ── Kuwo MV ──
      if (parsed && parsed.platform === 'kw') {
        const mvid = parsed.rawId;
        const mvData = await kuwo.getMvUrl(mvid);
        if (!mvData?.url) {
          return res.status(502).json({ code: 502, message: '获取酷我MV链接失败' });
        }
        return res.json({
          code: 200, message: 'success',
          data: { id: mvid, url: mvData.url, cover: mvData.cover, source: 'kuwo' },
        });
      }

      // Also handle QQ Music vid without prefix (starts with letter, not digits)
      if (!parsed && rawId && /^[a-z]/.test(rawId)) {
        const mvData = await qqmusic.getMvUrl(rawId);
        if (!mvData?.url) {
          return res.status(502).json({ code: 502, message: '获取QQ音乐MV链接失败' });
        }
        return res.json({
          code: 200, message: 'success',
          data: { id: rawId, url: mvData.url, cover: mvData.cover, source: 'qqmusic' },
        });
      }

      // ── NetEase MV (numeric id) ──
      const mvId = rawId.replace(/^wy_/, '');
      if (!/^\d+$/.test(mvId)) {
        return res.status(400).json({ code: 400, message: '无效的MV ID' });
      }

      const userId = getUserIdFromReq(req);
      const cookie = await getPlatformCookie(userId, 'netease');
      const result = await neteaseMvUrl({ id: mvId, cookie });
      if (result.status !== 200 || !result.body?.data) {
        return res.status(502).json({ code: 502, message: '获取MV链接失败' });
      }

      const mvData = result.body.data;
      const url = mvData.url || mvData.brs?.['720'] || mvData.brs?.['480'] || mvData.brs?.['240'] || '';

      res.json({
        code: 200,
        message: 'success',
        data: {
          id: mvId,
          url,
          cover: mvData.cover || '',
          duration: mvData.duration || 0,
          r: mvData.r || 0,
          source: 'netease',
        },
      });
    } catch (err) {
      console.error('MV URL error:', err);
      res.status(500).json({ code: 500, message: '获取MV链接失败' });
    }
  });

  // GET /api/music-source/mv-download/:id — download MV with correct filename
  router.get('/mv-download/:id', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT video_url, title FROM songs WHERE id = ?', [req.params.id]);
      if (rows.length === 0 || !rows[0].video_url) {
        return res.status(404).json({ code: 404, message: 'MV不存在' });
      }

      const videoUrl = rows[0].video_url;
      const songTitle = rows[0].title || 'MV';
      const ext = path.extname(new URL(videoUrl).pathname) || '.mp4';
      const filename = encodeURIComponent(songTitle) + ext;

      // For local uploads (/uploads/...), serve the file directly
      if (videoUrl.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, '../../../uploads', path.basename(videoUrl));
        if (!require('fs').existsSync(filePath)) {
          return res.status(404).json({ code: 404, message: 'MV文件不存在' });
        }
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'video/mp4');
        require('fs').createReadStream(filePath).pipe(res);
        return;
      }

      // For online URLs, proxy the download
      const resp = await axios.get(videoUrl, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://music.163.com/',
        },
      });

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', resp.headers['content-type'] || 'video/mp4');
      if (resp.headers['content-length']) {
        res.setHeader('Content-Length', resp.headers['content-length']);
      }
      resp.data.pipe(res);
    } catch (err) {
      console.error('MV download error:', err);
      if (!res.headersSent) {
        res.status(502).json({ code: 502, message: 'MV下载失败: ' + err.message });
      }
    }
  });
}

module.exports = registerSearchRoutes;
