import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  FireOutlined, ClockCircleOutlined,
  RobotOutlined, ReloadOutlined,
  PauseCircleOutlined, AppstoreOutlined, UnorderedListOutlined,
  PlayCircleFilled,
} from '@ant-design/icons';
import { Tag, Spin, App, Tooltip, Select } from 'antd';
import { aiRecommendationsAPI, recommendationsAPI, usersAPI, musicSourceAPI } from '../../services/api';
import { playSong, togglePlay } from '../../store/slices/playerSlice';
import { isSameSong, ensureStreamUrl, ensureQueueUrls, isOnlineSong } from '../../utils/songMatch';
import AddToPlaylist from '../../components/AddToPlaylist';
import MVPlayer from '../../components/MVPlayer';
import SongCard from '../../components/SongCard';
import { formatDuration } from '../../utils/format';
import { getMoodLabel } from '../../utils/labels';
import './Home.css';

const SongListRow = React.memo(({ song, i, active, isPlaying, onPlay, songs }) => (
  <div
    className={`song-list-row ${active ? 'song-list-row--active' : ''}`}
    onClick={() => onPlay(song, songs, i)}
  >
    <span className="song-list-col col-index">
      {active && isPlaying ? (
        <PauseCircleOutlined style={{ fontSize: 18, color: '#1db954' }} />
      ) : (
        <span className="song-list-index">{i + 1}</span>
      )}
    </span>
    <span className="song-list-col col-song">
      <img
        src={song.cover_url || `https://picsum.photos/seed/${song.id}/80/80`}
        alt=""
        className="song-list-cover"
      />
      <span className="song-list-title" title={song.title}>{song.title}</span>
    </span>
    <span className="song-list-col col-artist" title={song.artist}>{song.artist}</span>
    <span className="song-list-col col-genre">
      <Tag color="green" bordered={false}>
        {song.genre || '音乐'}
      </Tag>
    </span>
    <span className="song-list-col col-duration">{formatDuration(song.duration)}</span>
  </div>
));

const SongList = React.memo(({ songs, isCurrentSong, isPlaying, onPlay }) => (
  <div className="song-list-table">
    <div className="song-list-header">
      <span className="song-list-header-col col-index">#</span>
      <span className="song-list-header-col col-song">歌曲</span>
      <span className="song-list-header-col col-artist">歌手</span>
      <span className="song-list-header-col col-genre">风格</span>
      <span className="song-list-header-col col-duration">时长</span>
    </div>
    <div className="song-list-body">
      {songs.map((song, i) => (
        <SongListRow
          key={song.id}
          song={song}
          i={i}
          active={isCurrentSong(song)}
          isPlaying={isPlaying}
          onPlay={onPlay}
          songs={songs}
        />
      ))}
    </div>
  </div>
));

const PLATFORM_OPTIONS = [
  { value: 'local', label: '本地' },
  { value: 'netease', label: '网易云' },
  { value: 'qqmusic', label: 'QQ音乐' },
  { value: 'kugou', label: '酷狗' },
  { value: 'kuwo', label: '酷我' },
];

