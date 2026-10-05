import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Input, Select, Empty, Spin, Tooltip, Tabs, Button, App, Tag, Pagination, Popconfirm } from 'antd';
import { SearchOutlined, PlayCircleOutlined, PlusSquareOutlined, ArrowDownOutlined, HeartOutlined, HeartFilled, CrownFilled, DeleteOutlined } from '@ant-design/icons';
import { songsAPI, musicSourceAPI, usersAPI } from '../../services/api';
import { playSong } from '../../store/slices/playerSlice';
import { isSameSong, isOnlineSong, ensureStreamUrl, ensureQueueUrls, buildProxyUrl } from '../../utils/songMatch';
import { formatDuration } from '../../utils/format';
import AddToPlaylist from '../../components/AddToPlaylist';
import './Search.css';

const PLATFORM_OPTIONS = [
  { value: 'netease', label: '网易云音乐' },
  { value: 'qqmusic', label: 'QQ音乐' },
  { value: 'kugou', label: '酷狗音乐' },
  { value: 'kuwo', label: '酷我音乐' },
  { value: 'all', label: '综合搜索' },
];

const Search = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const { isLoggedIn } = useSelector((s) => s.user);
  const currentSong = useSelector((s) => s.player.currentSong);
  const isPlaying = useSelector((s) => s.player.isPlaying);
  const audioQuality = useSelector((s) => s.player.audioQuality);
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('all');
  const [sourceTab, setSourceTab] = useState('local');
  const [platform, setPlatform] = useState('netease');
  const [results, setResults] = useState([]);
  const [neAuth, setNeAuth] = useState({ hasCookie: false });
  const [qqAuth, setQqAuth] = useState({ hasCookie: false });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [playlistModalSongId, setPlaylistModalSongId] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const [favLoading, setFavLoading] = useState({});
  const importingRef = useRef(new Set());
  const searchingRef = useRef(false);
  const playingRef = useRef(false);
  const playIdRef = useRef(0);

  const isCurrentSong = (song) => isSameSong(song, currentSong);

  // Load favorites on mount
  useEffect(() => {
    if (isLoggedIn) {
      usersAPI.favorites()
        .then(({ data }) => {
          if (data.code === 200 && data.data) {
            setFavorites(new Set(data.data.map(f => f.id)));
          }
        })
        .catch(() => {});
    }
  }, [isLoggedIn]);

  // Fetch platform auth status to know if VIP songs are playable
  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const [neRes, qqRes] = await Promise.allSettled([
          musicSourceAPI.neteaseAuth.status(),
          musicSourceAPI.qqmusicAuth.status(),
        ]);
        if (neRes.status === 'fulfilled' && neRes.value?.data?.code === 200) {
          setNeAuth(neRes.value.data.data);
        }
        if (qqRes.status === 'fulfilled' && qqRes.value?.data?.code === 200) {
          setQqAuth(qqRes.value.data.data);
        }
      } catch (_) {}
    };
    fetchAuth();
    const timer = setInterval(fetchAuth, 30000); // refresh every 30s
    return () => clearInterval(timer);
  }, []);

  const handleToggleFavorite = async (song, e) => {
    if (e) e.stopPropagation();
    if (!isLoggedIn) { message.warning('请先登录'); return; }
    let songId = song.id;

    const isOnline = song.source === 'netease' || song.source === 'qqmusic' || song.source === 'kugou' || song.source === 'kuwo';
    if (isOnline) {
      setFavLoading(prev => ({ ...prev, [songId]: true }));
      try {
        const { data } = await songsAPI.quickAdd({
          title: song.title,
          artist: song.artist,
          album: song.album || '',
          duration: song.duration || 0,
          genre: song.genre || '在线',
          cover_url: song.cover_url || '',
          id: String(song.id),
          source: song.source,
        });
        if (data.code === 200) {
          songId = data.data.id;
        } else {
          message.error(data.message || '注册失败');
          return;
        }
      } catch (err) {
        message.error('注册歌曲失败: ' + (err?.response?.data?.message || err.message));
        return;
      } finally {
        setFavLoading(prev => ({ ...prev, [song.id]: false }));
      }
    }

    setFavLoading(prev => ({ ...prev, [songId]: true }));
    try {
      if (favorites.has(songId)) {
        await usersAPI.removeFavorite(songId);
        setFavorites(prev => { const n = new Set(prev); n.delete(songId); return n; });
      } else {
        await usersAPI.addFavorite(songId);
        setFavorites(prev => new Set(prev).add(songId));
      }
    } catch (err) {
      message.error(err?.response?.data?.message || '收藏操作失败');
    } finally {
      setFavLoading(prev => ({ ...prev, [songId]: false }));
    }
  };

  const handleSearch = async (value, searchPage = 1) => {
    if (!value.trim() || searchingRef.current) return;
    searchingRef.current = true;
    setLoading(true);
    setSearched(true);
    setPage(searchPage);
    try {
      if (sourceTab === 'local') {
        const { data } = await songsAPI.search({ keyword: value.trim(), type, page: searchPage, limit: pageSize });
        if (data.code === 200) {
          setResults(data.data?.list || []);
          setTotal(data.data?.total || 0);
        }
      } else {
        const { data } = await musicSourceAPI.search({ keyword: value.trim(), page: searchPage, limit: pageSize, platform });
        if (data.code === 200) {
          setResults(data.data?.list || []);
          setTotal(data.data?.total || 0);
        } else {
          message.error(data.message || '在线搜索失败');
          setResults([]);
          setTotal(0);
        }
      }
    } catch (e) {
      console.error('Search failed:', e);
      message.error('搜索失败: ' + (e.response?.data?.message || e.message));
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
      searchingRef.current = false;
    }
  };

  const handlePageChange = (newPage) => {
    handleSearch(keyword, newPage);
  };

  const handlePlay = async (song, index, e) => {
    if (e) e.stopPropagation();

    // Allow concurrent clicks: cancel previous pending play
    if (playingRef.current) {
      playingRef.current = false; // release old lock
    }
    const playId = ++playIdRef.current;
    playingRef.current = true;

    // VIP 歌曲检查：有平台 cookie 则允许播放
    const online = isOnlineSong(song);
    if (online && song.fee > 0) {
      const hasAuth = (song.source === 'netease' && neAuth?.hasCookie)
        || (song.source === 'qqmusic' && qqAuth?.hasCookie);
      if (!hasAuth) {
        playingRef.current = false;
        message.warning({
          content: `「${song.title}」为 ${song.source === 'netease' ? '网易云' : 'QQ音乐'} VIP歌曲，需要绑定平台VIP账号才能完整播放。`,
          duration: 3,
        });
        return;
      }
    }

    try {
      const prepared = online
        ? { ...song, audio_url: buildProxyUrl(song.id, audioQuality), stream_url: buildProxyUrl(song.id, audioQuality) }
        : ensureStreamUrl(song, audioQuality);

      // 修复：避免在 setState updater 中 dispatch 触发其他组件渲染警告
      const updated = results.map(s => (s.id === song.id ? prepared : s));
      setResults(updated);
      try {
        dispatch(playSong({
          song: prepared,
          queue: ensureQueueUrls(updated, audioQuality),
          index,
        }));
      } catch (dispatchErr) {
        console.error('Dispatch error:', dispatchErr);
        message.error('播放失败，请稍后重试');
      }
    } catch (err) {
      console.error('Play error:', err);
      message.error('播放失败，请稍后重试');
    } finally {
      if (playId === playIdRef.current) {
        playingRef.current = false;
      }
    }
  };

  const handleImport = async (song, e) => {
    e.stopPropagation();
    if (importingRef.current.has(song.id)) return;
    importingRef.current.add(song.id);
    try {
      message.loading({ content: '正在导入...', key: 'import' });
      
      const audioResp = await fetch(buildProxyUrl(song.id, 'lossless'));
      if (!audioResp.ok) {
        message.error({ content: '下载音频失败，歌曲可能受版权保护', key: 'import' });
        return;
      }
      const blob = await audioResp.blob();
      
      const fileName = `${song.artist} - ${song.title}.mp3`;
      const file = new File([blob], fileName, { type: blob.type || 'audio/mpeg' });
      
      const formData = new FormData();
      formData.append('files', file);
      formData.append('meta', JSON.stringify([{
        title: song.title,
        artist: song.artist,
        album: song.album || '',
        duration: song.duration,
        genre: song.genre || '在线导入',
        cover_url: song.cover_url || '',
        source: song.source || '',
        mv_id: song.mv_id || song.mvId || 0,
        video_url: song.video_url || '',
      }]));

      const uploadResp = await songsAPI.upload(formData);
      if (uploadResp.data.code === 200) {
        message.success({ content: `成功导入: ${song.title}`, key: 'import' });
      } else {
        message.error({ content: uploadResp.data.message || '导入失败', key: 'import' });
      }
    } catch (err) {
      console.error('Import error:', err);
      message.error({ content: '导入失败: ' + (err.message || '网络错误'), key: 'import' });
    } finally {
      importingRef.current.delete(song.id);
    }
  };

  const handleDelete = async (song, e) => {
    e.stopPropagation();
    try {
      await songsAPI.delete(song.id);
      message.success('已删除');
      setResults(prev => prev.filter(s => s.id !== song.id));
    } catch (err) {
      message.error('删除失败: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleTabChange = (key) => {
    setSourceTab(key);
    setResults([]);
    setSearched(false);
    setPage(1);
    setTotal(0);
    if (key === 'local') setPlatform('netease');
  };

  const handlePlatformChange = (val) => {
    setPlatform(val);
    setResults([]);
    setSearched(false);
    setPage(1);
    setTotal(0);
  };

  return (
    <div className="search-page">
      <div className="page-header">
        <h1>搜索</h1>
        <p>搜索你喜欢的歌曲、歌手或专辑</p>
      </div>

      <div className="search-bar">
        <Input.Search
          size="large"
          placeholder="搜索歌曲、歌手或专辑..."
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
          enterButton="搜索"
          style={{ maxWidth: 400 }}
          allowClear
        />
        {sourceTab === 'local' ? (
          <Select
            value={type}
            onChange={setType}
            style={{ width: 100 }}
            size="large"
            options={[
              { value: 'all', label: '全部' },
              { value: 'title', label: '歌曲' },
              { value: 'artist', label: '歌手' },
              { value: 'album', label: '专辑' },
            ]}
          />
        ) : (
          <Select
            value={platform}
            onChange={handlePlatformChange}
            style={{ width: 140 }}
            size="large"
            options={PLATFORM_OPTIONS}
          />
        )}
      </div>

      <Tabs
        activeKey={sourceTab}
        onChange={handleTabChange}
        items={[
          { key: 'local', label: '本地音乐' },
          { key: 'online', label: '在线搜索' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {loading && (
        <div className="search-loading">
          <Spin size="large" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <Empty description={sourceTab === 'online' ? '在线搜索无结果，请尝试其他关键词' : '未找到相关歌曲'} style={{ marginTop: 60 }} />
      )}

      {!loading && results.length > 0 && (
        <div className="search-results">
          {sourceTab === 'local' ? (
            <>
              <div className="search-result-header">
                <span className="col-num">#</span>
                <span className="col-title">标题</span>
                <span className="col-genre">曲风</span>
                <span className="col-duration">时长</span>
                <span className="col-count">播放量</span>
                <span className="col-play"></span>
              </div>
              {results.map((song, i) => {
                const active = isCurrentSong(song);
                return (
                <div className={`search-result-row ${active ? 'search-result-row--active' : ''}`} key={song.id} onClick={(e) => handlePlay(song, i, e)}>
                  <span className="search-num">
                    {active && isPlaying ? (
                      <span className="search-playing-indicator">
                        <span className="bar" /><span className="bar" /><span className="bar" />
                      </span>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="search-song-info">
                    <img src={song.cover_url || `https://picsum.photos/seed/song${song.id}/40/40`} alt="" className="search-song-cover" />
                    <div>
                      <div className="search-song-title">{song.title}</div>
                      <div className="search-song-artist">{song.artist}</div>
                    </div>
                  </div>
                  <span className="search-genre">{song.genre || '-'}</span>
                  <span className="search-duration">{formatDuration(song.duration)}</span>
                  <span className="search-count">{(song.play_count || 0).toLocaleString()}</span>
                  <Tooltip title="添加到歌单">
                    <PlusSquareOutlined
                      className="search-playlist-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isLoggedIn) { message.warning('请先登录'); return; }
                        setPlaylistModalSongId(song.id);
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={favorites.has(song.id) ? '取消收藏' : '收藏'}>
                    <span
                      className={`search-fav-icon ${favLoading[song.id] ? 'search-fav-loading' : ''}`}
                      onClick={(e) => handleToggleFavorite(song, e)}
                    >
                      {favorites.has(song.id)
                        ? <HeartFilled style={{ color: '#ff4d4f' }} />
                        : <HeartOutlined />
                      }
                    </span>
                  </Tooltip>
                  <Tooltip title="删除">
                    <Popconfirm
                      title="确认删除"
                      description={`确定删除「${song.title}」吗？`}
                      onConfirm={(e) => handleDelete(song, e)}
                      onCancel={(e) => e.stopPropagation()}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <DeleteOutlined
                        className="search-delete-icon"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 15 }}
                      />
                    </Popconfirm>
                  </Tooltip>
                  <PlayCircleOutlined className="search-play-icon" />
                </div>
                );
              })}
            </>
          ) : (
            <>
              <div className="search-result-header">
                <span className="col-num">#</span>
                <span className="col-title">标题</span>
                <span className="col-genre">平台</span>
                <span className="col-genre">时长</span>
                <span className="col-album" style={{ flex: 1 }}>专辑</span>
                <span className="col-play"></span>
                <span className="col-genre">收藏</span>
                <span className="col-genre">导入</span>
              </div>
              {results.map((song, i) => {
                const active = isCurrentSong(song);
                return (
                <div
                  className={`search-result-row ${active ? 'search-result-row--active' : ''}`}
                  key={song.id}
                  onClick={(e) => handlePlay(song, i, e)}
                >
                  <span className="search-num">
                    {active && isPlaying ? (
                      <span className="search-playing-indicator">
                        <span className="bar" /><span className="bar" /><span className="bar" />
                      </span>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="search-song-info">
                    <img
                      src={song.cover_url || `https://picsum.photos/seed/song${song.id}/40/40`}
                      alt=""
                      className="search-song-cover"
                    />
                    <div>
                      <div className="search-song-title">
                        {song.title}
                        {song.fee > 0 && (
                          <Tag color="gold" style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                            <CrownFilled style={{ fontSize: 10, marginRight: 2 }} />VIP
                          </Tag>
                        )}
                      </div>
                      <div className="search-song-artist">{song.artist}</div>
                    </div>
                  </div>
                  <span className="search-genre">
                    <span style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 3,
                      background: song.source === 'netease' ? '#c62f2f' : song.source === 'qqmusic' ? '#31c27c' : song.source === 'kugou' ? '#2e8bca' : '#f90',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}>
                      {song.source === 'netease' ? '网易云' : song.source === 'qqmusic' ? 'QQ音乐' : song.source === 'kugou' ? '酷狗' : '酷我'}
                    </span>
                  </span>
                  <span className="search-genre">{formatDuration(song.duration)}</span>
                  <span className="search-album" style={{ flex: 1, fontSize: 13, color: '#b3b3b3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 12 }}>
                    {song.album || '-'}
                  </span>
                  <PlayCircleOutlined
                    className="search-play-icon"
                    onClick={(e) => { e.stopPropagation(); handlePlay(song, i); }}
                  />
                  <Tooltip title={favorites.has(song.id) ? '取消收藏' : '收藏'}>
                    <span
                      className={`search-fav-icon ${favLoading[song.id] ? 'search-fav-loading' : ''}`}
                      onClick={(e) => handleToggleFavorite(song, e)}
                    >
                      {favorites.has(song.id)
                        ? <HeartFilled style={{ color: '#ff4d4f' }} />
                        : <HeartOutlined />
                      }
                    </span>
                  </Tooltip>
                  <Tooltip title="导入到本地音乐库">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDownOutlined />}
                      onClick={(e) => handleImport(song, e)}
                      style={{ color: '#1db954', flexShrink: 0 }}
                    />
                  </Tooltip>
                </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {!loading && searched && results.length > 0 && total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20, marginBottom: 20 }}>
          <Pagination
            current={page}
            total={total}
            pageSize={pageSize}
            onChange={handlePageChange}
            showSizeChanger={false}
            showTotal={(t) => `共 ${t} 首`}
          />
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

export default Search;
