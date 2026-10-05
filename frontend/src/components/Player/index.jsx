import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepForwardOutlined,
  StepBackwardOutlined,
  SoundOutlined,
  UnorderedListOutlined,
  CloseOutlined,
  DeleteOutlined,
  PlaySquareOutlined,
  FileTextOutlined,
  ExpandOutlined,
} from '@ant-design/icons';
import { Slider, Tooltip, App } from 'antd';
import {
  togglePlay,
  nextSong,
  prevSong,
  setPlayMode,
  setAudioQuality,
  toggleQueuePanel,
  setQueuePanel,
  playFromQueue,
  removeFromQueue,
  toggleMV,
  toggleLyrics,
  setShowMV,
  setShowLyrics,
  toggleVisualizer,
  setShowVisualizer,
  setPreviewClipDetected,
  updateCurrentSong,
} from '../../store/slices/playerSlice';
import MVPlayer from '../MVPlayer';
import LyricsPanel from '../LyricsPanel';
import Visualizer from '../Visualizer';
import { formatTime } from '../../utils/format';
import { musicSourceAPI, songsAPI } from '../../services/api';
import './Player.css';

const PLAY_MODES = [
  { key: 'sequential', icon: '⇄', label: '顺序播放' },
  { key: 'shuffle', icon: '⇋', label: '随机播放' },
  { key: 'repeat-one', icon: '↻1', label: '单曲循环' },
];

const QUALITY_LEVELS = [
  { key: 'standard', label: '标准', shortLabel: '标' },
  { key: 'high', label: '高品质', shortLabel: 'HQ' },
  { key: 'lossless', label: '无损', shortLabel: 'SQ' },
];