const Home = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const { isLoggedIn, token } = useSelector((s) => s.user);
  const { currentSong, isPlaying, audioQuality } = useSelector((s) => s.player);
  const [daily, setDaily] = useState([]);
  const [hot, setHot] = useState([]);
  const [onlineRecs, setOnlineRecs] = useState([]);
  const [aiRecs, setAiRecs] = useState([]);
  const [aiProfile, setAiProfile] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [playlistModalSongId, setPlaylistModalSongId] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [mvPlayer, setMvPlayer] = useState({ open: false, mvId: 0, title: '', artist: '' });
  const [viewMode, setViewMode] = useState('grid');
  const [aiRefreshKey, setAiRefreshKey] = useState(0);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [dailyRefreshKey, setDailyRefreshKey] = useState(0);
  const [hotRefreshKey, setHotRefreshKey] = useState(0);
  const [onlineRefreshKey, setOnlineRefreshKey] = useState(0);
  const [dailySource, setDailySource] = useState('local');
  const [hotSource, setHotSource] = useState('local');

  useEffect(() => {
    const fetchData = async () => {
      const isFirstLoad = dailyRefreshKey === 0 && hotRefreshKey === 0;
      if (isFirstLoad) setLoading(true);
      try {
        const [dailyRes, hotRes] = await Promise.all([
          recommendationsAPI.get({ type: 'daily', limit: 8, source: dailySource, refresh: dailyRefreshKey > 0 ? 'true' : 'false' }),
          recommendationsAPI.get({ type: 'hot', limit: 8, source: hotSource, refresh: hotRefreshKey > 0 ? 'true' : 'false' }),
        ]);
        if (dailyRes.data.code === 200) setDaily(dailyRes.data.data || []);
        if (hotRes.data.code === 200) setHot(hotRes.data.data || []);
      } catch (e) {
        console.error('Failed to load recommendations:', e);
      }

      // Fetch online recommendations (Netease new songs)
      try {
        const onlineRes = await musicSourceAPI.recommend(8);
        if (onlineRes.data.code === 200) setOnlineRecs(onlineRes.data.data?.list || []);
      } catch (e) {
        console.error('Failed to load online recommendations:', e);
      }

      if (isLoggedIn && token) {
        try {
          const isRefresh = aiRefreshKey > 0;
          if (isRefresh) setAiRefreshing(true);
          const aiRes = await aiRecommendationsAPI.get({ refresh: isRefresh ? 'true' : 'false' });
          if (aiRes.data.code === 200) {
            setAiRecs(aiRes.data.data.recommendations || []);
            setAiProfile(aiRes.data.data.tasteProfile);
          }
        } catch (e) {
          console.error('AI recommendations failed:', e);
        } finally {
          setAiRefreshing(false);
        }
        try {
          const favRes = await usersAPI.favorites();
          if (favRes.data.code === 200) {
            setFavorites(new Set((favRes.data.data || []).map(f => f.id)));
          }
        } catch (e) { /* ignore */ }
      }

      setLoading(false);
    };
    fetchData();
  }, [isLoggedIn, token, aiRefreshKey, dailyRefreshKey, hotRefreshKey, onlineRefreshKey, dailySource, hotSource]);

  const handleRefreshDaily = () => setDailyRefreshKey(k => k + 1);
  const handleRefreshHot = () => setHotRefreshKey(k => k + 1);
  const handleRefreshOnline = () => setOnlineRefreshKey(k => k + 1);
  const handleRefreshAI = () => {
    setAiRefreshKey(k => k + 1);
  };

  const handlePlay = (song, list, index) => {
    // Pre-set proxy URLs on every song in the queue so playback advances
    // seamlessly (no race with the lazy fetcher in useAudioPlayer)
    const preparedSong = ensureStreamUrl(song, audioQuality);
    const preparedList = ensureQueueUrls(list, audioQuality);
    if (isOnlineSong(song)) {
      // Persist the proxy URL back into the list so the next/prev songs
      // also have valid URLs when the user advances
      const i = list.findIndex(s => s.id === song.id);
      if (i >= 0) list[i] = preparedSong;
    }
    dispatch(playSong({ song: preparedSong, queue: preparedList, index }));
  };

  const handleToggleCardPlay = (song, list, index, e) => {
    e.stopPropagation();
    const isCurrent = isSameSong(song, currentSong);
    if (isCurrent) {
      // Same song — toggle play/pause
      dispatch(togglePlay());
    } else {
      // Different song — start playing from beginning
      handlePlay(song, list, index);
    }
  };

  const handlePlayAll = (songs) => {
    if (!songs || songs.length === 0) return;
    const prepared = ensureQueueUrls(songs, audioQuality);
    dispatch(playSong({ song: prepared[0], queue: prepared, index: 0 }));
    message.success(`已开始播放 ${songs.length} 首歌`);
  };

  const handleToggleFavorite = async (song, e) => {
    e.stopPropagation();
    if (!isLoggedIn) { message.warning('请先登录'); return; }
    try {
      if (favorites.has(song.id)) {
        await usersAPI.removeFavorite(song.id);
        setFavorites(prev => { const n = new Set(prev); n.delete(song.id); return n; });
        message.success('已取消收藏');
      } else {
        await usersAPI.addFavorite(song.id, {
          title: song.title, artist: song.artist,
          duration: song.duration, cover_url: song.cover_url,
          genre: song.genre || '其他', source: song.source || 'local'
        });
        setFavorites(prev => new Set(prev).add(song.id));
        message.success('已收藏');
      }
    } catch (err) {
      message.error('操作失败');
    }
  };

  const isCurrentSong = (song) => isSameSong(song, currentSong);

  const handleWatchMV = (mvInfo) => {
    setMvPlayer({ open: true, mvId: mvInfo.mvId, title: mvInfo.title, artist: mvInfo.artist });
  };

  const handleDeleteLocal = async (song) => {
    try {
      await songsAPI.delete(song.id);
      message.success('已删除');
      // Remove from all lists
      setDaily(prev => prev.filter(s => s.id !== song.id));
      setHot(prev => prev.filter(s => s.id !== song.id));
    } catch (err) {
      message.error('删除失败: ' + (err.response?.data?.message || err.message));
    }
  };

  const songCardProps = {
    currentSong,
    isPlaying,
    hoveredCard,
    favorites,
    isLoggedIn,
    onPlay: handlePlay,
    onToggleCardPlay: handleToggleCardPlay,
    onToggleFavorite: handleToggleFavorite,
    onAddToPlaylist: setPlaylistModalSongId,
    onWatchMV: handleWatchMV,
    onHoverEnter: (id) => setHoveredCard(id),
    onHoverLeave: () => setHoveredCard(null),
  };
  // Local songs get the delete option
  const localCardProps = { ...songCardProps, onDelete: handleDeleteLocal };

  const renderSection = (title, icon, songs, aiTags, cardProps = songCardProps, onRefresh = null, sourceSelector = null) => (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">
          {icon}
          <span>{title}</span>
        </h2>
        {aiTags}
        {sourceSelector}
        {songs.length > 0 && (
          <button
            className="section-play-all"
            onClick={() => handlePlayAll(songs)}
          >
            <PlayCircleFilled />
            <span>播放全部</span>
          </button>
        )}
        {onRefresh && (
          <Tooltip title="换一批">
            <button className="section-refresh-btn" onClick={onRefresh}>
              <ReloadOutlined />
            </button>
          </Tooltip>
        )}
        <span className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'grid' ? 'view-toggle-btn--active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="卡片视图"
          >
            <AppstoreOutlined />
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'list' ? 'view-toggle-btn--active' : ''}`}
            onClick={() => setViewMode('list')}
            title="列表视图"
          >
            <UnorderedListOutlined />
          </button>
        </span>
      </div>
      {loading ? (
        <div className="loading-placeholder"><Spin /> 加载中...</div>
      ) : songs.length === 0 ? (
        <div className="empty-placeholder">暂无内容</div>
      ) : viewMode === 'grid' ? (
        <div className="song-card-grid">
          {songs.map((song, i) => (
            <SongCard key={song.id} song={song} index={i} list={songs} {...cardProps} />
          ))}
        </div>
      ) : (
        <SongList songs={songs} isCurrentSong={isCurrentSong} isPlaying={isPlaying} onPlay={handlePlay} />
      )}
    </div>
  );

  return (
    <>
    <div className="home-page">
      {/* Hero banner */}
      <div className="home-hero">
        <div className="home-hero-content">
          <div className="home-hero-text">
            <h1>发现好音乐</h1>
            <p>每日精选推荐，为你的生活添加旋律，让每一刻都充满节奏</p>
          </div>
          <button
            className="home-hero-action"
            onClick={() => handlePlayAll(daily.length ? daily : hot)}
            disabled={!daily.length && !hot.length}
          >
            <PlayCircleFilled />
            <span>立即播放</span>
          </button>
        </div>
      </div>

      {/* AI Recommendations */}
      {isLoggedIn && aiRecs.length > 0 &&
        renderSection(
          '猜你喜欢',
          <RobotOutlined />,
          aiRecs,
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {aiProfile && (
              <span className="ai-profile-tags">
                {aiProfile.topGenres?.slice(0, 3).map(g => (
                  <Tag key={g} color="green" bordered={false}>{g}</Tag>
                ))}
                {aiProfile.favoriteMood && (
                  <Tag color="blue" bordered={false}>{getMoodLabel(aiProfile.favoriteMood)}</Tag>
                )}
              </span>
            )}
            <Tooltip title="换一批推荐">
              <button
                className="ai-refresh-btn"
                onClick={handleRefreshAI}
                disabled={aiRefreshing}
              >
                <ReloadOutlined spin={aiRefreshing} />
              </button>
            </Tooltip>
          </span>
        )
      }

      {/* Daily recommendations */}
      {renderSection('每日推荐', <ClockCircleOutlined />, daily, null, localCardProps, handleRefreshDaily, (
        <Select value={dailySource} onChange={setDailySource} options={PLATFORM_OPTIONS}
          size="small" style={{ width: 80 }} className="section-source-select" />
      ))}

      {/* Hot songs */}
      {renderSection('热门榜单', <FireOutlined />, hot, null, localCardProps, handleRefreshHot, (
        <Select value={hotSource} onChange={setHotSource} options={PLATFORM_OPTIONS}
          size="small" style={{ width: 80 }} className="section-source-select" />
      ))}

      {/* Online recommendations (Netease new songs) */}
      {onlineRecs.length > 0 && (
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <PlayCircleFilled style={{ color: '#1db954' }} /> 网易云新歌榜
              <Tag color="green" bordered={false} style={{ marginLeft: 8, fontSize: 11 }}>在线</Tag>
            </div>
            <Tooltip title="换一批">
              <button className="section-refresh-btn" onClick={handleRefreshOnline}>
                <ReloadOutlined />
              </button>
            </Tooltip>
          </div>
          <div className="song-card-grid">
            {onlineRecs.map((song, i) => (
              <SongCard key={song.id} song={song} index={i} list={onlineRecs} {...songCardProps} />
            ))}
          </div>
        </div>
      )}
    </div>

    <AddToPlaylist
      songId={playlistModalSongId}
      open={!!playlistModalSongId}
      onClose={() => setPlaylistModalSongId(null)}
    />

    {mvPlayer.open && (
      <MVPlayer
        currentSong={{ title: mvPlayer.title, artist: mvPlayer.artist, video_url: '' }}
        open={mvPlayer.open}
        onClose={() => setMvPlayer({ open: false, mvId: 0, title: '', artist: '' })}
      />
    )}
    </>
  );
};

export default Home;
