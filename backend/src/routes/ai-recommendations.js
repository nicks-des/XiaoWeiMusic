const express = require('express');
const auth = require('../middleware/auth');
const { pool } = require('../config/db');
const { parseFeatures } = require('../utils/data');

const router = express.Router();

/**
 * AI-style recommendation engine
 * Analyzes user's listening history + favorites to build a taste profile,
 * then recommends songs based on weighted similarity scoring.
 *
 * Features used: genre, mood, tempo, energy
 * Weights:
 *   - Favorite songs: 3x weight
 *   - Recent history: 2x weight (last 20 plays)
 *   - Older history: 1x weight
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const refresh = req.query.refresh === 'true'; // refresh mode: boost randomness

    // 1. Get user's favorite songs
    const [favorites] = await pool.query(
      `SELECT s.*, f.created_at as favorited_at FROM favorites f
       JOIN songs s ON f.song_id = s.id
       WHERE f.user_id = ?`,
      [userId]
    );

    // 2. Get recent play history (weighted by recency)
    const [history] = await pool.query(
      `SELECT s.*, h.played_at FROM play_history h
       JOIN songs s ON h.song_id = s.id
       WHERE h.user_id = ?
       ORDER BY h.played_at DESC
       LIMIT 50`,
      [userId]
    );

    // 3. Get all songs for scoring
    const [allSongs] = await pool.query('SELECT * FROM songs');

    // If user has no history/favorites, return random recommendations
    if (favorites.length === 0 && history.length === 0) {
      const shuffled = allSongs.sort(() => Math.random() - 0.5).slice(0, 10);
      return res.json({
        code: 200,
        message: 'success',
        data: {
          recommendations: shuffled.map(parseFeatures),
          tasteProfile: null,
          reason: 'new_user'
        }
      });
    }

    // 4. Build taste profile from user data
    const profile = buildTasteProfile(favorites.map(parseFeatures), history.map(parseFeatures));

    // 5. Score all songs
    const scored = allSongs.map(song => {
      const s = parseFeatures(song);
      const score = calculateScore(s, profile, favorites, history, refresh);
      return { song: s, score };
    });

    // 6. Filter out already heavily played songs, sort by score
    const playedIds = new Set(history.map(h => h.id));
    const result = scored
      .filter(item => !playedIds.has(item.song.id) || playedIds.size < 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Add recommendation reasons
    const recommendations = result.map(item => {
      const reasons = getReasons(item.song, profile);
      return { ...item.song, _score: item.score, _reasons: reasons };
    });

    res.json({
      code: 200,
      message: 'success',
      data: {
        recommendations,
        tasteProfile: profile,
        reason: 'personalized'
      }
    });
  } catch (err) {
    console.error('AI recommendation error:', err);
    res.status(500).json({ code: 500, message: '推荐服务错误' });
  }
});

function buildTasteProfile(favorites, history) {
  const genreScores = {};
  const moodScores = {};
  const tempoSum = { total: 0, count: 0 };
  const energySum = { total: 0, count: 0 };

  // Process favorites (3x weight)
  favorites.forEach(song => {
    const f = song.features || {};
    genreScores[song.genre] = (genreScores[song.genre] || 0) + 3;
    if (f.mood) moodScores[f.mood] = (moodScores[f.mood] || 0) + 3;
    if (f.tempo) { tempoSum.total += f.tempo; tempoSum.count++; }
    if (f.energy != null) { energySum.total += f.energy; energySum.count++; }
  });

  // Process history (recent 2x, older 1x)
  history.forEach((song, idx) => {
    const f = song.features || {};
    const weight = idx < 20 ? 2 : 1;
    genreScores[song.genre] = (genreScores[song.genre] || 0) + weight;
    if (f.mood) moodScores[f.mood] = (moodScores[f.mood] || 0) + weight;
    if (f.tempo) { tempoSum.total += f.tempo; tempoSum.count++; }
    if (f.energy != null) { energySum.total += f.energy; energySum.count++; }
  });

  // Normalize to top preferences
  const topGenres = Object.entries(genreScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre);

  const topMoods = Object.entries(moodScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([mood]) => mood);

  return {
    topGenres,
    topMoods,
    avgTempo: tempoSum.count > 0 ? tempoSum.total / tempoSum.count : null,
    avgEnergy: energySum.count > 0 ? energySum.total / energySum.count : null,
    favoriteGenres: topGenres[0] || 'Pop',
    favoriteMood: topMoods[0] || 'happy',
  };
}

function calculateScore(song, profile, favorites, history, refresh = false) {
  const f = song.features || {};
  let score = 0;

  // Genre match (0-40 points)
  if (profile.topGenres.includes(song.genre)) {
    const idx = profile.topGenres.indexOf(song.genre);
    score += 40 - (idx * 10); // 1st = 40, 2nd = 30, 3rd = 20
  }

  // Mood match (0-25 points)
  if (f.mood && profile.topMoods.includes(f.mood)) {
    const idx = profile.topMoods.indexOf(f.mood);
    score += 25 - (idx * 8);
  }

  // Tempo similarity (0-15 points)
  if (profile.avgTempo && f.tempo) {
    const diff = Math.abs(f.tempo - profile.avgTempo);
    score += Math.max(0, 15 - (diff * 0.2));
  }

  // Energy similarity (0-15 points)
  if (profile.avgEnergy != null && f.energy != null) {
    const diff = Math.abs(f.energy - profile.avgEnergy);
    score += Math.max(0, 15 - (diff * 20));
  }

  // Discovery bonus: random factor to keep recommendations fresh
  // In refresh mode, boost randomness significantly to show new songs
  score += Math.random() * (refresh ? 40 : 5);

  return Math.round(score * 10) / 10;
}

function getReasons(song, profile) {
  const f = song.features || {};
  const reasons = [];

  if (profile.topGenres.includes(song.genre)) {
    reasons.push(`因为你喜欢${getGenreLabel(song.genre)}风格`);
  }
  if (f.mood && profile.topMoods.includes(f.mood)) {
    reasons.push(`匹配你的${getMoodLabel(f.mood)}心情`);
  }
  if (profile.avgTempo && f.tempo && Math.abs(f.tempo - profile.avgTempo) < 15) {
    reasons.push('符合你的节奏偏好');
  }
  if (profile.avgEnergy != null && f.energy != null && Math.abs(f.energy - profile.avgEnergy) < 0.2) {
    reasons.push('匹配你的能量偏好');
  }

  if (reasons.length === 0) {
    reasons.push('为你发现新音乐');
  }

  return reasons;
}

function getGenreLabel(genre) {
  const map = {
    'Pop': '流行', 'Rock': '摇滚', 'Jazz': '爵士', 'Electronic': '电子',
    'Hip-Hop': '嘻哈', 'RnB': 'R&B', 'Classical': '古典', 'Blues': '蓝调',
    'Ambient': '氛围', 'EDM': '舞曲', 'Folk': '民谣', 'Latin': '拉丁',
    'Lo-Fi': 'Lo-Fi',
  };
  return map[genre] || genre;
}

function getMoodLabel(mood) {
  const map = {
    'calm': '平静', 'energetic': '活力', 'relaxed': '放松', 'happy': '快乐',
    'melancholy': '忧郁', 'intense': '激烈', 'peaceful': '安宁', 'party': '派对',
    'elegant': '优雅', 'romantic': '浪漫', 'powerful': '力量', 'warm': '温暖',
    'festive': '欢快', 'chill': '慵懒', 'upbeat': '轻快',
  };
  return map[mood] || mood;
}

module.exports = router;
