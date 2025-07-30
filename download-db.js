const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://drive.google.com/uc?export=download&id=1YAfI5lxaIwmPDtdhn1eN_WPboppGalyr';
const dest = path.join(process.cwd(), 'aircraft_chat.db');

if (fs.existsSync(dest)) {
  console.log('aircraft_chat.db already exists, skipping download.');
  process.exit(0);
}

console.log('Downloading aircraft_chat.db from Google Drive...');
const file = fs.createWriteStream(dest);

https.get(url, response => {
  if (response.statusCode !== 200) {
    console.error(`Download failed with status ${response.statusCode}`);
    process.exit(1);
  }
  response.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Downloaded aircraft_chat.db');
  });
}).on('error', err => {
  fs.unlink(dest, () => {});
  console.error('Failed to download DB:', err.message);
  process.exit(1);
});
