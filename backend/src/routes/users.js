const express = require('express');
const auth = require('../middleware/auth');
const { pool } = require('../config/db');
const { parseFeatures, safeJsonParse } = require('../utils/data');

const router = express.Router();
router.use(auth);

function inferSourceFromSongId(songId, body = {}) {
  if (body.source) return body.source;
  const value = String(songId);
  if (value.startsWith('qq_')) return 'qqmusic';
  if (value.startsWith('kg_')) return 'kugou';
  if (value.startsWith('kw_')) return 'kuwo';
  return 'netease';
}

async function ensureSongRecord(songId, body = {}) {
  const [songs] = await pool.query('SELECT id FROM songs WHERE id = ?', [songId]);
  if (songs.length > 0) return true;

  const isOnlineId = /^(wy|qq|kg|kw)_.+/.test(String(songId));
  if (!isOnlineId && !body.title) return false;

  const {
    title = 'Unknown Song',
    artist = 'Unknown Artist',
    duration = 0,
    cover_url = '',
    genre = 'Online',
  } = body || {};
  const source = inferSourceFromSongId(songId, body);
  const neteaseNumericId = source === 'netease' ? String(songId).replace(/^wy_/, '') : null;

  await pool.query(
    'INSERT INTO songs (id, title, artist, duration, cover_url, genre, source, audio_url, netease_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [songId, title, artist, Number(duration) || 0, cover_url, genre, source, '', neteaseNumericId]
  );
  return true;
}

// GET /me - current user info
router.get('/me', async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, avatar, preferences, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ code: 404, message: 'User not found' });
    }
    const user = users[0];
    user.preferences = safeJsonParse(user.preferences, null);
    res.json({ code: 200, message: 'success', data: user });
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ code: 500, message: 'Server error' });
  }
});

// GET /favorites - favorites list with song details
router.get('/favorites', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, f.created_at as favorited_at FROM favorites f
       JOIN songs s ON f.song_id = s.id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ code: 200, message: 'success', data: rows.map(parseFeatures) });
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ code: 500, message: 'Server error' });
  }
});

// POST /favorites/:songId - add favorite
router.post('/favorites/:songId', async (req, res) => {
  try {
    const songId = req.params.songId;
    const exists = await ensureSongRecord(songId, req.body || {});
    if (!exists) {
      return res.status(404).json({ code: 404, message: 'Song not found' });
    }

    try {
      await pool.query(
        'INSERT INTO favorites (user_id, song_id) VALUES (?, ?)',
        [req.user.id, songId]
      );
      res.json({ code: 200, message: 'Favorite added', data: null });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ code: 400, message: 'Song already favorited' });
      }
      throw err;
    }
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ code: 500, message: 'Server error' });
  }
});

// DELETE /favorites/:songId - remove favorite
router.delete('/favorites/:songId', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM favorites WHERE user_id = ? AND song_id = ?',
      [req.user.id, req.params.songId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ code: 404, message: 'Song is not favorited' });
    }
    res.json({ code: 200, message: 'Favorite removed', data: null });
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ code: 500, message: 'Server error' });
  }
});

// POST /history/:songId - record play history
router.post('/history/:songId', async (req, res) => {
  try {
    const songId = req.params.songId;
    const exists = await ensureSongRecord(songId, req.body || {});
    if (!exists) {
      return res.status(404).json({ code: 404, message: 'Song not found' });
    }

    await pool.query(
      'INSERT INTO play_history (user_id, song_id) VALUES (?, ?)',
      [req.user.id, songId]
    );
    res.json({ code: 200, message: 'History recorded', data: null });
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ code: 500, message: 'Server error' });
  }
});

// GET /history - play history
router.get('/history', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, h.played_at FROM play_history h
       JOIN songs s ON h.song_id = s.id
       WHERE h.user_id = ?
       ORDER BY h.played_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json({ code: 200, message: 'success', data: rows.map(parseFeatures) });
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ code: 500, message: 'Server error' });
  }
});

module.exports = router;
