import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  HomeOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  HeartOutlined,
  HistoryOutlined,
  UploadOutlined,
  UserOutlined,
  LogoutOutlined,
  LoginOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { logout } from '../../store/slices/userSlice';
import './Sidebar.css';

const menuItems = [
  { key: '/', icon: <HomeOutlined />, label: '发现音乐' },
  { key: '/search', icon: <SearchOutlined />, label: '搜索' },
  { key: '/playlists', icon: <UnorderedListOutlined />, label: '歌单' },
  { key: '/for-you', icon: <RobotOutlined />, label: '猜你喜欢' },
  { key: '/favorites', icon: <HeartOutlined />, label: '我的收藏' },
  { key: '/history', icon: <HistoryOutlined />, label: '播放历史' },
  { key: '/local', icon: <UploadOutlined />, label: '本地音乐' },
  { key: '/settings', icon: <SettingOutlined />, label: '会员设置' },
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { isLoggedIn, user } = useSelector((s) => s.user);

  return (
    <div className="sidebar">
      <div className="sidebar-logo" onClick={() => navigate('/')}>
        <span className="logo-icon">♪</span>
        <span className="logo-text">Music Player</span>
      </div>

      <nav className="sidebar-menu">
        {menuItems.map((item) => (
          <div
            key={item.key}
            className={`sidebar-menu-item ${location.pathname === item.key ? 'active' : ''}`}
            onClick={() => navigate(item.key)}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {isLoggedIn ? (
          <div className="user-section">
            <div className="user-info">
              <UserOutlined style={{ fontSize: 18 }} />
              <span className="user-name">{user?.username || '用户'}</span>
            </div>
            <div
              className="sidebar-menu-item"
              onClick={() => {
                dispatch(logout());
                navigate('/');
              }}
            >
              <span className="menu-icon"><LogoutOutlined /></span>
              <span className="menu-label">退出登录</span>
            </div>
          </div>
        ) : (
          <div
            className="sidebar-menu-item"
            onClick={() => navigate('/login')}
          >
            <span className="menu-icon"><LoginOutlined /></span>
            <span className="menu-label">登录</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
