// Unwrap various API response shapes → plain object or null
export function extractData(res) {
  if (!res) return null;
  const d = res?.data;
  if (!d) return null;
  // { data: { data: {...} } }
  if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) return d.data;
  // { data: {...} } (non-array)
  if (typeof d === 'object' && !Array.isArray(d)) return d;
  return null;
}

// Unwrap various API response shapes → array or null
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
