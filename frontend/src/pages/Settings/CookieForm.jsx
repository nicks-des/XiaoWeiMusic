import React, { useState } from 'react';
import { Button, Input, Form, Typography, Alert, Tooltip } from 'antd';
import { KeyOutlined, CopyOutlined, CheckCircleOutlined, ArrowRightOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

const PLATFORM_GUIDES = {
  netease: {
    name: '网易云音乐',
    url: 'https://music.163.com/',
    keyField: 'MUSIC_U',
    hint: '从 music.163.com 复制完整的 Cookie 字符串（至少需要 MUSIC_U 字段）',
    snippet: `fetch('http://localhost:3000/api/music-source/auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'网易云登录成功！':'失败:'+d.message))`,
  },
  qqmusic: {
    name: 'QQ音乐',
    url: 'https://y.qq.com/',
    keyField: 'uin + skey',
    hint: '从 y.qq.com 复制完整的 Cookie 字符串（需要 uin 和 skey/p_skey）',
    snippet: `fetch('http://localhost:3000/api/music-source/qq-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'QQ音乐登录成功！':'失败:'+d.message))`,
  },
  kugou: {
    name: '酷狗音乐',
    url: 'https://www.kugou.com/',
    keyField: 'kg_dfid / kg_mid',
    hint: '从 kugou.com 复制完整的 Cookie 字符串',
    snippet: `fetch('http://localhost:3000/api/music-source/kg-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'酷狗登录成功！':'失败:'+d.message))`,
  },
  kuwo: {
    name: '酷我音乐',
    url: 'https://www.kuwo.cn/',
    keyField: 'uid',
    hint: '从 kuwo.cn 复制完整的 Cookie 字符串',
    snippet: `fetch('http://localhost:3000/api/music-source/kw-auth/cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:document.cookie})}).then(r=>r.json()).then(d=>alert(d.code===200?'酷我登录成功！':'失败:'+d.message))`,
  },
};

const copyToClipboard = (text, onSuccess) => {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {});
  } else {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onSuccess();
    } catch (e) {}
  }
};

const CookieForm = ({ onFinish, placeholder, loading, platformKey = 'netease' }) => {
  const [copied, setCopied] = useState(false);
  const guide = PLATFORM_GUIDES[platformKey] || PLATFORM_GUIDES.netease;

  const handleCopySnippet = () => {
    copyToClipboard(guide.snippet, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  return (
    <div className="cookie-form-enhanced">
      {/* 一键导入 - JS 代码方式 */}
      <div className="cookie-section">
        <div className="cookie-section-title">
          <ThunderboltOutlined style={{ color: '#faad14', marginRight: 6 }} />
          方式一：一键导入（推荐）
        </div>
        <Alert
          type="info"
          style={{ marginBottom: 12, fontSize: 13 }}
          message={
            <div style={{ lineHeight: 1.8 }}>
              <div><b>步骤：</b></div>
              <div>1. 点击下方按钮复制 JS 代码</div>
              <div>2. 打开 <a href={guide.url} target="_blank" rel="noreferrer">{guide.url}</a>，确保已登录</div>
              <div>3. 按 <Text code>F12</Text> → <Text code>Console</Text> → 粘贴代码 → 回车</div>
              <div>4. 弹窗提示"登录成功"即完成</div>
            </div>
          }
        />
        <Button
          type="primary"
          icon={copied ? <CheckCircleOutlined /> : <CopyOutlined />}
          onClick={handleCopySnippet}
          style={{ borderRadius: 8, fontWeight: 600 }}
          block
        >
          {copied ? '已复制，请到 Console 粘贴' : `复制 ${guide.name} 导入脚本`}
        </Button>
      </div>

      <div className="cookie-divider">
        <Text type="secondary" style={{ fontSize: 12 }}>或手动粘贴 Cookie</Text>
      </div>

      {/* 手动粘贴 Cookie */}
      <div className="cookie-section">
        <div className="cookie-section-title">
          <KeyOutlined style={{ color: '#1db954', marginRight: 6 }} />
          方式二：手动粘贴 Cookie
        </div>
        <Alert
          type="info"
          style={{ marginBottom: 12, fontSize: 13 }}
          message={
            <div style={{ lineHeight: 1.8 }}>
              <div><b>步骤：</b></div>
              <div>1. 打开 <a href={guide.url} target="_blank" rel="noreferrer">{guide.url}</a>，登录账号</div>
              <div>2. 按 <Text code>F12</Text> → <Text code>Application</Text> → <Text code>Cookies</Text></div>
              <div>3. 点击 {guide.url.replace('https://', '')}，在右侧找到 <Text code>{guide.keyField}</Text></div>
              <div>4. 复制 <b>整个 Cookie 字符串</b>，粘贴到下方</div>
            </div>
          }
        />
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="cookie" rules={[{ required: true, message: '请粘贴 Cookie 字符串' }]}>
            <Input.TextArea
              rows={4}
              placeholder={placeholder || guide.hint}
              className="cookie-textarea"
              style={{ fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              ghost
              htmlType="submit"
              loading={loading}
              icon={<CheckCircleOutlined />}
              style={{ borderRadius: 8 }}
              block
            >
              验证并保存
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};

export default CookieForm;
