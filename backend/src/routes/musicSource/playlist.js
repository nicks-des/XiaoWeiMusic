const { playlist_track_all, playlist_hot, personalized_newsong, song_detail } = require('NeteaseCloudMusicApi');
const { getUserIdFromReq, getPlatformCookie, mapSearchSong } = require('./shared');

function registerPlaylistRoutes(router) {
  // GET /api/music-source/hot-playlists - hot playlists
  router.get('/hot-playlists', async (req, res) => {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
      const userId = getUserIdFromReq(req);
      const cookie = await getPlatformCookie(userId, 'netease');
      const result = await playlist_hot({ limit, cookie });
      if (result.status !== 200) {
        return res.status(502).json({ code: 502, message: '音乐源返回异常' });
      }
      res.json({ code: 200, message: 'success', data: result.body });
    } catch (err) {
      console.error('Hot playlists error:', err);
      res.status(500).json({ code: 500, message: '获取热门歌单失败' });
    }
  });

  // GET /api/music-source/playlist/:id/tracks - get playlist tracks
  router.get('/playlist/:id/tracks', async (req, res) => {
    try {
      const playlistId = String(req.params.id);
      if (!/^\d+$/.test(playlistId)) {
        return res.status(400).json({ code: 400, message: '无效的歌单ID' });
      }

      const userId = getUserIdFromReq(req);
      const cookie = await getPlatformCookie(userId, 'netease');
      const result = await playlist_track_all({ id: playlistId, cookie });
      if (result.status !== 200) {
        return res.status(502).json({ code: 502, message: '音乐源返回异常' });
      }

      const rawTracks = result.body?.songs || result.body?.tracks || [];

      // Batch-fetch song_detail to enrich with album covers and MV ids
      let coverMap = {};
      let mvMap = {};
      if (rawTracks.length > 0) {
        try {
          const ids = rawTracks.map(s => s.id).join(',');
          const detailRes = await song_detail({ ids, cookie });
          if (detailRes.status === 200 && detailRes.body?.songs) {
            for (const ds of detailRes.body.songs) {
              if (ds.al?.picUrl) coverMap[ds.id] = ds.al.picUrl;
              if (ds.mv) mvMap[ds.id] = ds.mv;
            }
          }
        } catch (e) {
          console.warn('Failed to enrich covers:', e.message);
        }
      }

      const tracks = rawTracks.map(s => {
        const mapped = mapSearchSong(s);
        if (coverMap[s.id]) mapped.cover_url = coverMap[s.id];
        if (mvMap[s.id]) mapped.mv_id = mvMap[s.id];
        return mapped;
      });

      res.json({ code: 200, message: 'success', data: { list: tracks, total: tracks.length } });
    } catch (err) {
      console.error('Playlist tracks error:', err);
      res.status(500).json({ code: 500, message: '获取歌单歌曲失败' });
    }
  });

  // GET /api/music-source/recommend - online song recommendations (Netease personalized new songs)
  router.get('/recommend', async (req, res) => {
    try {
      const limit = Math.min(16, Math.max(1, parseInt(req.query.limit, 10) || 8));
      const userId = getUserIdFromReq(req);
      const cookie = await getPlatformCookie(userId, 'netease');
      const result = await personalized_newsong({ limit, cookie });

      if (result.status !== 200 || !result.body?.result) {
        return res.status(502).json({ code: 502, message: '音乐源返回异常' });
      }

      const rawItems = (result.body.result || []).slice(0, limit);

      // Enrich with song_detail for album covers and MV ids
      let coverMap = {};
      let mvMap = {};
      const songIds = rawItems.map(item => item.id).filter(Boolean);
      if (songIds.length > 0) {
        try {
          const detailRes = await song_detail({ ids: songIds.join(','), cookie });
          if (detailRes.status === 200 && detailRes.body?.songs) {
            for (const ds of detailRes.body.songs) {
              if (ds.al?.picUrl) coverMap[ds.id] = ds.al.picUrl;
              if (ds.mv) mvMap[ds.id] = ds.mv;
            }
          }
        } catch (e) { /* ignore */ }
      }

      const list = rawItems.map(item => {
        // personalized_newsong wraps details in item.song
        const songData = item.song || item;
        const mapped = mapSearchSong(songData);
        // Use higher-quality cover from song_detail, fallback to item.picUrl
        if (!mapped.cover_url && item.picUrl) mapped.cover_url = item.picUrl;
        if (coverMap[item.id]) mapped.cover_url = coverMap[item.id];
        if (mvMap[item.id]) mapped.mv_id = mvMap[item.id];
        return mapped;
      });

      res.json({ code: 200, message: 'success', data: { list, total: list.length } });
    } catch (err) {
      console.error('Online recommend error:', err);
      res.status(500).json({ code: 500, message: '获取推荐失败' });
    }
  });
}

module.exports = registerPlaylistRoutes;
