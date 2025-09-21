import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { UpdateNotificationProvider } from './contexts/UpdateNotificationContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Hosts from './pages/Hosts'
import Packages from './pages/Packages'
import Repositories from './pages/Repositories'
import RepositoryDetail from './pages/RepositoryDetail'
import Users from './pages/Users'
import Permissions from './pages/Permissions'
import Settings from './pages/Settings'
import Options from './pages/Options'
import Profile from './pages/Profile'
import HostDetail from './pages/HostDetail'
import PackageDetail from './pages/PackageDetail'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UpdateNotificationProvider>
          <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute requirePermission="can_view_dashboard">
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/hosts" element={
          <ProtectedRoute requirePermission="can_view_hosts">
            <Layout>
              <Hosts />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/hosts/:hostId" element={
          <ProtectedRoute requirePermission="can_view_hosts">
            <Layout>
              <HostDetail />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/packages" element={
          <ProtectedRoute requirePermission="can_view_packages">
            <Layout>
              <Packages />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/repositories" element={
          <ProtectedRoute requirePermission="can_view_hosts">
            <Layout>
              <Repositories />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/repositories/:repositoryId" element={
          <ProtectedRoute requirePermission="can_view_hosts">
            <Layout>
              <RepositoryDetail />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute requirePermission="can_view_users">
            <Layout>
              <Users />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/permissions" element={
          <ProtectedRoute requirePermission="can_manage_settings">
            <Layout>
              <Permissions />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute requirePermission="can_manage_settings">
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/options" element={
          <ProtectedRoute requirePermission="can_manage_hosts">
            <Layout>
              <Options />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Layout>
              <Profile />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/packages/:packageId" element={
          <ProtectedRoute requirePermission="can_view_packages">
            <Layout>
              <PackageDetail />
            </Layout>
          </ProtectedRoute>
        } />
          </Routes>
        </UpdateNotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App 