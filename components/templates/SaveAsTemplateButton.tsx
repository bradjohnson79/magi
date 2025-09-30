"use client";

import { useState } from "react";
import { Save, Check, AlertCircle } from "lucide-react";
import SaveAsTemplateModal, { SaveTemplateData } from "./SaveAsTemplateModal";

interface SaveAsTemplateButtonProps {
  projectId: string;
  projectName: string;
  projectCode: string;
  suggestedCategory?: string;
  suggestedTags?: string[];
  onTemplateSaved?: (templateId: string) => void;
  className?: string;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export default function SaveAsTemplateButton({
  projectId,
  projectName,
  projectCode,
  suggestedCategory,
  suggestedTags,
  onTemplateSaved,
  className = "",
}: SaveAsTemplateButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSaveTemplate = async (templateData: SaveTemplateData) => {
    setSaveState('saving');
    setErrorMessage('');

    try {
      // Create template from project
      const response = await fetch('/api/v1/templates/custom/from-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          templateName: templateData.name,
          description: templateData.description,
          category: templateData.category,
          tags: templateData.tags,
          isPublic: templateData.isPublic,
          includeCorrections: templateData.includeCorrections,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save template');
      }

      const result = await response.json();

      setSaveState('success');
      onTemplateSaved?.(result.data.id);

      // Reset success state after 3 seconds
      setTimeout(() => {
        setSaveState('idle');
      }, 3000);

    } catch (error) {
      console.error('Failed to save template:', error);
      setSaveState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save template');

      // Reset error state after 5 seconds
      setTimeout(() => {
        setSaveState('idle');
        setErrorMessage('');
      }, 5000);
    }
  };

  const getButtonContent = () => {
    switch (saveState) {
      case 'saving':
        return (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Saving...</span>
          </>
        );
      case 'success':
        return (
          <>
            <Check className="w-4 h-4" />
            <span>Saved!</span>
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle className="w-4 h-4" />
            <span>Error</span>
          </>
        );
      default:
        return (
          <>
            <Save className="w-4 h-4" />
            <span>Save as Template</span>
          </>
        );
    }
  };

  const getButtonStyles = () => {
    const baseStyles = "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed";

    switch (saveState) {
      case 'saving':
        return `${baseStyles} bg-blue-400 text-white cursor-not-allowed`;
      case 'success':
        return `${baseStyles} bg-green-500 text-white`;
      case 'error':
        return `${baseStyles} bg-red-500 text-white`;
      default:
        return `${baseStyles} bg-blue-500 text-white hover:bg-blue-600`;
    }
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={saveState === 'saving'}
          className={`${getButtonStyles()} ${className}`}
          title={saveState === 'error' ? errorMessage : undefined}
        >
          {getButtonContent()}
        </button>

        {/* Error tooltip */}
        {saveState === 'error' && errorMessage && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-red-600 text-white text-sm rounded-lg shadow-lg z-10 max-w-xs">
            <div className="text-center">{errorMessage}</div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-600"></div>
          </div>
        )}
      </div>

      <SaveAsTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTemplate}
        projectId={projectId}
        projectName={projectName}
        projectCode={projectCode}
        suggestedCategory={suggestedCategory}
        suggestedTags={suggestedTags}
      />
    </>
  );
}