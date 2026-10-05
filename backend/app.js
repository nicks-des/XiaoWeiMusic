require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const authRoutes = require('./src/routes/auth');
const songRoutes = require('./src/routes/songs');
const recommendationRoutes = require('./src/routes/recommendations');
const aiRecommendationRoutes = require('./src/routes/ai-recommendations');
const playlistRoutes = require('./src/routes/playlists');
const userRoutes = require('./src/routes/users');
const musicSourceRoutes = require('./src/routes/musicSource');
const platformLoginRoutes = require('./src/routes/platformLogin');
const { pool } = require('./src/config/db');
const { getNextSongId } = require('./src/utils/data');

const app = express();

// 启动时检查 JWT_SECRET 是否配置
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET 环境变量未设置，认证功能将无法正常工作');
  console.error('[FATAL] 请在 .env 文件中设置 JWT_SECRET=一个随机字符串');
  process.exit(1);
}

// Upload storage
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Fix Windows encoding for Chinese filenames
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\u4e00-\u9fff\uac00-\ud7af_-]/g, '_');
    cb(null, Date.now() + '_' + baseName + ext);
  },
});
const ALLOWED_AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.ape', '.alac', '.opus', '.aiff', '.dsf', '.dff', '.wv'];
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_AUDIO_EXTS.includes(ext)) cb(null, true);
    else cb(new Error('不支持的音频格式: ' + ext));
  },
  limits: { fileSize: 500 * 1024 * 1024 },  // 500MB for lossless audio files
});

// Video upload multer config
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\u4e00-\u9fff\uac00-\ud7af_-]/g, '_');
    cb(null, 'mv_' + Date.now() + '_' + baseName + ext);
  },
});
const videoUpload = multer({
  storage: videoStorage,
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
    const allowedMimes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('不支持的视频格式: ' + ext));
  },
  limits: { fileSize: 200 * 1024 * 1024 },
});

// CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
    'https://music.163.com',
    'https://y.qq.com',
    'https://www.kugou.com',
    'http://localhost:5173',
  ],
  credentials: true
}));

app.use(express.json());

// Serve uploaded files statically with correct MIME types for lossless formats
const mime = require('mime');
// Ensure mime knows about lossless audio formats (older mime versions may not)
mime.define({
  'audio/flac': ['flac'],
  'audio/ape': ['ape'],
  'audio/wavpack': ['wv'],
  'audio/aiff': ['aiff', 'aif'],
  'audio/opus': ['opus'],
  'audio/dsd': ['dsf', 'dff'],
}, true);
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.flac': 'audio/flac', '.ape': 'audio/ape', '.wv': 'audio/wavpack',
      '.aiff': 'audio/aiff', '.opus': 'audio/opus', '.dsf': 'audio/dsd', '.dff': 'audio/dsd',
    };
    if (mimeMap[ext]) res.setHeader('Content-Type', mimeMap[ext]);
  },
}));

// Serve frontend static files (for production)
const frontendDist = path.join(__dirname, 'frontend-dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback: all non-API routes serve index.html
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    } else {
      next();
    }
  });
}

