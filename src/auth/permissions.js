export const ROLE_RANK = { staff: 1, storekeeper: 2, admin: 3 };

export function hasRole(profile, minRole) {
  if (!profile || !profile.role) return false;
  return ROLE_RANK[profile.role] >= ROLE_RANK[minRole];
}
// Minimum role to see each page, mirrors ACTION_ROLES in backend/stock.gs.
export const PAGE_ROLES = {
  usage: 'staff',
  restock: 'admin',
  newitem: 'admin',
  stock: 'staff',
  telegram: 'staff',
  users: 'admin',
}

export function canAccessPage(profile, pageId) {
  if (!profile || !profile.role) return false

  if (pageId === 'usage') {
    return profile.role === 'staff' || profile.role === 'admin'
  }

  if (pageId === 'restock' || pageId === 'newitem') {
    return profile.role === 'admin'
  }

  return hasRole(profile, PAGE_ROLES[pageId])
}