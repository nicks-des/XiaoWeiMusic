import React, { useState, useEffect, useRef } from 'react';
import { App, Button, Space, Typography, Tooltip, Tag, Empty, Spin } from 'antd';
import {
  SettingOutlined, LinkOutlined, StopOutlined,
  ReloadOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { musicSourceAPI, platformLoginAPI } from '../../services/api';
import PlatformCard from './PlatformCard';
import './Settings.css';

const { Text, Title } = Typography;

const PLATFORM_META = {
  netease: { label: '网易云音乐', short: '网易云', gradient: 'linear-gradient(135deg, #ec4141 0%, #c62f2f 100%)', icon: '云' },
  qqmusic: { label: 'QQ音乐', short: 'QQ音乐', gradient: 'linear-gradient(135deg, #31c27c 0%, #1da863 100%)', icon: 'Q' },
  kugou:   { label: '酷狗音乐', short: '酷狗',   gradient: 'linear-gradient(135deg, #2e6cf6 0%, #1a4fc0 100%)', icon: 'K' },
  kuwo:    { label: '酷我音乐', short: '酷我',   gradient: 'linear-gradient(135deg, #ff8a00 0%, #ff6a00 100%)', icon: '酷' },
};

const copyToClipboard = (text) => {
  const clipboard = navigator?.clipboard;
  if (clipboard?.writeText) {
    clipboard.writeText(text).catch(() => {});
  } else {
    // Electron 降级方案：用 textarea + execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { /* 忽略 */ }
  }
};

const Settings = () => {
  const { message, modal } = App.useApp();
  const { isLoggedIn } = useSelector((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [qqStatus, setQqStatus] = useState(null);
  const [kgStatus, setKgStatus] = useState(null);
  const [kwStatus, setKwStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [neCopied, setNeCopied] = useState(false);
  const [qqCopied, setQqCopied] = useState(false);
  const [kgCopied, setKgCopied] = useState(false);
  const [kwCopied, setKwCopied] = useState(false);
  const [neMethod, setNeMethod] = useState('cookie');
  const [qqMethod, setQqMethod] = useState('cookie');
  const [myBindings, setMyBindings] = useState([]);
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = async () => {
    try {
      setStatusLoading(true);
      // allSettled: 任一平台失败不影响其他平台状态更新
      const results = await Promise.allSettled([
        musicSourceAPI.neteaseAuth.status(),
        musicSourceAPI.qqmusicAuth.status(),
        musicSourceAPI.kugouAuth.status(),
        musicSourceAPI.kuwoAuth.status(),
      ]);
      if (results[0].status === 'fulfilled' && results[0].value?.data?.code === 200) {
        setStatus(results[0].value.data.data);
      }
      if (results[1].status === 'fulfilled' && results[1].value?.data?.code === 200) {
        setQqStatus(results[1].value.data.data);
      }
      if (results[2].status === 'fulfilled' && results[2].value?.data?.code === 200) {
        setKgStatus(results[2].value.data.data);
      }
      if (results[3].status === 'fulfilled' && results[3].value?.data?.code === 200) {
        setKwStatus(results[3].value.data.data);
      }
    } catch (e) { /* ignore */ }
    finally { setStatusLoading(false); }
  };

  const fetchMyBindings = async () => {
    if (!isLoggedIn) {
      setMyBindings([]);
      return;
    }
    try {
      setBindingsLoading(true);
      const res = await platformLoginAPI.myBindings();
      if (res.data?.code === 200) {
        setMyBindings(res.data.data || []);
      }
    } catch (e) {
      console.error('Fetch bindings error:', e);
    } finally {
      setBindingsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchMyBindings();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!status?.hasCookie || !qqStatus?.hasCookie) {
      pollRef.current = setInterval(fetchStatus, 5000);
      return () => clearInterval(pollRef.current);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [status?.hasCookie, qqStatus?.hasCookie]);

  const handleSetCookie = async (values) => {
    setLoading(true);
    try {
      const res = await musicSourceAPI.neteaseAuth.setCookie(values.cookie);
      if (res.data.code === 200) { message.success('已设置，VIP 歌曲可播放'); fetchStatus(); }
    } catch (e) { message.error('设置失败'); }
    finally { setLoading(false); }
  };

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      // QQ Music login
      if (values.uin) {
        const res = await musicSourceAPI.qqmusicAuth.login(values);
        if (res.data.code === 200) {
          if (res.data.data?.needCaptcha) {
            modal.info({
              title: '需要安全验证',
              content: (
                <div>
                  <p>您的QQ账号需要安全验证，请点击下方链接完成验证后重试：</p>
                  <a href={res.data.data.captchaUrl} target="_blank" rel="noreferrer">
                    {res.data.data.captchaUrl}
                  </a>
                </div>
              ),
            });
            return;
          }
          message.success('QQ音乐登录成功！');
          fetchStatus();
          fetchMyBindings();
        } else {
          message.error(res.data.message || '登录失败');
        }
      } else {
        // NetEase login
        const data = {};
        if (values.phone) data.phone = values.phone;
        else if (values.email) data.email = values.email;
        data.password = values.password;
        const res = await musicSourceAPI.neteaseAuth.login(data);
        if (res.data.code === 200) { message.success('登录成功，VIP 权限已激活'); fetchStatus(); }
        else { message.error(res.data.message || '登录失败'); }
      }
    } catch (e) { message.error('登录失败'); }
    finally { setLoading(false); }
  };

  const handleClear = async () => {
    try {
      await musicSourceAPI.neteaseAuth.clear();
      message.info('已退出'); fetchStatus(); fetchMyBindings();
    } catch (e) { message.error('操作失败'); }
  };

  const handleQqSetCookie = async (values) => {
    setLoading(true);
    try {
      const res = await musicSourceAPI.qqmusicAuth.setCookie(values.cookie);
      if (res.data.code === 200) { message.success('已设置，VIP 歌曲可播放'); fetchStatus(); fetchMyBindings(); }
    } catch (e) { message.error('设置失败'); }
    finally { setLoading(false); }
  };

  const handleQqClear = async () => {
    try {
      await musicSourceAPI.qqmusicAuth.clear();
      message.info('已清除'); fetchStatus(); fetchMyBindings();
    } catch (e) { message.error('操作失败'); }
  };

  const handleKgSetCookie = async (values) => {
    setLoading(true);
    try {
      const res = await musicSourceAPI.kugouAuth.setCookie(values.cookie);
      if (res.data.code === 200) { message.success('已设置，VIP 歌曲可播放'); fetchStatus(); fetchMyBindings(); }
    } catch (e) { message.error('设置失败'); }
    finally { setLoading(false); }
  };

  const handleKgClear = async () => {
    try {
      await musicSourceAPI.kugouAuth.clear();
      message.info('已清除'); fetchStatus(); fetchMyBindings();
    } catch (e) { message.error('操作失败'); }
  };

  const handleKwSetCookie = async (values) => {
    setLoading(true);
    try {
      const res = await musicSourceAPI.kuwoAuth.setCookie(values.cookie);
      if (res.data.code === 200) { message.success('已设置，VIP 歌曲可播放'); fetchStatus(); fetchMyBindings(); }
    } catch (e) { message.error('设置失败'); }
    finally { setLoading(false); }
  };

  const handleKwClear = async () => {
    try {
      await musicSourceAPI.kuwoAuth.clear();
      message.info('已清除'); fetchStatus(); fetchMyBindings();
    } catch (e) { message.error('操作失败'); }
  };

  const NE_JS_SNIPPET = `fetch('http://localhost:3000/api/music-source/auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'网易云登录成功！':'失败:'+d.message))`;
  const QQ_JS_SNIPPET = `fetch('http://localhost:3000/api/music-source/qq-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'QQ音乐登录成功！':'失败:'+d.message))`;
  const KG_JS_SNIPPET = `fetch('http://localhost:3000/api/music-source/kg-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'酷狗登录成功！':'失败:'+d.message))`;
  const KW_JS_SNIPPET = `fetch('http://localhost:3000/api/music-source/kw-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'酷我登录成功！':'失败:'+d.message))`;

  const handleCopyNe = () => {
    copyToClipboard(NE_JS_SNIPPET);
    setNeCopied(true);
    message.success('已复制代码，到网易云页面按 F12 粘贴并回车');
    setTimeout(() => setNeCopied(false), 3000);
  };

  const handleCopyQq = () => {
    copyToClipboard(QQ_JS_SNIPPET);
    setQqCopied(true);
    message.success('已复制代码，到QQ音乐页面按 F12 粘贴并回车');
    setTimeout(() => setQqCopied(false), 3000);
  };

  const handleCopyKg = () => {
    copyToClipboard(KG_JS_SNIPPET);
    setKgCopied(true);
    message.success('已复制代码，到酷狗页面按 F12 粘贴并回车');
    setTimeout(() => setKgCopied(false), 3000);
  };

  const handleCopyKw = () => {
    copyToClipboard(KW_JS_SNIPPET);
    setKwCopied(true);
    message.success('已复制代码，到酷我页面按 F12 粘贴并回车');
    setTimeout(() => setKwCopied(false), 3000);
  };

  // ── 渲染我的绑定列表 ──
  const handleUnbind = (platform, nickname) => {
    const meta = PLATFORM_META[platform] || { label: platform };
    modal.confirm({
      title: '确认解绑',
      content: `确定要解绑「${nickname || meta.label}」吗？解绑后将无法再使用该平台会员账号。`,
      okText: '解绑',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await platformLoginAPI.unbind(platform);
          message.success('已解绑');
          await fetchMyBindings();
          // 解绑后刷新平台卡片状态
          if (platform === 'netease') setStatus({ hasCookie: false });
          else if (platform === 'qqmusic') setQqStatus({ hasCookie: false });
          else if (platform === 'kugou') setKgStatus({ hasCookie: false });
          else if (platform === 'kuwo') setKwStatus({ hasCookie: false });
          fetchStatus();
        } catch (e) {
          message.error('解绑失败');
        }
      },
    });
  };

  // 续期
  const handleRefreshBinding = async (platform) => {
    try {
      await platformLoginAPI.refresh(platform);
      message.success('已续期 30 天');
      await fetchMyBindings();
      fetchStatus();
    } catch (e) {
      message.error('续期失败');
    }
  };

  // ── 渲染我的绑定列表 ──
  const renderMyBindings = () => {
    if (!isLoggedIn) {
      return (
        <div className="bindings-empty">
          <Text type="secondary" style={{ fontSize: 13 }}>
            登录账号后可绑定多平台会员，绑定信息与账号关联，不影响他人使用
          </Text>
        </div>
      );
    }
    if (bindingsLoading) {
      return <div className="bindings-loading"><Spin size="small" /> 正在加载…</div>;
    }
    if (myBindings.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary" style={{ fontSize: 13 }}>暂未绑定任何平台会员账号</Text>}
          style={{ margin: '12px 0' }}
        />
      );
    }
    return (
      <div className="binding-list">
        {myBindings.map((b) => {
          const meta = PLATFORM_META[b.platform] || { label: b.platform, gradient: 'linear-gradient(135deg, #999, #666)' };
          const expired = b.expires_at && new Date(b.expires_at) < new Date();
          return (
            <div key={b.platform} className="binding-row">
              <div className="binding-platform-icon" style={{ background: meta.gradient }}>
                {meta.icon}
              </div>
              <div className="binding-info">
                <div className="binding-platform">
                  {meta.label}
                  {expired ? (
                    <Tag color="red" style={{ marginLeft: 8, fontSize: 11 }}>已过期</Tag>
                  ) : (
                    <Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>已绑定</Tag>
                  )}
                </div>
                <div className="binding-nickname">
                  {b.platform_nickname || '已绑定用户'}
                  {b.expires_at && (
                    <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                      <ClockCircleOutlined style={{ marginRight: 2 }} />
                      到期：{new Date(b.expires_at).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
              </div>
              <Space size={4}>
                {!expired && (
                  <Tooltip title="续期 30 天">
                    <Button
                      type="text"
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => handleRefreshBinding(b.platform)}
                    />
                  </Tooltip>
                )}
                <Tooltip title="解绑">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<StopOutlined />}
                    onClick={() => handleUnbind(b.platform, b.platform_nickname)}
                  />
                </Tooltip>
              </Space>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Main render ──

  return (
    <div className="settings-page">
      <div className="settings-header">
        <SettingOutlined className="header-icon" />
        <Title level={3} style={{ margin: 0, color: '#fff' }}>会员设置</Title>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
          绑定多平台会员账号，畅享 VIP/无损音质
        </Text>
      </div>

      {/* 我的绑定（已登录） */}
      {isLoggedIn && (
        <div className="bindings-section">
          <div className="section-title">
            <LinkOutlined style={{ marginRight: 6 }} />
            我的平台绑定
            <span className="section-title-count">{myBindings.length}</span>
          </div>
          {renderMyBindings()}
        </div>
      )}

      <div className="settings-cards">
        <PlatformCard
          platformKey="netease"
          status={status}
          statusLoading={statusLoading}
          method={neMethod}
          loading={loading}
          copied={neCopied}
          onCopy={handleCopyNe}
          onClear={handleClear}
          onSetCookie={handleSetCookie}
          onLogin={handleLogin}
          onMethodChange={setNeMethod}
          disableQr
        />
        <PlatformCard
          platformKey="qqmusic"
          status={qqStatus}
          statusLoading={statusLoading}
          method={qqMethod}
          loading={loading}
          copied={qqCopied}
          onCopy={handleCopyQq}
          onClear={handleQqClear}
          onSetCookie={handleQqSetCookie}
          onLogin={handleLogin}
          onMethodChange={(method) => {
            if (method === 'qrcode') {
              message.info('QQ音乐暂不支持扫码，请使用Cookie粘贴');
              return;
            }
            setQqMethod(method);
          }}
          disableQr
        />
        <PlatformCard
          platformKey="kugou"
          status={kgStatus}
          statusLoading={statusLoading}
          method="cookie"
          loading={loading}
          copied={kgCopied}
          onCopy={handleCopyKg}
          onClear={handleKgClear}
          onSetCookie={handleKgSetCookie}
          onLogin={handleLogin}
          onMethodChange={() => message.info('酷狗仅支持 Cookie 粘贴方式')}
          disableQr
        />
        <PlatformCard
          platformKey="kuwo"
          status={kwStatus}
          statusLoading={statusLoading}
          method="cookie"
          loading={loading}
          copied={kwCopied}
          onCopy={handleCopyKw}
          onClear={handleKwClear}
          onSetCookie={handleKwSetCookie}
          onLogin={handleLogin}
          onMethodChange={() => message.info('酷我仅支持 Cookie 粘贴方式')}
          disableQr
        />
      </div>
    </div>
  );
};

export default Settings;
