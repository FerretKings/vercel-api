import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Ping Upstash: this harmless write keeps the DB "active"
  await kv.set('upstash_keepalive', Date.now());
  res.status(200).send('Upstash DB keepalive set!');
}
