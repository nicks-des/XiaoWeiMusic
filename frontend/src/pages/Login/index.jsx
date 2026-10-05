import React, { useState, useMemo, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import { authAPI } from '../../services/api';
import { login } from '../../store/slices/userSlice';
import QRLoginModal from '../../components/QRLoginModal';
import AuthVisual from './AuthVisual';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import './Auth.css';

/* ============================================
   顶部 Logo
   ============================================ */
const AuthTopbar = () => (
  <div className="auth-topbar">
    <div className="auth-topbar-logo">
      <span className="auth-topbar-logo-icon"><SoundOutlined /></span>
      <span className="auth-topbar-logo-text">Music<span>Flow</span></span>
    </div>
    <div className="auth-topbar-tag">PREMIUM · 会员中心</div>
  </div>
);

/* ============================================
   密码强度计算
   ============================================ */
const calcPasswordStrength = (pwd) => {
  if (!pwd) return { level: 0, text: '' };
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 2) return { level: 1, text: '弱' };
  if (score <= 4) return { level: 2, text: '中等' };
  return { level: 3, text: '强' };
};

/* ============================================
   登录页（容器）
   ============================================ */
const LoginPage = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = location.pathname.includes('register');
  const [tab, setTab] = useState(isRegister ? 'register' : 'login');
  const [qrOpen, setQrOpen] = useState(false);

  // 登录表单状态
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginErrorMsg, setLoginErrorMsg] = useState('');
  const [loginRemember, setLoginRemember] = useState(true);

  // 注册表单状态
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerErrorMsg, setRegisterErrorMsg] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerAgree, setRegisterAgree] = useState(false);

  const registerStrength = useMemo(
    () => calcPasswordStrength(registerPassword),
    [registerPassword],
  );

  useEffect(() => {
    setTab(isRegister ? 'register' : 'login');
  }, [isRegister]);

  const handleTabChange = (next) => {
    setTab(next);
    navigate(next === 'register' ? '/register' : '/login');
  };

  // 登录提交
  const handleLoginFinish = async (values) => {
    setLoginErrorMsg('');
    setLoginLoading(true);
    try {
      const { data } = await authAPI.login(values);
      if (data.code === 200) {
        dispatch(login(data.data));
        message.success('欢迎回来，开始你的音乐之旅 🎵');
        navigate('/');
      } else {
        setLoginErrorMsg(data.message || '登录失败，请检查输入');
      }
    } catch (err) {
      setLoginErrorMsg(err.response?.data?.message || '登录失败，请检查邮箱和密码');
    } finally {
      setLoginLoading(false);
    }
  };

  // 注册提交
  const handleRegisterFinish = async (values) => {
    setRegisterErrorMsg('');
    if (values.password !== values.confirmPassword) {
      setRegisterErrorMsg('两次输入的密码不一致');
      return;
    }
    if (values.password.length < 6) {
      setRegisterErrorMsg('密码至少 6 位');
      return;
    }
    if (!registerAgree) {
      message.warning('请先同意服务条款与隐私政策');
      return;
    }
    setRegisterLoading(true);
    try {
      const { confirmPassword, ...regData } = values;
      const { data } = await authAPI.register(regData);
      if (data.code === 200) {
        message.success('注册成功，请登录 🎉');
        handleTabChange('login');
      } else {
        setRegisterErrorMsg(data.message || '注册失败，请重试');
      }
    } catch (err) {
      setRegisterErrorMsg(err.response?.data?.message || '注册失败，请稍后重试');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* 背景层：渐变球 */}
      <div className="auth-bg">
        <div className="auth-bg-blob auth-bg-blob--1" />
        <div className="auth-bg-blob auth-bg-blob--2" />
        <div className="auth-bg-blob auth-bg-blob--3" />
        <div className="auth-bg-grid" />
        {/* 浮动音符 */}
        <div className="auth-bg-notes" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="auth-bg-note"
              style={{
                left: `${(i * 8.7 + 5) % 100}%`,
                animationDelay: `${(i * 0.6).toFixed(2)}s`,
                animationDuration: `${(10 + (i % 4) * 2).toFixed(0)}s`,
              }}
            >{['♪', '♫', '♬', '♩', '♭'][i % 5]}</span>
          ))}
        </div>
      </div>

      <div className="auth-shell">
        <AuthTopbar />

        <div className="auth-card">
          <AuthVisual />
          <div className="auth-form-wrap">
            {tab === 'login' ? (
              <LoginForm
                loading={loginLoading}
                errorMsg={loginErrorMsg}
                remember={loginRemember}
                onRememberChange={setLoginRemember}
                onFinish={handleLoginFinish}
                onSwitch={handleTabChange}
                onOpenQR={() => setQrOpen(true)}
              />
            ) : (
              <RegisterForm
                loading={registerLoading}
                errorMsg={registerErrorMsg}
                password={registerPassword}
                onPasswordChange={setRegisterPassword}
                strength={registerStrength}
                agree={registerAgree}
                onAgreeChange={setRegisterAgree}
                onFinish={handleRegisterFinish}
                onSwitch={handleTabChange}
              />
            )}
          </div>
        </div>

        <div className="auth-footer">
          <span>© 2026 MusicFlow</span>
          <span>·</span>
          <a className="auth-footer-link">帮助中心</a>
          <span>·</span>
          <a className="auth-footer-link">联系我们</a>
        </div>
      </div>

      <QRLoginModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onLoginSuccess={(platform, data) => {
          // 未登录用户扫码成功,提示前往设置页绑定
        }}
      />
    </div>
  );
};

const RegisterPage = LoginPage;

export { LoginPage, RegisterPage };
