import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const { topic } = req.query;
  const filePath = path.join(process.cwd(), 'help_topics.json');
  const file = fs.readFileSync(filePath, 'utf8');
  const topics = JSON.parse(file);

  if (!topic) {
    // List available topics
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
