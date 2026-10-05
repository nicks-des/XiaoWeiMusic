const express = require('express');
const { pool } = require('../config/db');
const { normalizePagination, parseFeatures } = require('../utils/data');
const { personalized_newsong, top_song } = require('NeteaseCloudMusicApi');
const qqmusic = require('./platforms/qqmusic');
const kugou = require('./platforms/kugou');
const kuwo = require('./platforms/kuwo');
const { getPlatformCookie, getUserIdFromReq } = require('./musicSource/shared');

const router = express.Router();

// GET / - recommendations with source support
// ?type=daily|hot &source=local|netease|qqmusic|kugou|kuwo &limit=8 &refresh=true
router.get('/', async (req, res) => {
  try {
    const { type, songId, refresh } = req.query;
    const source = req.query.source || 'local';
    const { limit } = normalizePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
    const isRefresh = refresh === 'true';

    // ── Local recommendations (existing) ──
    if (source === 'local') {
      if (type === 'hot') {
        if (isRefresh) {
          const [rows] = await pool.query(
            'SELECT * FROM songs ORDER BY play_count DESC LIMIT ? OFFSET ?',
            [limit * 3, Math.floor(Math.random() * 30)]
          );
          const shuffled = rows.sort(() => Math.random() - 0.5).slice(0, limit);
          return res.json({ code: 200, message: 'success', data: shuffled.map(parseFeatures), source: 'local' });
        }
        const [rows] = await pool.query('SELECT * FROM songs WHERE source = "local" OR source IS NULL ORDER BY play_count DESC LIMIT ?', [limit]);
        return res.json({ code: 200, message: 'success', data: rows.map(parseFeatures), source: 'local' });
      } else if (type === 'daily') {
        const [rows] = await pool.query('SELECT * FROM songs WHERE source = "local" OR source IS NULL ORDER BY RAND() LIMIT ?', [limit]);
        return res.json({ code: 200, message: 'success', data: rows.map(parseFeatures), source: 'local' });
      } else if (type === 'similar' && songId) {
        const [songRows] = await pool.query('SELECT genre FROM songs WHERE id = ?', [songId]);
        if (songRows.length === 0) return res.status(404).json({ code: 404, message: '歌曲不存在' });
        const [rows] = await pool.query('SELECT * FROM songs WHERE genre = ? AND id != ? ORDER BY play_count DESC LIMIT ?', [songRows[0].genre, songId, limit]);
        return res.json({ code: 200, message: 'success', data: rows.map(parseFeatures), source: 'local' });
      }
    }

    // ── Online platform recommendations ──
    const userId = getUserIdFromReq(req);

    if (source === 'netease') {
      const cookie = await getPlatformCookie(userId, 'netease');
      if (type === 'hot') {
        // Netease top songs (type=0 for all, type=7 for new, type=96 for Chinese)
        const result = await top_song({ type: 0, limit, cookie });
        if (result.status !== 200) throw new Error('Netease top song failed');
        const songs = (result.body?.data || []).map(s => ({
          id: 'wy_' + s.id, title: s.name,
          artist: (s.ar || []).map(a => a.name).join(' / '),
          album: (s.al || {}).name || '',
          cover_url: (s.al || {}).picUrl || '', duration: Math.floor((s.dt || 0) / 1000),
          source: 'netease', mv_id: s.mv || 0,
        }));
        return res.json({ code: 200, message: 'success', data: songs, source: 'netease' });
      } else {
        // Daily / new songs
        const result = await personalized_newsong({ limit, cookie });
        if (result.status !== 200) throw new Error('Netease newsong failed');
        const songs = (result.body?.result || []).map(item => {
          const s = item.song || item;
          return {
            id: 'wy_' + s.id, title: s.name,
            artist: (s.ar || []).map(a => a.name).join(' / '),
            album: (s.al || {}).name || '',
            cover_url: (s.al || {}).picUrl || '', duration: Math.floor((s.dt || 0) / 1000),
            source: 'netease', mv_id: s.mv || 0,
          };
        });
        return res.json({ code: 200, message: 'success', data: songs, source: 'netease' });
      }
    }

    if (source === 'qqmusic') {
      // QQ Music: search popular keywords for hot/daily songs
      const keywords = type === 'hot' ? ['热门', '流行', '抖音'] : ['新歌', '推荐', '最新'];
      const kw = keywords[Math.floor(Math.random() * keywords.length)];
      const result = await qqmusic.search(kw, 1, limit);
      return res.json({ code: 200, message: 'success', data: result.songs, source: 'qqmusic' });
    }

    if (source === 'kugou') {
      const kw = type === 'hot' ? '热门' : '新歌';
      const result = await kugou.search(kw, 1, limit);
      return res.json({ code: 200, message: 'success', data: result.songs, source: 'kugou' });
    }

    if (source === 'kuwo') {
      const kw = type === 'hot' ? '热门' : '新歌';
      const result = await kuwo.search(kw, 1, limit);
      return res.json({ code: 200, message: 'success', data: result.songs, source: 'kuwo' });
    }

    // Fallback: local hot
    const [rows] = await pool.query('SELECT * FROM songs ORDER BY play_count DESC LIMIT ?', [limit]);
    res.json({ code: 200, message: 'success', data: rows.map(parseFeatures), source: 'local' });
  } catch (err) {
    console.error('Recommendations error:', err.message);
    res.status(500).json({ code: 500, message: '服务器错误: ' + err.message });
  }
});

module.exports = router;
