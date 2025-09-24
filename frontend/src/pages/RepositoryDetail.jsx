import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	AlertTriangle,
	ArrowLeft,
	Calendar,
	Database,
	Globe,
	Lock,
	Server,
	Shield,
	ShieldOff,
	Unlock,
	Users,
} from "lucide-react";

import React, { useState } from "react";

import { Link, useParams } from "react-router-dom";
import { repositoryAPI } from "../utils/api";

const RepositoryDetail = () => {
	const isActiveId = useId();
	const repositoryNameId = useId();
	const priorityId = useId();
	const descriptionId = useId();
	const { repositoryId } = useParams();
	const queryClient = useQueryClient();
	const [editMode, setEditMode] = useState(false);
	const [formData, setFormData] = useState({});

	// Fetch repository details
	const {
		data: repository,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["repository", repositoryId],
		queryFn: () => repositoryAPI.getById(repositoryId).then((res) => res.data),
		enabled: !!repositoryId,
	});

	// Update repository mutation
	const updateRepositoryMutation = useMutation({
		mutationFn: (data) => repositoryAPI.update(repositoryId, data),
		onSuccess: () => {
			queryClient.invalidateQueries(["repository", repositoryId]);
			queryClient.invalidateQueries(["repositories"]);
			setEditMode(false);
		},
	});

	const handleEdit = () => {
		setFormData({
			name: repository.name,
			description: repository.description || "",
			is_active: repository.is_active,
			priority: repository.priority || "",
		});
		setEditMode(true);
	};

	const handleSave = () => {
		updateRepositoryMutation.mutate(formData);
	};

	const handleCancel = () => {
		setEditMode(false);
		setFormData({});
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-6">
				<div className="flex items-center gap-4">
					<Link
						to="/repositories"
						className="btn-outline flex items-center gap-2"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Repositories
					</Link>
				</div>
				<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
					<div className="flex items-center">
						<AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
						<span className="text-red-700 dark:text-red-300">
							Failed to load repository: {error.message}
						</span>
					</div>
				</div>
			</div>
		);
	}

	if (!repository) {
		return (
			<div className="space-y-6">
				<div className="flex items-center gap-4">
					<Link
						to="/repositories"
						className="btn-outline flex items-center gap-2"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Repositories
					</Link>
				</div>
				<div className="text-center py-12">
					<Database className="mx-auto h-12 w-12 text-secondary-400" />
					<h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">
						Repository not found
					</h3>
					<p className="mt-1 text-sm text-secondary-500 dark:text-secondary-300">
						The repository you're looking for doesn't exist.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link
						to="/repositories"
						className="btn-outline flex items-center gap-2"
					>
						<ArrowLeft className="h-4 w-4" />
						Back
					</Link>
					<div>
						<div className="flex items-center gap-3">
							{repository.isSecure ? (
								<Lock className="h-6 w-6 text-green-600" />
							) : (
								<Unlock className="h-6 w-6 text-orange-600" />
							)}
							<h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
								{repository.name}
							</h1>
							<span
								className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
									repository.is_active
										? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300"
										: "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300"
								}`}
							>
								{repository.is_active ? "Active" : "Inactive"}
							</span>
						</div>
						<p className="text-secondary-500 dark:text-secondary-300 mt-1">
							Repository configuration and host assignments
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{editMode ? (
						<>
							<button
								type="button"
								onClick={handleCancel}
								className="btn-outline"
								disabled={updateRepositoryMutation.isPending}
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSave}
								className="btn-primary"
								disabled={updateRepositoryMutation.isPending}
							>
								{updateRepositoryMutation.isPending
									? "Saving..."
									: "Save Changes"}
							</button>
						</>
					) : (
						<button type="button" onClick={handleEdit} className="btn-primary">
							Edit Repository
						</button>
					)}
				</div>
			</div>

			{/* Repository Information */}
			<div className="bg-white dark:bg-secondary-800 rounded-lg shadow">
				<div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
					<h2 className="text-lg font-semibold text-secondary-900 dark:text-white">
						Repository Information
					</h2>
				</div>
				<div className="px-6 py-4 space-y-4">
					{editMode ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div>
								<label
									htmlFor={repositoryNameId}
									className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
								>
									Repository Name
								</label>
								<input
									type="text"
									id={repositoryNameId}
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
									className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-secondary-700 dark:text-white"
								/>
							</div>
							<div>
								<label
									htmlFor={priorityId}
									className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
								>
									Priority
								</label>
								<input
									type="number"
									id={priorityId}
									value={formData.priority}
									onChange={(e) =>
										setFormData({ ...formData, priority: e.target.value })
									}
									className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-secondary-700 dark:text-white"
									placeholder="Optional priority"
								/>
							</div>
							<div className="md:col-span-2">
								<label
									htmlFor={descriptionId}
									className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
								>
									Description
								</label>
								<textarea
									id={descriptionId}
									value={formData.description}
									onChange={(e) =>
										setFormData({ ...formData, description: e.target.value })
									}
									rows="3"
									className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-secondary-700 dark:text-white"
									placeholder="Optional description"
								/>
							</div>
							<div className="flex items-center">
								<input
									type="checkbox"
									id={isActiveId}
									checked={formData.is_active}
									onChange={(e) =>
										setFormData({ ...formData, is_active: e.target.checked })
									}
									className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-secondary-300 rounded"
								/>
								<label
									htmlFor={isActiveId}
									className="ml-2 block text-sm text-secondary-900 dark:text-white"
								>
									Repository is active
								</label>
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="space-y-4">
								<div>
									<span className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
										URL
									</span>
									<div className="flex items-center mt-1">
										<Globe className="h-4 w-4 text-secondary-400 mr-2" />
										<span className="text-secondary-900 dark:text-white">
											{repository.url}
										</span>
									</div>
								</div>
								<div>
									<span className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
										Distribution
									</span>
									<p className="text-secondary-900 dark:text-white mt-1">
										{repository.distribution}
									</p>
								</div>
								<div>
									<span className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
										Components
									</span>
									<p className="text-secondary-900 dark:text-white mt-1">
										{repository.components}
									</p>
								</div>
								<div>
									<span className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
										Repository Type
									</span>
									<p className="text-secondary-900 dark:text-white mt-1">
										{repository.repoType}
									</p>
								</div>
							</div>
							<div className="space-y-4">
								<div>
									<span className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
										Security
									</span>
									<div className="flex items-center mt-1">
										{repository.isSecure ? (
											<>
												<Shield className="h-4 w-4 text-green-600 mr-2" />
												<span className="text-green-600">Secure (HTTPS)</span>
											</>
										) : (
											<>
												<ShieldOff className="h-4 w-4 text-orange-600 mr-2" />
												<span className="text-orange-600">Insecure (HTTP)</span>
											</>
										)}
									</div>
								</div>
								{repository.priority && (
									<div>
										<span className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
											Priority
										</span>
										<p className="text-secondary-900 dark:text-white mt-1">
											{repository.priority}
										</p>
									</div>
								)}
								{repository.description && (
									<div>
										<span className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
											Description
										</span>
										<p className="text-secondary-900 dark:text-white mt-1">
											{repository.description}
										</p>
									</div>
								)}
								<div>
									<span className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
										Created
									</span>
									<div className="flex items-center mt-1">
										<Calendar className="h-4 w-4 text-secondary-400 mr-2" />
										<span className="text-secondary-900 dark:text-white">
											{new Date(repository.created_at).toLocaleDateString()}
										</span>
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Hosts Using This Repository */}
			<div className="bg-white dark:bg-secondary-800 rounded-lg shadow">
				<div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
					<h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
						<Users className="h-5 w-5" />
						Hosts Using This Repository (
						{repository.host_repositories?.length || 0})
					</h2>
				</div>
				{!repository.host_repositories ||
				repository.host_repositories.length === 0 ? (
					<div className="px-6 py-12 text-center">
						<Server className="mx-auto h-12 w-12 text-secondary-400" />
						<h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">
							No hosts using this repository
						</h3>
						<p className="mt-1 text-sm text-secondary-500 dark:text-secondary-300">
							This repository hasn't been reported by any hosts yet.
						</p>
					</div>
				) : (
					<div className="divide-y divide-secondary-200 dark:divide-secondary-700">
						{repository.host_repositories.map((hostRepo) => (
							<div
								key={hostRepo.id}
								className="px-6 py-4 hover:bg-secondary-50 dark:hover:bg-secondary-700/50"
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div
											className={`w-3 h-3 rounded-full ${
												hostRepo.hosts.status === "active"
													? "bg-green-500"
													: hostRepo.hosts.status === "pending"
														? "bg-yellow-500"
														: "bg-red-500"
											}`}
										/>
										<div>
											<Link
												to={`/hosts/${hostRepo.hosts.id}`}
												className="text-primary-600 hover:text-primary-700 font-medium"
											>
												{hostRepo.hosts.friendly_name}
											</Link>
											<div className="flex items-center gap-4 text-sm text-secondary-500 dark:text-secondary-400 mt-1">
												<span>IP: {hostRepo.hosts.ip}</span>
												<span>
													OS: {hostRepo.hosts.os_type}{" "}
													{hostRepo.hosts.os_version}
												</span>
												<span>
													Last Update:{" "}
													{new Date(
														hostRepo.hosts.last_update,
													).toLocaleDateString()}
												</span>
											</div>
										</div>
									</div>
									<div className="flex items-center gap-4">
										<div className="text-center">
											<div className="text-xs text-secondary-500 dark:text-secondary-400">
												Last Checked
											</div>
											<div className="text-sm text-secondary-900 dark:text-white">
												{new Date(hostRepo.last_checked).toLocaleDateString()}
											</div>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default RepositoryDetail;
