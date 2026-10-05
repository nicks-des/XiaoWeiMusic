import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Spin } from 'antd';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import ErrorBoundary from './components/ErrorBoundary';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const Search = lazy(() => import('./pages/Search'));
const Playlists = lazy(() => import('./pages/Playlists'));
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail'));
const ForYou = lazy(() => import('./pages/ForYou'));
const LocalImport = lazy(() => import('./pages/LocalImport'));
const Favorites = lazy(() => import('./pages/Favorites'));
const History = lazy(() => import('./pages/History'));
const Settings = lazy(() => import('./pages/Settings'));
const LoginPage = lazy(() => import('./pages/Login').then((mod) => ({ default: mod.LoginPage })));
const RegisterPage = lazy(() => import('./pages/Login').then((mod) => ({ default: mod.RegisterPage })));
const FloatingPanel = lazy(() => import('./pages/FloatingPanel'));

// Must be defined outside AppContent to prevent React from unmounting/remounting
// children on every parent render (caused by useAudioPlayer dispatching every 500ms)
function Safe({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function AppContent() {
  const { audioRef, seekTo, changeVolume, analyserRef, analyserVersion } = useAudioPlayer();

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <Suspense fallback={<div className="route-loading"><Spin /></div>}>
          <Routes>
            <Route path="/" element={<Safe><Home /></Safe>} />
            <Route path="/search" element={<Safe><Search /></Safe>} />
            <Route path="/playlists" element={<Safe><Playlists /></Safe>} />
            <Route path="/playlists/:id" element={<Safe><PlaylistDetail /></Safe>} />
            <Route path="/for-you" element={<Safe><ForYou /></Safe>} />
            <Route path="/local" element={<Safe><LocalImport /></Safe>} />
            <Route path="/favorites" element={<Safe><Favorites /></Safe>} />
            <Route path="/history" element={<Safe><History /></Safe>} />
            <Route path="/settings" element={<Safe><Settings /></Safe>} />
            <Route path="/floating" element={<FloatingPanel />} />
            <Route path="/login" element={<Safe><LoginPage /></Safe>} />
            <Route path="/register" element={<Safe><RegisterPage /></Safe>} />
          </Routes>
        </Suspense>
      </div>
      <Player audioRef={audioRef} seekTo={seekTo} changeVolume={changeVolume} analyserRef={analyserRef} analyserVersion={analyserVersion} />
    </div>
  );
}

function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppContent />
    </HashRouter>
  );
}

export default App;
