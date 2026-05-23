const https = require('https');

let cache = { posts: [], lastFetch: 0, pageInfo: null };
const CACHE_TTL = 10 * 60 * 1000;

function graphRequest(path) {
  return new Promise((resolve, reject) => {
    const token = process.env.FACEBOOK_PAGE_TOKEN;
    if (!token) return reject(new Error('FACEBOOK_PAGE_TOKEN not set'));
    const tokenEncoded = encodeURIComponent(token);
    const url = `https://graph.facebook.com/v22.0/${path.includes('?') ? path + '&' : path + '?'}access_token=${tokenEncoded}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json);
        } catch (e) { reject(new Error('Parse error: ' + e.message + ' | Raw: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function formatPost(post) {
  const parts = post.id ? post.id.split('_') : [];
  const shortId = parts[1] || parts[0] || '';
  return {
    id: post.id,
    message: post.message || '',
    created_time: post.created_time,
    type: post.full_picture ? 'photo' : 'text',
    url: shortId ? `https://www.facebook.com/permalink.php?story_fbid=${shortId}` : '#',
    images: post.full_picture ? [post.full_picture] : [],
    thumbnail: null
  };
}

async function fetchPosts() {
  const now = Date.now();
  if (cache.posts.length && (now - cache.lastFetch) < CACHE_TTL) return cache.posts;

  if (!cache.pageInfo) {
    cache.pageInfo = await graphRequest('me?fields=id,name');
  }

  const raw = await graphRequest(`${cache.pageInfo.id}/posts?fields=message,created_time,full_picture&limit=50`);
  cache.posts = (raw.data || []).map(formatPost);
  cache.lastFetch = now;
  return cache.posts;
}

function getPageInfo() { return cache.pageInfo; }
function clearCache() { cache = { posts: [], lastFetch: 0, pageInfo: null }; }

module.exports = { fetchPosts, clearCache, getPageInfo };