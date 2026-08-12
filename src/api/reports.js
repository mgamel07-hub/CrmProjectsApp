import api from './client';

// Employee — GET (no body)
export const getProcessStatics  = () => api.get('/Dashboard/GetProcessStatics');
export const getTasksStatics    = () => api.get('/Dashboard/GetTasksStatics');
export const getPlanItemsSummary = () => api.get('/Dashboard/GetPlanItemsSummary');
export const getPlanItemsTotals  = () => api.get('/Dashboard/GetPlanItemsTotals');

// Employee — POST with date-range body
export const getMyPerformanceProcess = (body) => api.post('/Dashboard/GetUserPerformanceProcess', body);
export const getMyPerformanceTasks   = (body) => api.post('/Dashboard/GetUserPerformanceTasks', body);
export const getPlanItemsDetails     = (body) => api.post('/Dashboard/GetPlanItemsDetails', body);

// Manager — POST with date-range body
export const getTeamPerformanceProcess = (body) =>
  api.post('/Dashboard/GetUserAndPeriodPerformanceProcess', body);
export const getTeamPerformanceTasks = (body) =>
  api.post('/Dashboard/GetUserAndPeriodPerformanceTasks', body);

// Smart Dashboard (alternative — GET, no body)
export const getSmartUserSummary        = () => api.get('/SmartDashboard/GetUserSummary');
export const getSmartPlanItemsSummary   = () => api.get('/SmartDashboard/GetPlanItemsSummary');
export const getSmartUserTaskPerf       = (body) => api.post('/SmartDashboard/GetUserTaskPerformance', body);
export const getSmartUserProcessPerf    = (body) => api.post('/SmartDashboard/GetUserProcessPerformance', body);

// Project stats
export const getProjectDashboardStats     = () => api.get('/Project/GetMainDashboardStats');
export const getSingleProjectStats        = (projectId) =>
  api.get(`/Project/GetSingleProjectDashboardStats/${projectId}`);

// Team structure
export const getTeamStructure  = () => api.get('/UserStructure/GetuserStructureTree');
export const getStructureUsers = (params) => api.get('/UserStructure/GetStructureUsers', { params });
