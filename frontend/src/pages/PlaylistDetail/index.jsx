import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Button, Popconfirm, App } from 'antd';
import { PlayCircleOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { playlistsAPI } from '../../services/api';
import { playSong } from '../../store/slices/playerSlice';
import { formatDuration } from '../../utils/format';
import LoadingSpinner from '../../components/LoadingSpinner';
import './PlaylistDetail.css';

const PlaylistDetail = () => {
  const { message } = App.useApp();
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlaylist();
  }, [id]);

  const fetchPlaylist = async () => {
    setLoading(true);
    try {
      const { data } = await playlistsAPI.detail(id);
      if (data.code === 200) {
        setPlaylist(data.data);
        setSongs(data.data.songs || []);
      }
    } catch (e) {
      message.error('获取歌单失败');
      navigate('/playlists');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAll = () => {
    if (songs.length > 0) {
      dispatch(playSong({ song: songs[0], queue: songs, index: 0 }));
    }
  };

  const handleDelete = async () => {
    try {
      const { data } = await playlistsAPI.delete(id);
      if (data.code === 200) {
        message.success('歌单已删除');
        navigate('/playlists');
      }
    } catch (e) {
      message.error('删除失败');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!playlist) return null;

  return (
    <div className="playlist-detail-page">
      <div className="playlist-detail-header">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/playlists')}
          style={{ color: '#b3b3b3', marginBottom: 24 }}
        >
          返回歌单
        </Button>

        <div className="playlist-detail-info">
          <div className="playlist-detail-cover">
            <span>♪</span>
          </div>
          <div className="playlist-detail-text">
            <span className="playlist-detail-tag">歌单</span>
            <h1>{playlist.name}</h1>
            {playlist.description && <p>{playlist.description}</p>}
            <span className="playlist-detail-meta">{songs.length} 首歌曲</span>
          </div>
        </div>

        <div className="playlist-detail-actions">
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={handlePlayAll}
            disabled={songs.length === 0}
            style={{ background: '#1db954', borderColor: '#1db954' }}
          >
            播放全部
          </Button>
          <Popconfirm
            title="确定要删除这个歌单吗？"
            onConfirm={handleDelete}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />} size="large">
              删除歌单
            </Button>
          </Popconfirm>
        </div>
      </div>

      <div className="playlist-song-list">
        <div className="playlist-list-header">
          <span className="col-num">#</span>
          <span className="col-title">标题</span>
          <span className="col-genre">曲风</span>
          <span className="col-duration">时长</span>
        </div>
        {songs.map((song, i) => (
          <div
            key={song.id}
            className="playlist-song-row"
            onClick={() => dispatch(playSong({ song, queue: songs, index: i }))}
          >
            <span className="playlist-num">{i + 1}</span>
            <div className="playlist-song-info">
              <img src={song.cover_url || `https://picsum.photos/seed/song${song.id}/40/40`} alt="" className="playlist-song-cover" />
              <div>
                <div className="playlist-song-title">{song.title}</div>
                <div className="playlist-song-artist">{song.artist}</div>
              </div>
            </div>
            <span className="playlist-genre">{song.genre || '-'}</span>
            <span className="playlist-duration">{formatDuration(song.duration)}</span>
            <PlayCircleOutlined className="playlist-play-icon" />
          </div>
        ))}
        {songs.length === 0 && (
          <div style={{ textAlign: 'center', color: '#b3b3b3', padding: 40 }}>
            歌单中暂无歌曲
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaylistDetail;
