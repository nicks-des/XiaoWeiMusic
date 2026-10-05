import React from 'react';
import { Button, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ hasError: true, error });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 300,
            padding: 24,
            gap: 16,
          }}
        >
          <Title level={4} style={{ color: '#ff4d4f', margin: 0 }}>
            页面出错了
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {this.state.error?.message || '发生未知错误'}
          </Text>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={this.handleReload}
          >
            重试
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
