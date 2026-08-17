import api, { apiV2 } from './client';

// Projects
export const getProjects = (filter) => api.post('/Project/GetAll', filter);
export const getProjectById = (id) => api.get(`/Project/GetById/${id}`);
export const getProjectByIdForView = (id) => api.get(`/Project/GetByIdForView/${id}`);
export const getProjectProgress = (id) => api.get(`/Project/GetProgress/${id}`);
export const getDashboardStats = () => api.get('/Project/GetMainDashboardStats');
export const getProjectDashboard = (projectId) => api.get(`/Project/GetSingleProjectDashboardStats/${projectId}`);
export const getProjectRelatedObjects = () => api.get('/Project/GetRelatedObjectsForFilter');
export const createProject = (data) => api.post('/Project/Create', data);
export const createProjectV2 = (data) => apiV2.post('/Project/Create', data);
export const updateProject = (data) => api.put('/Project/Update', data);
export const updateProjectStatus = (data) => api.put('/Project/UpdateStatus', data);
export const deleteProject = (id) => api.delete(`/Project/Delete/${id}`);
export const getProjectsDropdown = () => api.get('/Project/GetAsDropDownList');

// Project Users
export const getProjectUsers = (projectId) => api.get(`/ProjectUser/GetByProject/${projectId}`);
export const addProjectUser = (data) => api.post('/ProjectUser/Create', data);
export const deleteProjectUser = (id) => api.delete(`/ProjectUser/Delete/${id}`);

// Scopes
export const getScopesByProject = (projectId) => api.get(`/ProjectScope/GetByProject/${projectId}`);
export const getScopeById = (id) => api.get(`/ProjectScope/GetById/${id}`);
export const createScope = (data) => api.post('/ProjectScope/Create', data);
export const updateScope = (data) => api.put('/ProjectScope/Update', data);
export const deleteScope = (id) => api.delete(`/ProjectScope/Delete/${id}`);
export const getScopesDropdown = (projectId) => api.get(`/ProjectScope/GetAsDropDownListByProject/${projectId}`);

// Scope Users
export const getScopeUsers = (projectScopeId) => api.get(`/ProjectScopeUser/GetByScope/${projectScopeId}`);
export const getEligibleScopeUsers = (projectScopeId) => api.get(`/ProjectScopeUser/GetEligibleProjectUsers/${projectScopeId}`);
export const addScopeUser = (data) => api.post('/ProjectScopeUser/Create', data);
export const deleteScopeUser = (id) => api.delete(`/ProjectScopeUser/Delete/${id}`);

// Scope Stages
export const getStagesByScope = (projectScopeId) => api.get(`/ProjectScopeStage/GetByScope/${projectScopeId}`);
export const getStagesDropdown = (projectScopeId) => api.get(`/ProjectScopeStage/GetAsDropDownListByScope/${projectScopeId}`);
export const updateStageStatus = (data) => api.put('/ProjectScopeStage/UpdateStatus', data);
export const updateStage = (data) => api.put('/ProjectScopeStage/Update', data);
export const finishStageWorkflow = (data) => api.put('/ProjectScopeStage/FinishWorkflow', data);

// Plans
export const getPlansByScope = (params) => api.get('/ProjectPlan/GetByScope', { params });
export const getPlanById = (id) => api.get(`/ProjectPlan/GetById/${id}`);
export const getPlanByIdForView = (id) => api.get(`/ProjectPlan/GetByIdForView/${id}`);
export const createPlan = (data) => api.post('/ProjectPlan/Create', data);
export const updatePlan = (data) => api.put('/ProjectPlan/Update', data);
export const updatePlanStatus = (data) => api.put('/ProjectPlan/UpdateStatus', data);
// statusId: 2=Submitted, 3=Approved, 4=Rejected (confirmed from API: statusId 3 → statusName "Approved")
export const submitPlan  = (id) => api.put('/ProjectPlan/UpdateStatus', { id, statusId: 2 });
export const approvePlan = (id) => api.put('/ProjectPlan/UpdateStatus', { id, statusId: 3 });
export const rejectPlan  = (id, data) => api.put('/ProjectPlan/UpdateStatus', { id, statusId: 4, ...data });
export const revertPlanStep = (id) => api.put('/ProjectPlan/UpdateStatus', { id, statusId: 1 });
export const deletePlan = (id) => api.delete(`/ProjectPlan/Delete/${id}`);
export const getAvailableStageDefItems = (planId) => api.get(`/ProjectPlan/GetAvailableStageDefItems/${planId}`);
export const getPendingPlans = (params) => api.get('/ProjectPlan/GetByFilter', { params });

