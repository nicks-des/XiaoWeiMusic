import React from 'react';
import { Form, Input, App, Checkbox } from 'antd';
import {
  MailOutlined, LockOutlined, EyeInvisibleOutlined, EyeTwoTone,
  QrcodeOutlined, CrownFilled,
} from '@ant-design/icons';
import AuthHeader from './AuthHeader';

/* ============================================
   登录表单
   ============================================ */
const LoginForm = ({ loading, errorMsg, remember, onRememberChange, onFinish, onSwitch, onOpenQR }) => {
  const { message } = App.useApp();

  return (
    <>
      <AuthHeader mode="login" onSwitch={onSwitch} />

      {errorMsg && (
        <div className="auth-error-banner">
          <span className="auth-error-banner-icon">!</span>
          <span>{errorMsg}</span>
        </div>
      )}

      <Form onFinish={onFinish} layout="vertical" size="large" requiredMark={false} className="auth-form">
        <Form.Item
          name="email"
          label={<span className="auth-form-label">邮箱地址</span>}
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input
            prefix={<MailOutlined className="auth-input-icon" />}
            placeholder="you@example.com"
            autoComplete="email"
            className="auth-input"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={<span className="auth-form-label">密码</span>}
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            prefix={<LockOutlined className="auth-input-icon" />}
            placeholder="请输入密码"
            autoComplete="current-password"
            iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
            className="auth-input"
          />
        </Form.Item>

        <div className="auth-form-extra">
          <Checkbox checked={remember} onChange={(e) => onRememberChange(e.target.checked)}>
            记住我
          </Checkbox>
          <a className="auth-form-link" onClick={() => message.info('请联系管理员重置密码')}>
            忘记密码？
          </a>
        </div>

        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" className="auth-submit-btn" disabled={loading}>
            <span className="auth-submit-btn-shine" />
            {loading ? (
              <>
                <span className="auth-submit-btn-spinner" />
                登录中…
              </>
            ) : (
              <>登 录</>
            )}
          </button>
        </Form.Item>
      </Form>

      <div className="auth-form-divider">
        <span>第三方登录</span>
      </div>

      <button
        type="button"
        className="auth-qr-login-btn"
        onClick={() => onOpenQR && onOpenQR()}
      >
        <span className="auth-qr-login-btn-icon">
          <QrcodeOutlined />
        </span>
        <span className="auth-qr-login-btn-text">
          <span className="auth-qr-login-btn-title">
            <CrownFilled style={{ color: '#faad14', marginRight: 4 }} />
            扫码登录会员
          </span>
          <span className="auth-qr-login-btn-desc">支持网易云 / QQ / 酷狗 / 酷我，扫码即享 VIP 音质</span>
        </span>
        <span className="auth-qr-login-btn-arrow">→</span>
      </button>

      <div className="auth-form-footer">
        登录即表示同意我们的 <a className="auth-form-link">服务条款</a> 与 <a className="auth-form-link">隐私政策</a>
      </div>
    </>
  );
};

export default LoginForm;
