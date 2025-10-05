import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Check,
	Columns,
	Database,
	GripVertical,
	Lock,
	RefreshCw,
	Search,
	Server,
	Shield,
	ShieldCheck,
	Trash2,
	Unlock,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { repositoryAPI } from "../utils/api";

const Repositories = () => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [searchTerm, setSearchTerm] = useState("");
	const [filterType, setFilterType] = useState("all"); // all, secure, insecure
	const [filterStatus, setFilterStatus] = useState("all"); // all, active, inactive
	const [sortField, setSortField] = useState("name");
	const [sortDirection, setSortDirection] = useState("asc");
	const [showColumnSettings, setShowColumnSettings] = useState(false);
	const [deleteModalData, setDeleteModalData] = useState(null);

	// Column configuration
	const [columnConfig, setColumnConfig] = useState(() => {
		const defaultConfig = [
			{ id: "name", label: "Repository", visible: true, order: 0 },
			{ id: "url", label: "URL", visible: true, order: 1 },
			{ id: "distribution", label: "Distribution", visible: true, order: 2 },
			{ id: "security", label: "Security", visible: true, order: 3 },
			{ id: "status", label: "Status", visible: true, order: 4 },
			{ id: "hostCount", label: "Hosts", visible: true, order: 5 },
			{ id: "actions", label: "Actions", visible: true, order: 6 },
		];

		const saved = localStorage.getItem("repositories-column-config");
		if (saved) {
			try {
				return JSON.parse(saved);
			} catch (e) {
				console.error("Failed to parse saved column config:", e);
			}
		}
		return defaultConfig;
	});

	const updateColumnConfig = (newConfig) => {
		setColumnConfig(newConfig);
		localStorage.setItem(
			"repositories-column-config",
			JSON.stringify(newConfig),
		);
	};

	// Fetch repositories
	const {
		data: repositories = [],
		isLoading,
		error,
		refetch,
		isFetching,
	} = useQuery({
		queryKey: ["repositories"],
		queryFn: () => repositoryAPI.list().then((res) => res.data),
	});

	// Fetch repository statistics
	const { data: stats } = useQuery({
		queryKey: ["repository-stats"],
		queryFn: () => repositoryAPI.getStats().then((res) => res.data),
	});

	// Delete repository mutation
	const deleteRepositoryMutation = useMutation({
		mutationFn: (repositoryId) => repositoryAPI.delete(repositoryId),
		onSuccess: () => {
			queryClient.invalidateQueries(["repositories"]);
			queryClient.invalidateQueries(["repository-stats"]);
		},
	});

	// Get visible columns in order
	const visibleColumns = columnConfig
		.filter((col) => col.visible)
		.sort((a, b) => a.order - b.order);

	// Sorting functions
	const handleSort = (field) => {
		if (sortField === field) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc");
		} else {
			setSortField(field);
			setSortDirection("asc");
		}
	};

	const getSortIcon = (field) => {
		if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
		return sortDirection === "asc" ? (
			<ArrowUp className="h-4 w-4" />
		) : (
			<ArrowDown className="h-4 w-4" />
		);
	};

	// Column management functions
	const toggleColumnVisibility = (columnId) => {
		const newConfig = columnConfig.map((col) =>
			col.id === columnId ? { ...col, visible: !col.visible } : col,
		);
		updateColumnConfig(newConfig);
	};

	const reorderColumns = (fromIndex, toIndex) => {
		const newConfig = [...columnConfig];
		const [movedColumn] = newConfig.splice(fromIndex, 1);
		newConfig.splice(toIndex, 0, movedColumn);

		// Update order values
		const updatedConfig = newConfig.map((col, index) => ({
			...col,
			order: index,
		}));
		updateColumnConfig(updatedConfig);
	};

	const resetColumns = () => {
		const defaultConfig = [
			{ id: "name", label: "Repository", visible: true, order: 0 },
			{ id: "url", label: "URL", visible: true, order: 1 },
			{ id: "distribution", label: "Distribution", visible: true, order: 2 },
			{ id: "security", label: "Security", visible: true, order: 3 },
			{ id: "status", label: "Status", visible: true, order: 4 },
			{ id: "hostCount", label: "Hosts", visible: true, order: 5 },
			{ id: "actions", label: "Actions", visible: true, order: 6 },
		];
		updateColumnConfig(defaultConfig);
	};

	const handleDeleteRepository = (repo, e) => {
		e.preventDefault();
		e.stopPropagation();

		setDeleteModalData({
			id: repo.id,
			name: repo.name,
			hostCount: repo.hostCount || 0,
		});
	};

	const handleRowClick = (repo) => {
		navigate(`/repositories/${repo.id}`);
	};

	const confirmDelete = () => {
		if (deleteModalData) {
			deleteRepositoryMutation.mutate(deleteModalData.id);
			setDeleteModalData(null);
		}
	};

	const cancelDelete = () => {
		setDeleteModalData(null);
	};

	// Filter and sort repositories
	const filteredAndSortedRepositories = useMemo(() => {
		if (!repositories) return [];

		// Filter repositories
		const filtered = repositories.filter((repo) => {
			const matchesSearch =
				repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				repo.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
				repo.distribution.toLowerCase().includes(searchTerm.toLowerCase());

			// Check security based on URL if isSecure property doesn't exist
			const isSecure =
				repo.isSecure !== undefined
					? repo.isSecure
					: repo.url.startsWith("https://");

			const matchesType =
				filterType === "all" ||
				(filterType === "secure" && isSecure) ||
				(filterType === "insecure" && !isSecure);

			const matchesStatus =
				filterStatus === "all" ||
				(filterStatus === "active" && repo.is_active === true) ||
				(filterStatus === "inactive" && repo.is_active === false);

			return matchesSearch && matchesType && matchesStatus;
		});

		// Sort repositories
		const sorted = filtered.sort((a, b) => {
			let aValue = a[sortField];
			let bValue = b[sortField];

			// Handle special cases
			if (sortField === "security") {
				aValue = a.isSecure ? "Secure" : "Insecure";
				bValue = b.isSecure ? "Secure" : "Insecure";
			} else if (sortField === "status") {
				aValue = a.is_active ? "Active" : "Inactive";
				bValue = b.is_active ? "Active" : "Inactive";
			}

			if (typeof aValue === "string") {
				aValue = aValue.toLowerCase();
				bValue = bValue.toLowerCase();
			}

			if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
			if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
			return 0;
		});

		return sorted;
	}, [
		repositories,
		searchTerm,
		filterType,
		filterStatus,
		sortField,
		sortDirection,
	]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
				<div className="flex items-center">
					<AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
					<span className="text-red-700 dark:text-red-300">
						Failed to load repositories: {error.message}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className="h-[calc(100vh-7rem)] flex flex-col overflow-hidden">
			{/* Delete Confirmation Modal */}
			{deleteModalData && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white dark:bg-secondary-800 rounded-lg p-6 max-w-md w-full mx-4">
						<div className="flex items-center mb-4">
							<AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
							<h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
								Delete Repository
							</h3>
						</div>
						<div className="mb-6">
							<p className="text-secondary-700 dark:text-secondary-300 mb-2">
								Are you sure you want to delete{" "}
								<strong>"{deleteModalData.name}"</strong>?
							</p>
							{deleteModalData.hostCount > 0 && (
								<p className="text-amber-600 dark:text-amber-400 text-sm">
									⚠️ This repository is currently assigned to{" "}
									{deleteModalData.hostCount} host
									{deleteModalData.hostCount !== 1 ? "s" : ""}.
								</p>
							)}
							<p className="text-red-600 dark:text-red-400 text-sm mt-2">
								This action cannot be undone.
							</p>
						</div>
						<div className="flex gap-3 justify-end">
							<button
								type="button"
								onClick={cancelDelete}
								className="px-4 py-2 text-secondary-600 dark:text-secondary-400 hover:text-secondary-800 dark:hover:text-secondary-200 transition-colors"
								disabled={deleteRepositoryMutation.isPending}
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={confirmDelete}
								className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={deleteRepositoryMutation.isPending}
							>
								{deleteRepositoryMutation.isPending
									? "Deleting..."
									: "Delete Repository"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Page Header */}
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-2xl font-semibold text-secondary-900 dark:text-white">
						Repositories
					</h1>
					<p className="text-sm text-secondary-600 dark:text-secondary-400 mt-1">
						Manage and monitor your package repositories
					</p>
				</div>
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={() => refetch()}
						disabled={isFetching}
						className="btn-outline flex items-center gap-2"
						title="Refresh repositories data"
					>
						<RefreshCw
							className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
						/>
						{isFetching ? "Refreshing..." : "Refresh"}
					</button>
				</div>
			</div>

			{/* Summary Stats */}
			<div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 flex-shrink-0">
				<div className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200">
					<div className="flex items-center">
						<Database className="h-5 w-5 text-primary-600 mr-2" />
						<div>
							<p className="text-sm text-secondary-500 dark:text-white">
								Total Repositories
							</p>
							<p className="text-xl font-semibold text-secondary-900 dark:text-white">
								{stats?.totalRepositories || 0}
							</p>
						</div>
					</div>
				</div>

				<div className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200">
					<div className="flex items-center">
						<Server className="h-5 w-5 text-success-600 mr-2" />
						<div>
							<p className="text-sm text-secondary-500 dark:text-white">
								Active Repositories
							</p>
							<p className="text-xl font-semibold text-secondary-900 dark:text-white">
								{stats?.activeRepositories || 0}
							</p>
						</div>
					</div>
				</div>

				<div className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200">
					<div className="flex items-center">
						<Shield className="h-5 w-5 text-warning-600 mr-2" />
						<div>
							<p className="text-sm text-secondary-500 dark:text-white">
								Secure (HTTPS)
							</p>
							<p className="text-xl font-semibold text-secondary-900 dark:text-white">
								{stats?.secureRepositories || 0}
							</p>
						</div>
					</div>
				</div>

				<div className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200">
					<div className="flex items-center">
						<ShieldCheck className="h-5 w-5 text-danger-600 mr-2" />
						<div>
							<p className="text-sm text-secondary-500 dark:text-white">
								Security Score
							</p>
							<p className="text-xl font-semibold text-secondary-900 dark:text-white">
								{stats?.securityPercentage || 0}%
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Repositories List */}
			<div className="card flex-1 flex flex-col overflow-hidden min-h-0">
				<div className="px-4 py-4 sm:p-4 flex-1 flex flex-col overflow-hidden min-h-0">
					<div className="flex items-center justify-end mb-4">
						{/* Empty selection controls area to match packages page spacing */}
					</div>

					{/* Table Controls */}
					<div className="mb-4 space-y-4">
						<div className="flex flex-col sm:flex-row gap-4">
							{/* Search */}
							<div className="flex-1">
								<div className="relative">
									<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-400 dark:text-secondary-500" />
									<input
										type="text"
										placeholder="Search repositories..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										className="w-full pl-10 pr-4 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white placeholder-secondary-500 dark:placeholder-secondary-400"
									/>
								</div>
							</div>

							{/* Security Filter */}
							<div className="sm:w-48">
								<select
									value={filterType}
									onChange={(e) => setFilterType(e.target.value)}
									className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
								>
									<option value="all">All Security Types</option>
									<option value="secure">HTTPS Only</option>
									<option value="insecure">HTTP Only</option>
								</select>
							</div>

							{/* Status Filter */}
							<div className="sm:w-48">
								<select
									value={filterStatus}
									onChange={(e) => setFilterStatus(e.target.value)}
									className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
								>
									<option value="all">All Statuses</option>
									<option value="active">Active Only</option>
									<option value="inactive">Inactive Only</option>
								</select>
							</div>

							{/* Columns Button */}
							<div className="flex items-center">
								<button
									type="button"
									onClick={() => setShowColumnSettings(true)}
									className="flex items-center gap-2 px-3 py-2 text-sm text-secondary-700 dark:text-secondary-300 bg-white dark:bg-secondary-700 border border-secondary-300 dark:border-secondary-600 rounded-md hover:bg-secondary-50 dark:hover:bg-secondary-600 transition-colors"
								>
									<Columns className="h-4 w-4" />
									Columns
								</button>
							</div>
						</div>
					</div>

					<div className="flex-1 overflow-hidden">
						{filteredAndSortedRepositories.length === 0 ? (
							<div className="text-center py-8">
								<Database className="h-12 w-12 text-secondary-400 mx-auto mb-4" />
								<p className="text-secondary-500 dark:text-secondary-300">
									{repositories?.length === 0
										? "No repositories found"
										: "No repositories match your filters"}
								</p>
								{repositories?.length === 0 && (
									<p className="text-sm text-secondary-400 dark:text-secondary-400 mt-2">
										No repositories have been reported by your hosts yet
									</p>
								)}
							</div>
						) : (
							<div className="h-full overflow-auto">
								<table className="min-w-full divide-y divide-secondary-200 dark:divide-secondary-600">
									<thead className="bg-secondary-50 dark:bg-secondary-700 sticky top-0 z-10">
										<tr>
											{visibleColumns.map((column) => (
												<th
													key={column.id}
													className="px-4 py-2 text-center text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider"
												>
													<button
														type="button"
														onClick={() => handleSort(column.id)}
														className="flex items-center gap-1 hover:text-secondary-700 dark:hover:text-secondary-200 transition-colors"
													>
														{column.label}
														{getSortIcon(column.id)}
													</button>
												</th>
											))}
										</tr>
									</thead>
									<tbody className="bg-white dark:bg-secondary-800 divide-y divide-secondary-200 dark:divide-secondary-600">
										{filteredAndSortedRepositories.map((repo) => (
											<tr
												key={repo.id}
												className="hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors cursor-pointer"
												onClick={() => handleRowClick(repo)}
											>
												{visibleColumns.map((column) => (
													<td
														key={column.id}
														className="px-4 py-2 whitespace-nowrap text-center"
													>
														{renderCellContent(column, repo)}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Column Settings Modal */}
			{showColumnSettings && (
				<ColumnSettingsModal
					columnConfig={columnConfig}
					onClose={() => setShowColumnSettings(false)}
					onToggleVisibility={toggleColumnVisibility}
					onReorder={reorderColumns}
					onReset={resetColumns}
				/>
			)}
		</div>
	);

	// Render cell content based on column type
	function renderCellContent(column, repo) {
		switch (column.id) {
			case "name":
				return (
					<div className="flex items-center">
						<Database className="h-5 w-5 text-secondary-400 mr-3" />
						<div>
							<div className="text-sm font-medium text-secondary-900 dark:text-white">
								{repo.name}
							</div>
						</div>
					</div>
				);
			case "url":
				return (
					<div
						className="text-sm text-secondary-900 dark:text-white max-w-xs truncate"
						title={repo.url}
					>
						{repo.url}
					</div>
				);
			case "distribution":
				return (
					<div className="text-sm text-secondary-900 dark:text-white">
						{repo.distribution}
					</div>
				);
			case "security": {
				const isSecure =
					repo.isSecure !== undefined
						? repo.isSecure
						: repo.url.startsWith("https://");
				return (
					<div className="flex items-center justify-center">
						{isSecure ? (
							<div className="flex items-center gap-1 text-green-600">
								<Lock className="h-4 w-4" />
								<span className="text-sm">Secure</span>
							</div>
						) : (
							<div className="flex items-center gap-1 text-orange-600">
								<Unlock className="h-4 w-4" />
								<span className="text-sm">Insecure</span>
							</div>
						)}
					</div>
				);
			}
			case "status":
				return (
					<span
						className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
							repo.is_active
								? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300"
								: "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300"
						}`}
					>
						{repo.is_active ? "Active" : "Inactive"}
					</span>
				);
			case "hostCount":
				return (
					<div className="flex items-center justify-center gap-1 text-sm text-secondary-900 dark:text-white">
						<Server className="h-4 w-4" />
						<span>{repo.hostCount}</span>
					</div>
				);
			case "actions":
				return (
					<div className="flex items-center justify-center">
						<button
							type="button"
							onClick={(e) => handleDeleteRepository(repo, e)}
							className="text-orange-600 hover:text-red-900 dark:text-orange-600 dark:hover:text-red-400 flex items-center gap-1"
							disabled={deleteRepositoryMutation.isPending}
							title="Delete repository"
						>
							<Trash2 className="h-4 w-4" />
						</button>
					</div>
				);
			default:
				return null;
		}
	}
};

// Column Settings Modal Component
const ColumnSettingsModal = ({
	columnConfig,
	onClose,
	onToggleVisibility,
	onReorder,
	onReset,
}) => {
	const [draggedIndex, setDraggedIndex] = useState(null);

	const handleDragStart = (e, index) => {
		setDraggedIndex(index);
		e.dataTransfer.effectAllowed = "move";
	};

	const handleDragOver = (e) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	};

	const handleDrop = (e, dropIndex) => {
		e.preventDefault();
		if (draggedIndex !== null && draggedIndex !== dropIndex) {
			onReorder(draggedIndex, dropIndex);
		}
		setDraggedIndex(null);
	};

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-white dark:bg-secondary-800 rounded-lg p-6 w-full max-w-md">
				<div className="flex justify-between items-center mb-4">
					<h3 className="text-lg font-medium text-secondary-900 dark:text-white">
						Column Settings
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="text-secondary-400 hover:text-secondary-600 dark:text-secondary-500 dark:hover:text-secondary-300"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<div className="space-y-3">
					{columnConfig.map((column, index) => (
						<button
							type="button"
							key={column.id}
							draggable
							onDragStart={(e) => handleDragStart(e, index)}
							onDragOver={handleDragOver}
							onDrop={(e) => handleDrop(e, index)}
							className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-700 rounded-lg cursor-move hover:bg-secondary-100 dark:hover:bg-secondary-600 transition-colors w-full text-left"
						>
							<div className="flex items-center gap-3">
								<GripVertical className="h-4 w-4 text-secondary-400" />
								<span className="text-sm font-medium text-secondary-900 dark:text-white">
									{column.label}
								</span>
							</div>
							<button
								type="button"
								onClick={() => onToggleVisibility(column.id)}
								className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
									column.visible
										? "bg-primary-600 border-primary-600"
										: "bg-white dark:bg-secondary-800 border-secondary-300 dark:border-secondary-600"
								}`}
							>
								{column.visible && <Check className="h-3 w-3 text-white" />}
							</button>
						</button>
					))}
				</div>

				<div className="flex justify-between mt-6">
					<button
						type="button"
						onClick={onReset}
						className="px-4 py-2 text-sm text-secondary-600 dark:text-secondary-400 hover:text-secondary-800 dark:hover:text-secondary-200"
					>
						Reset to Default
					</button>
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 transition-colors"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
};

export default Repositories;
