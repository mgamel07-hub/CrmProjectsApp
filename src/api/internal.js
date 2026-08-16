import { supabase } from './supabase';

// ── Schedule ─────────────────────────────────────────────────────────────────

export async function getWeekSchedule(userId, weekStart, weekEnd) {
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*')
    .eq('crm_user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function getTeamWeekSchedule(userIds, weekStart, weekEnd) {
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*')
    .in('crm_user_id', userIds)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function upsertScheduleEntry(entry) {
  const { data, error } = await supabase
    .from('schedule_entries')
    .upsert(entry, { onConflict: 'crm_user_id,date' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteScheduleEntry(id) {
  const { error } = await supabase.from('schedule_entries').delete().eq('id', id);
  if (error) throw error;
}

// ── Office Reports ────────────────────────────────────────────────────────────

export async function getOfficeReport(userId, date) {
  const { data, error } = await supabase
    .from('office_reports')
    .select('*')
    .eq('crm_user_id', userId)
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertOfficeReport(report) {
  const existing = await getOfficeReport(report.crm_user_id, report.date);
  if (existing) {
    const { data, error } = await supabase
      .from('office_reports')
      .update(report)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('office_reports')
    .insert(report)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getMyTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAssignedByMeTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTeamTasks(userIds) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .in('assigned_to', userIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markTaskDone(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'done', done_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markTaskPending(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'pending', done_at: null })
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getMyNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('to_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('to_user_id', userId);
  if (error) throw error;
}

export async function createNotification(notif) {
  const { error } = await supabase.from('notifications').insert(notif);
  if (error) throw error;
}

export async function getUnreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('to_user_id', userId)
    .eq('is_read', false);
  if (error) return 0;
  return count || 0;
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getTeams() {
  const { data, error } = await supabase.from('teams').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function createTeam(name) {
  const { data, error } = await supabase.from('teams').insert({ name }).select().single();
  if (error) throw error;
  return data;
}

export async function renameTeam(id, name) {
  const { error } = await supabase.from('teams').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteTeam(id) {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) throw error;
}

// ── Team Members ──────────────────────────────────────────────────────────────

export async function getTeamMembers() {
  const { data, error } = await supabase
    .from('team_members')
    .select('*, teams(id, name)')
    .order('display_name');
  if (error) throw error;
  return data || [];
}

export async function upsertTeamMember({ crm_user_id, display_name, role, team_id }) {
  const { error } = await supabase.from('team_members').upsert(
    { crm_user_id: String(crm_user_id), display_name, role, team_id: team_id || null, updated_at: new Date().toISOString() },
    { onConflict: 'crm_user_id' }
  );
  if (error) throw error;
}

export async function deleteTeamMember(crm_user_id) {
  const { error } = await supabase.from('team_members').delete().eq('crm_user_id', String(crm_user_id));
  if (error) throw error;
}
