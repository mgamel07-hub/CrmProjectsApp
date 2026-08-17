import api from './client';

export const getMyOverview    = ()            => api.get('/dashboards/my-overview');
export const getStageCards    = (params = {}) => api.get('/dashboards/stage-cards', { params });
export const getStaffKpi      = ()            => api.get('/dashboards/staff-kpi');
export const getWorkload      = ()            => api.get('/dashboards/workload');
export const getProgressTrend = (months = 6) => api.get('/dashboards/progress-trend', { params: { months } });
export const getClientBreakdown = (cid)      => api.get(`/dashboards/client-breakdown/${cid}`);
export const getTeamOverview  = ()            => api.get('/dashboards/team-overview');
export const getAggregation   = (params = {}) => api.get('/dashboards/aggregation', { params });
export const getUnplanned     = ()            => api.get('/dashboards/unplanned-report');
