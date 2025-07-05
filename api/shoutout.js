import { kv } from '@vercel/kv';

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const BROADCASTER_USER_ID = process.env.BROADCASTER_USER_ID;
const MODERATOR_USER_ID = process.env.MODERATOR_USER_ID;

const INITIAL_OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN;
const REFRESH_TOKEN = process.env.TWITCH_REFRESH_TOKEN;

const GLOBAL_COOLDOWN = 2 * 60 * 1000 + 15 * 1000; // 2 min 15 sec)
const USER_COOLDOWN = 60 * 60 * 1000;       // 60 minutes in ms

const SHOUTOUT_QUEUE_KEY = 'shoutout_queue';

// Get the latest OAuth token from KV, fallback to env var if not set yet
async function getOAuthToken() {
  const kvToken = await kv.get('twitch_access_token');
  return kvToken || INITIAL_OAUTH_TOKEN;
}

async function setOAuthToken(token) {
  await kv.set('twitch_access_token', token);
}

async function refreshOAuthToken() {
  const url = 'https://id.twitch.tv/oauth2/token';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(url, {
    method: 'POST',
    body: params,
  });
  if (!res.ok) {
    console.error('Failed to refresh Twitch OAuth token', res.status, await res.text());
    throw new Error('Could not refresh Twitch OAuth token');
  }
  const data = await res.json();
  await setOAuthToken(data.access_token);
  if (data.refresh_token) {
    await kv.set('twitch_refresh_token', data.refresh_token);
  }
  return data.access_token;
}

async function twitchApiFetch(url, options = {}, attempt = 0) {
  const MAX_ATTEMPTS = 2;
  let token = await getOAuthToken();
  const headers = {
    ...options.headers,
    'Client-ID': CLIENT_ID,
    'Authorization': `Bearer ${token}`,
  };
  let res = await fetch(url, { ...options, headers });
  if (res.status === 401 && attempt < MAX_ATTEMPTS) {
    token = await refreshOAuthToken();
    const retryHeaders = {
      ...options.headers,
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    };
    res = await fetch(url, { ...options, headers: retryHeaders });
  }
  return res;
}

async function isChannelLive(userId) {
  const url = `https://api.twitch.tv/helix/streams?user_id=${userId}`;
  const res = await twitchApiFetch(url);
  const data = await res.json();
  return data.data && data.data.length > 0;
}

async function getTwitchUser(login) {
  const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`;
  const res = await twitchApiFetch(url);
  const data = await res.json();
  // Debug: log both the response status and the JSON body
  console.log("Twitch API user lookup for login:", login);
  console.log("Response status:", res.status);
  console.log("Response body:", JSON.stringify(data));
  return data.data && data.data[0] ? data.data[0] : null;
}

async function sendShoutout(toBroadcasterId) {
  const url = 'https://api.twitch.tv/helix/chat/shoutouts';
  const res = await twitchApiFetch(url, {
    method: 'POST',
    headers: {
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

// Add user to the shoutout queue
async function enqueueShoutout(userParam) {
  await kv.rpush(SHOUTOUT_QUEUE_KEY, userParam);
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
    res.status(200).send('Invalid channel specified.');
    return;
  }

  // 2. Check if broadcaster is live BEFORE any cooldown or queue logic
  const live = await isChannelLive(BROADCASTER_USER_ID);
  if (!live) {
    // Not live: only return the chat message, do not enqueue
    res.status(200).send(`Go follow ${userParam} at https://twitch.tv/${userParam} ! Do it now!`);
    return;
  }

  // 3. Check cooldowns for API shoutout
  const now = Date.now();
  const lastGlobal = await kv.get('shoutout_last_global') || 0;
  const lastUser = await kv.get(`shoutout_last_${userParam}`) || 0;

  // 4. If not enough time has passed, queue the shoutout for later
  if (now - lastGlobal < GLOBAL_COOLDOWN || now - lastUser < USER_COOLDOWN) {
    // Add to queue only if not already in queue
    const queue = await kv.lrange(SHOUTOUT_QUEUE_KEY, 0, -1) || [];
    if (!queue.includes(userParam)) {
      await enqueueShoutout(userParam);
      console.log(`User ${userParam} added to shoutout queue.`);
    } else {
      console.log(`User ${userParam} is already in the shoutout queue.`);
    }
  } else {
    // 5. Send API shoutout immediately
    const success = await sendShoutout(targetUser.id);
    if (success) {
      await kv.set('shoutout_last_global', now);
      await kv.set(`shoutout_last_${userParam}`, now);
      console.log(`Shoutout sent for user ${userParam}.`);
    }
  }

  // 6. Always return chat message for StreamElements to post
  res.status(200).send(`Go follow ${userParam} at https://twitch.tv/${userParam} ! Do it now!`);
}
