import {
	AlertCircle,
	CheckCircle,
	Clock,
	Code,
	Download,
	ExternalLink,
	GitCommit,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { versionAPI } from "../../utils/api";

const VersionUpdateTab = () => {
	// Version checking state
	const [versionInfo, setVersionInfo] = useState({
		currentVersion: null,
		latestVersion: null,
		isUpdateAvailable: false,
		checking: false,
		error: null,
		github: null,
	});

	// Version checking functions
	const checkForUpdates = useCallback(async () => {
		setVersionInfo((prev) => ({ ...prev, checking: true, error: null }));

		try {
			const response = await versionAPI.checkUpdates();
			const data = response.data;

			setVersionInfo({
				currentVersion: data.currentVersion,
				latestVersion: data.latestVersion,
				isUpdateAvailable: data.isUpdateAvailable,
				last_update_check: data.last_update_check,
				github: data.github,
				checking: false,
				error: null,
			});
		} catch (error) {
			console.error("Version check error:", error);
			setVersionInfo((prev) => ({
				...prev,
				checking: false,
				error: error.response?.data?.error || "Failed to check for updates",
			}));
		}
	}, []);

	// Load current version on component mount
	useEffect(() => {
		const loadCurrentVersion = async () => {
			try {
				const response = await versionAPI.getCurrent();
				const data = response.data;
				setVersionInfo((prev) => ({
					...prev,
					currentVersion: data.version,
					github: data.github,
				}));
			} catch (error) {
				console.error("Error loading current version:", error);
			}
		};

		// Load current version and immediately check for updates
		const loadAndCheckUpdates = async () => {
			await loadCurrentVersion();
			// Automatically trigger update check when component loads
			await checkForUpdates();
		};

		loadAndCheckUpdates();
	}, [checkForUpdates]); // Include checkForUpdates dependency

	return (
		<div className="space-y-6">
			<div className="flex items-center mb-6">
				<Code className="h-6 w-6 text-primary-600 mr-3" />
				<h2 className="text-xl font-semibold text-secondary-900 dark:text-white">
					Server Version Information
				</h2>
			</div>

			<div className="bg-secondary-50 dark:bg-secondary-700 rounded-lg p-6">
				<h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">
					Version Information
				</h3>
				<p className="text-sm text-secondary-600 dark:text-secondary-300 mb-6">
					Current server version and latest updates from GitHub repository.
					{versionInfo.checking && (
						<span className="ml-2 text-blue-600 dark:text-blue-400">
							🔄 Checking for updates...
						</span>
					)}
				</p>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{/* My Version */}
					<div className="bg-white dark:bg-secondary-800 rounded-lg p-4 border border-secondary-200 dark:border-secondary-600">
						<div className="flex items-center gap-2 mb-2">
							<CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
							<span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
								My Version
							</span>
						</div>
						<span className="text-lg font-mono text-secondary-900 dark:text-white">
							{versionInfo.currentVersion}
						</span>
					</div>

					{/* Latest Release */}
					{versionInfo.github?.latestRelease && (
						<div className="bg-white dark:bg-secondary-800 rounded-lg p-4 border border-secondary-200 dark:border-secondary-600">
							<div className="flex items-center gap-2 mb-2">
								<Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
								<span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
									Latest Release
								</span>
							</div>
							<div className="space-y-1">
								<span className="text-lg font-mono text-secondary-900 dark:text-white">
									{versionInfo.github.latestRelease.tagName}
								</span>
								<div className="text-xs text-secondary-500 dark:text-secondary-400">
									Published:{" "}
									{new Date(
										versionInfo.github.latestRelease.publishedAt,
									).toLocaleDateString()}
								</div>
							</div>
						</div>
					)}
				</div>

				{/* GitHub Repository Information */}
				{versionInfo.github && (
					<div className="bg-white dark:bg-secondary-800 rounded-lg p-4 border border-secondary-200 dark:border-secondary-600 mt-4">
						<div className="flex items-center gap-2 mb-4">
							<Code className="h-4 w-4 text-purple-600 dark:text-purple-400" />
							<span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
								GitHub Repository Information
							</span>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							{/* Repository URL */}
							<div className="space-y-2">
								<span className="text-xs font-medium text-secondary-600 dark:text-secondary-400 uppercase tracking-wide">
									Repository
								</span>
								<div className="flex items-center gap-2">
									<span className="text-sm text-secondary-900 dark:text-white font-mono">
										{versionInfo.github.owner}/{versionInfo.github.repo}
									</span>
									{versionInfo.github.repository && (
										<a
											href={versionInfo.github.repository}
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
										>
											<ExternalLink className="h-3 w-3" />
										</a>
									)}
								</div>
							</div>

							{/* Latest Release Info */}
							{versionInfo.github.latestRelease && (
								<div className="space-y-2">
									<span className="text-xs font-medium text-secondary-600 dark:text-secondary-400 uppercase tracking-wide">
										Release Link
									</span>
									<div className="flex items-center gap-2">
										{versionInfo.github.latestRelease.htmlUrl && (
											<a
												href={versionInfo.github.latestRelease.htmlUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm"
											>
												View Release{" "}
												<ExternalLink className="h-3 w-3 inline ml-1" />
											</a>
										)}
									</div>
								</div>
							)}

							{/* Branch Status */}
							{versionInfo.github.commitDifference && (
								<div className="space-y-2">
									<span className="text-xs font-medium text-secondary-600 dark:text-secondary-400 uppercase tracking-wide">
										Branch Status
									</span>
									<div className="text-sm">
										{versionInfo.github.commitDifference.commitsAhead > 0 ? (
											<span className="text-blue-600 dark:text-blue-400">
												🚀 Main branch is{" "}
												{versionInfo.github.commitDifference.commitsAhead}{" "}
												commits ahead of release
											</span>
										) : versionInfo.github.commitDifference.commitsBehind >
											0 ? (
											<span className="text-orange-600 dark:text-orange-400">
												📊 Main branch is{" "}
												{versionInfo.github.commitDifference.commitsBehind}{" "}
												commits behind release
											</span>
										) : (
											<span className="text-green-600 dark:text-green-400">
												✅ Main branch is in sync with release
											</span>
										)}
									</div>
								</div>
							)}
						</div>

						{/* Latest Commit Information */}
						{versionInfo.github.latestCommit && (
							<div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-600">
								<div className="flex items-center gap-2 mb-2">
									<GitCommit className="h-4 w-4 text-orange-600 dark:text-orange-400" />
									<span className="text-xs font-medium text-secondary-600 dark:text-secondary-400 uppercase tracking-wide">
										Latest Commit (Rolling)
									</span>
								</div>
								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<span className="text-sm font-mono text-secondary-900 dark:text-white">
											{versionInfo.github.latestCommit.sha.substring(0, 8)}
										</span>
										{versionInfo.github.latestCommit.htmlUrl && (
											<a
												href={versionInfo.github.latestCommit.htmlUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
											>
												<ExternalLink className="h-3 w-3" />
											</a>
										)}
									</div>
									<p className="text-sm text-secondary-700 dark:text-secondary-300">
										{versionInfo.github.latestCommit.message.split("\n")[0]}
									</p>
									<div className="flex items-center gap-4 text-xs text-secondary-500 dark:text-secondary-400">
										<span>
											Author: {versionInfo.github.latestCommit.author}
										</span>
										<span>
											Date:{" "}
											{new Date(
												versionInfo.github.latestCommit.date,
											).toLocaleString()}
										</span>
									</div>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Last Checked Time */}
				{versionInfo.last_update_check && (
					<div className="bg-white dark:bg-secondary-800 rounded-lg p-4 border border-secondary-200 dark:border-secondary-600 mt-4">
						<div className="flex items-center gap-2 mb-2">
							<Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
							<span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
								Last Checked
							</span>
						</div>
						<span className="text-sm text-secondary-600 dark:text-secondary-400">
							{new Date(versionInfo.last_update_check).toLocaleString()}
						</span>
						<p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">
							Updates are checked automatically every 24 hours
						</p>
					</div>
				)}

				<div className="flex items-center justify-start mt-6">
					<button
						type="button"
						onClick={checkForUpdates}
						disabled={versionInfo.checking}
						className="btn-primary flex items-center gap-2"
					>
						<Download className="h-4 w-4" />
						{versionInfo.checking ? "Checking..." : "Check for Updates"}
					</button>
				</div>

				{versionInfo.error && (
					<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mt-4">
						<div className="flex">
							<AlertCircle className="h-5 w-5 text-red-400 dark:text-red-300" />
							<div className="ml-3">
								<h3 className="text-sm font-medium text-red-800 dark:text-red-200">
									Version Check Failed
								</h3>
								<p className="mt-1 text-sm text-red-700 dark:text-red-300">
									{versionInfo.error}
								</p>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default VersionUpdateTab;
