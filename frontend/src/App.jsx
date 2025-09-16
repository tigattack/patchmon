import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Hosts from './pages/Hosts'
import HostGroups from './pages/HostGroups'
import Packages from './pages/Packages'
import Repositories from './pages/Repositories'
import RepositoryDetail from './pages/RepositoryDetail'
import Users from './pages/Users'
import Permissions from './pages/Permissions'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import HostDetail from './pages/HostDetail'
import PackageDetail from './pages/PackageDetail'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute requirePermission="canViewDashboard">
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/hosts" element={
          <ProtectedRoute requirePermission="canViewHosts">
            <Layout>
              <Hosts />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/hosts/:hostId" element={
          <ProtectedRoute requirePermission="canViewHosts">
            <Layout>
              <HostDetail />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/host-groups" element={
          <ProtectedRoute requirePermission="canManageHosts">
            <Layout>
              <HostGroups />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/packages" element={
          <ProtectedRoute requirePermission="canViewPackages">
            <Layout>
              <Packages />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/repositories" element={
          <ProtectedRoute requirePermission="canViewHosts">
            <Layout>
              <Repositories />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/repositories/:repositoryId" element={
          <ProtectedRoute requirePermission="canViewHosts">
            <Layout>
              <RepositoryDetail />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute requirePermission="canViewUsers">
            <Layout>
              <Users />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/permissions" element={
          <ProtectedRoute requirePermission="canManageSettings">
            <Layout>
              <Permissions />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute requirePermission="canManageSettings">
            <Layout>
              <Settings />
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
          <ProtectedRoute requirePermission="canViewPackages">
            <Layout>
              <PackageDetail />
            </Layout>
          </ProtectedRoute>
        } />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App 