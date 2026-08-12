import api from './client';

// Employee reports — current user's own data
export const getMyPerformanceProcess = (params) =>
  api.get('/Dashboard/GetUserPerformanceProcess', { params });

export const getMyPerformanceTasks = (params) =>
  api.get('/Dashboard/GetUserPerformanceTasks', { params });

export const getPlanItemsSummary = (params) =>
  api.get('/Dashboard/GetPlanItemsSummary', { params });

export const getPlanItemsTotals = (params) =>
  api.get('/Dashboard/GetPlanItemsTotals', { params });

export const getProcessStatics = () =>
  api.get('/Dashboard/GetProcessStatics');

export const getTasksStatics = () =>
  api.get('/Dashboard/GetTasksStatics');

// Manager reports — team data
export const getTeamPerformanceProcess = (params) =>
  api.get('/Dashboard/GetUserAndPeriodPerformanceProcess', { params });

export const getTeamPerformanceTasks = (params) =>
  api.get('/Dashboard/GetUserAndPeriodPerformanceTasks', { params });

export const getPlanItemsDetails = (params) =>
  api.get('/Dashboard/GetPlanItemsDetails', { params });

export const getTeamStructure = () =>
  api.get('/UserStructure/GetuserStructureTree');

export const getStructureUsers = (params) =>
  api.get('/UserStructure/GetStructureUsers', { params });

export const getProjectDashboardStats = () =>
  api.get('/Project/GetMainDashboardStats');
