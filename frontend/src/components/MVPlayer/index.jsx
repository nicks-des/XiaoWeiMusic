import React, { useState, useEffect, useRef, useCallback } from 'react';
import { App } from 'antd';
import { useDispatch } from 'react-redux';
import {
  CloseOutlined, LinkOutlined, PlayCircleOutlined,
  FullscreenOutlined, FullscreenExitOutlined, UploadOutlined,
  LoadingOutlined, CloudDownloadOutlined,
} from '@ant-design/icons';
import { songsAPI, musicSourceAPI, resolveMediaUrl } from '../../services/api';
import { updateCurrentSong } from '../../store/slices/playerSlice';
import './MVPlayer.css';

const MVPlayer = ({ currentSong, onClose, open }) => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const [videoUrl, setVideoUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fetchingOnline, setFetchingOnline] = useState(false);
  const [onlineMvAvailable, setOnlineMvAvailable] = useState(false);
  const videoRef = useRef(null);
  const panelRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sync video URL from song
  useEffect(() => {
    const url = currentSong?.video_url || '';
    setVideoUrl(url);
    setInputUrl(url);
    setError('');
    setEditing(false);
    setOnlineMvAvailable(false);
  }, [currentSong?.id, currentSong?.video_url]);

  // Auto-fetch MV URL from online platform when song has mv_id
  useEffect(() => {
    let mvId = currentSong?.mv_id;
    // Also check features JSON for stored mv_id (from import)
    if (!mvId && currentSong?.features?.mv_id) {
      mvId = currentSong.features.mv_id;
    }
    const hasLocalVideo = !!currentSong?.video_url;
    if (!mvId || (typeof mvId === 'number' && mvId <= 0) || hasLocalVideo) return;

    setFetchingOnline(true);
    musicSourceAPI.mvUrl(mvId)
      .then((res) => {
        const data = res.data?.data;
        if (data?.url) {
          setVideoUrl(data.url);
          setInputUrl(data.url);
          setOnlineMvAvailable(true);
          // Save to backend for persistence
          songsAPI.update(currentSong.id, { video_url: data.url }).catch(() => {});
          dispatch(updateCurrentSong({ video_url: data.url }));
        }
      })
      .catch(() => { /* no MV available */ })
      .finally(() => setFetchingOnline(false));
  }, [currentSong?.id, currentSong?.mv_id, currentSong?.video_url, dispatch]);

  // Save video URL to backend
  const saveVideoUrl = async () => {
    if (!currentSong?.id) return;
    if (!inputUrl.trim()) {
      message.warning('请输入视频链接');
      return;
    }
    setSaving(true);
    try {
      await songsAPI.update(currentSong.id, { video_url: inputUrl.trim() });
      setVideoUrl(inputUrl.trim());
      dispatch(updateCurrentSong({ video_url: inputUrl.trim() }));
      message.success('MV链接已保存');
      setEditing(false);
    } catch (e) {
      message.error('保存失败: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleVideoError = () => {
    setError('视频加载失败，请检查链接是否有效');
  };

  // Download MV with correct filename
  const handleDownloadMV = () => {
    if (!currentSong?.id || !videoUrl) {
      message.warning('没有可下载的MV');
      return;
    }
    const isLocal = videoUrl.startsWith('/uploads/');
    if (isLocal) {
      // Local video: use <a> download with song title as filename
      const a = document.createElement('a');
      a.href = resolveMediaUrl(videoUrl);
      a.download = `${currentSong.title || 'MV'}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // Online video: proxy via backend for proper filename
      window.open(`/api/music-source/mv-download/${currentSong.id}`, '_blank');
      message.info('正在下载MV...');
    }
  };

  // Handle video file upload
  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentSong?.id) return;

    const maxSize = 200 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error('视频文件不能超过200MB');
      return;
    }

    const allowedExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
      message.error('不支持的视频格式，支持: mp4, webm, ogg, mov, avi, mkv');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('video', file);
      const { data } = await songsAPI.uploadVideo(formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        },
      });
      if (data.code === 200 && data.data.video_url) {
        const uploadedUrl = data.data.video_url;
        await songsAPI.update(currentSong.id, { video_url: uploadedUrl });
        setVideoUrl(uploadedUrl);
        setInputUrl(uploadedUrl);
        dispatch(updateCurrentSong({ video_url: uploadedUrl }));
        message.success('MV视频已上传并保存');
        setEditing(false);
      }
    } catch (err) {
      message.error('视频上传失败: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // If `open` is explicitly provided and false, don't render (Home page usage)
  if (open === false) return null;

  return (
    <div className="mv-panel" ref={panelRef}>
      <div className="mv-panel-header">
        <h3>
          <PlayCircleOutlined style={{ marginRight: 8 }} />
          MV
          {currentSong && <span className="mv-song-name"> - {currentSong.title}</span>}
        </h3>
        <div className="mv-panel-header-actions">
          <button className="mv-close-btn" onClick={toggleFullscreen} title={isFullscreen ? '退出全屏' : '全屏'}>
            {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          </button>
          <button className="mv-close-btn" onClick={onClose} title="关闭">
            <CloseOutlined />
          </button>
        </div>
      </div>

      <div className="mv-panel-content">
        {editing ? (
          <div className="mv-add-form">
            <p className="mv-add-hint">粘贴MV视频直链，或上传本地视频文件（支持 mp4, webm 等格式，最大200MB）</p>
            <input
              className="mv-url-input"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com/video.mp4"
              spellCheck={false}
            />
            <div className="mv-add-actions">
              <button className="mv-save-btn" onClick={saveVideoUrl} disabled={saving || uploading}>
                {saving ? '保存中...' : '保存链接'}
              </button>
              <label className={`mv-upload-btn ${uploading ? 'mv-uploading' : ''}`}>
                <UploadOutlined style={{ marginRight: 4 }} />
                {uploading ? `上传中 ${uploadProgress}%` : '上传视频'}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.ogg,.mov,.avi,.mkv"
                  style={{ display: 'none' }}
                  onChange={handleVideoUpload}
                />
              </label>
              <button className="mv-cancel-btn" onClick={() => { setEditing(false); setInputUrl(videoUrl); }}>
                取消
              </button>
            </div>
          </div>
        ) : videoUrl ? (
          <div className="mv-video-wrap">
            {error ? (
              <div className="mv-error-msg">
                <p>{error}</p>
                <button className="mv-retry-btn" onClick={() => { setError(''); setEditing(true); }}>
                  更换链接
                </button>
              </div>
            ) : null}
            {videoUrl.includes('y.qq.com/n/yqq/mv/') || videoUrl.includes('kugou.com/mvweb/') || videoUrl.includes('kuwo.cn/mvplay/') ? (
              // QQ Music / Kugou / Kuwo MV — use iframe or link since their MV page can't be played as raw video
              <div className="mv-qq-wrap">
                <p className="mv-qq-hint">第三方平台MV需要跳转到官方页面播放</p>
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mv-qq-link"
                  onClick={() => message.info('正在打开QQ音乐MV页面...')}
                >
                  <PlayCircleOutlined style={{ marginRight: 8 }} />
                  在官方页面中观看MV
                </a>
              </div>
            ) : (
              <div className="mv-video-section">
                <video
                  ref={videoRef}
                  className={`mv-video ${error ? 'mv-video-hidden' : ''}`}
                  src={resolveMediaUrl(videoUrl)}
                  controls
                  playsInline
                  onError={handleVideoError}
                />
                <div className="mv-video-actions">
                  <button className="mv-download-btn" onClick={handleDownloadMV}>
                    <CloudDownloadOutlined style={{ marginRight: 6 }} />
                    下载MV
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mv-empty">
            <PlayCircleOutlined style={{ fontSize: 40, opacity: 0.3 }} />
            {fetchingOnline ? (
              <>
                <p><LoadingOutlined style={{ marginRight: 8 }} />正在从云端获取MV...</p>
              </>
            ) : (
              <>
                <p>暂无MV</p>
                <div className="mv-empty-actions">
                  <button className="mv-add-btn" onClick={() => setEditing(true)}>
                    <LinkOutlined style={{ marginRight: 6 }} />
                    添加视频链接
                  </button>
                  <label className={`mv-upload-btn ${uploading ? 'mv-uploading' : ''}`}>
                    <UploadOutlined style={{ marginRight: 4 }} />
                    {uploading ? `上传中 ${uploadProgress}%` : '上传视频文件'}
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.ogg,.mov,.avi,.mkv"
                      style={{ display: 'none' }}
                      onChange={handleVideoUpload}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {!editing && videoUrl && (
          <div className="mv-change-link">
            <button className="mv-change-btn" onClick={() => setEditing(true)}>
              <LinkOutlined style={{ marginRight: 4 }} />
              更换链接
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MVPlayer;
