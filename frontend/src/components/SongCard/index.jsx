import React from 'react';
import {
  PlayCircleOutlined, HeartOutlined, HeartFilled, PlusOutlined,
  PauseCircleOutlined, PlayCircleFilled, VideoCameraOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Tag, App, Popconfirm } from 'antd';
import { isSameSong } from '../../utils/songMatch';
import { formatDuration } from '../../utils/format';

const SongCard = ({
  song, index, list,
  currentSong, isPlaying,
  hoveredCard, favorites, isLoggedIn,
  onPlay, onToggleCardPlay, onToggleFavorite,
  onAddToPlaylist, onWatchMV,
  onHoverEnter, onHoverLeave, onDelete,
}) => {
  const { message } = App.useApp();
  const active = isSameSong(song, currentSong);
  const hovered = hoveredCard === song.id;
  const isFav = favorites.has(song.id);

  return (
    <div
      className={`song-card ${active ? 'song-card--active' : ''}`}
      onClick={() => onPlay(song, list, index)}
      onMouseEnter={() => onHoverEnter(song.id)}
      onMouseLeave={() => onHoverLeave()}
    >
      <div className="song-card-cover">
        <img
          src={song.cover_url || `https://picsum.photos/seed/${song.id}/400/400`}
          alt={song.title}
          loading="lazy"
        />
        <div className={`song-card-cover-overlay ${(hovered || active) ? 'song-card-cover-overlay--visible' : ''}`}>
          <div className="song-card-cover-actions">
            <button
              className={`card-action-btn card-fav-btn ${isFav ? 'is-fav' : ''}`}
              onClick={(e) => onToggleFavorite(song, e)}
              title={isFav ? '取消收藏' : '收藏'}
            >
              {isFav ? <HeartFilled /> : <HeartOutlined />}
            </button>
            <button
              className="card-action-btn card-play-btn"
              onClick={(e) => onToggleCardPlay(song, list, index, e)}
              title={active && isPlaying ? '暂停' : '播放'}
            >
              {active && isPlaying ? <PauseCircleOutlined /> : <PlayCircleFilled />}
            </button>
            <button
              className="card-action-btn card-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (!isLoggedIn) { message.warning('请先登录'); return; }
                onAddToPlaylist(song.id);
              }}
              title="添加到歌单"
            >
              <PlusOutlined />
            </button>
            {(song.mv_id > 0 || (typeof song.mv_id === 'string' && song.mv_id.length > 0)) && (
              <button
                className="card-action-btn card-mv-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onWatchMV({ mvId: song.mv_id, title: song.title, artist: song.artist });
                }}
                title="观看MV"
              >
                <VideoCameraOutlined />
              </button>
            )}
            {onDelete && (
              <Popconfirm
                title="确认删除"
                description={`确定删除「${song.title}」吗？`}
                onConfirm={(e) => { e.stopPropagation(); onDelete(song); }}
                onCancel={(e) => e.stopPropagation()}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <button
                  className="card-action-btn card-delete-btn"
                  onClick={(e) => e.stopPropagation()}
                  title="删除歌曲"
                >
                  <DeleteOutlined />
                </button>
              </Popconfirm>
            )}
          </div>
        </div>
        {active && (
          <div className="song-card-playing-bar">
            <span className="bar" /><span className="bar" /><span className="bar" /><span className="bar" />
          </div>
        )}
      </div>
      <div className="song-card-body">
        <div className="song-card-title" title={song.title}>{song.title}</div>
        <div className="song-card-artist" title={song.artist}>{song.artist}</div>
        <div className="song-card-meta">
          <Tag color="green" bordered={false}>
            {song.genre || '音乐'}
          </Tag>
          <span className="song-card-duration">{formatDuration(song.duration)}</span>
        </div>
      </div>
    </div>
  );
};

export default SongCard;
