import React from "react";
import { Route, Routes } from "react-router-dom";
import FirstTimeAdminSetup from "./components/FirstTimeAdminSetup";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UpdateNotificationProvider } from "./contexts/UpdateNotificationContext";
import Dashboard from "./pages/Dashboard";
import HostDetail from "./pages/HostDetail";
import Hosts from "./pages/Hosts";
import Login from "./pages/Login";
import Options from "./pages/Options";
import PackageDetail from "./pages/PackageDetail";
import Packages from "./pages/Packages";
import Permissions from "./pages/Permissions";
import Profile from "./pages/Profile";
import Repositories from "./pages/Repositories";
import RepositoryDetail from "./pages/RepositoryDetail";
import Settings from "./pages/Settings";
import Users from "./pages/Users";

function AppRoutes() {
	const { needsFirstTimeSetup, checkingSetup, isAuthenticated } = useAuth();
	const isAuth = isAuthenticated(); // Call the function to get boolean value

	// Show loading while checking if setup is needed
	if (checkingSetup) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-secondary-900 dark:to-secondary-800 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
					<p className="text-secondary-600 dark:text-secondary-300">
						Checking system status...
					</p>
				</div>
			</div>
		);
	}

	// Show first-time setup if no admin users exist
	if (needsFirstTimeSetup && !isAuth) {
		return <FirstTimeAdminSetup />;
	}

	return (
		<Routes>
			<Route path="/login" element={<Login />} />
			<Route
				path="/"
				element={
					<ProtectedRoute requirePermission="can_view_dashboard">
						<Layout>
							<Dashboard />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/hosts"
				element={
					<ProtectedRoute requirePermission="can_view_hosts">
						<Layout>
							<Hosts />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/hosts/:hostId"
				element={
					<ProtectedRoute requirePermission="can_view_hosts">
						<Layout>
							<HostDetail />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/packages"
				element={
					<ProtectedRoute requirePermission="can_view_packages">
						<Layout>
							<Packages />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/repositories"
				element={
					<ProtectedRoute requirePermission="can_view_hosts">
						<Layout>
							<Repositories />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/repositories/:repositoryId"
				element={
					<ProtectedRoute requirePermission="can_view_hosts">
						<Layout>
							<RepositoryDetail />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/users"
				element={
					<ProtectedRoute requirePermission="can_view_users">
						<Layout>
							<Users />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/permissions"
				element={
					<ProtectedRoute requirePermission="can_manage_settings">
						<Layout>
							<Permissions />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/settings"
				element={
					<ProtectedRoute requirePermission="can_manage_settings">
						<Layout>
							<Settings />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/options"
				element={
					<ProtectedRoute requirePermission="can_manage_hosts">
						<Layout>
							<Options />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/profile"
				element={
					<ProtectedRoute>
						<Layout>
							<Profile />
						</Layout>
					</ProtectedRoute>
				}
			/>
			<Route
				path="/packages/:packageId"
				element={
					<ProtectedRoute requirePermission="can_view_packages">
						<Layout>
							<PackageDetail />
						</Layout>
					</ProtectedRoute>
				}
			/>
		</Routes>
	);
}

function App() {
	return (
		<ThemeProvider>
			<AuthProvider>
				<UpdateNotificationProvider>
					<AppRoutes />
				</UpdateNotificationProvider>
			</AuthProvider>
		</ThemeProvider>
	);
}

export default App;