const Player = ({ audioRef, seekTo, changeVolume, analyserRef, analyserVersion }) => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const {
    currentSong, isPlaying, volume, currentTime, duration,
    queue, queueIndex, playMode, audioQuality, showQueuePanel, showMV, showLyrics, showVisualizer,
    previewClipDetected,
  } = useSelector((s) => s.player);

  // Electron floating panels support
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const [floatingLyrics, setFloatingLyrics] = useState(false);
  const [floatingVis, setFloatingVis] = useState(false);

  // Sync song data to floating panels via IPC
  useEffect(() => {
    if (!isElectron || !currentSong) return;
    window.electronAPI.send?.('song-update', {
      id: currentSong.id,
      title: currentSong.title,
      artist: currentSong.artist,
      album: currentSong.album,
      duration: currentSong.duration,
      cover_url: currentSong.cover_url,
      source: currentSong.source,
    });
  }, [currentSong?.id, isElectron]);

  // Sync play state to floating panels
  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.send?.('play-state-update', {
      isPlaying,
      currentTime,
      duration,
    });
  }, [isPlaying, isElectron, currentTime]);

  // Listen for panel open/close status from Electron
  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.onPanelStatus?.((status) => {
      setFloatingLyrics(status.lyricsOpen);
      setFloatingVis(status.visualizerOpen);
    });
    return () => {
      window.electronAPI.removeAllListeners?.('panel-status');
    };
  }, [isElectron]);

  // When the audio player detects that the actual audio is much shorter
  // than the reported duration (NetEase preview clip for non-VIP users),
  // surface a one-shot notification telling the user how to get the full song.
  useEffect(() => {
    if (!previewClipDetected) return;
    message.warning({
      content: '当前为在线试听片段（30-60秒）。要听完整版请使用“导入到本地”下载歌曲。',
      duration: 5,
    });
    dispatch(setPreviewClipDetected(false));
  }, [previewClipDetected, message, dispatch]);

  const progress = useMemo(() => {
    if (!duration) return 0;
    return (currentTime / duration) * 100;
  }, [currentTime, duration]);

  const currentModeIdx = PLAY_MODES.findIndex(m => m.key === playMode);
  const [mvFetching, setMvFetching] = useState(false);
  const [mvAvailable, setMvAvailable] = useState(false);

  // Auto-fetch MV URL when current song has mv_id and no local video_url
  useEffect(() => {
    let mvId = currentSong?.mv_id;
    // Also check features JSON for stored mv_id (from imported songs)
    if (!mvId && currentSong?.features?.mv_id) {
      mvId = currentSong.features.mv_id;
    }
    const hasLocalVideo = !!currentSong?.video_url;
    if (!mvId || (typeof mvId === 'number' && mvId <= 0) || hasLocalVideo) {
      setMvAvailable(false);
      return;
    }

    setMvFetching(true);
    setMvAvailable(false);
    musicSourceAPI.mvUrl(mvId)
      .then((res) => {
        const data = res.data?.data;
        if (data?.url) {
          setMvAvailable(true);
          // Save to backend and Redux
          songsAPI.update(currentSong.id, { video_url: data.url }).catch(() => {});
          dispatch(updateCurrentSong({ video_url: data.url }));
        }
      })
      .catch(() => { setMvAvailable(false); })
      .finally(() => setMvFetching(false));
  }, [currentSong?.id, currentSong?.mv_id, currentSong?.video_url, dispatch]);

  const cyclePlayMode = () => {
    const next = (currentModeIdx + 1) % PLAY_MODES.length;
    dispatch(setPlayMode(PLAY_MODES[next].key));
  };

  const currentQualityIdx = QUALITY_LEVELS.findIndex(q => q.key === audioQuality);
  const cycleQuality = () => {
    const next = (currentQualityIdx + 1) % QUALITY_LEVELS.length;
    dispatch(setAudioQuality(QUALITY_LEVELS[next].key));
  };

  const handleToggleMV = () => {
    dispatch(toggleMV());
  };

  const handleToggleLyrics = () => {
    if (isElectron) {
      if (floatingLyrics) window.electronAPI.closeLyrics();
      else window.electronAPI.openLyrics();
    } else {
      dispatch(toggleLyrics());
    }
  };

  const handleToggleQueue = () => {
    dispatch(toggleQueuePanel());
  };

  const handleToggleVisualizer = () => {
    if (isElectron) {
      if (floatingVis) window.electronAPI.closeVisualizer();
      else window.electronAPI.openVisualizer();
    } else {
      dispatch(toggleVisualizer());
    }
  };

  if (!currentSong) {
    return (
      <div className="player-bar">
        <div className="player-empty">选择一首歌曲开始播放</div>
      </div>
    );
  }

  return (
    <>
      {/* MV Player Panel */}
      {showMV && currentSong && (
        <MVPlayer
          currentSong={currentSong}
          onClose={() => dispatch(setShowMV(false))}
        />
      )}

      {/* Lyrics Panel */}
      {showLyrics && currentSong && (
        <LyricsPanel
          currentSong={currentSong}
          currentTime={currentTime}
          onClose={() => dispatch(setShowLyrics(false))}
        />
      )}

      {/* Visualizer Popup */}
      {showVisualizer && (
        <Visualizer analyserRef={analyserRef} analyserVersion={analyserVersion} />
      )}

      {/* Queue Panel Overlay */}
      {showQueuePanel && (
        <div className="queue-panel">
          <div className="queue-panel-header">
            <h3>播放队列 ({queue.length})</h3>
            <Tooltip title="关闭">
              <button className="queue-close-btn" onClick={() => dispatch(setQueuePanel(false))}>
                <CloseOutlined />
              </button>
            </Tooltip>
          </div>
          <div className="queue-panel-list">
            {queue.map((song, i) => (
              <div
                key={`${song.id}-${i}`}
                className={`queue-item ${i === queueIndex ? 'queue-item-active' : ''}`}
                onClick={() => dispatch(playFromQueue(i))}
              >
                <div className="queue-item-info">
                  <img
                    src={song.cover_url || `https://picsum.photos/seed/song${song.id}/40/40`}
                    alt=""
                    className="queue-item-cover"
                    onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="%23282828"><rect width="36" height="36"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="16">♪</text></svg>'; }}
                  />
                  <div className="queue-item-text">
                    <div className="queue-item-title">{song.title}</div>
                    <div className="queue-item-artist">{song.artist}</div>
                  </div>
                </div>
                {i === queueIndex && <span className="queue-item-playing">正在播放</span>}
                <Tooltip title="移除">
                  <button
                    className="queue-item-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch(removeFromQueue(i));
                    }}
                  >
                    <DeleteOutlined />
                  </button>
                </Tooltip>
              </div>
            ))}
            {queue.length === 0 && (
              <div className="queue-empty">播放队列为空</div>
            )}
          </div>
        </div>
      )}

      {/* Player Bar */}
      <div className="player-bar">
        {/* Song info */}
        <div className="player-song-info">
          <img
            src={currentSong.cover_url || `https://picsum.photos/seed/song${currentSong.id}/300/300`}
            alt=""
            className="player-cover"
            onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="%23282828"><rect width="56" height="56"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20">♪</text></svg>'; }}
          />
          <div className="player-song-text">
            <div className="player-song-title">{currentSong.title}</div>
            <div className="player-song-artist">{currentSong.artist}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="player-controls">
          <div className="player-buttons">
            <Tooltip title={PLAY_MODES[currentModeIdx].label}>
              <button
                className={`player-btn player-mode-btn ${playMode !== 'sequential' ? 'player-mode-active' : ''}`}
                onClick={cyclePlayMode}
              >
                <span className="player-mode-icon">{PLAY_MODES[currentModeIdx].icon}</span>
              </button>
            </Tooltip>
            <Tooltip title={`音质: ${QUALITY_LEVELS[currentQualityIdx].label}${currentSong?.source === 'local' ? ' (仅在线音乐支持切换)' : ''}`}>
              <button
                className={`player-btn player-quality-btn ${audioQuality !== 'standard' ? 'player-quality-active' : ''}`}
                onClick={cycleQuality}
                disabled={currentSong?.source === 'local' || (!currentSong?.source && !currentSong?.netease_id)}
              >
                <span className="player-quality-label">{QUALITY_LEVELS[currentQualityIdx].shortLabel}</span>
              </button>
            </Tooltip>
            <button
              className="player-btn"
              onClick={() => dispatch(prevSong())}
              title="上一首"
            >
              <StepBackwardOutlined />
            </button>
            <button
              className="player-btn player-btn-play"
              onClick={() => dispatch(togglePlay())}
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            </button>
            <button
              className="player-btn"
              onClick={() => dispatch(nextSong())}
              title="下一首"
            >
              <StepForwardOutlined />
            </button>
            <Tooltip title="播放队列">
              <button
                className={`player-btn ${showQueuePanel ? 'player-queue-btn-active' : ''}`}
                onClick={handleToggleQueue}
              >
                <UnorderedListOutlined />
              </button>
            </Tooltip>
            <Tooltip title={mvAvailable ? 'MV 可用（云端）' : mvFetching ? '正在获取MV...' : 'MV / 视频'}>
              <button
                className={`player-btn ${showMV ? 'player-mv-btn-active' : ''} ${mvAvailable ? 'player-mv-available' : ''} ${mvFetching ? 'player-mv-fetching' : ''}`}
                onClick={handleToggleMV}
              >
                <PlaySquareOutlined />
                {mvAvailable && <span className="mv-badge" title="在线MV可用">●</span>}
              </button>
            </Tooltip>
            <Tooltip title="歌词">
              <button
                className={`player-btn ${(isElectron ? floatingLyrics : showLyrics) ? 'player-lyrics-btn-active' : ''}`}
                onClick={handleToggleLyrics}
              >
                <FileTextOutlined />
              </button>
            </Tooltip>
            <Tooltip title="可视化">
              <button
                className={`player-btn ${(isElectron ? floatingVis : showVisualizer) ? 'player-vis-btn-active' : ''}`}
                onClick={handleToggleVisualizer}
              >
                <ExpandOutlined />
              </button>
            </Tooltip>
          </div>
          <div className="player-progress">
            <span className="player-time">{formatTime(currentTime)}</span>
            <Slider
              min={0}
              max={100}
              value={progress}
              tooltip={{ formatter: () => formatTime(currentTime) }}
              onChange={(val) => {
                const time = (val / 100) * duration;
                seekTo(time);
              }}
              styles={{
                track: { background: '#1db954' },
                handle: { borderColor: '#1db954' },
                rail: { background: 'rgba(255,255,255,0.1)' },
              }}
            />
            <span className="player-time">{formatTime(duration)}</span>
          </div>
          <div className="player-visualizer-container">
            <Visualizer analyserRef={analyserRef} analyserVersion={analyserVersion} inline />
          </div>
        </div>

        {/* Volume */}
        <div className="player-volume">
          <SoundOutlined />
          <Slider
            min={0}
            max={100}
            value={volume}
            onChange={changeVolume}
            tooltip={{ formatter: (v) => `${v}%` }}
            styles={{
              track: { background: '#1db954' },
              handle: { borderColor: '#1db954' },
              rail: { background: 'rgba(255,255,255,0.1)' },
            }}
            style={{ width: 100 }}
          />
        </div>
      </div>
    </>
  );
};

export default Player;
