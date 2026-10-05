const mysql = require('mysql2/promise');

const dbName = process.env.DB_NAME || 'musicplayer';

const baseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  charset: 'utf8mb4',
};

const pool = mysql.createPool({
  ...baseConfig,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initDB() {
  const bootstrap = await mysql.createConnection(baseConfig);
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await bootstrap.end();
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      avatar VARCHAR(500),
      preferences JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS songs (
      id VARCHAR(100) PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      artist VARCHAR(100) NOT NULL,
      album VARCHAR(200),
      duration INT NOT NULL,
      genre VARCHAR(50),
      audio_url VARCHAR(500) NOT NULL DEFAULT '',
      cover_url VARCHAR(500),
      video_url VARCHAR(500),
      lyrics TEXT,
      netease_id VARCHAR(50),
      source VARCHAR(20) DEFAULT 'local',
      features JSON,
      play_count INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add video_url column if missing (for existing databases)
  try {
    await pool.query('ALTER TABLE songs ADD COLUMN video_url VARCHAR(500) AFTER cover_url');
  } catch (e) { /* column already exists - ok */ }

  // Add lyrics column if missing
  try {
    await pool.query('ALTER TABLE songs ADD COLUMN lyrics TEXT AFTER video_url');
  } catch (e) { /* column already exists - ok */ }

  // Add netease_id column if missing (for online song quick-add)
  try {
    await pool.query('ALTER TABLE songs ADD COLUMN netease_id VARCHAR(50) AFTER lyrics');
  } catch (e) { /* column already exists - ok */ }

  // Fix play_history.song_id type (INT -> VARCHAR(100) for Netease IDs)
  try {
    await pool.query('ALTER TABLE play_history MODIFY COLUMN song_id VARCHAR(100)');
  } catch (e) { /* column already correct or empty table - ok */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_public TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      playlist_id INT,
      song_id VARCHAR(100),
      position INT,
      UNIQUE KEY unique_playlist_song (playlist_id, song_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      song_id VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_song (user_id, song_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      song_id VARCHAR(100),
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 用户平台账号绑定 (扫码登录)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_platforms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      platform VARCHAR(20) NOT NULL,
      platform_uid VARCHAR(100),
      platform_nickname VARCHAR(100),
      platform_avatar VARCHAR(500),
      cookie TEXT,
      extra JSON,
      bound_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      UNIQUE KEY unique_user_platform (user_id, platform)
    )
  `);

  await ensureIndex('idx_playlists_user_created', 'playlists', 'user_id, created_at');
  await ensureIndex('idx_history_user_played', 'play_history', 'user_id, played_at');
  await ensureIndex('idx_user_platforms_user', 'user_platforms', 'user_id');

  console.log('Database and tables initialized successfully');
}

async function ensureIndex(indexName, tableName, columns) {
  try {
    await pool.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') {
      throw err;
    }
  }
}

module.exports = { pool, initDB };
