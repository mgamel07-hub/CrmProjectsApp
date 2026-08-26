import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { login as apiLogin, loginV2 as apiLoginV2 } from '../api/auth';
import { getMyPermissions, getMyProfile } from '../api/permissions';
import { DEMO_USER } from '../api/demoData';
import api from '../api/client';

const AuthContext = createContext(null);

// Parse API permissions response into a simple map: { 'Project': {view,create,edit,delete}, ... }
function parsePermissions(raw) {
  const map = {};
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (Array.isArray(raw?.data)) list = raw.data;
  else if (Array.isArray(raw?.data?.screens)) list = raw.data.screens;
  else if (Array.isArray(raw?.screens)) list = raw.screens;

  list.forEach((item) => {
    const name =
      item.screenName || item.ScreenName || item.name || item.Name ||
      item.screenCode || item.ScreenCode || String(item.screenId || item.id || '');
    if (!name) return;
    map[name] = {
      view:   !!(item.isView   ?? item.canView   ?? item.view   ?? true),
      create: !!(item.isCreate ?? item.canCreate ?? item.create ?? true),
      edit:   !!(item.isEdit   ?? item.canEdit   ?? item.edit   ?? true),
      delete: !!(item.isDelete ?? item.canDelete ?? item.delete ?? true),
    };
  });
  return map;
}

// Parse profile response into a flat user info object
function parseProfile(raw) {
  const d = raw?.data ?? raw;
  if (!d || typeof d !== 'object') return {};
  const uid = d.userId ?? d.UserId ?? d.id ?? null;
  const result = {
    fullName:  d.fullName  || d.FullName  || d.userName   || d.UserName  || '',
    email:     d.email     || d.Email     || '',
    roleName:  d.roleName  || d.RoleName  || d.role       || d.Role      || '',
    isAdmin:   !!(d.isAdmin || d.IsAdmin  || d.isSuperAdmin || false),
    isManager: !!(d.isManager || d.IsManager || false),
    avatar:    d.photo     || d.Photo     || d.avatar    || d.Avatar    || d.profileImage || d.profilePicture || '',
  };
  if (uid != null && uid !== '') result.userId = uid;
  return result;
}

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null);
  const [token, setToken]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [isDemo, setIsDemo]         = useState(false);
  const [permissions, setPerms]     = useState({});   // map of screen→{view,create,edit,delete}
  const [profile, setProfile]       = useState({});   // full user info

  // Restore session on startup
  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem('token');
        const savedUser  = await AsyncStorage.getItem('user');
        const savedDemo  = await AsyncStorage.getItem('isDemo');
        const savedPerms = await AsyncStorage.getItem('permissions');
        const savedProf  = await AsyncStorage.getItem('profile');
        if (savedDemo === 'true') {
          setIsDemo(true);
          setUser(DEMO_USER);
          setToken('demo-token');
          setPerms({});
        } else if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          if (savedPerms) setPerms(JSON.parse(savedPerms));
          if (savedProf)  setProfile(JSON.parse(savedProf));
          // DEBUG: fetch RSA public key and display it
          try {
            const pkRes = await api.get('/Auth/GetPublicKey');
            const pk = pkRes?.data?.data || pkRes?.data;
            if (pk) {
              Alert.alert('RSA Public Key', String(pk), [{ text: 'OK' }]);
              await AsyncStorage.setItem('rsaPublicKey', String(pk));
            }
          } catch (pkErr) {
            Alert.alert('GetPublicKey Error', String(pkErr?.response?.status) + ' ' + JSON.stringify(pkErr?.response?.data));
          }
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const extractToken = (d) =>
    (typeof d?.data === 'string' && d.data) ||
    (typeof d?.data?.token === 'string' && d.data.token) ||
    (typeof d?.data?.jwtToken === 'string' && d.data.jwtToken) ||
    (typeof d?.data?.accessToken === 'string' && d.data.accessToken) ||
    (typeof d?.token === 'string' && d.token) ||
    (typeof d?.jwtToken === 'string' && d.jwtToken) ||
    (typeof d?.accessToken === 'string' && d.accessToken) ||
    null;

  // Fetch and store permissions + profile after token is ready
  const loadUserData = async () => {
    try {
      const [permsRes, profRes] = await Promise.allSettled([
        getMyPermissions(),
        getMyProfile(),
      ]);
      if (permsRes.status === 'fulfilled') {
        const parsed = parsePermissions(permsRes.value?.data);
        setPerms(parsed);
        await AsyncStorage.setItem('permissions', JSON.stringify(parsed));
      }
      if (profRes.status === 'fulfilled') {
        const parsed = parseProfile(profRes.value?.data);
        setProfile(parsed);
        await AsyncStorage.setItem('profile', JSON.stringify(parsed));
        // Update user with full name
        setUser((prev) => ({ ...prev, ...parsed }));
        const savedUser = await AsyncStorage.getItem('user');
        const base = savedUser ? JSON.parse(savedUser) : {};
        await AsyncStorage.setItem('user', JSON.stringify({ ...base, ...parsed }));
      }
    } catch (_) {}
  };

  const login = async (userId, password) => {
    let jwtToken = null;

    // Try V1 first
    try {
      const res = await apiLogin(userId, password);
      jwtToken = extractToken(res.data);
    } catch (e) {
      const msg = e?.response?.data?.message || '';
      if (!msg.toLowerCase().includes('usernotfound') && !msg.toLowerCase().includes('notfound')) {
        throw e;
      }
    }

    // Fall back to V2
    if (!jwtToken) {
      const res2 = await apiLoginV2(userId, password);
      jwtToken = extractToken(res2.data);
      if (!jwtToken) {
        throw new Error(`Login failed: no token\nResponse: ${JSON.stringify(res2.data)}`);
      }
    }

    const userInfo = { userId };
    await AsyncStorage.setItem('token', jwtToken);
    await AsyncStorage.setItem('user', JSON.stringify(userInfo));
    await AsyncStorage.removeItem('isDemo');
    setToken(jwtToken);
    setUser(userInfo);
    setIsDemo(false);

    // Load profile + permissions in background (token is now set in AsyncStorage)
    loadUserData();

    return jwtToken;
  };

  const loginDemo = async () => {
    await AsyncStorage.setItem('isDemo', 'true');
    await AsyncStorage.setItem('user', JSON.stringify(DEMO_USER));
    setUser(DEMO_USER);
    setToken('demo-token');
    setIsDemo(true);
    setPerms({});
    setProfile({});
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'user', 'isDemo', 'permissions', 'profile']);
    setToken(null);
    setUser(null);
    setIsDemo(false);
    setPerms({});
    setProfile({});
  };

  // can('Project', 'create') → true/false
  // Defaults to true if screen not found (graceful degradation)
  const can = (screen, action = 'view') => {
    if (isDemo) return true;
    if (!permissions || Object.keys(permissions).length === 0) return true;
    const s = permissions[screen];
    if (!s) return true; // screen not in map → allow
    return !!s[action];
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading, isDemo,
      permissions, profile,
      login, loginDemo, logout, can,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
