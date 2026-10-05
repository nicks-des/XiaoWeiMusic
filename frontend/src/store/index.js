import { configureStore } from '@reduxjs/toolkit';
import playerReducer from './slices/playerSlice';
import userReducer from './slices/userSlice';
import musicReducer from './slices/musicSlice';

export const store = configureStore({
  reducer: {
    player: playerReducer,
    user: userReducer,
    music: musicReducer,
  },
});
