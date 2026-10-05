const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const router = express.Router();

// POST /register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ code: 400, message: '用户名、邮箱和密码为必填项' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ code: 400, message: '用户名或邮箱已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    res.status(201).json({
      code: 200,
      message: '注册成功',
      data: { id: result.insertId, username, email }
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ code: 400, message: '邮箱和密码为必填项' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ code: 401, message: '邮箱或密码错误' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ code: 401, message: '邮箱或密码错误' });
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
    );
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
    );

    res.json({
      code: 200,
      message: 'success',
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar }
      }
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// POST /refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ code: 401, message: '缺少refreshToken' });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const [users] = await pool.query('SELECT id, username, email FROM users WHERE id = ?', [decoded.id]);
    if (users.length === 0) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }

    const user = users[0];
    const newAccessToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
    );

    res.json({
      code: 200,
      message: 'success',
      data: { accessToken: newAccessToken }
    });
  } catch (err) {
    console.error('Auth error:', err);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ code: 401, message: 'refreshToken无效或已过期' });
    }
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

module.exports = router;
