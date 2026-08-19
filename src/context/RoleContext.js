import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// Lazy imports to avoid any startup side-effects
let _getMyTeamRecord = null;
let _getTeamMembers  = null;

const RoleContext = createContext({
  myRole: 'admin',
  visibleCrmIds: null,
  visibleNames: null,
  roleLoading: false,
});

export function RoleProvider({ children }) {
  const { user } = useAuth();
  const [myRole, setMyRole]             = useState('admin');
  const [visibleCrmIds, setVisible]     = useState(null);
  const [visibleNames, setVisibleNames] = useState(null);
  const [roleLoading, setLoading]       = useState(false);

  useEffect(() => {
    let cancelled = false;
    const uid = user && (user.userId != null ? user.userId : (user.UserId != null ? user.UserId : user.id));
    if (!uid) return;

    setLoading(true);

    (async () => {
      try {
        // Lazy-load internal API so any import errors don't crash the app
        if (!_getMyTeamRecord) {
          const mod = require('../api/internal');
          _getMyTeamRecord = mod.getMyTeamRecord;
          _getTeamMembers  = mod.getTeamMembers;
        }

        const me = await _getMyTeamRecord(String(uid));
        if (cancelled) return;

        const role = (me && me.role) ? me.role : 'admin';
        setMyRole(role);

        if (role === 'admin') {
          setVisible(null);
          setVisibleNames(null);
        } else if (role === 'manager') {
          const allMembers = await _getTeamMembers();
          if (cancelled) return;
          const mine  = allMembers.filter(function(m) { return m.team_id === me.team_id; });
          const ids   = mine.map(function(m) { return m.crm_user_id; }).filter(Boolean);
          const names = mine.map(function(m) { return m.display_name; }).filter(Boolean);
          setVisible(ids.length ? ids : [String(uid)]);
          setVisibleNames(names.length ? names : []);
        } else {
          setVisible([String(uid)]);
          setVisibleNames(me && me.display_name ? [me.display_name] : []);
        }
      } catch (e) {
        if (!cancelled) {
          // Fail-open: on any error, show everything (admin view)
          setMyRole('admin');
          setVisible(null);
          setVisibleNames(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return function() { cancelled = true; };
  }, [user && (user.userId || user.UserId || user.id)]);

  return (
    <RoleContext.Provider value={{ myRole, visibleCrmIds, visibleNames, roleLoading }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);

// Shared helper: does a project's user list include any visible CRM ID?
export function projectMatchesRole(proj, visibleCrmIds) {
  if (!visibleCrmIds) return true;
  const users = proj.projectUsers ?? proj.users ?? [];
  return users.some(u => {
    const id = String(u?.key ?? u?.Key ?? u?.userId ?? u?.UserId
              ?? u?.user_id ?? u?.id ?? u?.Id ?? u?.ID ?? '');
    return id && visibleCrmIds.includes(id);
  });
}
