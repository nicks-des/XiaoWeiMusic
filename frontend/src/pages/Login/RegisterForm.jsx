import React from 'react';
import { Form, Input, Checkbox } from 'antd';
import {
  UserOutlined, LockOutlined, MailOutlined, EyeInvisibleOutlined, EyeTwoTone,
  CheckCircleFilled,
} from '@ant-design/icons';
import AuthHeader from './AuthHeader';

/* ============================================
   注册表单
   ============================================ */
const RegisterForm = ({
  loading, errorMsg, password, onPasswordChange,
  strength, agree, onAgreeChange, onFinish, onSwitch,
}) => {
  const strengthClass = strength.level === 1 ? 'weak' : strength.level === 2 ? 'medium' : 'strong';

  return (
    <>
      <AuthHeader mode="register" onSwitch={onSwitch} />

      {errorMsg && (
        <div className="auth-error-banner">
          <span className="auth-error-banner-icon">!</span>
          <span>{errorMsg}</span>
        </div>
      )}

      <Form onFinish={onFinish} layout="vertical" size="large" requiredMark={false} className="auth-form">
        <Form.Item
          name="username"
          label={<span className="auth-form-label">用户名</span>}
          rules={[
            { required: true, message: '请输入用户名' },
            { min: 2, message: '用户名至少 2 个字符' },
            { max: 20, message: '用户名最多 20 个字符' },
          ]}
        >
          <Input
            prefix={<UserOutlined className="auth-input-icon" />}
            placeholder="你的昵称"
            autoComplete="username"
            className="auth-input"
          />
        </Form.Item>

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
          label={<span className="auth-form-label">设置密码</span>}
          rules={[
            { required: true, message: '请输入密码' },
            { min: 6, message: '密码至少 6 个字符' },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined className="auth-input-icon" />}
            placeholder="至少 6 位，建议字母+数字"
            autoComplete="new-password"
            iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="auth-input"
          />
        </Form.Item>

        {password && (
          <div className="password-strength-wrap">
            <div className="password-strength">
              <span className={`password-strength-bar ${strength.level >= 1 ? strengthClass : ''}`} />
              <span className={`password-strength-bar ${strength.level >= 2 ? strengthClass : ''}`} />
              <span className={`password-strength-bar ${strength.level >= 3 ? strengthClass : ''}`} />
            </div>
            <div className={`password-strength-text ${strengthClass}`}>
              密码强度：<b>{strength.text}</b>
            </div>
          </div>
        )}

        <Form.Item
          name="confirmPassword"
          label={<span className="auth-form-label">确认密码</span>}
          dependencies={['password']}
          rules={[
            { required: true, message: '请再次输入密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<CheckCircleFilled className="auth-input-icon" />}
            placeholder="再输入一次"
            autoComplete="new-password"
            iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
            className="auth-input"
          />
        </Form.Item>

        <div className="auth-form-extra">
          <Checkbox checked={agree} onChange={(e) => onAgreeChange(e.target.checked)}>
            我已阅读并同意 <a className="auth-form-link">服务条款</a> 与 <a className="auth-form-link">隐私政策</a>
          </Checkbox>
        </div>

        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" className="auth-submit-btn" disabled={loading}>
            <span className="auth-submit-btn-shine" />
            {loading ? (
              <>
                <span className="auth-submit-btn-spinner" />
                注册中…
              </>
            ) : (
              <>注 册</>
            )}
          </button>
        </Form.Item>
      </Form>

      <div className="auth-form-footer">
        已有账号？<a className="auth-form-link" onClick={() => onSwitch('login')}>立即登录</a>
      </div>
    </>
  );
};

export default RegisterForm;
