const path = require('path');
const fs = require('fs');
const { generateWavFile } = require('../utils/wavGenerator');
const { getNextSongId } = require('../utils/data');

const songs = [
  { title: 'Sunset Dreams', artist: 'Ambient Waves', album: 'Calm Waters', duration: 212, genre: 'Electronic', features: { energy: 0.3, mood: 'calm', tempo: 80 }, play_count: 1520,
    lyrics: `[00:10.50]Golden sky is fading slow\n[00:15.20]Waves are dancing far below\n[00:20.30]Feel the warmth upon my skin\n[00:25.10]Let the evening light sink in\n[00:30.50]Sunset dreams they carry me\n[00:35.00]Far across the endless sea\n[00:39.80]Close my eyes and drift away\n[00:44.50]Until the night becomes the day\n[00:50.00]Colors bleed from red to blue\n[00:54.80]Every thought leads back to you` },
  { title: 'Urban Rhythm', artist: 'Beat Maker', album: 'City Lights', duration: 198, genre: 'Hip-Hop', features: { energy: 0.8, mood: 'energetic', tempo: 120 }, play_count: 2340,
    lyrics: `[00:08.00]Step into the city feel the beat\n[00:12.50]Concrete jungle underneath my feet\n[00:17.00]Every corner got a story to tell\n[00:21.50]Living fast breaking out of this shell\n[00:26.00]Urban rhythm running through my veins\n[00:30.50]No more limits no more chains\n[00:35.00]Lights are flashing people passing by\n[00:39.50]Raise your hands up reach into the sky\n[00:44.00]This is our time this is our sound\n[00:48.50]City never sleeps we run this town` },
  { title: 'Morning Coffee', artist: 'Jazz Trio', album: 'Cafe Sessions', duration: 245, genre: 'Jazz', features: { energy: 0.4, mood: 'relaxed', tempo: 90 }, play_count: 980,
    lyrics: `[00:10.00]Early morning sun peeks through\n[00:15.00]Steam is rising fresh and new\n[00:20.00]Gentle jazz upon the air\n[00:25.00]Not a worry not a care\n[00:30.00]Pour another cup for two\n[00:35.00]Morning coffee me and you\n[00:40.00]Saxophone is playing low\n[00:45.00]Watch the world go by so slow\n[00:50.00]Simple moments feel so true\n[00:55.00]Morning coffee lovely view` },
  { title: 'Summer Breeze', artist: 'Tropical Sound', album: 'Island Vibes', duration: 186, genre: 'Pop', features: { energy: 0.6, mood: 'happy', tempo: 105 }, play_count: 3100,
    lyrics: `[00:08.00]Palm trees swaying side to side\n[00:12.00]Ocean calling come inside\n[00:16.00]Sand between my toes so warm\n[00:20.00]Dancing in a summer storm\n[00:24.00]Summer breeze blow through my hair\n[00:28.00]Feel the love is everywhere\n[00:32.00]Every moment feels so right\n[00:36.00]Underneath the golden light\n[00:40.00]Summer breeze you set me free\n[00:44.00]This is where I want to be` },
  { title: 'Midnight Blues', artist: 'Guitar Soul', album: 'Dark Hours', duration: 275, genre: 'Blues', features: { energy: 0.5, mood: 'melancholy', tempo: 70 }, play_count: 1750,
    lyrics: `[00:12.00]It's past midnight and I'm wide awake\n[00:18.00]Got these blues that I just can't shake\n[00:24.00]Six string crying soft and low\n[00:30.00]Telling stories you already know\n[00:36.00]Midnight blues they come around\n[00:42.00]When there's nobody else in town\n[00:48.00]Smoke and whiskey ease the pain\n[00:54.00]But tomorrow it starts again\n[01:00.00]Play that guitar soft and slow\n[01:06.00]Let the midnight feelings flow` },
  { title: 'Electric Storm', artist: 'Synth Wave', album: 'Neon Nights', duration: 190, genre: 'Rock', features: { energy: 0.9, mood: 'intense', tempo: 140 }, play_count: 4200,
    lyrics: `[00:06.00]Thunder rolling through the night\n[00:10.00]Neon flashes blinding light\n[00:14.00]Heart is racing feel the power\n[00:18.00]This is our electric hour\n[00:22.00]Riding through the electric storm\n[00:26.00]Breaking free from every norm\n[00:30.00]Lightning strikes and shakes the ground\n[00:34.00]Hear the revolution sound\n[00:38.00]We are wild we are the storm\n[00:42.00]In this chaos we are born` },
  { title: 'Peaceful Garden', artist: 'Nature Sounds', album: 'Zen Moments', duration: 300, genre: 'Ambient', features: { energy: 0.1, mood: 'peaceful', tempo: 60 }, play_count: 890,
    lyrics: `[00:15.00]Silence speaks in gentle tones\n[00:22.00]Wind is whispering through the stones\n[00:29.00]Blossoms open to the light\n[00:36.00]Everything just feels so right\n[00:43.00]In this garden find your peace\n[00:50.00]Let the inner chatter cease\n[00:57.00]Breathe in deep and let it go\n[01:04.00]Feel the quiet river flow\n[01:11.00]Nature holds you safe and warm\n[01:18.00]Sheltered from the raging storm` },
  { title: 'Dance Floor', artist: 'DJ Electra', album: 'Club Mix', duration: 210, genre: 'EDM', features: { energy: 0.95, mood: 'party', tempo: 128 }, play_count: 5600,
    lyrics: `[00:05.00]Drop the beat and feel the bass\n[00:09.00]Everybody find your space\n[00:13.00]Hands up high don't touch the ground\n[00:17.00]Move your body to the sound\n[00:21.00]On the dance floor lose control\n[00:25.00]Let the rhythm heal your soul\n[00:29.00]Lights are spinning round and round\n[00:33.00]We're the hottest crew in town\n[00:37.00]Jump jump let the music play\n[00:41.00]Dancing till the break of day` },
  { title: 'Classical Sonata', artist: 'Vienna Orchestra', album: 'Timeless', duration: 265, genre: 'Classical', features: { energy: 0.4, mood: 'elegant', tempo: 85 }, play_count: 1230,
    lyrics: `[00:12.00]Strings are singing sweet and clear\n[00:19.00]Melodies from yesteryear\n[00:26.00]Every note a masterpiece\n[00:33.00]Bringing troubled hearts to peace\n[00:40.00]Timeless beauty fills the hall\n[00:47.00]Echoes answer every call\n[00:54.00]Piano dances soft and true\n[01:01.00]Painting skies of deepest blue\n[01:08.00]Close your eyes and let it soar\n[01:15.00]This is what the soul is for` },
  { title: 'R&B Groove', artist: 'Smooth Voice', album: 'Velvet Touch', duration: 220, genre: 'RnB', features: { energy: 0.6, mood: 'romantic', tempo: 95 }, play_count: 2890,
    lyrics: `[00:08.00]Candles burning soft and low\n[00:13.00]Feel the groove begin to flow\n[00:18.00]Your body close against the beat\n[00:23.00]Moving slowly on repeat\n[00:28.00]Velvet touch and satin skies\n[00:33.00]Looking deep into your eyes\n[00:38.00]Every heartbeat sings your name\n[00:43.00]Nothing else will be the same\n[00:48.00]Let me hold you through the night\n[00:53.00]Everything will be alright` },
  { title: 'Rock Anthem', artist: 'Thunder Band', album: 'Loudest', duration: 228, genre: 'Rock', features: { energy: 0.85, mood: 'powerful', tempo: 135 }, play_count: 3780,
    lyrics: `[00:06.00]Stand up tall and make some noise\n[00:10.00]Raise your voice with all the boys\n[00:14.00]Guitars screaming through the amp\n[00:18.00]Crowd is jumping like a champ\n[00:22.00]This is our rock anthem now\n[00:26.00]Take a bow and show them how\n[00:30.00]We won't back down we won't fade\n[00:34.00]History is being made\n[00:38.00]Sing it loud sing it proud\n[00:42.00]Rock and roll above the crowd` },
  { title: 'Acoustic Sunrise', artist: 'Folk Singer', album: 'Wooden Guitar', duration: 195, genre: 'Folk', features: { energy: 0.3, mood: 'warm', tempo: 100 }, play_count: 1560,
    lyrics: `[00:10.00]First light creeping through the trees\n[00:15.00]Dewdrops falling with the breeze\n[00:20.00]Wooden guitar in my hands\n[00:25.00]Playing songs that understand\n[00:30.00]Acoustic sunrise soft and warm\n[00:35.00]Shelter from the coming storm\n[00:40.00]Simple chords and honest words\n[00:45.00]Singing with the morning birds\n[00:50.00]Life is good and life is kind\n[00:55.00]Leave your troubles far behind` },
  { title: 'Latin Fiesta', artist: 'Salsa Kings', album: 'Fuego', duration: 200, genre: 'Latin', features: { energy: 0.8, mood: 'festive', tempo: 115 }, play_count: 2100,
    lyrics: `[00:05.00]Trumpets calling come alive\n[00:09.00]Feel the rhythm start to thrive\n[00:13.00]Hips are moving left to right\n[00:17.00]Dancing underneath the light\n[00:21.00]Fiesta let the music play\n[00:25.00]Celebrate the latin way\n[00:29.00]Spinning round and round we go\n[00:33.00]Putting on a crazy show\n[00:37.00]Viva la fiesta tonight\n[00:41.00]Everything just feels so right` },
  { title: 'Lo-Fi Study', artist: 'Chill Hop', album: 'Beats to Study', duration: 250, genre: 'Lo-Fi', features: { energy: 0.2, mood: 'chill', tempo: 75 }, play_count: 6400,
    lyrics: `[00:12.00]Headphones on the world fades out\n[00:18.00]Soft beats help me think about\n[00:24.00]Pages turning one by one\n[00:30.00]Got my coffee study's on\n[00:36.00]Lo-fi beats to help me through\n[00:42.00]Every chapter something new\n[00:48.00]Raindrops tapping on the glass\n[00:54.00]Time is moving not too fast\n[01:00.00]Steady rhythm keeps me calm\n[01:06.00]Knowledge resting in my palm` },
  { title: 'Pop Star', artist: 'Crystal Voice', album: 'Shine Bright', duration: 205, genre: 'Pop', features: { energy: 0.7, mood: 'upbeat', tempo: 110 }, play_count: 4560,
    lyrics: `[00:05.00]Woke up feeling like a star today\n[00:09.00]Nothing's gonna stand in my way\n[00:13.00]Got my dreams and I'm ready to fly\n[00:17.00]Reaching up to touch the sky\n[00:21.00]Shine bright like a diamond light\n[00:25.00]Dancing through the starry night\n[00:29.00]Everybody sing along\n[00:33.00]This is our favorite song\n[00:37.00]Never gonna dim my glow\n[00:41.00]Watch me put on quite a show` },
  { title: 'Dream Walker', artist: 'Starlight', album: 'Galaxy', duration: 232, genre: 'Electronic', features: { energy: 0.5, mood: 'chill', tempo: 95 }, play_count: 1890,
    lyrics: `[00:10.00]Walking through a world of dreams\n[00:15.00]Nothing is quite what it seems\n[00:20.00]Stars are falling all around\n[00:25.00]Feet don't even touch the ground\n[00:30.00]Dream walker floating through the night\n[00:35.00]Guided by celestial light\n[00:40.00]Wandering the milky way\n[00:45.00]Where the silent planets play\n[00:50.00]Wake me when the journey ends\n[00:55.00]Until then we're cosmic friends` },
];

async function initSeedData(pool) {
  const [rows] = await pool.query('SELECT COUNT(*) as count FROM songs');
  if (rows[0].count > 0) {
    console.log('Songs table already has data, skipping seed');
    return;
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  console.log('Generating local audio files for seed data...');

  const baseId = await getNextSongId(pool);
  const values = songs.map((song, i) => {
    const filename = `seed_song_${i + 1}.wav`;
    const filePath = path.join(uploadsDir, filename);
    generateWavFile(filePath, i, songs.length, song.duration);

    return [
      String(Number(baseId) + i),
      song.title,
      song.artist,
      song.album,
      song.duration,
      song.genre,
      '/uploads/' + filename,
      `https://picsum.photos/seed/song${i + 1}/300/300`,
      JSON.stringify(song.features),
      song.play_count,
      null,          // video_url
      song.lyrics,   // lyrics
    ];
  });

  const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');

  await pool.query(
    `INSERT INTO songs (id, title, artist, album, duration, genre, audio_url, cover_url, features, play_count, video_url, lyrics)
     VALUES ${placeholders}`,
    values.flat()
  );

  console.log('Seed data inserted successfully (' + songs.length + ' songs, with lyrics)');
}

module.exports = { initSeedData, songs };
