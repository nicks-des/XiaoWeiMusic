import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { InboxOutlined, PlayCircleOutlined, FolderOpenOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import { Upload, Button, Table, Tag, Tooltip, Input, Space, App, Popconfirm } from 'antd';
import { songsAPI, localSongsAPI } from '../../services/api';
import { playSong } from '../../store/slices/playerSlice';
import './LocalImport.css';

const { Dragger } = Upload;

const LocalImport = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanDir, setScanDir] = useState('');

  // Load all local songs from database
  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await songsAPI.list({ limit: 500 });
      if (res.data?.code === 200) {
        const list = (res.data.data?.list || []).filter(
          s => s.source === 'local' || (s.audio_url && !s.netease_id)
        );
        setSongs(list);
      }
    } catch (e) {
      message.error('加载本地歌曲失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { loadSongs(); }, [loadSongs]);

  // Build audio URL - uploaded (/uploads/xxx) or scanned (/api/local-songs/stream/:id)
  const getAudioUrl = (song) => {
    if (!song.audio_url) return null;
    return song.audio_url;
  };

  const handlePlay = (song) => {
    const queue = songs.map(s => ({
      ...s,
      audio_url: getAudioUrl(s),
    }));
    const idx = songs.findIndex(s => s.id === song.id);
    dispatch(playSong({
      song: { ...song, audio_url: getAudioUrl(song) },
      queue,
      index: idx,
    }));
  };

  const handlePlayAll = () => {
    if (songs.length > 0) handlePlay(songs[0]);
  };

  // Directory scan
  const handleDelete = async (record, e) => {
    e.stopPropagation();
    try {
      await songsAPI.delete(record.id);
      message.success('已删除');
      setSongs(prev => prev.filter(s => s.id !== record.id));
    } catch (err) {
      message.error('删除失败: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleScan = async () => {
    const dir = scanDir.trim();
    if (!dir) {
      message.warning('请输入音乐文件夹路径');
      return;
    }
    setScanning(true);
    try {
      const res = await localSongsAPI.scan(dir);
      if (res.data?.code === 200) {
        const { new: count, total } = res.data.data;
        if (count > 0) {
          message.success(`扫描完成，新增 ${count} 首歌曲 (共发现 ${total} 个文件)`);
        } else {
          message.info(`目录中有 ${total} 个音乐文件，均已在库中`);
        }
        loadSongs();
      }
    } catch (e) {
      message.error('扫描失败: ' + (e.response?.data?.message || e.message));
    } finally {
      setScanning(false);
    }
  };

  // Upload handler
  const handleBatchUpload = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append('files', file);
    setUploading(true);
    try {
      const response = await songsAPI.upload(formData);
      if (response.data.code === 200) {
        message.success(`导入 ${(response.data.data || []).length} 首歌曲`);
        onSuccess(response.data, file);
        loadSongs();
      } else {
        message.error(response.data.message || '上传失败');
        onError(new Error(response.data.message));
      }
    } catch (err) {
      message.error('上传失败: ' + (err.response?.data?.message || err.message));
      onError(err);
    } finally {
      setUploading(false);
    }
  };

  const columns = [
    { title: '#', width: 45, render: (_, __, i) => i + 1 },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '艺术家', dataIndex: 'artist', width: 150, ellipsis: true },
    {
      title: '来源', width: 80,
      render: (_, record) => (
        <Tag color={record.audio_url?.startsWith('/uploads/') ? 'blue' : 'green'}>
          {record.audio_url?.startsWith('/uploads/') ? '导入' : '本地'}
        </Tag>
      ),
    },
    {
      title: '操作', width: 100,
      render: (_, record) => (
        <Space>
          <Tooltip title="播放">
            <button className="li-action-btn" onClick={(e) => { e.stopPropagation(); handlePlay(record); }}>
              <PlayCircleOutlined />
            </button>
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description={`确定删除「${record.title}」吗？`}
            onConfirm={(e) => handleDelete(record, e)}
            onCancel={(e) => e.stopPropagation()}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除">
              <button className="li-action-btn li-delete-btn" onClick={(e) => e.stopPropagation()}>
                <DeleteOutlined />
              </button>
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="local-import-page">
      <div className="import-header">
        <h1>本地音乐</h1>
        <p>扫描电脑上的音乐文件夹，或拖拽上传音乐文件</p>
      </div>

      {/* ── 目录扫描 ── */}
      <div className="scan-section">
        <div className="scan-input-row">
          <Input
            prefix={<FolderOpenOutlined style={{ color: '#999' }} />}
            placeholder="输入音乐文件夹路径，如 D:\Music"
            value={scanDir}
            onChange={(e) => setScanDir(e.target.value)}
            onPressEnter={handleScan}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleScan}
            loading={scanning}
            style={{ background: '#1db954', borderColor: '#1db954' }}
          >
            扫描目录
          </Button>
        </div>
      </div>

      {/* ── 拖拽上传 ── */}
      <Dragger
        name="files"
        multiple
        accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,.ape,.alac,.opus,.aiff,.dsf,.dff,.wv"
        showUploadList={false}
        customRequest={handleBatchUpload}
        beforeUpload={(file) => {
          if (file.size > 500 * 1024 * 1024) {
            message.error('文件大小不能超过 500MB');
            return false;
          }
          return true;
        }}
        disabled={uploading}
        style={{ marginBottom: 24 }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{uploading ? '正在导入...' : '点击或拖拽音乐文件到此处上传'}</p>
        <p className="ant-upload-hint">支持 SQ/HQ 无损格式 (FLAC, APE, ALAC, DSD, WAVPack, WAV 等)</p>
      </Dragger>

      {/* ── 歌曲列表 ── */}
      <div className="local-song-list">
        <div className="local-list-header">
          <h2>我的本地音乐 ({songs.length})</h2>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadSongs}
              loading={loading}
            >
              刷新
            </Button>
            {songs.length > 0 && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handlePlayAll}
                style={{ background: '#1db954', borderColor: '#1db954' }}
              >
                播放全部
              </Button>
            )}
          </Space>
        </div>

        {songs.length === 0 && !loading ? (
          <div className="local-empty">
            <FolderOpenOutlined style={{ fontSize: 48, opacity: 0.2 }} />
            <p>暂无本地音乐</p>
            <p className="local-empty-hint">扫描电脑上的音乐文件夹，或拖拽音乐文件到上方区域</p>
          </div>
        ) : (
          <Table
            dataSource={songs}
            columns={columns}
            rowKey="id"
            pagination={songs.length > 50 ? { pageSize: 50 } : false}
            size="small"
            loading={loading}
            onRow={(record) => ({
              onClick: () => handlePlay(record),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </div>
    </div>
  );
};

export default LocalImport;
