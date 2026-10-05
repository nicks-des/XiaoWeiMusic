import React, { useState, useEffect } from 'react';
import { Modal, List, Button, Empty, Spin, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { playlistsAPI } from '../../services/api';
import LoadingSpinner from '../LoadingSpinner';

const AddToPlaylist = ({ songId, open, onClose }) => {
  const { message } = App.useApp();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState({});

  useEffect(() => {
    if (open) {
      fetchPlaylists();
    }
  }, [open]);

  const fetchPlaylists = async () => {
    setLoading(true);
    try {
      const { data } = await playlistsAPI.list({ page: 1, limit: 50 });
      if (data.code === 200) {
        setPlaylists(data.data?.list || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (playlistId) => {
    setAdding(prev => ({ ...prev, [playlistId]: true }));
    try {
      const { data } = await playlistsAPI.addSong(playlistId, songId);
      if (data.code === 200) {
        message.success(data.message || '已添加到歌单');
        onClose();
      } else {
        message.error(data.message || '添加失败');
      }
    } catch (e) {
      message.error(e.response?.data?.message || '添加失败');
    } finally {
      setAdding(prev => ({ ...prev, [playlistId]: false }));
    }
  };

  return (
    <Modal
      title="添加到歌单"
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      destroyOnHidden
    >
      {loading ? (
        <LoadingSpinner style={{ padding: 40 }} />
      ) : playlists.length === 0 ? (
        <Empty description="暂无歌单，请先创建歌单" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          dataSource={playlists}
          renderItem={(pl) => (
            <List.Item
              actions={[
                <Button
                  key="add"
                  type="text"
                  icon={adding[pl.id] ? <Spin size="small" /> : <PlusOutlined />}
                  onClick={() => handleAdd(pl.id)}
                  loading={adding[pl.id]}
                  style={{ color: '#1db954' }}
                >
                  添加
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={<span style={{ fontSize: 24 }}>♪</span>}
                title={pl.name}
                description={`${pl.song_count || 0} 首歌曲`}
              />
            </List.Item>
          )}
          style={{ maxHeight: 300, overflow: 'auto' }}
        />
      )}
    </Modal>
  );
};

export default AddToPlaylist;
