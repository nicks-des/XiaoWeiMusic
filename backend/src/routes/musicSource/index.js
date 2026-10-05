const express = require('express');
const router = express.Router();

const registerAuthRoutes = require('./auth');
const registerSearchRoutes = require('./search');
const registerPlaylistRoutes = require('./playlist');
const registerDownloadProxyRoutes = require('./downloadProxy');

// 注册所有子路由
registerAuthRoutes(router);
registerSearchRoutes(router);
registerPlaylistRoutes(router);
registerDownloadProxyRoutes(router);

module.exports = router;
