import { apiRoot } from './client';

// All dashboard endpoints live at /api/dashboards/... (not /api/v1/)
const dash = (path, params) => apiRoot.get(`/api/dashboards/${path}`, params ? { params } : undefined);

export const getMyOverview     = ()            => dash('my-overview');
export const getStageCards     = (params = {}) => dash('stage-cards', params);
export const getStaffKpi       = ()            => dash('staff-kpi');
export const getWorkload       = ()            => dash('workload');
export const getProgressTrend  = (months = 6) => dash('progress-trend', { months });
export const getClientBreakdown = (cid)       => dash(`client-breakdown/${cid}`);
export const getTeamOverview   = ()            => dash('team-overview');
export const getAggregation    = (params = {}) => dash('aggregation', params);
export const getUnplanned      = ()            => dash('unplanned-report');
export const getKpi            = ()            => dash('kpi');
