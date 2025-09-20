import React, { useState, useRef, useEffect } from 'react';
import { Edit2, Check, X, ChevronDown } from 'lucide-react';

const InlineGroupEdit = ({ 
  value, 
  onSave, 
  onCancel, 
  options = [],
  className = "",
  disabled = false,
  placeholder = "Select group..."
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (isEditing && dropdownRef.current) {
      dropdownRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setSelectedValue(value);
    // Force re-render when value changes
    if (!isEditing) {
      setIsOpen(false);
    }
  }, [value, isEditing]);

  // Calculate dropdown position
  const calculateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      calculateDropdownPosition();
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', calculateDropdownPosition);
      window.addEventListener('scroll', calculateDropdownPosition);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('resize', calculateDropdownPosition);
        window.removeEventListener('scroll', calculateDropdownPosition);
      };
    }
  }, [isOpen]);

  const handleEdit = () => {
    if (disabled) return;
    setIsEditing(true);
    setSelectedValue(value);
    setError('');
    // Automatically open dropdown when editing starts
    setTimeout(() => {
      setIsOpen(true);
    }, 0);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedValue(value);
    setError('');
    setIsOpen(false);
    if (onCancel) onCancel();
  };

  const handleSave = async () => {
    if (disabled || isLoading) return;

    console.log('handleSave called:', { selectedValue, originalValue: value, changed: selectedValue !== value });

    // Check if value actually changed
    if (selectedValue === value) {
      console.log('No change detected, closing edit mode');
      setIsEditing(false);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('Calling onSave with:', selectedValue);
      await onSave(selectedValue);
      console.log('Save successful');
      // Update the local value to match the saved value
      setSelectedValue(selectedValue);
      setIsEditing(false);
      setIsOpen(false);
    } catch (err) {
      console.error('Save failed:', err);
      setError(err.message || 'Failed to save');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const getDisplayValue = () => {
    console.log('getDisplayValue called with:', { value, options });
    if (!value) {
      console.log('No value, returning Ungrouped');
      return 'Ungrouped';
    }
    const option = options.find(opt => opt.id === value);
    console.log('Found option:', option);
    return option ? option.name : 'Unknown Group';
  };

  const getDisplayColor = () => {
    if (!value) return 'bg-secondary-100 text-secondary-800';
    const option = options.find(opt => opt.id === value);
    return option ? `text-white` : 'bg-secondary-100 text-secondary-800';
  };

  if (isEditing) {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className={`w-full px-3 py-1 text-sm border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent flex items-center justify-between ${
                error ? 'border-red-500' : ''
              } ${isLoading ? 'opacity-50' : ''}`}
            >
              <span className="truncate">
                {selectedValue ? options.find(opt => opt.id === selectedValue)?.name || 'Unknown Group' : 'Ungrouped'}
              </span>
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            </button>
            
            {isOpen && (
              <div 
                className="fixed z-50 bg-white dark:bg-secondary-800 border border-secondary-300 dark:border-secondary-600 rounded-md shadow-lg max-h-60 overflow-auto"
                style={{
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                  minWidth: '200px'
                }}
              >
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedValue(null);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary-100 dark:hover:bg-secondary-700 flex items-center ${
                      selectedValue === null ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary-100 text-secondary-800">
                      Ungrouped
                    </span>
                  </button>
                  {options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedValue(option.id);
                        setIsOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary-100 dark:hover:bg-secondary-700 flex items-center ${
                        selectedValue === option.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                      }`}
                    >
                      <span 
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: option.color }}
                      >
                        {option.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <span className="text-xs text-red-600 dark:text-red-400 mt-1 block">{error}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 group ${className}`}>
      <span 
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDisplayColor()}`}
        style={value ? { backgroundColor: options.find(opt => opt.id === value)?.color } : {}}
      >
        {getDisplayValue()}
      </span>
      {!disabled && (
        <button
          onClick={handleEdit}
          className="p-1 text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded transition-colors opacity-0 group-hover:opacity-100"
          title="Edit group"
        >
          <Edit2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export default InlineGroupEdit;
