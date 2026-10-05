import React from 'react';
import { Button, Typography } from 'antd';
import { ExportOutlined, CopyOutlined, SwapOutlined } from '@ant-design/icons';

const { Text } = Typography;

const QuickGuide = ({ platform, loginUrl, snippet, onCopy, copied, themeColor }) => (
  <div className="quick-guide">
    <div className="guide-steps">
      <div className="guide-step">
        <span className="step-number" style={{ background: themeColor }}>1</span>
        <div className="step-content">
          <Text strong>打开 {platform} 登录页</Text>
          <br />
          <Button
            type="primary"
            shape="round"
            icon={<ExportOutlined />}
            href={loginUrl}
            target="_blank"
            style={{ marginTop: 8, background: themeColor, borderColor: themeColor }}
          >
            前往登录
          </Button>
          <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
            在新页面中使用扫码或账号密码登录
          </Text>
        </div>
      </div>
      <div className="guide-arrow">
        <SwapOutlined style={{ color: themeColor, fontSize: 18 }} />
      </div>
      <div className="guide-step">
        <span className="step-number" style={{ background: themeColor }}>2</span>
        <div className="step-content">
          <Text strong>一键同步 Cookie</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            在 {platform} 页面按 <kbd className="kbd">F12</kbd>，粘贴代码并回车
          </Text>
          <div className="code-snippet">
            <code>{snippet.substring(0, 60)}...</code>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={onCopy}
              className="copy-btn"
            >
              {copied ? '已复制' : '复制代码'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default QuickGuide;
