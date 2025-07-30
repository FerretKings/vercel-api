const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const url = 'https://drive.google.com/uc?export=download&id=1YAfI5lxaIwmPDtdhn1eN_WPboppGalyr';
const dest = path.join(process.cwd(), 'aircraft_chat.db');

if (fs.existsSync(dest)) {
  console.log('aircraft_chat.db already exists, skipping download.');
  process.exit(0);
}

console.log('Downloading aircraft_chat.db from Google Drive...');

fetch(url)
  .then(res => {
    if (!res.ok) {
      console.error(`Download failed with status ${res.status}`);
      process.exit(1);
    }
    const fileStream = fs.createWriteStream(dest);
    res.body.pipe(fileStream);
    res.body.on('error', err => {
      console.error('Failed to download DB:', err.message);
      process.exit(1);
    });
    fileStream.on('finish', () => {
      console.log('Downloaded aircraft_chat.db');
    });
  })
  .catch(err => {
    console.error('Failed to download DB:', err.message);
    process.exit(1);
  });
