import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState } from "react";
import { isAuthReady } from "../constants/authPhases";
import { settingsAPI, versionAPI } from "../utils/api";
import { useAuth } from "./AuthContext";

const UpdateNotificationContext = createContext();

export const useUpdateNotification = () => {
	const context = useContext(UpdateNotificationContext);
	if (!context) {
		throw new Error(
			"useUpdateNotification must be used within an UpdateNotificationProvider",
		);
	}
	return context;
};

export const UpdateNotificationProvider = ({ children }) => {
	const [dismissed, setDismissed] = useState(false);
	const { authPhase, isAuthenticated } = useAuth();

	// Ensure settings are loaded - but only after auth is fully ready
	const { data: settings, isLoading: settingsLoading } = useQuery({
		queryKey: ["settings"],
		queryFn: () => settingsAPI.get().then((res) => res.data),
		staleTime: 5 * 60 * 1000, // Settings stay fresh for 5 minutes
		refetchOnWindowFocus: false,
		enabled: isAuthReady(authPhase, isAuthenticated()),
	});

	// Memoize the enabled condition to prevent unnecessary re-evaluations
	const isQueryEnabled = useMemo(() => {
		return (
			isAuthReady(authPhase, isAuthenticated()) &&
			!!settings &&
			!settingsLoading
		);
	}, [authPhase, isAuthenticated, settings, settingsLoading]);

	// Query for update information
	const {
		data: updateData,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["updateCheck"],
		queryFn: () => versionAPI.checkUpdates().then((res) => res.data),
		staleTime: 10 * 60 * 1000, // Data stays fresh for 10 minutes
		refetchOnWindowFocus: false, // Don't refetch when window regains focus
		retry: 1,
		enabled: isQueryEnabled,
	});

	const updateAvailable = updateData?.isUpdateAvailable && !dismissed;
	const updateInfo = updateData;

	const dismissNotification = () => {
		setDismissed(true);
	};

	const value = {
		updateAvailable,
		updateInfo,
		dismissNotification,
		isLoading,
		error,
	};

	return (
		<UpdateNotificationContext.Provider value={value}>
			{children}
		</UpdateNotificationContext.Provider>
	);
};
