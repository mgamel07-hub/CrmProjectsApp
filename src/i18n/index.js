import { I18nManager } from 'react-native';

const translations = {
  ar: {
    // Auth
    login: 'تسجيل الدخول',
    userId: 'اسم المستخدم',
    password: 'كلمة المرور',
    loginError: 'خطأ في بيانات الدخول',
    logout: 'تسجيل الخروج',

    // Common
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    add: 'إضافة',
    create: 'إنشاء',
    search: 'بحث',
    loading: 'جاري التحميل...',
    error: 'خطأ',
    success: 'نجح',
    confirm: 'تأكيد',
    yes: 'نعم',
    no: 'لا',
    submit: 'تقديم',
    approve: 'موافقة',
    reject: 'رفض',
    revert: 'إرجاع',
    reason: 'السبب',
    notes: 'ملاحظات',
    status: 'الحالة',
    date: 'التاريخ',
    startDate: 'تاريخ البداية',
    endDate: 'تاريخ النهاية',
    description: 'الوصف',
    title: 'العنوان',
    units: 'الوحدات',
    progress: 'التقدم',
    all: 'الكل',
    noData: 'لا توجد بيانات',
    optional: 'اختياري',
    required: 'مطلوب',

    // Navigation
    dashboard: 'لوحة التحكم',
    projects: 'المشاريع',
    reports: 'التقارير',
    approvals: 'الموافقات',
    profile: 'الملف الشخصي',
    notifications: 'الإشعارات',

    // Project
    project: 'المشروع',
    projectTitle: 'اسم المشروع',
    projectType: 'نوع المشروع',
    branch: 'الفرع',
    customer: 'العميل',
    allocatedUnits: 'الوحدات المخصصة',
    newProject: 'مشروع جديد',
    editProject: 'تعديل المشروع',
    projectDetails: 'تفاصيل المشروع',
    projectUsers: 'فريق العمل',
    clientTeam: 'فريق العميل',
    addContact: 'إضافة جهة اتصال',
    scopeProgress: 'تقدم النطاق',
    systemName: 'اسم النظام',
    planExecution: 'تنفيذ الخطة',
    addVisit: 'إضافة',
    visitDate: 'التاريخ',
    timeFrom: 'من',
    timeTo: 'إلى',
    noVisits: 'لا توجد سجلات تنفيذ',
    confirmDelete: 'تأكيد الحذف',
    deleteVisitConfirm: 'هل تريد حذف هذا السجل؟',

    // Scope
    scope: 'النطاق',
    scopes: 'النطاقات',
    newScope: 'نطاق جديد',
    scopeDetails: 'تفاصيل النطاق',
    weight: 'النسبة المئوية',
    product: 'المنتج',
    property: 'العقار',

    // Stage
    stage: 'المرحلة',
    stages: 'المراحل',
    stageDetails: 'تفاصيل المرحلة',

    // Plan
    plan: 'الخطة',
    plans: 'الخطط',
    newPlan: 'خطة جديدة',
    planDetails: 'تفاصيل الخطة',
    planItems: 'بنود الخطة',
    newPlanItem: 'بند جديد',
    expectedUnits: 'الوحدات المتوقعة',
    scheduledDate: 'التاريخ المجدول',

    // Allocated Units
    unitsRequest: 'طلب وحدات',
    unitsRequests: 'طلبات الوحدات',
    newUnitsRequest: 'طلب وحدات جديد',
    requestedUnits: 'الوحدات المطلوبة',
    approvedUnits: 'الوحدات المعتمدة',

    // Statuses
    status1: 'قيد التنفيذ',
    status2: 'معلق',
    status3: 'مكتمل',
    status4: 'ملغي',
    status5: 'مغلق',
    planDraft: 'مسودة',
    planSubmitted: 'مقدم',
    planApproved: 'معتمد',
    planRejected: 'مرفوض',
    reqPending: 'معلق',
    reqApproved: 'معتمد',
    reqRejected: 'مرفوض',
    stageNotStarted: 'لم تبدأ',
    stageInProgress: 'جاري',
    stageCompleted: 'مكتملة',

    // Dashboard
    totalProjects: 'إجمالي المشاريع',
    activeProjects: 'المشاريع النشطة',
    completedProjects: 'المشاريع المكتملة',
    pendingApprovals: 'بانتظار الموافقة',
    overallProgress: 'التقدم الكلي',

    // Errors
    networkError: 'خطأ في الاتصال بالشبكة',
    sessionExpired: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً',
  },
  en: {
    // Auth
    login: 'Login',
    userId: 'User ID',
    password: 'Password',
    loginError: 'Invalid credentials',
    logout: 'Logout',

    // Common
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    create: 'Create',
    search: 'Search',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    submit: 'Submit',
    approve: 'Approve',
    reject: 'Reject',
    revert: 'Revert',
    reason: 'Reason',
    notes: 'Notes',
    status: 'Status',
    date: 'Date',
    startDate: 'Start Date',
    endDate: 'End Date',
    description: 'Description',
    title: 'Title',
    units: 'Units',
    progress: 'Progress',
    all: 'All',
    noData: 'No data available',
    optional: 'Optional',
    required: 'Required',

    // Navigation
    dashboard: 'Dashboard',
    projects: 'Projects',
    reports: 'Reports',
    approvals: 'Approvals',
    profile: 'Profile',
    notifications: 'Notifications',

    // Project
    project: 'Project',
    projectTitle: 'Project Name',
    projectType: 'Project Type',
    branch: 'Branch',
    customer: 'Customer',
    allocatedUnits: 'Allocated Units',
    newProject: 'New Project',
    editProject: 'Edit Project',
    projectDetails: 'Project Details',
    projectUsers: 'Team Members',
    clientTeam: 'Client Team',
    addContact: 'Add Contact',
    scopeProgress: 'Scope Progress',
    systemName: 'System Name',
    planExecution: 'Plan Execution',
    addVisit: 'Add',
    visitDate: 'Date',
    timeFrom: 'From',
    timeTo: 'To',
    noVisits: 'No execution records',
    confirmDelete: 'Confirm Delete',
    deleteVisitConfirm: 'Delete this record?',

    // Scope
    scope: 'Scope',
    scopes: 'Scopes',
    newScope: 'New Scope',
    scopeDetails: 'Scope Details',
    weight: 'Weight %',
    product: 'Product',
    property: 'Property',

    // Stage
    stage: 'Stage',
    stages: 'Stages',
    stageDetails: 'Stage Details',

    // Plan
    plan: 'Plan',
    plans: 'Plans',
    newPlan: 'New Plan',
    planDetails: 'Plan Details',
    planItems: 'Plan Items',
    newPlanItem: 'New Item',
    expectedUnits: 'Expected Units',
    scheduledDate: 'Scheduled Date',

    // Allocated Units
    unitsRequest: 'Units Request',
    unitsRequests: 'Units Requests',
    newUnitsRequest: 'New Units Request',
    requestedUnits: 'Requested Units',
    approvedUnits: 'Approved Units',

    // Statuses
    status1: 'In Progress',
    status2: 'On Hold',
    status3: 'Completed',
    status4: 'Cancelled',
    status5: 'Closed',
    planDraft: 'Draft',
    planSubmitted: 'Submitted',
    planApproved: 'Approved',
    planRejected: 'Rejected',
    reqPending: 'Pending',
    reqApproved: 'Approved',
    reqRejected: 'Rejected',
    stageNotStarted: 'Not Started',
    stageInProgress: 'In Progress',
    stageCompleted: 'Completed',

    // Dashboard
    totalProjects: 'Total Projects',
    activeProjects: 'Active Projects',
    completedProjects: 'Completed',
    pendingApprovals: 'Pending Approvals',
    overallProgress: 'Overall Progress',

    // Errors
    networkError: 'Network connection error',
    sessionExpired: 'Session expired, please login again',
  },
};

let currentLang = 'ar';

export const setLanguage = (lang) => {
  currentLang = lang;
  I18nManager.forceRTL(lang === 'ar');
};

export const t = (key) => {
  return translations[currentLang]?.[key] || key;
};

export const getLang = () => currentLang;
export const isRTL = () => currentLang === 'ar';
