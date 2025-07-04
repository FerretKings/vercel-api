const fetch = require('node-fetch');

async function getTwitchAppAccessToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const url = `https://id.twitch.tv/oauth2/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const resp = await fetch(`${url}?${params.toString()}`, { method: 'POST' });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Could not get Twitch app token: " + JSON.stringify(data));
  return data.access_token;
}

async function isChannelLive(userId, accessToken, clientId) {
  const url = `https://api.twitch.tv/helix/streams?user_id=${userId}`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Client-ID': clientId,
    }
  });
  const data = await resp.json();
  return data.data && data.data.length > 0;
}

async function updateCronJobOrgJob(enabled) {
  const jobId = process.env.CRON_JOB_ORG_JOB_ID;
  const apiKey = process.env.CRON_JOB_ORG_API_KEY;
  const url = `https://api.cron-job.org/jobs/${jobId}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ job: { enabled } })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to update cron job: ${resp.status} ${text}`);
  }
}

async function main() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const userId = process.env.TWITCH_USER_ID;
  const accessToken = await getTwitchAppAccessToken();
  const live = await isChannelLive(userId, accessToken, clientId);

  console.log(`Channel is ${live ? 'LIVE' : 'OFFLINE'}`);

  await updateCronJobOrgJob(live);
  console.log(`cron-job.org job has been ${live ? 'ENABLED' : 'DISABLED'}.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