// Plan Items
export const getPlanItems = (projectPlanId) => api.get(`/ProjectPlanItem/GetByPlan/${projectPlanId}`);
export const createPlanItem = (data) => api.post('/ProjectPlanItem/Create', data);
export const createPlanItemFromCatalog = (data) => api.post('/ProjectPlanItem/CreateFromCatalog', data);
export const updatePlanItem = (data) => api.put('/ProjectPlanItem/Update', data);
export const deletePlanItem = (id) => api.delete(`/ProjectPlanItem/Delete/${id}`);

// Allocated Units Requests
export const getUnitsRequests = (params) => api.get('/ProjectAllocatedUnitsRequest/GetByFilter', { params });
export const createUnitsRequest = (data) => api.post('/ProjectAllocatedUnitsRequest/Create', data);
export const approveUnitsRequest = (id, data) => api.put(`/ProjectAllocatedUnitsRequest/Approve/${id}`, data);
export const rejectUnitsRequest = (id, data) => api.put(`/ProjectAllocatedUnitsRequest/Reject/${id}`, data);
export const updateUnitsRequestStatus = (data) => api.put('/ProjectAllocatedUnitsRequest/UpdateStatus', data);

// Accounts / Customers dropdown
export const getAccountsDropdown = () => api.get('/Account/GetAsDropDownList');
export const getAccountsDynamic = (search = '') => api.get('/Account/GetDynamicList', { params: { searchVal: search, pageNo: 1 } });

// Related objects for dropdowns
export const getBranches = () => api.get('/Branch/GetAllAsDropDownList');
export const getUserBranches = () => api.get('/User/GetUserBranchesAsDropdownList');
export const getCustomers = () => api.get('/Account/GetDynamicList');
export const getCustomersByUser = (userId) =>
  api.get('/Account/GetAsDropDownListByUser', { params: { userId } }).catch(() =>
    api.get('/Account/GetAsDropDownList')
  );
export const getFlags = (groupCode) => api.get('/Flag/GetAsDropDownList', { params: { groupCode } });
export const getUsers = () => api.post('/User/GetAsDropDownList', {});
export const getProducts = (search = '', pageSize = 200) =>
  api.get('/Product/GetDynamicList', { params: { pageNo: 1, pageSize, searchVal: search } });

// Plan Execution (تنفيذ الخطة)
export const getProjectVisits = (projectId) => api.get(`/PlanExecution/GetByFilter?projectId=${projectId}`);
export const createProjectVisit = (data) => api.post('/PlanExecution/Create', data);
export const deleteProjectVisit = (id) => api.delete(`/PlanExecution/Delete/${id}`);
export const getPlanExecutionStages = (projectScopeId) => api.get(`/PlanExecution/GetStagesByScopeId?projectScopeId=${projectScopeId}`);
export const getPlansDropDown = (projectScopeId, projectScopeStageId) =>
  api.get('/ProjectPlan/GetPlansDropDown', { params: { projectScopeId, projectScopeStageId, approvedPlansOnly: true } });
export const uploadPlanExecutionAttachment = (planExecutionId, formData) =>
  api.post(`/PlanExecution/UploadAttachment/${planExecutionId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// Client Team (فريق العميل) — contacts from the customer side on a project
export const getClientContacts = (projectId) => api.get(`/ProjectClientUser/GetByProject/${projectId}`);
export const addClientContact = (data) => api.post('/ProjectClientUser/Create', data);
export const deleteClientContact = (id) => api.delete(`/ProjectClientUser/Delete/${id}`);
export const getEligibleClientUsers = (projectId) => api.get(`/ProjectClientUser/GetEligibleUsers/${projectId}`);
