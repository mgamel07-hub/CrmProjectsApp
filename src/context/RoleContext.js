import React, { createContext, useContext, useState, useEffect } from 'react';
import { getMyTeamRecord, getTeamMembers } from '../api/internal';
import { useAuth } from './AuthContext';

const RoleContext = createContext({
  myRole: 'employee',
  visibleCrmIds: null,   // null → admin (no filter); string[] → filter to these CRM IDs
  visibleNames: null,    // null → no filter; string[] → visible member display names
  roleLoading: true,
});

function extractCrmId(u) {
  const v = u?.key ?? u?.Key ?? u?.userId ?? u?.UserId ?? u?.user_id
         ?? u?.id  ?? u?.Id  ?? u?.ID     ?? u?.accountId ?? null;
  return v != null ? String(v) : '';
}

export function RoleProvider({ children }) {
  const { user } = useAuth();
  const [myRole, setMyRole]             = useState('employee');
  const [visibleCrmIds, setVisible]     = useState(null);
  const [visibleNames, setVisibleNames] = useState(null);
  const [roleLoading, setLoading]       = useState(true);

  useEffect(() => {
    const uid = user?.userId;
    if (!uid) { setLoading(false); return; }

    (async () => {
      try {
        const me = await getMyTeamRecord(uid);
        const role = me?.role || 'employee';
        setMyRole(role);

        if (role === 'admin') {
          setVisible(null);       // sees everything
          setVisibleNames(null);
        } else if (role === 'manager') {
          const allMembers = await getTeamMembers();
          const mine = allMembers.filter(m => m.team_id === me.team_id);
          const ids   = mine.map(m => m.crm_user_id).filter(Boolean);
          const names = mine.map(m => m.display_name).filter(Boolean);
          setVisible(ids.length   ? ids   : [String(uid)]);
          setVisibleNames(names.length ? names : []);
        } else {
          // employee: only own record
          const ids   = [String(uid)];
          const names = me?.display_name ? [me.display_name] : [];
          setVisible(ids);
          setVisibleNames(names);
        }
      } catch {
        // On Supabase failure → default to show everything (fail-open)
        setVisible(null);
        setVisibleNames(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.userId]);

  return (
    <RoleContext.Provider value={{ myRole, visibleCrmIds, visibleNames, roleLoading, extractCrmId }}>
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
