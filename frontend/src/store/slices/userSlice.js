import { createSlice } from '@reduxjs/toolkit';

const getStoredUser = () => {
  try {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    if (token && user) return { token, user, isLoggedIn: true };
  } catch (e) {}
  return { token: null, user: null, isLoggedIn: false };
};

const initialState = {
  ...getStoredUser(),
  refreshToken: localStorage.getItem('refreshToken') || null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    login(state, action) {
      const { user, accessToken, refreshToken } = action.payload;
      state.user = user;
      state.token = accessToken;
      state.refreshToken = refreshToken;
      state.isLoggedIn = true;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
    },
    logout(state) {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.isLoggedIn = false;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    },
    updateToken(state, action) {
      state.token = action.payload;
      localStorage.setItem('token', action.payload);
    },
    updateUser(state, action) {
      state.user = action.payload;
      localStorage.setItem('user', JSON.stringify(action.payload));
    },
  },
});

export const { login, logout, updateToken, updateUser } = userSlice.actions;
export default userSlice.reducer;
