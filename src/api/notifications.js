import api from './client';

export const getNotifications = (page = 1, size = 20) =>
  api.get(`/Notification/Get/${page}/${size}`);

export const markAsRead = (id) =>
  api.put(`/Notification/MarkAsRead/${id}`);

export const pingNotifications = () =>
  api.get('/Notification/Ping');
