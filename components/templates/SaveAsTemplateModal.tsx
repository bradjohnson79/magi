"use client";

import { useState } from "react";
import { Save, X, Tag, BookOpen, Globe, Lock, Loader2 } from "lucide-react";

interface SaveAsTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateData: SaveTemplateData) => Promise<void>;
  projectId: string;
  projectName: string;
  projectCode: string;
  suggestedCategory?: string;
  suggestedTags?: string[];
}

export interface SaveTemplateData {
  name: string;
  description: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  includeCorrections: boolean;
}

const CATEGORIES = [
  'Frontend',
  'Backend',
  'Full Stack',
  'Mobile',
  'CLI',
  'Library',
  'Microservice',
  'API',
  'Game',
  'Desktop',
  'AI/ML',
  'General',
];

const COMMON_TAGS = [
  'react',
  'nextjs',
  'typescript',
  'javascript',
  'python',
  'go',
  'api',
  'database',
  'auth',
  'tailwind',
  'ui',
  'components',
  'hooks',
  'utils',
  'test',
  'config',
];

export default function SaveAsTemplateModal({
  isOpen,
  onClose,
  onSave,
  projectId,
  projectName,
  projectCode,
  suggestedCategory,
  suggestedTags = [],
}: SaveAsTemplateModalProps) {
  const [name, setName] = useState(`${projectName} Template`);
  const [description, setDescription] = useState(`Template based on ${projectName}`);
  const [category, setCategory] = useState(suggestedCategory || 'General');
  const [tags, setTags] = useState<string[]>(suggestedTags);
  const [newTag, setNewTag] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [includeCorrections, setIncludeCorrections] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [previewCode, setPreviewCode] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        category,
        tags,
        isPublic,
        includeCorrections,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
    }
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const addCommonTag = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Save className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-semibold text-gray-900">Save as Template</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Template Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter template name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this template is for and when to use it"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                disabled={isLoading}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags
              </label>

              {/* Current Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {tags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-lg"
                    >
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                        disabled={isLoading}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add New Tag */}
              <div className="flex space-x-2 mb-3">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addTag(newTag)}
                  placeholder="Add a tag"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoading}
                />
                <button
                  onClick={() => addTag(newTag)}
                  disabled={!newTag.trim() || isLoading}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>

              {/* Common Tags */}
              <div>
                <p className="text-sm text-gray-600 mb-2">Common tags:</p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_TAGS.filter(tag => !tags.includes(tag)).slice(0, 8).map(tag => (
                    <button
                      key={tag}
                      onClick={() => addCommonTag(tag)}
                      className="px-2 py-1 bg-gray-50 text-gray-600 text-sm rounded border border-gray-200 hover:bg-gray-100"
                      disabled={isLoading}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-4">
              {/* Public/Private */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {isPublic ? (
                    <Globe className="w-4 h-4 text-green-500" />
                  ) : (
                    <Lock className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-sm font-medium text-gray-700">
                    {isPublic ? 'Public Template' : 'Private Template'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="sr-only peer"
                    disabled={isLoading}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <p className="text-xs text-gray-500">
                {isPublic
                  ? 'This template will be visible to all users and can be used by others'
                  : 'This template will only be visible to you'
                }
              </p>

              {/* Include Corrections */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-gray-700">
                    Include Learning Data
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeCorrections}
                    onChange={(e) => setIncludeCorrections(e.target.checked)}
                    className="sr-only peer"
                    disabled={isLoading}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Include any corrections made to this project to help improve the template
              </p>
            </div>

            {/* Code Preview Toggle */}
            <div>
              <button
                onClick={() => setPreviewCode(!previewCode)}
                className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800"
                disabled={isLoading}
              >
                <BookOpen className="w-4 h-4" />
                <span>{previewCode ? 'Hide' : 'Preview'} template code</span>
              </button>

              {previewCode && (
                <div className="mt-3 p-4 bg-gray-50 rounded-lg border">
                  <p className="text-sm text-gray-600 mb-2">Template will include:</p>
                  <pre className="text-xs text-gray-800 bg-white p-3 rounded border overflow-x-auto max-h-40">
                    {projectCode.slice(0, 500)}
                    {projectCode.length > 500 && '...'}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600">
            Template will be created from current project state
          </p>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || isLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Template</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}