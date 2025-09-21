import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [permissions, setPermissions] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [needsFirstTimeSetup, setNeedsFirstTimeSetup] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    const storedPermissions = localStorage.getItem('permissions')

    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
        if (storedPermissions) {
          setPermissions(JSON.parse(storedPermissions))
        } else {
          // Fetch permissions if not stored
          fetchPermissions(storedToken)
        }
      } catch (error) {
        console.error('Error parsing stored user data:', error)
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('permissions')
      }
    }
    setIsLoading(false)
  }, [])

  // Refresh permissions when user logs in (no automatic refresh)
  useEffect(() => {
    if (token && user) {
      // Only refresh permissions once when user logs in
      refreshPermissions()
    }
  }, [token, user])

  const fetchPermissions = async (authToken) => {
    try {
      setPermissionsLoading(true)
      const response = await fetch('/api/v1/permissions/user-permissions', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setPermissions(data)
        localStorage.setItem('permissions', JSON.stringify(data))
        return data
      } else {
        console.error('Failed to fetch permissions')
        return null
      }
    } catch (error) {
      console.error('Error fetching permissions:', error)
      return null
    } finally {
      setPermissionsLoading(false)
    }
  }

  const refreshPermissions = async () => {
    if (token) {
      const updatedPermissions = await fetchPermissions(token)
      return updatedPermissions
    }
    return null
  }

  const login = async (username, password) => {
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (response.ok) {
        setToken(data.token)
        setUser(data.user)
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        
        // Fetch user permissions after successful login
        const userPermissions = await fetchPermissions(data.token)
        if (userPermissions) {
          setPermissions(userPermissions)
        }
        
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Login failed' }
      }
    } catch (error) {
      return { success: false, error: 'Network error occurred' }
    }
  }

  const logout = async () => {
    try {
      if (token) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setToken(null)
      setUser(null)
      setPermissions(null)
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('permissions')
    }
  }

  const updateProfile = async (profileData) => {
    try {
      const response = await fetch('/api/v1/auth/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      })

      const data = await response.json()

      if (response.ok) {
        setUser(data.user)
        localStorage.setItem('user', JSON.stringify(data.user))
        return { success: true, user: data.user }
      } else {
        return { success: false, error: data.error || 'Update failed' }
      }
    } catch (error) {
      return { success: false, error: 'Network error occurred' }
    }
  }

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const response = await fetch('/api/v1/auth/change-password', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = await response.json()

      if (response.ok) {
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Password change failed' }
      }
    } catch (error) {
      return { success: false, error: 'Network error occurred' }
    }
  }

  const isAuthenticated = () => {
    return !!(token && user)
  }

  const isAdmin = () => {
    return user?.role === 'admin'
  }

  // Permission checking functions
  const hasPermission = (permission) => {
    // If permissions are still loading, return false to show loading state
    if (permissionsLoading) {
      return false
    }
    return permissions?.[permission] === true
  }

  const canViewDashboard = () => hasPermission('can_view_dashboard')
  const canViewHosts = () => hasPermission('can_view_hosts')
  const canManageHosts = () => hasPermission('can_manage_hosts')
  const canViewPackages = () => hasPermission('can_view_packages')
  const canManagePackages = () => hasPermission('can_manage_packages')
  const canViewUsers = () => hasPermission('can_view_users')
  const canManageUsers = () => hasPermission('can_manage_users')
  const canViewReports = () => hasPermission('can_view_reports')
  const canExportData = () => hasPermission('can_export_data')
  const canManageSettings = () => hasPermission('can_manage_settings')

  // Check if any admin users exist (for first-time setup)
  const checkAdminUsersExist = useCallback(async () => {
    try {
      console.log('Making API call to check admin users...')
      const response = await fetch('/api/v1/auth/check-admin-users', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Admin check response:', data) // Debug log
        setNeedsFirstTimeSetup(!data.hasAdminUsers)
      } else {
        console.log('Admin check failed:', response.status, response.statusText) // Debug log
        // If endpoint doesn't exist or fails, assume setup is needed
        setNeedsFirstTimeSetup(true)
      }
    } catch (error) {
      console.error('Error checking admin users:', error)
      // If there's an error, assume setup is needed
      setNeedsFirstTimeSetup(true)
    } finally {
      setCheckingSetup(false)
    }
  }, [])

  // Check for admin users on initial load
  useEffect(() => {
    console.log('AuthContext useEffect triggered:', { token: !!token, user: !!user })
    if (!token && !user) {
      console.log('Calling checkAdminUsersExist...')
      checkAdminUsersExist()
    } else {
      console.log('Skipping admin check - user already authenticated')
      setCheckingSetup(false)
    }
  }, [token, user, checkAdminUsersExist])

  const value = {
    user,
    token,
    permissions,
    isLoading: isLoading || permissionsLoading || checkingSetup,
    needsFirstTimeSetup,
    checkingSetup,
    login,
    logout,
    updateProfile,
    changePassword,
    refreshPermissions,
    isAuthenticated,
    isAdmin,
    hasPermission,
    canViewDashboard,
    canViewHosts,
    canManageHosts,
    canViewPackages,
    canManagePackages,
    canViewUsers,
    canManageUsers,
    canViewReports,
    canExportData,
    canManageSettings
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
