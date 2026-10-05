import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CloseOutlined, DragOutlined } from '@ant-design/icons';
import './FloatingPanel.css';

// Simple audio visualizer for the floating window
const FloatingVisualizer = ({ song }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!song) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Try to create an AudioContext and analyser using a tiny proxy to get frequency data
    // We'll use a periodic waveform approximation since we can't access the main audio element directly
    const animate = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!song) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      // Generate mock frequency bars that pulse with the music
      const t = Date.now() / 1000;
      const bars = 64;
      const barW = w / bars;
      for (let i = 0; i < bars; i++) {
        // Simulate frequency spectrum using sine waves
        const freq = (i / bars);
        const amp = 0.3 + 0.7 * (
          Math.sin(t * 3 + freq * 12) * 0.5 +
          Math.sin(t * 5 + freq * 8) * 0.3 +
          Math.sin(t * 2 + freq * 4) * 0.2
        );
        const barH = Math.abs(amp) * h * 0.85 + 4;
        const hue = 120 + freq * 60;
        const grad = ctx.createLinearGradient(0, h - barH, 0, h);
        grad.addColorStop(0, `hsl(${hue}, 80%, ${30 + amp * 35}%)`);
        grad.addColorStop(1, `hsl(${hue}, 60%, 20%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(i * barW + 1, h - barH, barW - 2, barH);
      }
      animRef.current = requestAnimationFrame(animate);
    };

    // Resize canvas
    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth * 2;
      canvas.height = canvas.parentElement.clientHeight * 2;
    };
    resize();
    window.addEventListener('resize', resize);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [song]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

// Simple lyrics display for the floating window
const FloatingLyrics = ({ song, currentTime }) => {
  const [lrcLines, setLrcLines] = useState([]);
  const activeRef = useRef(null);

  const parseLRC = useCallback((text) => {
    if (!text?.trim()) return [];
    const lines = text.split('\n');
    const result = [];
    const re = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    for (const line of lines) {
      re.lastIndex = 0;
      let m;
      const t = line.replace(re, '').trim();
      if (!t) continue;
      while ((m = re.exec(line)) !== null) {
        const s = parseInt(m[1]) * 60 + parseInt(m[2]) + (parseInt(m[3] || 0) / 1000);
        result.push({ time: s, text: t });
      }
    }
    return result.sort((a, b) => a.time - b.time);
  }, []);

  useEffect(() => {
    if (!song) { setLrcLines([]); return; }
    // Load lyrics from music source API
    const loadLyrics = async () => {
      try {
        const { musicSourceAPI } = await import('../../services/api');
        const resp = await musicSourceAPI.lyric(song.id);
        if (resp.data?.code === 200 && resp.data?.data?.lyric) {
          setLrcLines(parseLRC(resp.data.data.lyric));
          return;
        }
        setLrcLines([]);
      } catch (e) {
        setLrcLines([]);
      }
    };
    loadLyrics();
  }, [song?.id]);

  // Auto-scroll to active line
  useEffect(() => {
    if (lrcLines.length === 0) return;
    const idx = lrcLines.findIndex((l, i) => {
      const next = lrcLines[i + 1];
      return currentTime >= l.time && (!next || currentTime < next.time);
    });
    if (idx >= 0) {
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, lrcLines]);

  if (!song) {
    return <div className="floating-empty">未播放歌曲</div>;
  }

  const activeIdx = lrcLines.findIndex((l, i) => {
    const next = lrcLines[i + 1];
    return currentTime >= l.time && (!next || currentTime < next.time);
  });

  return (
    <div className="floating-lyrics">
      {lrcLines.length === 0 ? (
        <div className="floating-lyrics-placeholder">
          <div className="floating-song-title">{song.title}</div>
          <div className="floating-song-artist">{song.artist}</div>
          <div className="floating-no-lyrics">暂无歌词</div>
        </div>
      ) : (
        <div className="floating-lyrics-scroll">
          <div className="floating-song-title lrc-header">{song.title}</div>
          <div className="floating-song-artist lrc-sub">{song.artist}</div>
          <div className="lrc-spacer" />
          {lrcLines.map((l, i) => (
            <div
              key={i}
              ref={i === activeIdx ? activeRef : null}
              className={`lrc-line ${i === activeIdx ? 'lrc-active' : ''}`}
            >
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FloatingPanel = () => {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const panelType = params.get('panel') || 'lyrics';
  const isLyrics = panelType === 'lyrics';

  const [song, setSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [opacity, setOpacity] = useState(0.85);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Request initial data
    api.requestSongData().then((data) => {
      if (data?.song) setSong(data.song);
      if (data?.playState) {
        setIsPlaying(data.playState.isPlaying);
        setCurrentTime(data.playState.currentTime || 0);
      }
    });

    // Listen for updates
    api.onSongUpdate((data) => {
      if (data) setSong(data);
    });

    api.onPlayStateUpdate((data) => {
      if (data) {
        setIsPlaying(data.isPlaying);
        if (data.currentTime != null) setCurrentTime(data.currentTime);
      }
    });

    api.onTimeUpdate((data) => {
      if (data?.currentTime != null) setCurrentTime(data.currentTime);
    });

    return () => {
      api.removeAllListeners('song-update');
      api.removeAllListeners('play-state-update');
      api.removeAllListeners('time-update');
    };
  }, []);

  const handleClose = () => {
    const api = window.electronAPI;
    if (api) {
      if (isLyrics) api.closeLyrics();
      else api.closeVisualizer();
    }
  };

  return (
    <div className="floating-panel" style={{ opacity }}>
      <div className="floating-header">
        <div className="floating-drag-handle">
          <DragOutlined style={{ marginRight: 6, fontSize: 12 }} />
          {isLyrics ? '歌词' : '音乐可视化'}
          {song && <span className="floating-song-name"> — {song.title}</span>}
        </div>
        <div className="floating-controls">
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="floating-opacity-slider"
            title="透明度"
          />
          <button className="floating-close-btn" onClick={handleClose}>
            <CloseOutlined />
          </button>
        </div>
      </div>
      <div className="floating-body">
        {isLyrics ? (
          <FloatingLyrics song={song} currentTime={currentTime} />
        ) : (
          <FloatingVisualizer song={song} />
        )}
      </div>
    </div>
  );
};

export default FloatingPanel;
