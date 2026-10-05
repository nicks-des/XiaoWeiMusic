import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  PlayCircleOutlined, HeartOutlined, HeartFilled,
  DownloadOutlined, RobotOutlined, ReloadOutlined, PlusSquareOutlined,
} from '@ant-design/icons';
import { Spin, Button, Empty, Tooltip, Tag, App } from 'antd';
import { aiRecommendationsAPI, resolveApiUrl, usersAPI } from '../../services/api';
import { playSong } from '../../store/slices/playerSlice';
import AddToPlaylist from '../../components/AddToPlaylist';
import { formatDuration } from '../../utils/format';
import { getMoodLabel } from '../../utils/labels';
import './ForYou.css';

const ForYou = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoggedIn, token } = useSelector((s) => s.user);
  const [aiRecs, setAiRecs] = useState([]);
  const [aiProfile, setAiProfile] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState({});
  const [playlistModalSongId, setPlaylistModalSongId] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    fetchRecommendations();
  }, [isLoggedIn, token]);

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const aiRes = await aiRecommendationsAPI.get();
      if (aiRes.data.code === 200) {
        setAiRecs(aiRes.data.data.recommendations || []);
        setAiProfile(aiRes.data.data.tasteProfile);
      }
      // Load favorites
      try {
        const favRes = await usersAPI.favorites();
        if (favRes.data.code === 200) {
          setFavorites(new Set((favRes.data.data || []).map(f => f.id)));
        }
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.error('AI recommendations failed:', e);
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRecommendations();
    setRefreshing(false);
    message.success('已刷新推荐');
  };

  const handlePlay = (song, list, index) => {
    dispatch(playSong({ song, queue: list, index }));
  };

  const handlePlayAll = () => {
    if (aiRecs.length > 0) {
      dispatch(playSong({ song: aiRecs[0], queue: aiRecs, index: 0 }));
    }
  };

  const handleDownload = async (song) => {
    if (downloading[song.id]) return;
    setDownloading(prev => ({ ...prev, [song.id]: true }));
    try {
      const a = document.createElement('a');
      a.href = song.audio_url?.startsWith('http') ? song.audio_url : resolveApiUrl(`/songs/download/${song.id}`);
      a.download = `${song.artist} - ${song.title}.mp3`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      message.success(`正在下载: ${song.title}`);
    } catch (err) {
      message.error('下载失败，请稍后重试');
    } finally {
      setDownloading(prev => ({ ...prev, [song.id]: false }));
    }
  };

  const handleToggleFavorite = async (song) => {
    if (!isLoggedIn) { message.warning('请先登录'); return; }
    try {
      if (favorites.has(song.id)) {
        await usersAPI.removeFavorite(song.id);
        setFavorites(prev => { const n = new Set(prev); n.delete(song.id); return n; });
        message.success('已取消收藏');
      } else {
        await usersAPI.addFavorite(song.id);
        setFavorites(prev => new Set(prev).add(song.id));
        message.success('已收藏');
      }
    } catch (err) { message.error('操作失败'); }
  };

  if (!isLoggedIn) {
    return (
      <div className="for-you-page">
        <div className="for-you-hero">
          <RobotOutlined style={{ fontSize: 64, color: '#1db954', marginBottom: 16 }} />
          <h1>猜你喜欢</h1>
          <p style={{ color: '#b3b3b3', marginBottom: 24 }}>登录后，AI 将根据你的听歌习惯为你推荐音乐</p>
          <Button type="primary" size="large" onClick={() => navigate('/login')} style={{ background: '#1db954', borderColor: '#1db954' }}>
            立即登录
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="for-you-page">
      <div className="for-you-header">
        <div className="for-you-title">
          <RobotOutlined style={{ color: '#1db954', fontSize: 28 }} />
          <div>
            <h1>猜你喜欢</h1>
            {aiProfile && (
              <p className="for-you-subtitle">
                根据你的听歌风格智能推荐
                {aiProfile.topGenres?.slice(0, 3).map(g => (
                  <Tag key={g} color="green" style={{ marginLeft: 4 }}>{g}</Tag>
                ))}
                {aiProfile.favoriteMood && (
                  <Tag color="blue" style={{ marginLeft: 4 }}>{getMoodLabel(aiProfile.favoriteMood)}</Tag>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="for-you-actions">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handlePlayAll}
            disabled={aiRecs.length === 0}
            style={{ background: '#1db954', borderColor: '#1db954' }}
          >
            播放全部
          </Button>
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={handleRefresh}
            loading={refreshing}
          >
            换一批
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="loading-placeholder"><Spin size="large" /> 正在分析你的音乐偏好...</div>
      ) : aiRecs.length === 0 ? (
        <Empty
          description="暂无推荐，先去听听歌吧"
          style={{ marginTop: 60 }}
        >
          <Button type="primary" onClick={() => navigate('/')}>去发现音乐</Button>
        </Empty>
      ) : (
        <div className="for-you-list">
          <div className="for-you-list-header">
            <span className="fyh-num">#</span>
            <span className="fyh-info">标题</span>
            <span className="fyh-genre">风格</span>
            <span className="fyh-duration">时长</span>
            <span className="fyh-reason">推荐理由</span>
            <span className="fyh-actions">操作</span>
          </div>
          {aiRecs.map((song, i) => (
            <div className="for-you-song-row" key={song.id} onClick={() => handlePlay(song, aiRecs, i)}>
              <span className="fy-row-num">{i + 1}</span>
              <div className="fy-row-info">
                <img src={song.cover_url || `https://picsum.photos/seed/song${song.id}/40/40`} alt="" className="fy-row-cover" />
                <div className="fy-row-text">
                  <div className="fy-row-title">{song.title}</div>
                  <div className="fy-row-artist">{song.artist}</div>
                </div>
              </div>
              <span className="fy-row-genre">
                <Tag color="green" bordered={false} style={{ fontSize: 11 }}>{song.genre}</Tag>
              </span>
              <span className="fy-row-duration">{formatDuration(song.duration)}</span>
              <span className="fy-row-reason">
                {song._reasons?.[0] || '为你推荐'}
              </span>
              <div className="fy-row-actions" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="添加到歌单">
                  <button className="fy-action-btn" onClick={() => setPlaylistModalSongId(song.id)}>
                    <PlusSquareOutlined />
                  </button>
                </Tooltip>
                <Tooltip title={favorites.has(song.id) ? '取消收藏' : '收藏'}>
                  <button className="fy-action-btn" onClick={() => handleToggleFavorite(song)}>
                    {favorites.has(song.id) ? <HeartFilled style={{ color: '#1db954' }} /> : <HeartOutlined />}
                  </button>
                </Tooltip>
                <Tooltip title="下载">
                  <button className="fy-action-btn" onClick={() => handleDownload(song)} disabled={downloading[song.id]}>
                    {downloading[song.id] ? <Spin size="small" /> : <DownloadOutlined />}
                  </button>
                </Tooltip>
                <Tooltip title="播放">
                  <button className="fy-action-btn fy-play-btn" onClick={() => handlePlay(song, aiRecs, i)}>
                    <PlayCircleOutlined />
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddToPlaylist
        songId={playlistModalSongId}
        open={!!playlistModalSongId}
        onClose={() => setPlaylistModalSongId(null)}
      />
    </div>
  );
};

export default ForYou;
