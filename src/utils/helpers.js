import { t } from '../i18n';

// ─── API response unwrappers ────────────────────────────────────────────────

export function extractData(res) {
  if (!res) return null;
  const d = res?.data;
  if (!d) return null;
  if (d.data && !Array.isArray(d.data)) return d.data;
  if (!Array.isArray(d)) return d;
  return null;
}

export function extractList(res) {
  if (!res) return null;
  const d = res?.data;
  if (!d) return null;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.data)) return d.data;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.list)) return d.list;
  if (Array.isArray(d.results)) return d.results;
  return null;
}

// ─── Date formatter ─────────────────────────────────────────────────────────

export function formatDate(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(val);
  }
}

// ─── Project status ─────────────────────────────────────────────────────────

const PROJECT_STATUS = {
  1: { label: () => t('status1'), color: '#F57C00' }, // In Progress
  2: { label: () => t('status2'), color: '#607D8B' }, // On Hold
  3: { label: () => t('status3'), color: '#388E3C' }, // Completed
  4: { label: () => t('status4'), color: '#D32F2F' }, // Cancelled
  5: { label: () => t('status5'), color: '#455A64' }, // Closed
};

export function getProjectStatusLabel(statusId) {
  const s = PROJECT_STATUS[statusId] || PROJECT_STATUS[Number(statusId)];
  return s ? s.label() : String(statusId ?? '');
}

export function getProjectStatusColor(statusId) {
  const s = PROJECT_STATUS[statusId] || PROJECT_STATUS[Number(statusId)];
  return s ? s.color : '#90A4AE';
}

// ─── Plan status ─────────────────────────────────────────────────────────────

const PLAN_STATUS_MAP = {
  draft:     { label: () => t('planDraft'),      color: '#607D8B' },
  submitted: { label: () => t('planSubmitted'),  color: '#1565C0' },
  approved:  { label: () => t('planApproved'),   color: '#388E3C' },
  rejected:  { label: () => t('planRejected'),   color: '#D32F2F' },
  1:         { label: () => t('planDraft'),      color: '#607D8B' },
  2:         { label: () => t('planSubmitted'),  color: '#1565C0' },
  3:         { label: () => t('planApproved'),   color: '#388E3C' },
  4:         { label: () => t('planRejected'),   color: '#D32F2F' },
};

export function getPlanStatusLabel(status) {
  const key = String(status ?? '').toLowerCase();
  const s = PLAN_STATUS_MAP[key] || PLAN_STATUS_MAP[Number(key)];
  return s ? s.label() : String(status ?? '');
}

export function getPlanStatusColor(status) {
  const key = String(status ?? '').toLowerCase();
  const s = PLAN_STATUS_MAP[key] || PLAN_STATUS_MAP[Number(key)];
  return s ? s.color : '#90A4AE';
}

// ─── Stage status ─────────────────────────────────────────────────────────────

const STAGE_STATUS_MAP = {
  0:           { label: () => t('stageNotStarted'), color: '#607D8B' },
  notstarted:  { label: () => t('stageNotStarted'), color: '#607D8B' },
  1:           { label: () => t('stageInProgress'),  color: '#F57C00' },
  inprogress:  { label: () => t('stageInProgress'),  color: '#F57C00' },
  started:     { label: () => t('stageInProgress'),  color: '#F57C00' },
  2:           { label: () => t('stageCompleted'),   color: '#388E3C' },
  completed:   { label: () => t('stageCompleted'),   color: '#388E3C' },
  finished:    { label: () => t('stageCompleted'),   color: '#388E3C' },
};

export function getStageStatusLabel(status) {
  const key = String(status ?? '').toLowerCase().replace(/[_\s]/g, '');
  const s = STAGE_STATUS_MAP[key] || STAGE_STATUS_MAP[Number(key)];
  return s ? s.label() : String(status ?? '');
}

export function getStageStatusColor(status) {
  const key = String(status ?? '').toLowerCase().replace(/[_\s]/g, '');
  const s = STAGE_STATUS_MAP[key] || STAGE_STATUS_MAP[Number(key)];
  return s ? s.color : '#90A4AE';
}

// ─── Request (units request) status ─────────────────────────────────────────

const REQUEST_STATUS_MAP = {
  0:        { label: () => t('reqPending'),  color: '#F57C00' },
  pending:  { label: () => t('reqPending'),  color: '#F57C00' },
  1:        { label: () => t('reqApproved'), color: '#388E3C' },
  approved: { label: () => t('reqApproved'), color: '#388E3C' },
  2:        { label: () => t('reqRejected'), color: '#D32F2F' },
  rejected: { label: () => t('reqRejected'), color: '#D32F2F' },
};

export function getRequestStatusLabel(status) {
  const key = String(status ?? '').toLowerCase();
  const s = REQUEST_STATUS_MAP[key] || REQUEST_STATUS_MAP[Number(key)];
  return s ? s.label() : String(status ?? '');
}

export function getRequestStatusColor(status) {
  const key = String(status ?? '').toLowerCase();
  const s = REQUEST_STATUS_MAP[key] || REQUEST_STATUS_MAP[Number(key)];
  return s ? s.color : '#90A4AE';
}
