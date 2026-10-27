// Helpers for matching project types by name (case-insensitive, typo-tolerant).
// The CRM stores type names like "Instlation" or "implementaion" — we match
// by substring so typos in the server data don't break the filter.
//
// IMPORTANT: GetAll responses often return only `projectTypeFlagId` (a number)
// without the embedded `projectTypeFlag` object. Pass a `flagsMap` (built from
// getProjectRelatedObjects()) so the ID can be resolved to a name.

function getTypeName(project, flagsMap = {}) {
  return (
    project?.projectTypeFlag?.name ||
    project?.projectTypeFlag?.value ||
    project?.projectTypeFlagName ||
    flagsMap[String(project?.projectTypeFlagId ?? '')] ||
    ''
  ).toLowerCase().trim();
}

function isInstallationName(n) {
  return n.includes('install') || n.includes('inst');
}
function isImplementationName(n) {
  return n.includes('impl') || n.includes('implement');
}

export function isInstallationType(project, flagsMap = {}) {
  return isInstallationName(getTypeName(project, flagsMap));
}

export function isImplementationType(project, flagsMap = {}) {
  return isImplementationName(getTypeName(project, flagsMap));
}

/**
 * Returns true for projects that should appear in the main app views
 * (i.e. Implementation projects only).
 * If the type name is completely unknown, shows the project (backward compat).
 */
export function isMainProjectType(project, flagsMap = {}) {
  const n = getTypeName(project, flagsMap);
  if (!n) return true; // no type resolved → show it
  return isImplementationName(n);
}

/**
 * Build a flagsMap from a getProjectRelatedObjects() response.
 * Maps String(flagId) → lowercase flag name.
 */
export function buildFlagsMap(relatedObjectsData) {
  const flags =
    relatedObjectsData?.projectTypeFlagsDDL ||
    relatedObjectsData?.flags ||
    [];
  const map = {};
  if (!Array.isArray(flags)) return map;
  flags.forEach(f => {
    const k = f.key ?? f.id;
    if (k != null) {
      map[String(k)] = (f.value || f.name || '').toLowerCase().trim();
    }
  });
  return map;
}
