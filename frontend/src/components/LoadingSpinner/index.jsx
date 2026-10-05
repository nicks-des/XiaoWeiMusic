import React from 'react';
import { Spin } from 'antd';

const LoadingSpinner = ({ style }) => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 60, ...style }}>
    <Spin size="large" />
  </div>
);

export default LoadingSpinner;
