const axios = require('axios');
const qqmusic = require('../platforms/qqmusic');
const kugou = require('../platforms/kugou');
const kuwo = require('../platforms/kuwo');
const {
  getUserIdFromReq,
  getPlatformCookie,
  urlCache,
  URL_CACHE_TTL,
  URL_CACHE_TTL_AUTH,
  songMetaCache,
  parsePlatformId,
} = require('./shared');
const { fetchNeteaseUrl, shouldUseCachedUrl } = require('./neteaseUrl');

function registerDownloadProxyRoutes(router) {
  // GET /api/music-source/download/:id - proxy audio download (multi-platform, supports Range seeking)
  // Query params: ?quality=standard|high|lossless (default: standard)
  router.get('/download/:id', async (req, res) => {
    try {
      const rawId = req.params.id;
      const quality = ['standard', 'high', 'lossless'].includes(req.query.quality)
        ? req.query.quality
        : 'standard';
      const parsed = parsePlatformId(rawId);
      const userId = getUserIdFromReq(req);
      let streamUrl = '';
      let neteaseCookie = '';
      let neteaseHasCookie = false;
      const isNetease = !parsed || parsed.platform === 'wy';

      if (isNetease) {
        neteaseCookie = await getPlatformCookie(userId, 'netease');
        neteaseHasCookie = Boolean(neteaseCookie);
      }

      // Check URL cache first (avoids double-fetching vkey/API for non-NetEase platforms)
      const cached = urlCache.get(rawId);
      if (isNetease ? shouldUseCachedUrl(cached, neteaseHasCookie) : cached && cached.expires > Date.now()) {
        streamUrl = cached.url;
      }

      if (!streamUrl) {
        if (!parsed) {
          // Legacy: no prefix, treat as netease
          const neteaseId = String(rawId).replace(/^wy_/, '');
          if (!/^\d+$/.test(neteaseId)) {
            return res.status(400).json({ code: 400, message: '无效的歌曲ID' });
          }
          const result = await fetchNeteaseUrl(neteaseId, neteaseCookie, quality);
          streamUrl = result?.url || '';
          if (streamUrl) {
            const ttl = result.hasCookie ? URL_CACHE_TTL_AUTH : URL_CACHE_TTL;
            urlCache.set(rawId, {
              url: streamUrl,
              hasCookie: result.hasCookie,
              trial: result.trial || false,
              quality,
              expires: Date.now() + ttl,
            });
          }
          if (!streamUrl) {
            return res.status(502).json({ code: 502, message: '音乐源返回异常' });
          }
        } else {
          const { platform, rawId: id } = parsed;
          if (platform === 'wy') {
            if (!/^\d+$/.test(id)) {
              return res.status(400).json({ code: 400, message: '无效的歌曲ID' });
            }
            const result = await fetchNeteaseUrl(id, neteaseCookie, quality);
            streamUrl = result?.url || '';
            if (streamUrl) {
              const ttl = result.hasCookie ? URL_CACHE_TTL_AUTH : URL_CACHE_TTL;
              urlCache.set(rawId, {
                url: streamUrl,
                hasCookie: result.hasCookie,
                trial: result.trial || false,
                quality,
                expires: Date.now() + ttl,
              });
            }
          } else if (platform === 'qq') {
            const cookie = await getPlatformCookie(userId, 'qqmusic');
            const qqQuality = quality === 'lossless' ? 'lossless' : quality === 'high' ? 'hires' : 'standard';
            const result = await qqmusic.getSongUrl(id, qqQuality, cookie);
            streamUrl = result.url || '';
          } else if (platform === 'kg') {
            const cookie = await getPlatformCookie(userId, 'kugou');
            const meta = songMetaCache.get(rawId);
            const result = await kugou.getSongUrl(id, cookie, meta?.albumAudioId || 0);
            streamUrl = result.url || '';
          } else if (platform === 'kw') {
            const cookie = await getPlatformCookie(userId, 'kuwo');
            const result = await kuwo.getSongUrl(id, cookie);
            streamUrl = result.url || '';
          }
        }
      }

      if (!streamUrl) {
        return res.status(404).json({ code: 404, message: '该歌曲无播放链接' });
      }

      // Set CORS headers for audio element with crossOrigin='anonymous'
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      // Fetch stream from CDN, forwarding Range header for seeking
      // Upstream CDN handles 206 / partial content natively — no manual slicing
      const rangeHeader = req.headers.range;
      let audioResp;
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const fetchHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          };
          if (rangeHeader) {
            fetchHeaders['Range'] = rangeHeader;
          }
          audioResp = await axios.get(streamUrl, {
            responseType: 'stream',
            timeout: 12000,
            headers: fetchHeaders,
          });
          break;
        } catch (err) {
          lastErr = err;
          if (attempt === 0) {
            urlCache.delete(rawId);
            if (parsed && parsed.platform === 'qq') {
              const qqCookie = await getPlatformCookie(getUserIdFromReq(req), 'qqmusic');
              const qqQuality = quality === 'lossless' ? 'lossless' : quality === 'high' ? 'hires' : 'standard';
              const result = await qqmusic.getSongUrl(parsed.rawId, qqQuality, qqCookie);
              if (result.url) {
                streamUrl = result.url;
                urlCache.set(rawId, { url: streamUrl, expires: Date.now() + URL_CACHE_TTL });
              }
            }
            console.log(`[Download] Retry attempt ${attempt + 1} for ${rawId}`);
          }
        }
      }

      if (!audioResp) {
        console.error(`[Download] Failed to fetch CDN stream for ${rawId}:`, lastErr?.message);
        if (!res.headersSent) {
          return res.status(502).json({ code: 502, message: 'CDN 连接失败' });
        }
        return;
      }

      // Forward CDN response headers (status, content-length, content-range, content-type)
      const cdnStatus = audioResp.status;
      const contentType = audioResp.headers['content-type'] || 'audio/mpeg';
      const respContentLength = audioResp.headers['content-length'];
      const respContentRange = audioResp.headers['content-range'];

      res.status(cdnStatus);
      if (respContentLength) res.setHeader('Content-Length', respContentLength);
      if (respContentRange) res.setHeader('Content-Range', respContentRange);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      // Pipe CDN stream directly to client — no manual slicing
      let streamEnded = false;
      audioResp.data.on('end', () => { streamEnded = true; });
      audioResp.data.on('error', (err) => {
        console.error(`[Download] Stream error for ${rawId}:`, err.message);
        if (!res.headersSent) {
          res.status(502).end();
        } else if (!streamEnded) {
          try { res.end(); } catch (_) {}
        }
      });
      audioResp.data.pipe(res);
    } catch (err) {
      console.error('Download proxy error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ code: 500, message: '下载代理失败: ' + err.message });
      }
    }
  });
}

module.exports = registerDownloadProxyRoutes;
