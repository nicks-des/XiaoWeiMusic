import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Form, Input, Empty, App } from 'antd';
import { PlusOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { playlistsAPI } from '../../services/api';
import { setPlaylists, addPlaylist as addPlaylistAction } from '../../store/slices/musicSlice';
import LoadingSpinner from '../../components/LoadingSpinner';
import './Playlists.css';

const Playlists = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoggedIn } = useSelector((s) => s.user);
  const { playlists } = useSelector((s) => s.music);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    setLoading(true);
    try {
      const { data } = await playlistsAPI.list({ page: 1, limit: 50 });
      if (data.code === 200) {
        dispatch(setPlaylists(data.data?.list || []));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values) => {
    try {
      const { data } = await playlistsAPI.create(values);
      if (data.code === 200) {
        dispatch(addPlaylistAction(data.data));
        message.success('歌单创建成功');
        setModalOpen(false);
        form.resetFields();
      }
    } catch (e) {
      message.error(e.response?.data?.message || '创建失败');
    }
  };

  return (
    <div className="playlists-page">
      <div className="page-header">
        <h1>歌单</h1>
        <p>创建和管理你的歌单</p>
      </div>

      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => isLoggedIn ? setModalOpen(true) : message.warning('请先登录')}
        style={{ background: '#1db954', borderColor: '#1db954', marginBottom: 24 }}
      >
        创建歌单
      </Button>

      {loading ? (
        <LoadingSpinner />
      ) : playlists.length === 0 ? (
        <Empty description="暂无歌单" style={{ marginTop: 60 }} />
      ) : (
        <div className="playlist-grid">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className="playlist-card"
              onClick={() => navigate(`/playlists/${pl.id}`)}
            >
              <div className="playlist-card-cover">
                <UnorderedListOutlined style={{ fontSize: 48, color: '#b3b3b3' }} />
              </div>
              <div className="playlist-card-title">{pl.name}</div>
              <div className="playlist-card-count">
                {pl.song_count || 0} 首歌曲
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="创建歌单"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="歌单名称" rules={[{ required: true, message: '请输入歌单名称' }]}>
            <Input placeholder="我的歌单" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="歌单描述（可选）" rows={3} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" style={{ background: '#1db954', borderColor: '#1db954' }}>
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Playlists;
