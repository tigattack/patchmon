import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Dashboard API
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getHosts: () => api.get('/dashboard/hosts'),
  getPackages: () => api.get('/dashboard/packages'),
  getHostDetail: (hostId) => api.get(`/dashboard/hosts/${hostId}`),
}

// Admin Hosts API (for management interface)
export const adminHostsAPI = {
  create: (data) => api.post('/hosts/create', data),
  list: () => api.get('/hosts/admin/list'),
  delete: (hostId) => api.delete(`/hosts/${hostId}`),
  regenerateCredentials: (hostId) => api.post(`/hosts/${hostId}/regenerate-credentials`),
  updateGroup: (hostId, hostGroupId) => api.put(`/hosts/${hostId}/group`, { hostGroupId }),
  bulkUpdateGroup: (hostIds, hostGroupId) => api.put('/hosts/bulk/group', { hostIds, hostGroupId }),
  toggleAutoUpdate: (hostId, autoUpdate) => api.patch(`/hosts/${hostId}/auto-update`, { autoUpdate })
}

// Host Groups API
export const hostGroupsAPI = {
  list: () => api.get('/host-groups'),
  get: (id) => api.get(`/host-groups/${id}`),
  create: (data) => api.post('/host-groups', data),
  update: (id, data) => api.put(`/host-groups/${id}`, data),
  delete: (id) => api.delete(`/host-groups/${id}`),
  getHosts: (id) => api.get(`/host-groups/${id}/hosts`),
}

// Admin Users API (for user management)
export const adminUsersAPI = {
  list: () => api.get('/auth/admin/users'),
  create: (userData) => api.post('/auth/admin/users', userData),
  update: (userId, userData) => api.put(`/auth/admin/users/${userId}`, userData),
  delete: (userId) => api.delete(`/auth/admin/users/${userId}`),
  resetPassword: (userId, newPassword) => api.post(`/auth/admin/users/${userId}/reset-password`, { newPassword })
}

// Permissions API (for role management)
export const permissionsAPI = {
  getRoles: () => api.get('/permissions/roles'),
  getRole: (role) => api.get(`/permissions/roles/${role}`),
  updateRole: (role, permissions) => api.put(`/permissions/roles/${role}`, permissions),
  deleteRole: (role) => api.delete(`/permissions/roles/${role}`),
  getUserPermissions: () => api.get('/permissions/user-permissions')
}

// Settings API
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (settings) => api.put('/settings', settings),
  getServerUrl: () => api.get('/settings/server-url')
}

// Agent Version API
export const agentVersionAPI = {
  list: () => api.get('/hosts/agent/versions'),
  create: (data) => api.post('/hosts/agent/versions', data),
  update: (id, data) => api.put(`/hosts/agent/versions/${id}`, data),
  delete: (id) => api.delete(`/hosts/agent/versions/${id}`),
  setCurrent: (id) => api.patch(`/hosts/agent/versions/${id}/current`),
  setDefault: (id) => api.patch(`/hosts/agent/versions/${id}/default`),
  download: (version) => api.get(`/hosts/agent/download${version ? `?version=${version}` : ''}`, { responseType: 'blob' })
}

// Repository API
export const repositoryAPI = {
  list: () => api.get('/repositories'),
  getById: (repositoryId) => api.get(`/repositories/${repositoryId}`),
  getByHost: (hostId) => api.get(`/repositories/host/${hostId}`),
  update: (repositoryId, data) => api.put(`/repositories/${repositoryId}`, data),
  toggleHostRepository: (hostId, repositoryId, isEnabled) => 
    api.patch(`/repositories/host/${hostId}/repository/${repositoryId}`, { isEnabled }),
  getStats: () => api.get('/repositories/stats/summary'),
  cleanupOrphaned: () => api.delete('/repositories/cleanup/orphaned')
}

// Dashboard Preferences API
export const dashboardPreferencesAPI = {
  get: () => api.get('/dashboard-preferences'),
  update: (preferences) => api.put('/dashboard-preferences', { preferences }),
  getDefaults: () => api.get('/dashboard-preferences/defaults')
}

// Hosts API (for agent communication - kept for compatibility)
export const hostsAPI = {
  // Legacy register endpoint (now deprecated)
  register: (data) => api.post('/hosts/register', data),
  
  // Updated to use API credentials
  update: (apiId, apiKey, data) => api.post('/hosts/update', data, {
    headers: { 
      'X-API-ID': apiId,
      'X-API-KEY': apiKey
    }
  }),
  getInfo: (apiId, apiKey) => api.get('/hosts/info', {
    headers: { 
      'X-API-ID': apiId,
      'X-API-KEY': apiKey
    }
  }),
  ping: (apiId, apiKey) => api.post('/hosts/ping', {}, {
    headers: { 
      'X-API-ID': apiId,
      'X-API-KEY': apiKey
    }
  }),
  toggleAutoUpdate: (id, autoUpdate) => api.patch(`/hosts/${id}/auto-update`, { autoUpdate })
}

// Packages API
export const packagesAPI = {
  getAll: (params = {}) => api.get('/packages', { params }),
  getById: (packageId) => api.get(`/packages/${packageId}`),
  getCategories: () => api.get('/packages/categories/list'),
  getHosts: (packageId, params = {}) => api.get(`/packages/${packageId}/hosts`, { params }),
  update: (packageId, data) => api.put(`/packages/${packageId}`, data),
  search: (query, params = {}) => api.get(`/packages/search/${query}`, { params }),
}

// Utility functions
export const formatError = (error) => {
  if (error.response?.data?.message) {
    return error.response.data.message
  }
  if (error.response?.data?.error) {
    return error.response.data.error
  }
  if (error.message) {
    return error.message
  }
  return 'An unexpected error occurred'
}

export const formatDate = (date) => {
  return new Date(date).toLocaleString()
}

// Version API
export const versionAPI = {
  getCurrent: () => api.get('/version/current'),
  checkUpdates: () => api.get('/version/check-updates'),
}

export const formatRelativeTime = (date) => {
  const now = new Date()
  const diff = now - new Date(date)
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return `${seconds} second${seconds > 1 ? 's' : ''} ago`
}

export default api 