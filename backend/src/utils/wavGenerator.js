const fs = require('fs');
const path = require('path');

/**
 * Generate a WAV audio file with musical progression.
 * @param {string} filePath - Output file path
 * @param {number} songIndex - Index of the song (affects base frequency)
 * @param {number} totalSongs - Total number of songs
 * @param {number} durationSec - Duration in seconds (default 60)
 */
function generateWavFile(filePath, songIndex, totalSongs, durationSec = 60) {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate * durationSec;

  // Each song has a unique musical key
  const baseFreq = 220 + (songIndex / totalSongs) * 300;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buf = Buffer.alloc(totalSize);

  // WAV Header
  let offset = 0;
  buf.write('RIFF', offset);              offset += 4;
  buf.writeUInt32LE(totalSize - 8, offset); offset += 4;
  buf.write('WAVE', offset);              offset += 4;
  buf.write('fmt ', offset);              offset += 4;
  buf.writeUInt32LE(16, offset);          offset += 4;
  buf.writeUInt16LE(1, offset);           offset += 2; // PCM
  buf.writeUInt16LE(numChannels, offset); offset += 2;
  buf.writeUInt32LE(sampleRate, offset);   offset += 4;
  buf.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), offset); offset += 4;
  buf.writeUInt16LE(numChannels * (bitsPerSample / 8), offset); offset += 2;
  buf.writeUInt16LE(bitsPerSample, offset); offset += 2;
  buf.write('data', offset);              offset += 4;
  buf.writeUInt32LE(dataSize, offset);    offset += 4;

  // Musical scales - pick different scale patterns per song
  const scales = [
    [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2],    // major
    [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 16 / 9, 2],    // natural minor
    [1, 5 / 4, 3 / 2, 7 / 4, 2],                            // pentatonic major
    [1, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 2],                     // pentatonic minor
    [1, 16 / 15, 9 / 8, 6 / 5, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 2], // chromatic-ish
    [1, 7 / 6, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 7 / 4, 2],      // mixolydian
    [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5, 2],      // dorian
    [1, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2],             // lydian
  ];

  // Rhythmic patterns (beats at 120 bpm = 0.5 sec per beat)
  const rhythmicPatterns = [
    [0, 1, 2, 3],                      // steady quarter notes
    [0, 1.5, 2, 3.5],                  // syncopated
    [0, 0.75, 1.5, 2, 2.75, 3.5],      // eighth feel
    [0, 1, 2, 2.5, 3.5],               // upbeat emphasis
    [0, 0.67, 1.33, 2, 2.67, 3.33],    // triplet feel
  ];

  // Chord progressions (multiples of baseFreq)
  const chordProgressions = [
    [1, 5 / 4, 3 / 2, 4 / 3],          // I - III - V - IV
    [1, 4 / 3, 3 / 2, 1],              // I - IV - V - I
    [1, 3 / 2, 4 / 3, 5 / 3],          // I - V - IV - vi
    [1, 3 / 2, 4 / 3, 9 / 8],          // I - V - IV - II
  ];

  const scale = scales[songIndex % scales.length];
  const rhythm = rhythmicPatterns[songIndex % rhythmicPatterns.length];
  const chords = chordProgressions[(Math.floor(songIndex / 3)) % chordProgressions.length];

  // Song structure: intro(10s) -> verse(20s) -> chorus(15s) -> verse(15s) -> fade
  const sections = [
    { startSec: 0, endSec: 10, energy: 0.3, noteSpeed: 1.0 },       // intro
    { startSec: 10, endSec: 30, energy: 0.5, noteSpeed: 1.5 },      // verse
    { startSec: 30, endSec: 45, energy: 0.8, noteSpeed: 2.0 },      // chorus
    { startSec: 45, endSec: 55, energy: 0.4, noteSpeed: 1.0 },      // outro
    { startSec: 55, endSec: durationSec, energy: 0, noteSpeed: 0 },  // fade to silence
  ];

  const beatDuration = 0.5; // 120 bpm
  let sectionIdx = 0;
  let prevNoteScaleIdx = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sec = t;

    // Progress to next section
    while (sectionIdx < sections.length - 1 && sec >= sections[sectionIdx + 1].startSec) {
      sectionIdx++;
    }
    const section = sections[sectionIdx];

    // Global fade envelope
    let globalEnv = 1;
    if (sec < 0.5) globalEnv = sec / 0.5;               // initial fade in
    else if (sec > durationSec - 2) globalEnv = (durationSec - sec) / 2; // final fade out

    const energy = section.energy * globalEnv;
    if (energy <= 0) {
      buf.writeInt16LE(0, offset + i * 2);
      continue;
    }

    // Determine current beat position for rhythm
    const beatPos = (sec % (beatDuration * 4)) / beatDuration; // 0-4 per bar
    const beatIdx = Math.floor(beatPos);

    // Find closest rhythmic beat
    const isBeat = rhythm.some(r => Math.abs(beatPos - r) < 0.08);
    const nearBeat = rhythm.some(r => Math.abs(beatPos - r) < 0.2);

    // Melody note selection - walk the scale
    const melodyLen = scale.length;
    const noteChangeInterval = 0.25 / section.noteSpeed;
    const melodyNoteIdx = Math.floor((sec / noteChangeInterval) + songIndex * 0.37) % melodyLen;

    // Chord note selection
    const chordIdx = Math.floor(beatPos) % chords.length;
    const chordRoot = chords[chordIdx];

    const melodyFreq = baseFreq * scale[Math.abs(melodyNoteIdx) % melodyLen];
    const chordFreq = baseFreq * chordRoot;
    const bassFreq = baseFreq * chordRoot * 0.5;
    const harmonyFreq = baseFreq * scale[(melodyNoteIdx + 2) % melodyLen];

    // Note envelope within each note
    const notePhase = (sec * section.noteSpeed) % (noteChangeInterval * 4) / (noteChangeInterval * 4);
    let noteEnv;
    if (notePhase < 0.1) noteEnv = notePhase / 0.1;
    else if (notePhase > 0.85) noteEnv = (1 - notePhase) / 0.15;
    else noteEnv = 0.8;

    // Generate audio components
    const sine = Math.sin(2 * Math.PI * melodyFreq * t) * 0.4;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * chordFreq * t)) * 0.25;
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.2;
    const harm = Math.sin(2 * Math.PI * harmonyFreq * t + Math.sin(2 * Math.PI * 2 * t) * 0.5) * 0.15;
    const squareLike = Math.sign(Math.sin(2 * Math.PI * melodyFreq * 0.5 * t)) * 0.1;

    // Percussion (kick on beats)
    let perc = 0;
    if (isBeat && sec > 5 && sec < durationSec - 3) {
      const kickFreq = 60 + (1 - Math.min((sec % beatDuration) / 0.08, 1)) * 80;
      const kickEnv = Math.exp(-(sec % beatDuration) * 30);
      perc = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * 0.35;
    }

    // Hi-hat like noise on off-beats
    if (beatPos % 0.5 < 0.04 && !isBeat && sec > 10 && sec < durationSec - 3) {
      perc += (Math.random() * 2 - 1) * 0.08;
    }

    const sample = (sine + tri + bass + harm + squareLike + perc) * energy * noteEnv * 0.85;

    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buf.writeInt16LE(intSample, offset + i * 2);
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buf);
}

module.exports = { generateWavFile };
