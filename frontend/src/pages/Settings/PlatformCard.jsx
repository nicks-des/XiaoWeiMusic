import React from 'react';
import { Button, Form, Input, Spin, Tooltip, Typography, Avatar } from 'antd';
import {
  CheckCircleFilled, DeleteOutlined, CrownFilled,
  QrcodeOutlined, PhoneOutlined, MailOutlined, UserOutlined, LockOutlined,
} from '@ant-design/icons';
import MethodSwitcher from './MethodSwitcher';
import QuickGuide from './QuickGuide';
import CookieForm from './CookieForm';

const { Text } = Typography;

const PLATFORM_META = {
  netease: { label: '网易云音乐', short: '网易云', gradient: 'linear-gradient(135deg, #ec4141 0%, #c62f2f 100%)', icon: '云', color: '#ec4141', iconClass: 'netease-icon' },
  qqmusic: { label: 'QQ音乐', short: 'QQ音乐', gradient: 'linear-gradient(135deg, #31c27c 0%, #1da863 100%)', icon: 'Q', color: '#31c27c', iconClass: 'qqmusic-icon' },
  kugou:   { label: '酷狗音乐', short: '酷狗',   gradient: 'linear-gradient(135deg, #2e6cf6 0%, #1a4fc0 100%)', icon: 'K', color: '#2e6cf6', iconClass: 'kugou-icon' },
  kuwo:    { label: '酷我音乐', short: '酷我',   gradient: 'linear-gradient(135deg, #ff8a00 0%, #ff6a00 100%)', icon: '酷', color: '#ff8a00', iconClass: 'kuwo-icon' },
};

const PlatformCard = ({
  platformKey,
  status,
  statusLoading,
  method,
  loading,
  copied,
  onCopy,
  onClear,
  onSetCookie,
  onLogin,
  onMethodChange,
  disableQr = false,
}) => {
  const meta = PLATFORM_META[platformKey] || PLATFORM_META.netease;
  const isNe = platformKey === 'netease';
  const isQq = platformKey === 'qqmusic';
  const isKg = platformKey === 'kugou';
  const isKw = platformKey === 'kuwo';
  const isConnected = status?.hasCookie;

  const loginUrls = {
    netease: 'https://music.163.com/',
    qqmusic: 'https://y.qq.com/',
    kugou: 'https://www.kugou.com/',
    kuwo: 'https://www.kuwo.cn/',
  };
  const snippets = {
    netease: `fetch('http://localhost:3000/api/music-source/auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'网易云登录成功！':'失败:'+d.message))`,
    qqmusic: `fetch('http://localhost:3000/api/music-source/qq-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'QQ音乐登录成功！':'失败:'+d.message))`,
    kugou: `fetch('http://localhost:3000/api/music-source/kg-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'酷狗登录成功！':'失败:'+d.message))`,
    kuwo: `fetch('http://localhost:3000/api/music-source/kw-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'酷我登录成功！':'失败:'+d.message))`,
  };

  const loginUrl = loginUrls[platformKey] || loginUrls.netease;
  const snippet = snippets[platformKey] || snippets.netease;
  const themeColor = meta.color;

  return (
    <div className={`platform-card ${platformKey}`}>
      {/* 左侧品牌色条 */}
      <div className="card-accent" />

      <div className="card-body">
        {/* ── 卡片头部 ── */}
        <div className="platform-header">
          <div className={`platform-icon ${meta.iconClass}`}>
            {meta.icon}
          </div>
          <div className="platform-info">
            <div className="platform-name">{meta.label}</div>
            <div className="platform-status">
              {statusLoading ? (
                <Spin size="small" />
              ) : (
                <span className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
                  <span className="status-dot" />
                  {isConnected ? '已连接' : '未连接'}
                </span>
              )}
            </div>
          </div>
          {isConnected && (
            <Tooltip title={isNe ? '退出登录' : '清除配置'}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={onClear}
                className="logout-btn"
              />
            </Tooltip>
          )}
        </div>

        {/* ── 已连接状态 ── */}
        {isConnected ? (
          <div className="logged-in-info">
            {status?.profile?.avatarUrl ? (
              <Avatar src={status.profile.avatarUrl} size={44} />
            ) : (
              <CheckCircleFilled style={{ color: '#52c41a', fontSize: 44 }} />
            )}
            <Text className="logged-in-name">
              {status?.profile?.nickname
                ? `${status.profile.nickname}`
                : 'VIP 权限已就绪'}
              {isNe && !status?.profile?.nickname ? '，可以播放付费歌曲' : ''}
              {isQq && status?.uin && status.uin !== '0' ? ` · QQ ${status.uin}` : ''}
            </Text>
          </div>
        ) : (
          <>
            {/* ── 登录方式切换 ── */}
            <MethodSwitcher
              method={method}
              onMethodChange={onMethodChange}
              ne={isNe}
              qq={isQq}
              color={themeColor}
              disableQr={disableQr || isQq || isKg || isKw}
            />

            <div className="method-content">
              {/* Cookie 粘贴 */}
              {method === 'cookie' && (
                <CookieForm
                  onFinish={onSetCookie}
                  placeholder={`粘贴从 ${loginUrl.replace('https://', '')} 复制的 Cookie...`}
                  loading={loading}
                  platformKey={platformKey}
                />
              )}

              {/* 账号密码登录 (仅网易云) */}
              {method === 'login' && isNe && (
                <Form onFinish={onLogin} layout="vertical" className="login-form">
                  <Form.Item label={<Text type="secondary" style={{ fontSize: 12 }}>手机号或邮箱（二选一）</Text>} style={{ marginBottom: 8 }}>
                    <Input.Group compact>
                      <Form.Item name="phone" noStyle rules={[{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不对' }]}>
                        <Input placeholder="手机号" prefix={<PhoneOutlined />} className="login-input left" />
                      </Form.Item>
                      <Form.Item name="email" noStyle rules={[{ type: 'email', message: '邮箱格式不对' }]}>
                        <Input placeholder="邮箱" prefix={<MailOutlined />} className="login-input right" />
                      </Form.Item>
                    </Input.Group>
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]} style={{ marginBottom: 12 }}>
                    <Input.Password placeholder="密码" className="login-input" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" ghost htmlType="submit" loading={loading}>登录</Button>
                  </Form.Item>
                </Form>
              )}

              {/* QQ号+密码登录 (QQ音乐电脑端登录) */}
              {method === 'login' && isQq && (
                <Form onFinish={onLogin} layout="vertical" className="login-form">
                  <Form.Item name="uin" rules={[{ required: true, message: '请输入QQ号' }]} style={{ marginBottom: 8 }}>
                    <Input placeholder="QQ号" prefix={<UserOutlined />} className="login-input" />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, message: '请输入QQ密码' }]} style={{ marginBottom: 12 }}>
                    <Input.Password placeholder="QQ密码" prefix={<LockOutlined />} className="login-input" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" ghost htmlType="submit" loading={loading}>
                      登录 QQ 音乐
                    </Button>
                  </Form.Item>
                </Form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PlatformCard;
