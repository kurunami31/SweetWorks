const https = require('https');

let cache = { posts: [], pageInfo: null, lastFetch: 0 };
const CACHE_TTL = 10 * 60 * 1000;

function graphRequest(urlPath) {
  return new Promise((resolve, reject) => {
    const token = process.env.FACEBOOK_PAGE_TOKEN;
    if (!token) return reject(new Error('FACEBOOK_PAGE_TOKEN not set'));
    const url = `https://graph.facebook.com/v21.0/${urlPath}&access_token=${encodeURIComponent(token)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json);
        } catch (e) { reject(e); }
      });
    }).on('error', (e) => reject(new Error('HTTP error: ' + e.message)));
  });
}

async function verifyToken() {
  const info = await graphRequest('me?fields=id,name');
  return { id: info.id, name: info.name };
}

async function fetchPosts() {
  const now = Date.now();
  if (cache.posts.length && (now - cache.lastFetch) < CACHE_TTL) return cache.posts;

  let pageId;
  if (cache.pageInfo) {
    pageId = cache.pageInfo.id;
  } else {
    const info = await verifyToken();
    cache.pageInfo = { id: info.id, name: info.name };
    pageId = info.id;
  }

  const raw = await graphRequest(`${pageId}/posts?fields=message,created_time,full_picture&limit=50`);
  cache.posts = (raw.data || []).map(p => {
    const parts = (p.id || '').split('_');
    return {
      id: p.id,
      message: p.message || '',
      created_time: p.created_time,
      type: p.full_picture ? 'photo' : 'text',
      url: parts[1] ? `https://www.facebook.com/permalink.php?story_fbid=${parts[1]}` : '#',
      images: p.full_picture ? [p.full_picture] : [],
    };
  });
  cache.lastFetch = now;
  return cache.posts;
}

function getPageInfo() {
  return cache.pageInfo || null;
}

function clearCache() { cache = { posts: [], pageInfo: null, lastFetch: 0 }; }

module.exports = { fetchPosts, getPageInfo, clearCache };