// Upload endpoint with multer middleware (must be BEFORE /api/songs routes to avoid /:id conflict)
app.post('/api/songs/upload', upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择音频文件' });
    }

    let metaList = [];
    if (req.body?.meta) {
      try {
        const parsed = JSON.parse(req.body.meta);
        metaList = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        metaList = [];
      }
    }

    const results = [];
    for (const [index, file] of req.files.entries()) {
      // Fix Windows encoding: multer stores filename in latin1
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
      const audioUrl = '/uploads/' + file.filename;
      let title = nameWithoutExt;
      let artist = '未知艺术家';
      if (nameWithoutExt.includes(' - ')) {
        const parts = nameWithoutExt.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else if (nameWithoutExt.includes('-')) {
        const parts = nameWithoutExt.split('-');
        artist = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      }
      const meta = metaList[index] || {};
      title = meta.title || title;
      artist = meta.artist || artist;
      const album = meta.album || 'Local Import';
      const duration = Number(meta.duration) || 0;
      const genre = meta.genre || 'Other';
      const coverUrl = meta.cover_url || `https://picsum.photos/seed/${encodeURIComponent(file.filename)}/300/300`;
      const source = meta.source || 'local';
      const videoUrl = meta.video_url || '';
      const mvId = meta.mv_id || 0;
      const neteaseId = meta.netease_id || '';
      const features = { energy: 0.5, mood: 'calm', tempo: 90, ...(mvId ? { mv_id: mvId } : {}) };
      const nextId = await getNextSongId(pool);
      await pool.query(
        `INSERT INTO songs (id, title, artist, album, duration, genre, audio_url, cover_url, features, play_count, source, video_url, netease_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nextId, title, artist, album, duration, genre, audioUrl, coverUrl, JSON.stringify(features), 0, source, videoUrl, neteaseId]
      );
      results.push({ id: nextId, title, artist, album, duration, genre, cover_url: coverUrl, audio_url: audioUrl });
    }
    res.json({ code: 200, message: `成功导入 ${results.length} 首歌曲`, data: results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ code: 500, message: '上传失败: ' + err.message });
  }
});

// ── 本地目录扫描 & 文件流 ──
const MUSIC_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.ape', '.alac', '.opus', '.aiff', '.dsf', '.dff', '.wv']);

// POST /api/local-songs/scan - 扫描本地音乐目录
app.post('/api/local-songs/scan', async (req, res) => {
  try {
    const { directory } = req.body;
    if (!directory || typeof directory !== 'string') {
      return res.status(400).json({ code: 400, message: '请提供要扫描的目录路径' });
    }
    const dirPath = path.resolve(directory.trim());
    if (!fs.existsSync(dirPath)) {
      return res.status(400).json({ code: 400, message: `目录不存在: ${dirPath}` });
    }
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ code: 400, message: '路径不是有效目录' });
    }

    // 获取所有已入库本地文件的绝对路径 (audio_url 以 / 或盘符开头的)
    const [existing] = await pool.query(
      "SELECT id, audio_url FROM songs WHERE (source = 'local' OR source IS NULL) AND audio_url IS NOT NULL AND audio_url != ''"
    );
    const existingPaths = new Set();
    for (const row of existing) {
      // Normalize: 存入的可能是 /uploads/xxx 或 D:\Music\xxx
      let p = row.audio_url;
      if (p.startsWith('/uploads/')) {
        p = path.join(uploadsDir, path.basename(p));
      }
      existingPaths.add(path.resolve(p).toLowerCase());
    }

    // 递归扫描音乐文件
    const musicFiles = [];
    function walkDir(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(full);
          } else if (entry.isFile() && MUSIC_EXTS.has(path.extname(entry.name).toLowerCase())) {
            musicFiles.push(full);
          }
        }
      } catch (_) { /* skip inaccessible dirs */ }
    }
    walkDir(dirPath);

    // 过滤已入库、插入新歌曲
    const results = [];
    for (const filePath of musicFiles) {
      if (existingPaths.has(filePath.toLowerCase())) continue;

      const ext = path.extname(filePath);
      const basename = path.basename(filePath, ext);
      let title = basename;
      let artist = '未知歌手';
      if (basename.includes(' - ')) {
        const parts = basename.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else if (basename.includes('-')) {
        const parts = basename.split('-');
        artist = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      }

      const nextId = await getNextSongId(pool);
      // 存储流代理URL: /api/local-songs/stream/:id
      // 实际文件路径存在 audio_url 中，stream 端点会读取并流式播放
      const streamUrl = `/api/local-songs/stream/${nextId}`;
      await pool.query(
        `INSERT INTO songs (id, title, artist, album, duration, genre, audio_url, cover_url, features, play_count, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nextId, title, artist, '本地音乐', 0, '其他', filePath, `https://picsum.photos/seed/${encodeURIComponent(basename)}/300/300`, JSON.stringify({ energy: 0.5, mood: 'calm', tempo: 90 }), 0, 'local']
      );
      results.push({ id: nextId, title, artist, audio_url: streamUrl });
      existingPaths.add(filePath.toLowerCase());
    }

    res.json({
      code: 200,
      message: `扫描完成，新发现 ${results.length} 首歌曲`,
      data: { scanned: results, total: musicFiles.length, new: results.length }
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ code: 500, message: '扫描失败: ' + err.message });
  }
});

// GET /api/local-songs/stream/:id - 流式播放本地文件
app.get('/api/local-songs/stream/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT audio_url, title, artist FROM songs WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '歌曲不存在' });

    let filePath = rows[0].audio_url;
    if (!filePath) return res.status(404).json({ code: 404, message: '无音频文件' });

    // 如果是 uploads 目录的相对路径
    if (filePath.startsWith('/uploads/')) {
      filePath = path.join(uploadsDir, path.basename(filePath));
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ code: 404, message: '音频文件不存在' });
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
      '.wma': 'audio/x-ms-wma', '.ape': 'audio/ape', '.alac': 'audio/mp4',
      '.opus': 'audio/opus', '.aiff': 'audio/aiff', '.wv': 'audio/wavpack',
    };
    const contentType = mimeMap[ext] || 'audio/mpeg';
    const song = rows[0];

    // Set CORS headers for audio element with crossOrigin='anonymous'
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // 支持 Range 请求 (用于 seek)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${encodeURIComponent(song.title)}${ext}"`,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ code: 500, message: '播放失败' });
    }
  }
});

// Video upload endpoint
app.post('/api/songs/upload-video', videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请选择视频文件' });
    }
    const videoUrl = '/uploads/' + req.file.filename;
    res.json({ code: 200, message: '视频上传成功', data: { video_url: videoUrl } });
  } catch (err) {
    console.error('Video upload error:', err);
    res.status(500).json({ code: 500, message: '视频上传失败: ' + err.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/ai-recommendations', aiRecommendationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/music-source', musicSourceRoutes);
app.use('/api/platform-login', platformLoginRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.name === 'MulterError') {
    return res.status(400).json({ code: 400, message: err.message });
  }
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

module.exports = app;
