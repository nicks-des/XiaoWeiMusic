import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Modal, App, Spin, Tag, Tabs, Button, Tooltip } from 'antd';
import {
  QrcodeOutlined, ReloadOutlined, CheckCircleFilled,
  CloseCircleFilled, ScanOutlined, ThunderboltFilled,
  LinkOutlined, DisconnectOutlined, ClockCircleOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { platformLoginAPI } from '../../services/api';
import './QRLoginModal.css';

/* ============================================
   平台主题色映射
   ============================================ */
const PLATFORM_THEMES = {
  netease: {
    label: '网易云音乐',
    short: '网易云',
    gradient: 'linear-gradient(135deg, #ec4141 0%, #c62f2f 100%)',
    accent: '#ec4141',
    bgGlow: 'rgba(236, 65, 65, 0.18)',
    description: '扫码登录后可播放 VIP/付费/无损歌曲',
    help: '打开网易云 APP 扫一扫完成登录',
  },
  qqmusic: {
    label: 'QQ 音乐',
    short: 'QQ 音乐',
    gradient: 'linear-gradient(135deg, #31c27c 0%, #1da863 100%)',
    accent: '#31c27c',
    bgGlow: 'rgba(49, 194, 124, 0.18)',
    description: '扫码登录后可播放 QQ 音乐绿钻/付费内容',
    help: '打开 QQ 音乐 APP 扫一扫完成登录',
  },
  kugou: {
    label: '酷狗音乐',
    short: '酷狗',
    gradient: 'linear-gradient(135deg, #2e6cf6 0%, #1a4fc0 100%)',
    accent: '#2e6cf6',
    bgGlow: 'rgba(46, 108, 246, 0.18)',
    description: '扫码登录后可播放酷狗 VIP 音乐',
    help: '打开酷狗音乐 APP 扫一扫完成登录',
  },
  kuwo: {
    label: '酷我音乐',
    short: '酷我',
    gradient: 'linear-gradient(135deg, #ff8a00 0%, #ff6a00 100%)',
    accent: '#ff8a00',
    bgGlow: 'rgba(255, 138, 0, 0.18)',
    description: '扫码登录后可播放酷我 VIP 音乐',
    help: '打开酷我音乐 APP 扫一扫完成登录',
  },
};

const STATUS_TEXT = {
  waiting: { text: '等待扫码', icon: <ScanOutlined />, color: '#999' },
  scanned: { text: '已扫码，请在手机上确认', icon: <ClockCircleOutlined />, color: '#faad14' },
  success: { text: '登录成功！正在绑定…', icon: <CheckCircleFilled />, color: '#52c41a' },
  expired: { text: '二维码已过期', icon: <CloseCircleFilled />, color: '#ff4d4f' },
  error: { text: '扫码出错', icon: <CloseCircleFilled />, color: '#ff4d4f' },
};

/* ============================================
   平台选择项
   ============================================ */
const PlatformTab = ({ platformKey, active, onClick }) => {
  const theme = PLATFORM_THEMES[platformKey];
  if (!theme) return null;
  return (
    <div
      className={`qr-platform-tab ${active ? 'active' : ''}`}
      onClick={() => onClick(platformKey)}
      style={active ? { '--accent': theme.accent, '--bg-glow': theme.bgGlow } : {}}
    >
      <div className="qr-platform-tab-icon" style={{ background: theme.gradient }}>
        {platformKey === 'netease' && '云'}
        {platformKey === 'qqmusic' && 'Q'}
        {platformKey === 'kugou' && 'K'}
        {platformKey === 'kuwo' && '酷'}
      </div>
      <span className="qr-platform-tab-label">{theme.short}</span>
    </div>
  );
};

/* ============================================
   扫码核心面板
   ============================================ */
const QRPanel = ({ platform, onSuccess, onBindNeeded }) => {
  const theme = PLATFORM_THEMES[platform];
  const [qrcode, setQrcode] = useState('');
  const [status, setStatus] = useState('idle'); // idle | waiting | scanned | success | expired | error
  const [errMsg, setErrMsg] = useState('');
  const [remaining, setRemaining] = useState(120); // QQ 服务端有效期约 2 分钟
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const checkRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const onBindNeededRef = useRef(onBindNeeded);
  const platformRef = useRef(platform);
  const mountedRef = useRef(true);
  onSuccessRef.current = onSuccess;
  onBindNeededRef.current = onBindNeeded;
  platformRef.current = platform;

  const stopAllTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (checkRef.current) {
      clearInterval(checkRef.current);
      checkRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    stopAllTimers();
    setStatus('waiting');
    setErrMsg('');
    setQrcode('');
    setRemaining(120);
    setLoading(true);
    try {
      const res = await platformLoginAPI.generateQrcode(platform);
      if (res.data?.code === 200 && res.data?.data?.qrcode) {
        setQrcode(res.data.data.qrcode);
        setStatus('waiting');
      } else {
        setStatus('error');
        setErrMsg(res.data?.message || '生成二维码失败');
      }
    } catch (e) {
      setStatus('error');
      setErrMsg(e.response?.data?.message || e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, [platform, stopAllTimers]);

  // 倒计时
  useEffect(() => {
    if (status !== 'waiting' && status !== 'scanned') return;
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          stopAllTimers();
          setStatus('expired');
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => stopAllTimers();
  }, [status, stopAllTimers]);

  // 轮询扫码状态
  const failCountRef = useRef(0);
  useEffect(() => {
    if (status !== 'waiting' && status !== 'scanned') return;
    mountedRef.current = true;
    failCountRef.current = 0;
    const currentPlatform = platformRef.current;
    checkRef.current = setInterval(async () => {
      try {
        const res = await platformLoginAPI.checkQrcodeStatus(currentPlatform);
        if (!mountedRef.current) return;
        failCountRef.current = 0;
        const s = res.data?.data?.status;
        console.log(`[QR] ${currentPlatform} poll:`, s);
        if (s === 'scanned') setStatus('scanned');
        else if (s === 'success') {
          setStatus('success');
          stopAllTimers();
          console.log('[QR] success, triggering callbacks');
          onSuccessRef.current?.(currentPlatform);
          onBindNeededRef.current?.(currentPlatform);
        } else if (s === 'expired') {
          setStatus('expired');
          stopAllTimers();
        } else if (s === 'waiting') {
          setStatus('waiting');
        }
      } catch (e) {
        if (!mountedRef.current) return;
        failCountRef.current += 1;
        console.warn(`[QR] poll fail #${failCountRef.current}:`, e.message || e);
        if (failCountRef.current >= 5) {
          stopAllTimers();
          setStatus('error');
          setErrMsg('连续连接失败，请检查网络或刷新二维码');
        }
      }
    }, 2000);
    return () => { mountedRef.current = false; stopAllTimers(); };
  }, [status, stopAllTimers]);

  useEffect(() => {
    refresh();
    return stopAllTimers;
  }, [platform, refresh, stopAllTimers]);

  const formatTime = (sec) => `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

  return (
    <div className="qr-panel" style={{ '--accent': theme.accent, '--bg-glow': theme.bgGlow }}>
      <div className="qr-panel-header">
        <div className="qr-panel-title">
          <span className="qr-panel-icon" style={{ background: theme.gradient }}>
            <ScanOutlined />
          </span>
          <div>
            <div className="qr-panel-title-text">扫码登录 {theme.label}</div>
            <div className="qr-panel-title-desc">{theme.description}</div>
          </div>
        </div>
      </div>

      <div className="qr-stage">
        {loading && (
          <div className="qr-loading">
            <Spin size="large" />
            <div className="qr-loading-text">正在生成二维码…</div>
          </div>
        )}

        {!loading && qrcode && status !== 'expired' && (
          <>
            <div className="qr-image-wrap">
              <div className="qr-image-corners">
                <span className="qr-corner qr-corner--tl" />
                <span className="qr-corner qr-corner--tr" />
                <span className="qr-corner qr-corner--bl" />
                <span className="qr-corner qr-corner--br" />
              </div>
              <img src={qrcode} alt="QR Code" className="qr-image" />
              {status === 'success' && (
                <div className="qr-success-mask">
                  <CheckCircleFilled className="qr-success-icon" />
                  <div>扫码成功</div>
                </div>
              )}
            </div>

            <div className="qr-status-bar" style={{ color: STATUS_TEXT[status]?.color || '#999' }}>
              {STATUS_TEXT[status]?.icon}
              <span>{STATUS_TEXT[status]?.text || '请稍候'}</span>
            </div>

            <div className="qr-tips">
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {formatTime(remaining)} 内有效
            </div>
            <div className="qr-help">{theme.help}</div>
          </>
        )}

        {!loading && (status === 'expired' || (!qrcode && status === 'error')) && (
          <div className="qr-expired">
            <div className="qr-expired-icon" style={{ color: theme.accent }}>
              <CloseCircleFilled />
            </div>
            <div className="qr-expired-text">
              {status === 'expired' ? '二维码已过期' : errMsg || '二维码生成失败'}
            </div>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={refresh}
              className="qr-refresh-btn"
              style={{ background: theme.gradient, borderColor: 'transparent' }}
            >
              刷新二维码
            </Button>
          </div>
        )}
      </div>

      <div className="qr-footer">
        <Tooltip title="刷新二维码">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={refresh}
            disabled={loading || status === 'success'}
          >
            刷新
          </Button>
        </Tooltip>
        <div className="qr-footer-tip">
          <ThunderboltFilled style={{ color: theme.accent }} />
          绑定后可在多端享受 VIP 音质
        </div>
      </div>
    </div>
  );
};

/* ============================================
   扫码登录弹窗
   ============================================ */
const QRLoginModal = ({ open, onClose, onLoginSuccess, requireBind = true, initialPlatform = 'netease', loginPath = '/login' }) => {
  const { message } = App.useApp();
  const { isLoggedIn } = useSelector((s) => s.user);
  const [platforms, setPlatforms] = useState([]);
  const [activePlatform, setActivePlatform] = useState('netease');
  const [successPlatform, setSuccessPlatform] = useState(null);
  const [bindingLoading, setBindingLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSuccessPlatform(null);
      setActivePlatform(initialPlatform);
      platformLoginAPI.listPlatforms()
        .then((res) => {
          if (res.data?.code === 200) {
            const list = (res.data.data || []).map((p) => p.key).filter((k) => k !== '__placeholder' && k !== 'kugou' && k !== 'kuwo' && k !== 'qqmusic');
            setPlatforms(list);
          }
        })
        .catch(() => {
          setPlatforms(['netease', 'qqmusic']);
        });
    }
  }, [open]);

  const handleScanSuccess = (platform) => {
    setSuccessPlatform(platform);
  };

  const handleBind = async () => {
    if (!successPlatform) return;
    setBindingLoading(true);
    try {
      const res = await platformLoginAPI.bind(successPlatform);
      console.log('[QR] bind result:', res.data);
      if (res.data?.code === 200) {
        message.success(res.data.message || '绑定成功！');
        await onLoginSuccess?.(successPlatform, res.data.data);
        setTimeout(() => onClose?.(), 400);
      } else {
        message.error(res.data?.message || '绑定失败');
      }
    } catch (e) {
      const errDetail = e.response?.data?.message || e.message || '绑定失败，请重试';
      console.error('[QR] bind error:', errDetail, e.response?.data);
      message.error(errDetail);
    } finally {
      setBindingLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => !bindingLoading && onClose?.()}
      footer={null}
      width={520}
      centered
      destroyOnHidden
      maskClosable={!bindingLoading}
      closable={!bindingLoading}
      className="qr-login-modal"
      title={null}
    >
      <div className="qr-modal-header">
        <div className="qr-modal-title">
          <span className="qr-modal-title-icon">
            <QrcodeOutlined />
          </span>
          扫码登录
        </div>
        <div className="qr-modal-subtitle">
          选择平台，扫码即可登录并绑定会员账号
        </div>
      </div>

      <div className="qr-platform-tabs">
        {platforms.map((p) => (
          <PlatformTab
            key={p}
            platformKey={p}
            active={activePlatform === p}
            onClick={setActivePlatform}
          />
        ))}
      </div>

      <div className="qr-modal-body">
        {successPlatform ? (
          isLoggedIn ? (
            <div className="qr-bind-confirm">
              <div className="qr-bind-success-icon">
                <CheckCircleFilled />
              </div>
              <div className="qr-bind-title">扫码成功！</div>
              <div className="qr-bind-desc">
                是否将 <b>{PLATFORM_THEMES[successPlatform]?.label}</b> 会员账号绑定到当前用户？
              </div>
              <div className="qr-bind-actions">
                <Button size="large" onClick={onClose}>稍后</Button>
                <Button
                  type="primary"
                  size="large"
                  loading={bindingLoading}
                  onClick={handleBind}
                  style={{ background: PLATFORM_THEMES[successPlatform]?.gradient, borderColor: 'transparent' }}
                  icon={<LinkOutlined />}
                >
                  立即绑定
                </Button>
              </div>
            </div>
          ) : (
            <div className="qr-bind-confirm">
              <div className="qr-bind-success-icon">
                <CheckCircleFilled />
              </div>
              <div className="qr-bind-title">扫码成功！</div>
              <div className="qr-bind-desc">
                <b>{PLATFORM_THEMES[successPlatform]?.label}</b> 已识别成功，需要先登录/注册 MusicFlow 账号后绑定
              </div>
              <div className="qr-bind-actions">
                <Button size="large" onClick={onClose}>稍后</Button>
                <Button
                  type="primary"
                  size="large"
                  onClick={() => {
                    onClose?.();
                    // 跳转到登录页
                    window.location.hash = loginPath;
                  }}
                  icon={<UserAddOutlined />}
                >
                  去登录/注册
                </Button>
              </div>
            </div>
          )
        ) : (
          <QRPanel
            key={activePlatform}
            platform={activePlatform}
            onSuccess={requireBind ? handleScanSuccess : onLoginSuccess}
            onBindNeeded={requireBind ? handleScanSuccess : null}
          />
        )}
      </div>
    </Modal>
  );
};

export default QRLoginModal;
