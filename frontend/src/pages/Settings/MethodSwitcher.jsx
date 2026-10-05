import React from 'react';
import { QrcodeOutlined, ThunderboltOutlined, KeyOutlined, PhoneOutlined } from '@ant-design/icons';

const MethodSwitcher = ({ method, onMethodChange, ne, qq, color, disableQr = false }) => {
  const getCls = (key) => `method-tab ${method === key ? 'active' : ''}`;
  const getStyle = (key) => method === key ? { color } : {};

  return (
    <div className="method-switcher">
      {!disableQr && (
        <span className={getCls('qrcode')} style={getStyle('qrcode')} onClick={() => onMethodChange('qrcode')}>
          <QrcodeOutlined /> 扫码
        </span>
      )}
      <span className={getCls('quick')} style={getStyle('quick')} onClick={() => onMethodChange('quick')}>
        <ThunderboltOutlined /> 快速
      </span>
      <span className={getCls('cookie')} style={getStyle('cookie')} onClick={() => onMethodChange('cookie')}>
        <KeyOutlined /> Cookie
      </span>
      {(ne || qq) && (
        <span className={getCls('login')} style={getStyle('login')} onClick={() => onMethodChange('login')}>
          <PhoneOutlined /> 账号
        </span>
      )}
    </div>
  );
};

export default MethodSwitcher;
