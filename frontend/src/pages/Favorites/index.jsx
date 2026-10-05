import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, App } from 'antd';
import { HeartFilled, PlayCircleOutlined, LoginOutlined } from '@ant-design/icons';
import { usersAPI } from '../../services/api';
import { setFavorites } from '../../store/slices/musicSlice';
import { playSong } from '../../store/slices/playerSlice';
import LoadingSpinner from '../../components/LoadingSpinner';
import './Favorites.css';

const Favorites = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoggedIn } = useSelector((s) => s.user);
  const { favorites } = useSelector((s) => s.music);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoggedIn) fetchFavorites();
    else setLoading(false);
  }, [isLoggedIn]);

  const fetchFavorites = async () => {
    setLoading(true);
    try {
      const { data } = await usersAPI.favorites();
      if (data.code === 200) {
        dispatch(setFavorites(data.data || []));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (songId) => {
    try {
      const { data } = await usersAPI.removeFavorite(songId);
      if (data.code === 200) {
        dispatch(setFavorites(favorites.filter(f => f.id !== songId && f.song_id !== songId)));
        message.success('已取消收藏');
      }
    } catch (e) {
      message.error('操作失败');
    }
  };

  const handlePlay = (song, index) => {
    const queue = favorites.map(f => f);
    dispatch(playSong({ song, queue, index }));
  };

  if (!isLoggedIn) {
    return (
      <div className="favorites-page">
        <Empty description="请先登录查看收藏" style={{ marginTop: 60 }}>
          <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate('/login')} style={{ background: '#1db954', borderColor: '#1db954' }}>
            去登录
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="favorites-page">
      <div className="page-header">
        <h1><HeartFilled style={{ color: '#1db954' }} /> 我的收藏</h1>
        <p>共 {favorites.length} 首收藏歌曲</p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : favorites.length === 0 ? (
        <Empty description="还没有收藏歌曲" style={{ marginTop: 60 }} />
      ) : (
        <div className="favorites-list">
          {favorites.map((fav, i) => (
            <div className="favorites-row" key={fav.id}>
              <span className="fav-num">{i + 1}</span>
              <div className="fav-song-info" onClick={() => handlePlay(fav, i)}>
                <img src={fav.cover_url || `https://picsum.photos/seed/song${fav.song_id}/40/40`} alt="" className="fav-cover" />
                <div>
                  <div className="fav-title">{fav.title}</div>
                  <div className="fav-artist">{fav.artist}</div>
                </div>
              </div>
              <span className="fav-genre">{fav.genre || '-'}</span>
              <HeartFilled className="fav-heart" onClick={() => handleRemove(fav.id || fav.song_id)} />
              <PlayCircleOutlined className="fav-play-icon" onClick={() => handlePlay(fav, i)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Favorites;
