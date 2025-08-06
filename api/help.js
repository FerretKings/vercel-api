import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  let topic = req.query.topic;

  // If topic is missing, empty, or only whitespace, treat as "no topic"
  if (typeof topic !== 'string' || !topic.trim()) {
    // List available topics
    const filePath = path.join(process.cwd(), 'help_topics.json');
    const file = fs.readFileSync(filePath, 'utf8');
    const topics = JSON.parse(file);
    const available = Object.keys(topics).join(', ');
    return res.status(200).send(
      `You can type !help <topic> to get help with the following commands: ${available}`
    );
  }

  // Proceed with lookup for a valid topic
  const filePath = path.join(process.cwd(), 'help_topics.json');
  const file = fs.readFileSync(filePath, 'utf8');
  const topics = JSON.parse(file);

  const key = topic.toLowerCase();
  if (topics[key]) {
    return res.status(200).send(topics[key]);
  } else {
    return res.status(404).send(
      `Sorry, I don't have help for "${topic}". Try one of: ${Object.keys(topics).join(', ')}`
    );
  }
}
