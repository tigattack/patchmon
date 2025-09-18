import React, { createContext, useContext, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { versionAPI } from '../utils/api'

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

  // Query for update information
  const { data: updateData, isLoading, error } = useQuery({
    queryKey: ['updateCheck'],
    queryFn: () => versionAPI.checkUpdates().then(res => res.data),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    retry: 1
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
