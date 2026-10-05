const assert = require('assert');
const fs = require('fs');
const path = require('path');

const playerPath = path.join(__dirname, 'index.jsx');
const mvPlayerPath = path.join(__dirname, '..', 'MVPlayer', 'index.jsx');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function functionBody(source, name) {
  const start = source.indexOf(`const ${name} = () => {`);
  assert(start >= 0, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(bodyStart + 1, i);
  }
  throw new Error(`Could not parse ${name}`);
}

function testPanelTogglesAreIndependent() {
  const source = read(playerPath);
  const handlers = [
    'handleToggleMV',
    'handleToggleLyrics',
    'handleToggleQueue',
    'handleToggleVisualizer',
  ];

  for (const handler of handlers) {
    const body = functionBody(source, handler);
    assert(
      !/setShow(MV|Lyrics|Visualizer)\(false\)|setQueuePanel\(false\)/.test(body),
      `${handler} should only toggle its own panel`
    );
  }
}

function testMvUploadSyncsCurrentSong() {
  const source = read(mvPlayerPath);
  assert(
    source.includes('updateCurrentSong'),
    'MVPlayer should import updateCurrentSong'
  );
  assert(
    /dispatch\(updateCurrentSong\(\{\s*video_url:\s*uploadedUrl\s*\}\)\)/s.test(source),
    'successful MV upload should update currentSong.video_url in Redux'
  );
}

testPanelTogglesAreIndependent();
testMvUploadSyncsCurrentSong();
console.log('player panel contract tests passed');
