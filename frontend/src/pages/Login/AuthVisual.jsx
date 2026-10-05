import React from 'react';
import {
  StarFilled, ThunderboltFilled,
  CloudFilled, SafetyCertificateFilled,
} from '@ant-design/icons';

/* ============================================
   左侧视觉区 - 唱片 + 频谱 + 特色
   ============================================ */
const AuthVisual = () => {
  // 频谱条动画
  const bars = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div className="auth-visual">
      {/* 背景光环 */}
      <div className="auth-visual-glow auth-visual-glow--1" />
      <div className="auth-visual-glow auth-visual-glow--2" />
      <div className="auth-visual-glow auth-visual-glow--3" />

      {/* 顶部小标签 */}
      <div className="auth-visual-badge">
        <StarFilled /> 已有 10w+ 音乐爱好者加入
      </div>

      {/* 唱片 */}
      <div className="auth-visual-disc-wrap">
        <div className="auth-visual-disc">
          <div className="auth-visual-disc-inner">
            <span className="auth-visual-disc-icon">♪</span>
          </div>
        </div>
        <div className="auth-visual-disc-shadow" />
      </div>

      {/* 标题 */}
      <h2 className="auth-visual-title">
        开启你的<br />
        <span className="auth-visual-title-grad">高品质音乐</span><br />
        之旅
      </h2>
      <p className="auth-visual-desc">
        无损音质 · AI 推荐 · 多端同步<br />
        4 大平台 3000 万+ 正版曲库随心听
      </p>

      {/* 频谱条 */}
      <div className="auth-visual-spectrum">
        {bars.map((i) => (
          <span
            key={i}
            className="auth-visual-spectrum-bar"
            style={{ animationDelay: `${(i * 0.08).toFixed(2)}s`, animationDuration: `${(0.8 + (i % 5) * 0.15).toFixed(2)}s` }}
          />
        ))}
      </div>

      {/* 特色卡片 */}
      <div className="auth-visual-features">
        <div className="auth-visual-feature">
          <span className="auth-visual-feature-icon"><ThunderboltFilled /></span>
          <div>
            <div className="auth-visual-feature-title">AI 智能推荐</div>
            <div className="auth-visual-feature-desc">懂你的音乐口味</div>
          </div>
        </div>
        <div className="auth-visual-feature">
          <span className="auth-visual-feature-icon"><CloudFilled /></span>
          <div>
            <div className="auth-visual-feature-title">多端云同步</div>
            <div className="auth-visual-feature-desc">手机/电脑无缝切换</div>
          </div>
        </div>
        <div className="auth-visual-feature">
          <span className="auth-visual-feature-icon"><SafetyCertificateFilled /></span>
          <div>
            <div className="auth-visual-feature-title">无损音质</div>
            <div className="auth-visual-feature-desc">Hi-Fi 级别听觉盛宴</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthVisual;
