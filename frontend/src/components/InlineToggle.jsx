import { Check, Edit2, X } from "lucide-react";
import { useEffect, useState } from "react";

const InlineToggle = ({
	value,
	onSave,
	onCancel,
	className = "",
	disabled = false,
	trueLabel = "Yes",
	falseLabel = "No",
}) => {
	const [isEditing, setIsEditing] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		// Auto-save when value changes during editing
		if (isEditing && !isLoading) {
			handleSave(!value);
		}
	}, [isEditing]);

	const handleEdit = () => {
		if (disabled) return;
		setIsEditing(true);
		setError("");
	};

	const handleCancel = () => {
		setIsEditing(false);
		setError("");
		if (onCancel) onCancel();
	};

	const handleSave = async (newValue) => {
		if (disabled || isLoading) return;

		// Check if value actually changed
		if (newValue === value) {
			setIsEditing(false);
			return;
		}

		setIsLoading(true);
		setError("");

		try {
			await onSave(newValue);
			setIsEditing(false);
		} catch (err) {
			setError(err.message || "Failed to save");
		} finally {
			setIsLoading(false);
		}
	};

	const handleToggle = () => {
		if (disabled || isLoading) return;
		handleSave(!value);
	};

	const displayValue = (
		<span
			className={`text-sm font-medium ${
				value
					? "text-green-600 dark:text-green-400"
					: "text-red-600 dark:text-red-400"
			}`}
		>
			{value ? trueLabel : falseLabel}
		</span>
	);

	return (
		<div className={`flex items-center gap-2 group ${className}`}>
			{displayValue}
			{!disabled && (
				<button
					type="button"
					onClick={handleToggle}
					disabled={isLoading}
					className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
						value
							? "bg-primary-600 dark:bg-primary-500"
							: "bg-secondary-200 dark:bg-secondary-600"
					}`}
					title={`Toggle ${value ? "off" : "on"}`}
				>
					<span
						className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
							value ? "translate-x-5" : "translate-x-1"
						}`}
					/>
				</button>
			)}
			{error && (
				<span className="text-xs text-red-600 dark:text-red-400">
					{error}
				</span>
			)}
		</div>
	);
};

export default InlineToggle;
