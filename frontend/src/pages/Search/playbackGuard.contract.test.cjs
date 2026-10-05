const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'index.jsx'), 'utf8');

assert(
  source.includes('await musicSourceAPI.getUrl(song.id)'),
  'Search playback should preflight the online song URL before dispatching playSong'
);

assert(
  !source.includes("song.source !== 'netease'"),
  'Search playback should not skip URL preflight for NetEase songs'
);

console.log('search playback guard contract passed');
