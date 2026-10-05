import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, App } from 'antd';
import { HistoryOutlined, PlayCircleOutlined, LoginOutlined } from '@ant-design/icons';
import { usersAPI } from '../../services/api';
import { setHistory } from '../../store/slices/musicSlice';
import { playSong } from '../../store/slices/playerSlice';
import { formatDuration } from '../../utils/format';
import LoadingSpinner from '../../components/LoadingSpinner';
import './History.css';

const History = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoggedIn } = useSelector((s) => s.user);
  const { history } = useSelector((s) => s.music);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoggedIn) fetchHistory();
    else setLoading(false);
  }, [isLoggedIn]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data } = await usersAPI.history();
      if (data.code === 200) {
        dispatch(setHistory(data.data || []));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (item, index) => {
    const queue = history.map(h => h);
    dispatch(playSong({ song: item, queue, index }));
  };

  if (!isLoggedIn) {
    return (
      <div className="history-page">
        <Empty description="请先登录查看播放历史" style={{ marginTop: 60 }}>
          <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate('/login')} style={{ background: '#1db954', borderColor: '#1db954' }}>
            去登录
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="page-header">
        <h1><HistoryOutlined /> 播放历史</h1>
        <p>最近播放的 {history.length} 首歌曲</p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : history.length === 0 ? (
        <Empty description="暂无播放记录" style={{ marginTop: 60 }} />
      ) : (
        <div className="history-list">
          <div className="history-list-header">
            <span className="col-num">#</span>
            <span className="col-title">标题</span>
            <span className="col-time">播放时间</span>
            <span className="col-duration">时长</span>
          </div>
          {history.map((item, i) => (
            <div className="history-row" key={item.id} onClick={() => handlePlay(item, i)}>
              <span className="history-num">{i + 1}</span>
              <div className="history-song-info">
                <img src={item.cover_url || `https://picsum.photos/seed/song${item.song_id}/40/40`} alt="" className="history-cover" />
                <div>
                  <div className="history-title">{item.title}</div>
                  <div className="history-artist">{item.artist}</div>
                </div>
              </div>
              <span className="history-time">{formatDate(item.played_at)}</span>
              <span className="history-duration">{formatDuration(item.duration)}</span>
              <PlayCircleOutlined className="history-play-icon" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hour = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hour}:${min}`;
};

export default History;
