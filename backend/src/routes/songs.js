const express = require('express');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/db');
const { normalizePagination, parseFeatures } = require('../utils/data');

const router = express.Router();

// Parse filename like "Artist - Title.mp3" or "Title.mp3"
function parseFilename(originalName) {
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext).trim();
  const sepIdx = name.indexOf(' - ');
  if (sepIdx > 0) {
    return { artist: name.slice(0, sepIdx).trim(), title: name.slice(sepIdx + 3).trim() };
  }
  return { artist: '未知歌手', title: name };
}

function normalizeOnlineSongId(body) {
  const source = body.source || 'netease';
  const raw = String(body.netease_id || body.id || '').trim();
  if (/^(wy|qq|kg|kw)_.+/.test(raw)) return raw;
  if (!raw) return '';
  if (source === 'qqmusic') return `qq_${raw}`;
  if (source === 'kugou') return `kg_${raw}`;
  if (source === 'kuwo') return `kw_${raw}`;
  return `wy_${raw.replace(/^wy_/, '')}`;
}

// GET /download/:id - download song (redirect external URLs, serve local files)
router.get('/download/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM songs WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '歌曲不存在' });
    }

    const song = rows[0];
    const audioUrl = song.audio_url;

    if (!audioUrl) {
      return res.status(404).json({ code: 404, message: '该歌曲没有音频文件' });
    }

    const fileName = `${song.artist} - ${song.title}.mp3`;

    if (audioUrl.startsWith('http')) {
      // External URL: 302 redirect to let browser download directly from CDN
      return res.redirect(302, audioUrl);
    } else {
      // Local file: send as download
      const uploadsDir = path.resolve(__dirname, '../../uploads');
      const filePath = audioUrl.startsWith('/uploads/')
        ? path.resolve(uploadsDir, path.basename(audioUrl))
        : path.resolve(audioUrl);
      if (!filePath.startsWith(uploadsDir + path.sep)) {
        return res.status(400).json({ code: 400, message: 'invalid file path' });
      }
      return res.download(filePath, fileName);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ code: 500, message: '服务器错误' });
    }
  }
});

// POST /quick-add - register an online song so favorites/history/playlists can reference it
router.post('/quick-add', async (req, res) => {
  try {
    const id = normalizeOnlineSongId(req.body || {});
    if (!id) {
      return res.status(400).json({ code: 400, message: 'song id is required' });
    }

    const [existing] = await pool.query('SELECT * FROM songs WHERE id = ?', [id]);
    if (existing.length > 0) {
      return res.json({ code: 200, message: 'success', data: parseFeatures(existing[0]) });
    }

    const {
      title = '未知歌曲',
      artist = '未知歌手',
      album = '',
      duration = 0,
      genre = '在线',
      cover_url = '',
      source = id.startsWith('qq_') ? 'qqmusic' : id.startsWith('kg_') ? 'kugou' : id.startsWith('kw_') ? 'kuwo' : 'netease',
    } = req.body || {};
    const neteaseId = source === 'netease' ? id.replace(/^wy_/, '') : null;

    await pool.query(
      `INSERT INTO songs
       (id, title, artist, album, duration, genre, audio_url, cover_url, source, netease_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, artist, album, Number(duration) || 0, genre, '', cover_url, source, neteaseId]
    );

    const [rows] = await pool.query('SELECT * FROM songs WHERE id = ?', [id]);
    res.json({ code: 200, message: 'success', data: parseFeatures(rows[0]) });
  } catch (err) {
    res.status(500).json({ code: 500, message: '服务端错误: ' + err.message });
  }
});

// GET / - paginated song list
router.get('/', async (req, res) => {
  try {
    const { page, limit, offset } = normalizePagination(req.query);

    const [total] = await pool.query('SELECT COUNT(*) as count FROM songs');
    const [rows] = await pool.query(
      'SELECT * FROM songs ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    res.json({
      code: 200,
      message: 'success',
      data: {
        list: rows.map(parseFeatures),
        pagination: {
          page,
          limit,
          total: total[0].count,
          totalPages: Math.ceil(total[0].count / limit)
        }
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// GET /search - search songs (must be before /:id)
router.get('/search', async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const { type } = req.query;
    if (!keyword) {
      return res.status(400).json({ code: 400, message: '请提供搜索关键词' });
    }

    let sql;
    const params = [`%${keyword}%`];

    switch (type) {
      case 'title':
        sql = 'SELECT * FROM songs WHERE title LIKE ?';
        break;
      case 'artist':
        sql = 'SELECT * FROM songs WHERE artist LIKE ?';
        break;
      case 'album':
        sql = 'SELECT * FROM songs WHERE album LIKE ?';
        break;
      default:
        sql = 'SELECT * FROM songs WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?';
        params.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY play_count DESC LIMIT 100';
    const [rows] = await pool.query(sql, params);

    res.json({
      code: 200,
      message: 'success',
      data: {
        list: rows.map(parseFeatures),
        total: rows.length
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// GET /:id - song detail
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM songs WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '歌曲不存在' });
    }
    res.json({ code: 200, message: 'success', data: parseFeatures(rows[0]) });
  } catch (err) {
    res.status(500).json({ code: 500, message: '服务端错误' });
  }
});

// PUT /:id - update editable song fields
router.put('/:id', async (req, res) => {
  try {
    const allowed = ['title', 'artist', 'album', 'duration', 'genre', 'audio_url', 'cover_url', 'video_url', 'lyrics', 'source'];
    const updates = [];
    const params = [];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        updates.push(`${key} = ?`);
        params.push(req.body[key]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, message: '没有可更新字段' });
    }

    params.push(req.params.id);
    await pool.query(`UPDATE songs SET ${updates.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.query('SELECT * FROM songs WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '歌曲不存在' });
    }
    res.json({ code: 200, message: 'success', data: parseFeatures(rows[0]) });
  } catch (err) {
    res.status(500).json({ code: 500, message: '服务端错误: ' + err.message });
  }
});

// DELETE /:id - delete a local song (and its file)
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM songs WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '歌曲不存在' });
    }

    const song = rows[0];

    // Only allow deleting local songs
    if (song.source && song.source !== 'local') {
      return res.status(400).json({ code: 400, message: '只能删除本地歌曲' });
    }

    // Delete physical file
    if (song.audio_url) {
      const uploadsDir = path.resolve(__dirname, '../../uploads');
      let filePath = song.audio_url;
      if (filePath.startsWith('/uploads/')) {
        filePath = path.resolve(uploadsDir, path.basename(filePath));
      }
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.warn('Failed to delete file:', filePath, e.message);
      }
      // Also try to delete video file if exists
      if (song.video_url && song.video_url.startsWith('/uploads/')) {
        try {
          const videoPath = path.resolve(uploadsDir, path.basename(song.video_url));
          if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        } catch (_) {}
      }
    }

    // Clean up related data
    await pool.query('DELETE FROM favorites WHERE song_id = ?', [req.params.id]);
    await pool.query('DELETE FROM play_history WHERE song_id = ?', [req.params.id]);
    await pool.query('DELETE FROM playlist_songs WHERE song_id = ?', [req.params.id]);

    // Delete song record
    await pool.query('DELETE FROM songs WHERE id = ?', [req.params.id]);

    res.json({ code: 200, message: '歌曲已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败: ' + err.message });
  }
});

module.exports = router;
