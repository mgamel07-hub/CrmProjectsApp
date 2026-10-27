// Helpers for matching project types by name (case-insensitive, typo-tolerant).
// The CRM stores type names like "Instlation" or "implementaion" — we match
// by substring so typos in the server data don't break the filter.

function typeName(project) {
  return (
    project?.projectTypeFlag?.name ||
    project?.projectTypeFlag?.value ||
    project?.projectTypeFlagName ||
    ''
  ).toLowerCase().trim();
}

export function isInstallationType(project) {
  const n = typeName(project);
  return n.includes('install') || n.includes('inst');
}

export function isImplementationType(project) {
  const n = typeName(project);
  // "implementaion" / "implementation" / "impl"
  return n.includes('impl') || n.includes('implement');
}

/**
 * Returns true for projects that should appear in the main app views.
 * Falls back to showing the project if its type is unknown/unset
 * (so existing projects without a type flag are not silently hidden).
 */
export function isMainProjectType(project) {
  const n = typeName(project);
  if (!n) return true; // no type set → show it
  return isImplementationType(project);
}
