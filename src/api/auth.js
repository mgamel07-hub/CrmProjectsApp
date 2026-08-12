import api, { apiV2 } from './client';

export const login = (userId, password) =>
  api.post('/Auth/Login', { userId, password, rememberMe: true });

export const loginV2 = (userId, password) =>
  apiV2.post('/Auth/Login', { userId, password, rememberMe: true });

export const refreshToken = () => api.get('/Auth/RefreshToken');
export const validateToken = () => api.get('/Auth/ValidateToken');
