import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL      = 'https://crm.yemensoft.net:3346/api/v1';
const BASE_URL_V2   = 'https://crm.yemensoft.net:3346/api/v2';
const BASE_URL_ROOT = 'https://crm.yemensoft.net:3346';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export const apiV2 = axios.create({
  baseURL: BASE_URL_V2,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiV2.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['token', 'user']);
    }
    return Promise.reject(error);
  }
);

// Client for endpoints that live at the server root (e.g. /api/dashboards/...)
export const apiRoot = axios.create({
  baseURL: BASE_URL_ROOT,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiRoot.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiRoot.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['token', 'user']);
    }
    return Promise.reject(error);
  }
);

export default api;
