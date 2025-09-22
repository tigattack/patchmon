import React, { createContext, useContext, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { versionAPI, settingsAPI } from '../utils/api'
import { useAuth } from './AuthContext'

const UpdateNotificationContext = createContext()

export const useUpdateNotification = () => {
  const context = useContext(UpdateNotificationContext)
  if (!context) {
    throw new Error('useUpdateNotification must be used within an UpdateNotificationProvider')
  }
  return context
}

export const UpdateNotificationProvider = ({ children }) => {
  const [dismissed, setDismissed] = useState(false)
  const { user, token } = useAuth()

  // Ensure settings are loaded
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsAPI.get().then(res => res.data),
    enabled: !!(user && token),
    retry: 1
  })

  // Query for update information
  const { data: updateData, isLoading, error } = useQuery({
    queryKey: ['updateCheck'],
    queryFn: () => versionAPI.checkUpdates().then(res => res.data),
    staleTime: 10 * 60 * 1000, // Data stays fresh for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    retry: 1,
    enabled: !!(user && token && settings && !settingsLoading) // Only run when authenticated and settings are loaded
  })

  const updateAvailable = updateData?.isUpdateAvailable && !dismissed
  const updateInfo = updateData

  const dismissNotification = () => {
    setDismissed(true)
  }

  const value = {
    updateAvailable,
    updateInfo,
    dismissNotification,
    isLoading,
    error
  }

  return (
    <UpdateNotificationContext.Provider value={value}>
      {children}
    </UpdateNotificationContext.Provider>
  )
}
