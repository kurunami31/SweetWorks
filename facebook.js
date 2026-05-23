const https = require('https');

const PAGE_ID = 'Sweetworks';
let cache = { posts: [], lastFetch: 0 };
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function graphRequest(path) {
  return new Promise((resolve, reject) => {
    const token = process.env.FACEBOOK_PAGE_TOKEN;
    if (!token) return reject(new Error('FACEBOOK_PAGE_TOKEN not set'));
    const url = `https://graph.facebook.com/v22.0/${path}&access_token=${encodeURIComponent(token)}`;
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
    }).on('error', reject);
  });
}

function formatPost(post) {
  const item = { id: post.id, message: post.message || '', created_time: post.created_time, type: 'text', url: `https://www.facebook.com/${PAGE_ID}/posts/${post.id.split('_')[1]}` };
  if (post.attachments && post.attachments.data[0]) {
    const att = post.attachments.data[0];
    if (att.type === 'video_inline' || att.type === 'video') {
      item.type = 'video';
      item.video_url = att.url || item.url;
      if (att.media && att.media.source) item.video_source = att.media.source;
      item.thumbnail = att.media && att.media.image ? att.media.image.src : null;
    } else if (att.type === 'photo' || (att.subattachments && att.subattachments.data)) {
      item.type = 'album';
      item.images = att.subattachments ? att.subattachments.data.map(s => s.media.image.src) : (att.media && att.media.image ? [att.media.image.src] : []);
      if (att.media && att.media.image && !item.images.length) item.images = [att.media.image.src];
    } else if (att.type === 'share' || att.type === 'link') {
      item.type = 'link';
      item.thumbnail = att.media && att.media.image ? att.media.image.src : null;
      item.link_url = att.url;
    } else if (att.type === 'photo') {
      item.type = 'photo';
      item.images = att.media && att.media.image ? [att.media.image.src] : [];
    }
  }
  if (post.full_picture && !item.thumbnail && !item.images) {
    item.type = 'photo';
    item.images = [post.full_picture];
  }
  return item;
}

async function fetchPosts() {
  const now = Date.now();
  if (cache.posts.length && (now - cache.lastFetch) < CACHE_TTL) return cache.posts;
  const data = await graphRequest(`${PAGE_ID}/posts?fields=message,created_time,full_picture,attachments{type,url,media,subattachments}&limit=50`);
  cache.posts = (data.data || []).map(formatPost);
  cache.lastFetch = now;
  return cache.posts;
}

function clearCache() { cache = { posts: [], lastFetch: 0 }; }

module.exports = { fetchPosts, clearCache };