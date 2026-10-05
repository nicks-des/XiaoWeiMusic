const { song_url_v1, song_url, login_refresh } = require('NeteaseCloudMusicApi');

function hasFreeTrialInfo(item) {
  if (!item || typeof item !== 'object') return false;
  return Boolean(item.freeTrialInfo);
}

function chooseNeteaseUrlData(data) {
  const items = Array.isArray(data) ? data : [];
  return items.find((item) => item?.url && !hasFreeTrialInfo(item)) || null;
}

function shouldUseCachedUrl(cached, hasCookie) {
  if (!cached || cached.expires <= Date.now() || !cached.url) return false;
  return !hasCookie || cached.hasCookie === true;
}

/**
 * Try to refresh the NetEase login cookie before fetching URL.
 * This helps ensure VIP songs return a playable URL.
 */
async function refreshLogin(cookie) {
  if (!cookie) return false;
  try {
    const result = await login_refresh({ cookie });
    return result?.body?.code === 200;
  } catch (e) {
    return false;
  }
}

/**
 * Fallback: try the older song_url API when song_url_v1 returns no playable URL.
 * Some VIP songs work with the older endpoint.
 */
async function fetchNeteaseUrlOld(neteaseId, cookie, logger = console) {
  try {
    const urlRes = await song_url({ id: neteaseId, br: 320000, cookie });
    const selected = chooseNeteaseUrlData(urlRes.body?.data);
    if (urlRes.status === 200 && selected?.url) {
      logger.log('[NetEase] song_url (old API) OK for', neteaseId,
        '| code:', urlRes.body?.code);
      return {
        url: selected.url,
        level: 'standard',
        hasCookie: Boolean(cookie),
        data: selected,
      };
    }
    logger.log('[NetEase] song_url (old API) no URL for', neteaseId,
      '| code:', urlRes.body?.code);
  } catch (e) {
    logger.log('[NetEase] song_url (old API) error for', neteaseId, '|', e.message);
  }
  return null;
}

/**
 * Last resort: accept a URL even with freeTrialInfo for VIP songs.
 * Some VIP songs only return a preview, which is better than nothing.
 */
async function fetchNeteaseUrlAny(neteaseId, cookie, logger = console) {
  const levels = ['higher', 'exhigh', 'lossless', 'standard'];
  // Run all levels in parallel — accept the first URL we get
  const results = await Promise.allSettled(
    levels.map((level) =>
      song_url_v1({ id: neteaseId, level, br: 320000, cookie })
    )
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const urlRes = r.value;
    const items = Array.isArray(urlRes.body?.data) ? urlRes.body.data : [];
    const anyUrl = items.find((item) => item?.url);
    if (anyUrl?.url) {
      logger.log('[NetEase] song_url_v1 ANY URL for', neteaseId,
        '| level:', levels[i], '| trial:', hasFreeTrialInfo(anyUrl));
      return {
        url: anyUrl.url,
        level: levels[i],
        hasCookie: Boolean(cookie),
        trial: hasFreeTrialInfo(anyUrl),
        data: anyUrl,
      };
    }
  }
  return null;
}

/**
 * Map user quality preference to NetEase API level priorities.
 * @param {'standard'|'high'|'lossless'} quality - desired quality tier
 * @param {boolean} hasCookie - whether user has a valid login cookie
 * @returns {string[]} ordered array of level values to try
 */
function getLevelPriorities(quality = 'standard', hasCookie = false) {
  switch (quality) {
    case 'lossless':
      return hasCookie
        ? ['lossless', 'exhigh', 'higher', 'standard']
        : ['lossless', 'exhigh', 'higher', 'standard'];
    case 'high':
      return hasCookie
        ? ['exhigh', 'higher', 'standard', 'lossless']
        : ['exhigh', 'higher', 'standard'];
    case 'standard':
    default:
      return ['standard', 'higher', 'exhigh', 'lossless'];
  }
}

async function fetchNeteaseUrl(neteaseId, cookie, quality = 'standard', logger = console) {
  const hasCookie = Boolean(cookie);

  // Step 1: Run first 2 quality levels in parallel (fast path)
  const levels = getLevelPriorities(quality, hasCookie);
  const firstBatch = levels.slice(0, 2);
  const results = await Promise.allSettled(
    firstBatch.map((level) =>
      song_url_v1({ id: neteaseId, level, br: 320000, cookie })
    )
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const urlRes = r.value;
    const selected = chooseNeteaseUrlData(urlRes.body?.data);
    if (urlRes.status === 200 && selected?.url) {
      logger.log('[NetEase] song_url_v1 OK for', neteaseId,
        '| level:', firstBatch[i], '| hasCookie:', hasCookie);
      return { url: selected.url, level: firstBatch[i], hasCookie, data: selected };
    }
  }

  // Step 2: Try remaining levels sequentially
  const remaining = levels.slice(2);
  for (const level of remaining) {
    try {
      const urlRes = await song_url_v1({ id: neteaseId, level, br: 320000, cookie });
      const selected = chooseNeteaseUrlData(urlRes.body?.data);
      if (urlRes.status === 200 && selected?.url) {
        logger.log('[NetEase] song_url_v1 OK for', neteaseId,
          '| level:', level, '| hasCookie:', hasCookie);
        return { url: selected.url, level, hasCookie, data: selected };
      }
    } catch (e) { /* skip */ }
  }

  // Step 3: Last resort — accept any URL including trial preview
  const anyResult = await fetchNeteaseUrlAny(neteaseId, cookie, logger);
  if (anyResult?.url) return anyResult;

  return null;
}

module.exports = {
  chooseNeteaseUrlData,
  fetchNeteaseUrl,
  hasFreeTrialInfo,
  shouldUseCachedUrl,
  getLevelPriorities,
};
