import { kv } from '@vercel/kv';

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN;
const BROADCASTER_USER_ID = process.env.BROADCASTER_USER_ID;
const MODERATOR_USER_ID = process.env.MODERATOR_USER_ID;

const GLOBAL_COOLDOWN = 2 * 60 * 1000; // 2 minutes in ms
const USER_COOLDOWN = 60 * 60 * 1000;  // 60 minutes in ms

// Helper to fetch Twitch user by login name
async function getTwitchUser(login) {
  const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`;
  const res = await fetch(url, {
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${OAUTH_TOKEN}`,
    }
  });
  const data = await res.json();
  return data.data && data.data[0] ? data.data[0] : null;
}

// Helper to send the shoutout via Twitch API
async function sendShoutout(toBroadcasterId) {
  const url = 'https://api.twitch.tv/helix/chat/shoutouts';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${OAUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from_broadcaster_id: BROADCASTER_USER_ID,
      to_broadcaster_id: toBroadcasterId,
      moderator_id: MODERATOR_USER_ID,
    })
  });
  return res.ok;
}

// Helper to queue shoutout if rate-limited
async function queueShoutout(targetLogin, targetId) {
  // Get the current queue
  const queueKey = `shoutout_queue`;
  let queue = (await kv.get(queueKey)) || [];
  if (!Array.isArray(queue)) queue = [];
  // Add new entry
  queue.push({ login: targetLogin, id: targetId, requestedAt: Date.now() });
  await kv.set(queueKey, queue);
}

// Background: process the API shoutout queue
async function processQueue() {
  const queueKey = `shoutout_queue`;
  let queue = (await kv.get(queueKey)) || [];
  if (!Array.isArray(queue)) queue = [];
  if (queue.length === 0) return;

  // Check cooldowns
  const lastGlobal = await kv.get('shoutout_last_global') || 0;
  const now = Date.now();
  if (now - lastGlobal < GLOBAL_COOLDOWN) return; // Still cooling down globally

  const next = queue.shift();
  // Check per-user cooldown
  const userCooldownKey = `shoutout_last_${next.login}`;
  const lastUser = await kv.get(userCooldownKey) || 0;
  if (now - lastUser < USER_COOLDOWN) {
    // Too soon for this user, skip it for now (re-add to end of queue)
    queue.push(next);
    await kv.set(queueKey, queue);
    return;
  }

  // Send shoutout
  const success = await sendShoutout(next.id);
  if (success) {
    await kv.set('shoutout_last_global', now);
    await kv.set(userCooldownKey, now);
  }
  // Remove processed entry from queue
  await kv.set(queueKey, queue);
}

// Run processQueue in the background (fire and forget, not awaited)
// NOTE: This is best-effort. Vercel functions are stateless, so background work is "fire and forget".
function processQueueInBackground() {
  setTimeout(processQueue, 1000); // Defer so response isn't delayed
}

export default async function handler(req, res) {
  const userParam = (req.query.user || '').replace('@','').trim().toLowerCase();
  if (!userParam) {
    res.status(400).send('Missing user parameter');
    return;
  }

  // 1. Validate Twitch username
  const targetUser = await getTwitchUser(userParam);
  if (!targetUser) {
    res.status(200).send(`Invalid channel specified.`);
    return;
  }
  const targetId = targetUser.id;

  // 2. Start processing the queue in the background
  processQueueInBackground();

  // 3. Check cooldowns for API shoutout
  const now = Date.now();
  const lastGlobal = await kv.get('shoutout_last_global') || 0;
  const lastUser = await kv.get(`shoutout_last_${userParam}`) || 0;

  let apiQueued = false;
  if (now - lastGlobal >= GLOBAL_COOLDOWN && now - lastUser >= USER_COOLDOWN) {
    // Can send API shoutout now
    const success = await sendShoutout(targetId);
    if (success) {
      await kv.set('shoutout_last_global', now);
      await kv.set(`shoutout_last_${userParam}`, now);
    } else {
      // If API call fails, queue it just in case
      await queueShoutout(userParam, targetId);
      apiQueued = true;
    }
  } else {
    // Queue the API shoutout for later
    await queueShoutout(userParam, targetId);
    apiQueued = true;
  }

  // 4. Always return chat message for StreamElements to post
  res.status(200).send(`Go follow ${userParam} at https://twitch.tv/${userParam} ! Do it now!`);
}
