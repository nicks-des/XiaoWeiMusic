const express = require('express');
const auth = require('../middleware/auth');
const { pool } = require('../config/db');
const { normalizePagination, parseFeatures, uniquePositiveIds } = require('../utils/data');

const router = express.Router();
router.use(auth);

// GET / - playlist list (paginated, optional userId filter)
router.get('/', async (req, res) => {
  try {
    const { page, limit, offset } = normalizePagination(req.query);
    const userId = req.query.userId;

    let whereSql = '';
    const params = [];

    if (userId) {
      whereSql = 'WHERE user_id = ?';
      params.push(userId);
    }

    const [total] = await pool.query(`SELECT COUNT(*) as count FROM playlists ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT * FROM playlists ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      code: 200,
      message: 'success',
      data: {
        list: rows,
        pagination: {
          page,
          limit,
          total: total[0].count,
          totalPages: Math.ceil(total[0].count / limit)
        }
      }
    });
  } catch (err) {
    console.error('Playlists error:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// POST / - create playlist
router.post('/', async (req, res) => {
  try {
    const { name, description, songs, isPublic } = req.body;
    if (!name) {
      return res.status(400).json({ code: 400, message: '歌单名称为必填项' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        'INSERT INTO playlists (user_id, name, description, is_public) VALUES (?, ?, ?, ?)',
        [req.user.id, name, description || null, isPublic !== undefined ? isPublic : 1]
      );

      const playlistId = result.insertId;

      await insertPlaylistSongs(conn, playlistId, songs);

      await conn.commit();

      res.status(201).json({
        code: 200,
        message: 'success',
        data: { id: playlistId, name, description, is_public: isPublic !== undefined ? isPublic : 1 }
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Playlists error:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// GET /:id - playlist detail with songs
router.get('/:id', async (req, res) => {
  try {
    const [playlists] = await pool.query('SELECT * FROM playlists WHERE id = ?', [req.params.id]);
    if (playlists.length === 0) {
      return res.status(404).json({ code: 404, message: '歌单不存在' });
    }

    const playlist = playlists[0];
    const [songs] = await pool.query(
      `SELECT s.* FROM songs s
       JOIN playlist_songs ps ON s.id = ps.song_id
       WHERE ps.playlist_id = ?
       ORDER BY ps.position ASC`,
      [req.params.id]
    );

    playlist.songs = songs.map(parseFeatures);

    res.json({ code: 200, message: 'success', data: playlist });
  } catch (err) {
    console.error('Playlists error:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// PUT /:id - update playlist
router.put('/:id', async (req, res) => {
  try {
    const { name, description, songs, isPublic } = req.body;

    const [existing] = await pool.query('SELECT * FROM playlists WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ code: 404, message: '歌单不存在' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        'UPDATE playlists SET name = ?, description = ?, is_public = ? WHERE id = ?',
        [
          name || existing[0].name,
          description !== undefined ? description : existing[0].description,
          isPublic !== undefined ? isPublic : existing[0].is_public,
          req.params.id
        ]
      );

      if (Array.isArray(songs)) {
        await conn.query('DELETE FROM playlist_songs WHERE playlist_id = ?', [req.params.id]);
        await insertPlaylistSongs(conn, req.params.id, songs);
      }

      await conn.commit();

      res.json({ code: 200, message: 'success', data: { id: parseInt(req.params.id) } });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Playlists error:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// POST /:id/songs - add a song to playlist
router.post('/:id/songs', async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { songId } = req.body;
    if (!songId) {
      return res.status(400).json({ code: 400, message: 'songId 为必填项' });
    }

    const [playlists] = await pool.query('SELECT * FROM playlists WHERE id = ?', [playlistId]);
    if (playlists.length === 0) {
      return res.status(404).json({ code: 404, message: '歌单不存在' });
    }

    // Check if song already exists in playlist
    const [existing] = await pool.query(
      'SELECT * FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
      [playlistId, songId]
    );
    if (existing.length > 0) {
      return res.json({ code: 200, message: '歌曲已在歌单中', data: null });
    }

    // Get the next position
    const [maxPos] = await pool.query(
      'SELECT MAX(position) as maxPos FROM playlist_songs WHERE playlist_id = ?',
      [playlistId]
    );
    const nextPosition = (maxPos[0].maxPos || 0) + 1;

    await pool.query(
      'INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)',
      [playlistId, songId, nextPosition]
    );

    res.json({ code: 200, message: '添加成功', data: { playlistId, songId } });
  } catch (err) {
    console.error('Playlists error:', err);
    console.error('Add song to playlist error:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// DELETE /:id - delete playlist
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM playlists WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ code: 404, message: '歌单不存在' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM playlist_songs WHERE playlist_id = ?', [req.params.id]);
      await conn.query('DELETE FROM playlists WHERE id = ?', [req.params.id]);
      await conn.commit();
      res.json({ code: 200, message: 'success', data: null });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Playlists error:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

module.exports = router;

async function insertPlaylistSongs(conn, playlistId, songs) {
  const songIds = uniquePositiveIds(songs);
  if (songIds.length === 0) return;

  const values = songIds.map((songId, index) => [playlistId, songId, index + 1]);
  const placeholders = values.map(() => '(?, ?, ?)').join(', ');
  await conn.query(
    `INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES ${placeholders}`,
    values.flat()
  );
}
