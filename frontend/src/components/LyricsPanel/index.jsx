import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { CloseOutlined, EditOutlined, FileTextOutlined, DragOutlined, LoadingOutlined } from '@ant-design/icons';
import { Tooltip, App } from 'antd';
import { songsAPI, musicSourceAPI } from '../../services/api';
import { updateCurrentSong } from '../../store/slices/playerSlice';
import './LyricsPanel.css';

/**
 * Parse LRC format lyrics into timestamped array
 * Format: [mm:ss.xx]text OR [mm:ss]text
 */
function parseLRC(lrcText) {
  if (!lrcText || !lrcText.trim()) return [];
  const lines = lrcText.split('\n');
  const result = [];
  const timeRe = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const line of lines) {
    timeRe.lastIndex = 0;
    let match;
    const text = line.replace(timeRe, '').trim()
      .replace(/^\[ti:.*?\]/i, '').replace(/^\[ar:.*?\]/i, '')
      .replace(/^\[al:.*?\]/i, '').replace(/^\[by:.*?\]/i, '')
      .replace(/^\[offset:.*?\]/i, '');
    if (!text) continue;

    while ((match = timeRe.exec(line)) !== null) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      const time = mins * 60 + secs + ms / 1000;
      result.push({ time, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

const LyricsPanel = ({ currentSong, currentTime, onClose }) => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const listRef = useRef(null);
  const [lyrics, setLyrics] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingOnline, setFetchingOnline] = useState(false);
  const [onlineLyricSource, setOnlineLyricSource] = useState(''); // trace where lyrics came from

  // Floating window state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);

  const parsed = useMemo(() => parseLRC(lyrics), [lyrics]);

  // Find current line index
  const activeIdx = useMemo(() => {
    if (parsed.length === 0) return -1;
    for (let i = parsed.length - 1; i >= 0; i--) {
      if (currentTime >= parsed[i].time) return i;
    }
    return 0;
  }, [parsed, currentTime]);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('.lyrics-line');
    const el = items[activeIdx];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIdx]);

  // Load lyrics from song — resets when song changes
  // For online songs (Netease) without local lyrics, auto-fetch from API
  useEffect(() => {
    const localLyrics = currentSong?.lyrics || '';
    setLyrics(localLyrics);
    setEditing(false);
    setOnlineLyricSource('');

    // Auto-fetch lyrics for online songs that don't have local lyrics
    const songId = currentSong?.id || '';
    const isOnline = currentSong?.source === 'netease' || currentSong?.source === 'qqmusic'
      || currentSong?.source === 'kugou' || currentSong?.source === 'kuwo'
      || (songId.startsWith && (songId.startsWith('wy_') || songId.startsWith('qq_') || songId.startsWith('kg_') || songId.startsWith('kw_')));
    if (!localLyrics && isOnline) {
      setFetchingOnline(true);
      musicSourceAPI.lyric(songId)
        .then((res) => {
          const data = res.data?.data;
          if (data?.lyric) {
            // Combine original lyric with translated lyric if available
            const combined = data.translatedLyric
              ? data.lyric + '\n' + data.translatedLyric
              : data.lyric;
            setLyrics(combined);
            setOnlineLyricSource('netease');
            // Save to backend so it persists
            songsAPI.update(songId, { lyrics: combined }).catch(() => {});
            // Sync to Redux
            dispatch(updateCurrentSong({ lyrics: combined }));
          }
        })
        .catch(() => { /* no lyrics available online */ })
        .finally(() => setFetchingOnline(false));
    }
  }, [currentSong?.id, currentSong?.lyrics, currentSong?.source, dispatch]);

  // Initialize position to center
  useEffect(() => {
    if (!initialized && panelRef.current) {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const pw = Math.min(460, winW - 40);
      const ph = Math.min(500, winH - 120);
      setPosition({ x: (winW - pw) / 2, y: (winH - ph) / 2 - 40 });
      setInitialized(true);
    }
  }, [initialized]);

  // Drag handlers
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('.lyrics-floating-actions, .lyrics-editor-actions, button, textarea, .anticon')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      setIsDragging(true);
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e) => {
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, dragOffset]);

  // Save lyrics — also update Redux store
  const saveLyrics = async () => {
    if (!currentSong?.id) return;
    setSaving(true);
    try {
      await songsAPI.update(currentSong.id, { lyrics });
      // Sync to Redux so lyrics persist after close/reopen
      dispatch(updateCurrentSong({ lyrics }));
      message.success('歌词已保存');
      setEditing(false);
    } catch (e) {
      message.error('保存失败: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  const hasLyrics = lyrics && lyrics.trim();
  const hasLRC = parsed.length > 0;

  return (
    <div
      className={`lyrics-floating ${isDragging ? 'lyrics-floating-dragging' : ''}`}
      ref={panelRef}
      style={{ left: position.x, top: position.y }}
    >
      {/* Draggable header */}
      <div className="lyrics-floating-header" onMouseDown={handleDragStart}>
        <DragOutlined className="lyrics-drag-icon" />
        <h3>
          <FileTextOutlined style={{ marginRight: 8 }} />
          歌词
          {currentSong && <span className="lyrics-song-name"> - {currentSong.title}</span>}
        </h3>
        <div className="lyrics-floating-actions">
          {onlineLyricSource && !editing && (
            <span className="lyrics-source-tag" title="歌词来自网易云音乐">🌐 云</span>
          )}
          {!editing && hasLyrics && (
            <Tooltip title="编辑歌词">
              <button className="lyrics-action-btn" onClick={() => setEditing(true)}>
                <EditOutlined />
              </button>
            </Tooltip>
          )}
          <Tooltip title="关闭">
            <button className="lyrics-close-btn" onClick={onClose}>
              <CloseOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <div className="lyrics-floating-body">
        {editing ? (
          <div className="lyrics-editor">
            <textarea
              className="lyrics-textarea"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={'粘贴 LRC 歌词，格式:\n[00:12.34]第一句歌词\n[00:25.67]第二句歌词\n\n也支持纯文本歌词'}
              spellCheck={false}
            />
            <div className="lyrics-editor-actions">
              <button className="lyrics-save-btn" onClick={saveLyrics} disabled={saving}>
                {saving ? '保存中...' : '保存歌词'}
              </button>
              <button className="lyrics-cancel-btn" onClick={() => { setEditing(false); setLyrics(currentSong?.lyrics || ''); }}>
                取消
              </button>
            </div>
          </div>
        ) : hasLRC ? (
          <div className="lyrics-scroll" ref={listRef}>
            {parsed.map((line, i) => (
              <p
                key={i}
                className={`lyrics-line ${i === activeIdx ? 'lyrics-line-active' : ''} ${i < activeIdx ? 'lyrics-line-past' : ''}`}
              >
                {line.text}
              </p>
            ))}
          </div>
        ) : hasLyrics ? (
          <div className="lyrics-plain">
            <p>{lyrics}</p>
          </div>
        ) : (
          <div className="lyrics-empty">
            <FileTextOutlined style={{ fontSize: 40, opacity: 0.3 }} />
            {fetchingOnline ? (
              <>
                <p><LoadingOutlined style={{ marginRight: 8 }} />正在从云端获取歌词...</p>
              </>
            ) : (
              <>
                <p>暂无歌词</p>
                <button className="lyrics-add-btn" onClick={() => setEditing(true)}>
                  添加歌词
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LyricsPanel;
