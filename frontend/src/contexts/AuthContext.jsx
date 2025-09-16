import React, { createContext, useContext, useState, useEffect } from 'react'

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

  // Periodically refresh permissions when user is logged in
  useEffect(() => {
    if (token && user) {
      // Refresh permissions every 30 seconds
      const interval = setInterval(() => {
        refreshPermissions()
      }, 30000)

      return () => clearInterval(interval)
    }
  }, [token, user])

  const fetchPermissions = async (authToken) => {
    try {
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
    return permissions?.[permission] === true
  }

  const canViewDashboard = () => hasPermission('canViewDashboard')
  const canViewHosts = () => hasPermission('canViewHosts')
  const canManageHosts = () => hasPermission('canManageHosts')
  const canViewPackages = () => hasPermission('canViewPackages')
  const canManagePackages = () => hasPermission('canManagePackages')
  const canViewUsers = () => hasPermission('canViewUsers')
  const canManageUsers = () => hasPermission('canManageUsers')
  const canViewReports = () => hasPermission('canViewReports')
  const canExportData = () => hasPermission('canExportData')
  const canManageSettings = () => hasPermission('canManageSettings')

  const value = {
    user,
    token,
    permissions,
    isLoading,
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
