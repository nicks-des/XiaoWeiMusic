import React from 'react';
import { UserOutlined, StarFilled } from '@ant-design/icons';

/* ============================================
   标签切换 (登录/注册)
   ============================================ */
const AuthTabs = ({ active, onChange }) => (
  <div className="auth-tabs">
    <button
      type="button"
      className={`auth-tab ${active === 'login' ? 'active' : ''}`}
      onClick={() => onChange('login')}
    >
      <UserOutlined /> 登 录
    </button>
    <button
      type="button"
      className={`auth-tab ${active === 'register' ? 'active' : ''}`}
      onClick={() => onChange('register')}
    >
      <StarFilled /> 注 册
    </button>
  </div>
);

/* ============================================
   顶部标题区域
   ============================================ */
const AuthHeader = ({ mode, onSwitch }) => (
  <>
    {mode === 'login' ? (
      <div className="auth-form-head">
        <h1 className="auth-form-title">欢迎回来 👋</h1>
        <p className="auth-form-subtitle">登录以继续你的音乐之旅</p>
      </div>
    ) : (
      <div className="auth-form-head">
        <h1 className="auth-form-title">创建账号 <span className="auth-form-title-emoji">🎵</span></h1>
        <p className="auth-form-subtitle">加入我们，开启个性化音乐体验</p>
      </div>
    )}
    <AuthTabs active={mode} onChange={onSwitch} />
  </>
);

export default AuthHeader;
