import api from './client';

export const getMyPermissions = () => api.get('/PermsGroup/GetLoggedUserPermsGroupScreens');
export const getMyProfile = () => api.get('/User/GetLoggedUserOptions');
