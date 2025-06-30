import { kv } from '@vercel/kv';

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN;
const BROADCASTER_USER_ID = process.env.BROADCASTER_USER_ID;
const MODERATOR_USER_ID = process.env.MODERATOR_USER_ID;

const GLOBAL_COOLDOWN = 2 * 60 * 1000; // 2 minutes in ms
const USER_COOLDOWN = 60 * 60 * 1000;  // 60 minutes in ms

// Check if the broadcaster is live on Twitch
async function isChannelLive(userId) {
  const url = `https://api.twitch.tv/helix/streams?user_id=${userId}`;
  const res = await fetch(url, {
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${OAUTH_TOKEN}`,
    }
  });
  const data = await res.json();
  return data.data && data.data.length > 0;
}

// Fetch Twitch user info
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

// Send a shoutout via Twitch API
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

  // 2. Always send the chat message for StreamElements to post
  // (This is returned at the end, even if the API shoutout doesn't happen)

  // 3. Check cooldowns for API shoutout
  const now = Date.now();
  const lastGlobal = await kv.get('shoutout_last_global') || 0;
  const lastUser = await kv.get(`shoutout_last_${userParam}`) || 0;

  // 4. If not enough time has passed, do not send a shoutout
  let triedApiShoutout = false;
  if (now - lastGlobal >= GLOBAL_COOLDOWN && now - lastUser >= USER_COOLDOWN) {
    // 5. Check if broadcaster is live before sending API shoutout
    const live = await isChannelLive(BROADCASTER_USER_ID);
    if (live) {
      const success = await sendShoutout(targetId);
      if (success) {
        await kv.set('shoutout_last_global', now);
        await kv.set(`shoutout_last_${userParam}`, now);
        triedApiShoutout = true;
      }
    }
    // If not live, do nothing (do not attempt or queue API shoutout)
  }
  // If on cooldown, do nothing (do not queue API shoutout)

  // 6. Always return chat message for StreamElements to post
  res.status(200).send(`Go follow ${userParam} at https://twitch.tv/${userParam} ! Do it now!`);
}
