import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Accept both "?topic=reg" and "?reg"
  let topic = req.query.topic;
  if (!topic) {
    // If any other key is present (like "?reg"), use its key name as topic
    const keys = Object.keys(req.query);
    if (keys.length > 0) topic = keys[0];
  }

  const filePath = path.join(process.cwd(), 'help_topics.json');
  const file = fs.readFileSync(filePath, 'utf8');
  const topics = JSON.parse(file);

  if (!topic || topic.trim() === "") {
    const available = Object.keys(topics).join(', ');
    return res.status(200).send(
      `You can type !help <topic> to get help with the following commands: ${available}`
    );
  }

  const key = topic.toLowerCase();
  if (topics[key]) {
    return res.status(200).send(topics[key]);
  } else {
    return res.status(404).send(
      `Sorry, I don't have help for "${topic}". Try one of: ${Object.keys(topics).join(', ')}`
    );
  }
}
