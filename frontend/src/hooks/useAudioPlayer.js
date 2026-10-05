import { useRef, useEffect, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setCurrentTime,
  setDuration,
  setPlaying,
  nextSong,
  playSong,
  setVolume,
  setPreviewClipDetected,
} from '../store/slices/playerSlice';
import { resolveMediaUrl, usersAPI } from '../services/api';
import { musicSourceAPI } from '../services/api';

export const useAudioPlayer = () => {
  const audioRef = useRef(null);        // main <audio>
  const preloadRef = useRef(null);       // preload <audio> for next song
  const analyserRef = useRef(null);      // exposed for optional Visualizer
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);    // MediaElementAudioSourceNode (created once)
  const visualizerSetupRef = useRef(false);
  const [analyserVersion, setAnalyserVersion] = useState(0);
  const playAttemptRef = useRef(0);        // tracks play attempts to avoid stale rejections
  const dispatch = useDispatch();
  const currentSong = useSelector((s) => s.player.currentSong);
  const isPlaying = useSelector((s) => s.player.isPlaying);
  const volume = useSelector((s) => s.player.volume);
  const playMode = useSelector((s) => s.player.playMode);
  const audioQuality = useSelector((s) => s.player.audioQuality);
  const { isLoggedIn } = useSelector((s) => s.user);
  const queue = useSelector((s) => s.player.queue);
  const queueIndex = useSelector((s) => s.player.queueIndex);

  const currentSongRef = useRef(currentSong);
  const isPlayingRef = useRef(isPlaying);
  const isLoggedInRef = useRef(isLoggedIn);
  const lastHistorySongIdRef = useRef(null);
  const lastPreviewSongIdRef = useRef(null); // dedupe preview notifications
  const songHasPlayedRef = useRef(false);     // track if current song actually played audio
  const playModeRef = useRef(playMode);
  const audioQualityRef = useRef(audioQuality);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  currentSongRef.current = currentSong;
  isPlayingRef.current = isPlaying;
  isLoggedInRef.current = isLoggedIn;
  playModeRef.current = playMode;
  audioQualityRef.current = audioQuality;
  queueRef.current = queue;
  queueIndexRef.current = queueIndex;

  // Reset the preview-dedup ref whenever the song actually changes
  // (so a new instance of the same song re-detects correctly)
  useEffect(() => {
    if (currentSong?.id) lastPreviewSongIdRef.current = null;
  }, [currentSong?.id]);

  // Helper: is this song served by the online music source (Netease/QQ/Kugou)?
  const isOnlineRef = (song) =>
    song && (song.source === 'netease' || song.source === 'qqmusic' || song.source === 'kugou' || song.source === 'kuwo');

  /* ── Preload next song in background ── */
  const preloadNext = useCallback(() => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (!q || q.length <= 1) return;

    let nextIdx;
    if (playModeRef.current === 'shuffle') {
      const available = Array.from({ length: q.length }, (_, i) => i)
        .filter(i => i !== idx || q.length === 1);
      nextIdx = available[Math.floor(Math.random() * available.length)];
    } else {
      nextIdx = (idx + 1) % q.length;
    }

    const nextS = q[nextIdx];
    const nextUrl = nextS?.audio_url || nextS?.stream_url;
    if (!nextUrl) return;

    const pl = preloadRef.current;
    if (!pl) return;
    const url = resolveMediaUrl(nextUrl);
    if (pl.src === url) return;
    pl.src = url;
  }, []);

  /* ── Optional visualizer setup (non-intrusive) ── */
  const trySetupVisualizer = useCallback((audio) => {
    if (visualizerSetupRef.current) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;

      // Resume if suspended (Chrome autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          doConnectVisualizer(ctx, audio);
        }).catch(() => {});
      } else {
        doConnectVisualizer(ctx, audio);
      }
    } catch (e) { /* non-fatal */ }
  }, []);

  const doConnectVisualizer = (ctx, audio) => {
    try {
      // createMediaElementSource can only be called ONCE per audio element.
      // On subsequent song changes, reuse the source node and reconnect.
      let source = sourceNodeRef.current;
      if (!source) {
        source = ctx.createMediaElementSource(audio);
        sourceNodeRef.current = source;
      }

      // Disconnect old analyser if present
      const oldAnalyser = analyserRef.current;
      if (oldAnalyser) {
        try { source.disconnect(oldAnalyser); } catch (_) {}
        try { oldAnalyser.disconnect(ctx.destination); } catch (_) {}
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      visualizerSetupRef.current = true;
      setAnalyserVersion((v) => v + 1);
    } catch (e) { /* cross-origin or already-connected */ }
  };

  /* ── Setup audio elements ── */
  useEffect(() => {
    const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    audio.preload = 'metadata';  // faster startup: fetch headers immediately for local files
    audio.volume = 0.8;
    audio.crossOrigin = 'anonymous';     // allow CORS for visualizer
    audioRef.current = audio;

    const pl = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    pl.preload = 'metadata';
    pl.volume = 0;
    preloadRef.current = pl;

    // Throttle setCurrentTime to ~once per 500ms to avoid spamming Redux state
    let lastTimeDispatch = 0;
    audio.addEventListener('timeupdate', () => {
      const now = Date.now();
      // Track that the song actually played: currentTime > 0 means audio is progressing
      if (audio.currentTime > 0.5 && !songHasPlayedRef.current) {
        songHasPlayedRef.current = true;
      }
      if (now - lastTimeDispatch < 500) return;
      lastTimeDispatch = now;
      dispatch(setCurrentTime(audio.currentTime));
    });
    audio.addEventListener('loadedmetadata', () => {
      // Only set duration if it's a valid finite number
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        dispatch(setDuration(audio.duration));

        // ── Preview-clip detection ──
        // For online songs, NetEase often returns a 30–60s preview instead
        // of the full track for non-VIP users. Compare the song's reported
        // duration (from metadata / search result) with the actual audio
        // duration. If actual < ~70% of reported, it's almost certainly a
        // preview clip. Notify the user once per song.
        const song = currentSongRef.current;
        const reported = Number(song?.duration);
        const actual = audio.duration;
        if (
          song && isOnlineRef(song) &&
          Number.isFinite(reported) && reported > 60 &&
          Number.isFinite(actual) &&
          actual < reported * 0.7 &&
          lastPreviewSongIdRef.current !== song.id
        ) {
          lastPreviewSongIdRef.current = song.id;
          dispatch(setPreviewClipDetected(true));
        }
      }
      // Try to set up visualizer AFTER audio has metadata
      trySetupVisualizer(audio);
    });
    audio.addEventListener('ended', () => {
      // ── Smart auto-advance logic ──
      // For streaming audio (online proxy), duration metadata may be unreliable.
      // We use multiple signals to decide whether to advance:
      //   1. audio.duration is valid and reasonably long → definitely played
      //   2. songHasPlayedRef (timeupdate fired with currentTime > 0.5) → played audio
      //   3. For truly broken files (no duration + no playback), pause instead
      const hasValidDuration = Number.isFinite(audio.duration) && audio.duration > 2;
      const songPlayed = songHasPlayedRef.current;

      if (!hasValidDuration && !songPlayed) {
        // Audio file is likely broken — don't cycle
        dispatch(setPlaying(false));
        return;
      }

      if (playModeRef.current === 'repeat-one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        dispatch(nextSong());
      }
    });
    audio.addEventListener('play', () => {
      // Try to set up visualizer on play (in case loadedmetadata didn't fire or CORS was resolved later)
      trySetupVisualizer(audio);
      const song = currentSongRef.current;
      if (song?.id && isLoggedInRef.current && lastHistorySongIdRef.current !== song.id) {
        lastHistorySongIdRef.current = song.id;
        usersAPI.addHistory(song.id, {
          title: song.title,
          artist: song.artist,
          album: song.album || '',
          duration: song.duration || 0,
          cover_url: song.cover_url || '',
          genre: song.genre || (isOnlineRef(song) ? 'Online' : 'Other'),
          source: song.source || (isOnlineRef(song) ? 'netease' : 'local'),
        }).catch(() => {});
      }
      // Clear retry flag when playback starts successfully
      if (song?.id) {
        delete audio.dataset[`retry_${song.id}`];
      }
    });
    audio.addEventListener('error', () => {
      // Silently ignore empty/missing src errors
      if (!audio.src || audio.src === '' || audio.src === window.location.href || audio.src.endsWith('/')) return;
      // MEDIA_ERR_ABORTED (code 1) is normal during song switching — ignore
      if (audio.error?.code === 1) return;

      const song = currentSongRef.current;
      // For online songs, retry the CDN URL once with a cache-busting param.
      // We retry directly on the audio element (bypassing Redux) because the
      // source-loading effect skips re-init when the proxy URL string is unchanged.
      if (isOnlineRef(song) && song?.id) {
        const retryKey = `retry_${song.id}`;
        if (audio.dataset[retryKey]) {
          // Already retried once, give up — try to advance to next song
          audio.dataset[retryKey] = '2'; // mark as exhausted
          // If we never heard any audio and there are more songs, advance
          if (!songHasPlayedRef.current && queueRef.current.length > 1) {
            dispatch(nextSong());
          } else {
            dispatch(setPlaying(false));
          }
          return;
        }
        audio.dataset[retryKey] = '1';
        const proxyUrl = resolveMediaUrl(`/api/music-source/download/${String(song.id)}?_rt=${Date.now()}&quality=${audioQualityRef.current}`);
        audio.src = proxyUrl;
        audio.load();
        if (isPlayingRef.current) {
          audio.play().catch(() => {});
        }
        return;
      }

      // Pause on error to prevent state from cycling
      dispatch(setPlaying(false));
    });

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      pl.src = '';
      pl.removeAttribute('src');
      pl.load();
      visualizerSetupRef.current = false;
    };
  }, [dispatch, trySetupVisualizer]);

  /* ── Load source when currentSong changes ── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const song = currentSong;

    // Determine target URL (before any side effects)
    let targetUrl = null;
    const isOnlineSong = isOnlineRef(song) || (song?.netease_id && song?.netease_id.startsWith('wy_'));
    if (song?.audio_url || song?.stream_url) {
      targetUrl = resolveMediaUrl(song.audio_url || song.stream_url);
    } else if (isOnlineSong && song?.id) {
      targetUrl = resolveMediaUrl(`/api/music-source/download/${song.netease_id || song.id}?quality=${audioQualityRef.current}`);
    }

    // If target URL is the same as what's already loaded/loading, skip re-init
    // This prevents the lazy-fetch from interrupting playback when it dispatches
    // playSong with the same proxy URL that was already set directly.
    if (targetUrl) {
      const currentSrc = audio.src;
      if (currentSrc && currentSrc !== window.location.href) {
        try {
          const expectedSrc = new URL(targetUrl, window.location.href).href;
          if (currentSrc === expectedSrc) {
            preloadNext();
            return;
          }
        } catch (_) { /* URL parse error — proceed with re-init */ }
      }
    }

    // Always stop previous playback when switching songs
    audio.pause();
    songHasPlayedRef.current = false;  // reset for new song

    // If song has no audio_url, use proxy for Netease or just pause for local
    if (!song?.audio_url && !song?.stream_url) {
      if (isOnlineSong && song?.id) {
        // Use backend proxy directly — download endpoint fetches the real stream URL internally
        audio.currentTime = 0;
        audio.src = targetUrl;
        audio.load();          // force load to handle browser state after ended event
      } else {
        audio.currentTime = 0;
      }
      visualizerSetupRef.current = false;
      analyserRef.current = null;
      lastHistorySongIdRef.current = null;
      preloadNext();
      return;
    }

    visualizerSetupRef.current = false;   // reset for new song
    analyserRef.current = null;
    audio.pause();
    audio.currentTime = 0;
    lastHistorySongIdRef.current = null;
    audio.src = targetUrl;
    audio.load();          // force load to handle browser state after ended event

    preloadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id, currentSong?.audio_url, currentSong?.stream_url]);

  /* ── Lazy fetch stream URL for online songs ──
     The audio element already loads the proxy URL directly in the load effect.
     This just updates the Redux store so next/prev songs have the URL cached. */
  const fetchingRef = useRef(new Set());
  useEffect(() => {
    const song = currentSong;
    if (!song || !song.id || !isOnlineRef(song)) return;
    if (song.audio_url || song.stream_url) return;
    if (fetchingRef.current.has(song.id)) return;
    fetchingRef.current.add(song.id);
    // Just set the proxy URL in the store — audio element already has it
    const proxyUrl = `/api/music-source/download/${String(song.id)}?quality=${audioQualityRef.current}`;
    dispatch(playSong({
      song: { ...song, audio_url: proxyUrl, stream_url: proxyUrl },
      queue: queueRef.current.map(s => {
        if (s.id !== song.id) return s;
        return { ...s, audio_url: proxyUrl, stream_url: proxyUrl };
      }),
      index: queueIndexRef.current,
    }));
    fetchingRef.current.delete(song.id);
    // deps intentionally exclude currentSong to avoid re-trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id]);

  /* ── Auto-play when source is ready ── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const tryPlay = () => {
      if (!audio.src || audio.src === window.location.href) return;
      // Always try to set up visualizer when audio data is available
      trySetupVisualizer(audio);
      if (isPlayingRef.current) {
        const attempt = ++playAttemptRef.current;
        audio.play().catch((e) => {
          if (attempt === playAttemptRef.current) {
            console.debug('[Player] Autoplay prevented:', e.message);
          }
        });
      }
    };
    audio.addEventListener('canplay', tryPlay);
    audio.addEventListener('loadeddata', tryPlay);

    if (audio.readyState >= 2 && audio.src && audio.src !== window.location.href && isPlayingRef.current) {
      const attempt = ++playAttemptRef.current;
      audio.play().catch(() => {});
    }

    return () => {
      audio.removeEventListener('canplay', tryPlay);
      audio.removeEventListener('loadeddata', tryPlay);
    };
  }, [currentSong?.id]);

  /* ── Play/pause toggle ── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src || audio.src === window.location.href) return;

    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  /* ── Volume ── */
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  /* ── Quality changed ── reload online song with new quality ── */
  const qualityChangeGuardRef = useRef(false);
  useEffect(() => {
    // Skip first render (initial load)
    if (!qualityChangeGuardRef.current) {
      qualityChangeGuardRef.current = true;
      return;
    }
    const song = currentSongRef.current;
    if (!song || !isOnlineRef(song)) return;

    // Reload with new quality by clearing cached URL
    const audio = audioRef.current;
    if (!audio) return;
    const wasPlaying = isPlayingRef.current;
    const wasTime = audio.currentTime;

    const newUrl = resolveMediaUrl(`/api/music-source/download/${song.netease_id || song.id}?quality=${audioQuality}`);
    audio.src = newUrl;
    audio.load();
    // Restore position after loaded
    const onCanPlay = () => {
      audio.removeEventListener('canplay', onCanPlay);
      if (wasTime > 0) audio.currentTime = wasTime;
      if (wasPlaying) audio.play().catch(() => {});
    };
    audio.addEventListener('canplay', onCanPlay);
  }, [audioQuality]);

  /* ── Preload next when queue changes ── */
  useEffect(() => { preloadNext(); }, [queueIndex, queue.length]);

  const seekTo = useCallback((time) => {
    audioRef.current && (audioRef.current.currentTime = time);
  }, []);

  const changeVolume = useCallback((vol) => {
    dispatch(setVolume(vol));
  }, [dispatch]);

  return { audioRef, seekTo, changeVolume, analyserRef, analyserVersion };
};
