import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import { store } from './store';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#1db954',
            colorBgContainer: '#181818',
            colorBgElevated: '#282828',
            colorBgLayout: '#121212',
            colorText: '#ffffff',
            colorTextSecondary: '#b3b3b3',
            borderRadius: 8,
          },
        }}
      >
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    </Provider>
  </React.StrictMode>
);
