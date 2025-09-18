import React, { createContext, useContext, useState } from 'react'

const UpdateNotificationContext = createContext()

export const useUpdateNotification = () => {
  const context = useContext(UpdateNotificationContext)
  if (!context) {
    throw new Error('useUpdateNotification must be used within an UpdateNotificationProvider')
  }
  return context
}

export const UpdateNotificationProvider = ({ children }) => {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)

  const dismissNotification = () => {
    setUpdateAvailable(false)
    setUpdateInfo(null)
  }

  const value = {
    updateAvailable,
    updateInfo,
    dismissNotification,
    isLoading: false,
    error: null
  }

  return (
    <UpdateNotificationContext.Provider value={value}>
      {children}
    </UpdateNotificationContext.Provider>
  )
}
