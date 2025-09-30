"use client";

import { useState, useEffect } from "react";
import { Brain, Star, TrendingUp, BookOpen, X, Check, AlertCircle } from "lucide-react";

interface Learningsuggestion {
  userId: string;
  projectId: string;
  suggestedName: string;
  description: string;
  category?: string;
  tags: string[];
  corrections: any[];
  confidence: number;
  priority: 'low' | 'medium' | 'high';
}

interface TemplateLearningSuggestionsProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const PRIORITY_COLORS = {
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    badge: 'bg-red-100 text-red-800',
  },
  medium: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badge: 'bg-yellow-100 text-yellow-800',
  },
  low: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    badge: 'bg-green-100 text-green-800',
  },
};

export default function TemplateLearningSuggestions({
  isOpen,
  onClose,
  userId,
}: TemplateLearningSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Learningsuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [creatingTemplates, setCreatingTemplates] = useState<Set<number>>(new Set());
  const [createdTemplates, setCreatedTemplates] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
    }
  }, [isOpen, userId]);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/v1/templates/learning/suggestions');

      if (!response.ok) {
        throw new Error('Failed to fetch learning suggestions');
      }

      const data = await response.json();
      setSuggestions(data.data.suggestions || []);
    } catch (error) {
      console.error('Failed to fetch learning suggestions:', error);
      setError('Failed to load learning suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  const createTemplateFromSuggestion = async (suggestion: Learningsuggestion, index: number) => {
    setCreatingTemplates(prev => new Set(prev).add(index));

    try {
      const response = await fetch('/api/v1/templates/custom/from-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: suggestion.projectId,
          templateName: suggestion.suggestedName,
          description: suggestion.description,
          category: suggestion.category,
          tags: suggestion.tags,
          isPublic: false,
          includeCorrections: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create template');
      }

      setCreatedTemplates(prev => new Set(prev).add(index));

      // Remove suggestion from list after successful creation
      setTimeout(() => {
        setSuggestions(prev => prev.filter((_, i) => i !== index));
      }, 2000);

    } catch (error) {
      console.error('Failed to create template from suggestion:', error);
      setError(error instanceof Error ? error.message : 'Failed to create template');
    } finally {
      setCreatingTemplates(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const dismissSuggestion = (index: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-purple-500" />
            <h2 className="text-xl font-semibold text-gray-900">Learning Suggestions</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700">{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Loading learning suggestions...</p>
              </div>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Learning Suggestions</h3>
              <p className="text-gray-600">
                Make some corrections to your projects to generate personalized template suggestions.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {suggestions.map((suggestion, index) => {
                const colors = PRIORITY_COLORS[suggestion.priority];
                const isCreating = creatingTemplates.has(index);
                const isCreated = createdTemplates.has(index);

                return (
                  <div
                    key={index}
                    className={`border-2 rounded-lg p-4 ${colors.bg} ${colors.border} transition-all duration-200 ${
                      isCreated ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Header */}
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-semibold text-gray-900">{suggestion.suggestedName}</h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors.badge}`}>
                            {suggestion.priority} priority
                          </span>
                          <div className="flex items-center space-x-1 text-sm text-gray-600">
                            <Star className="w-4 h-4" />
                            <span>{Math.round(suggestion.confidence * 100)}% confidence</span>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-gray-700 mb-3">{suggestion.description}</p>

                        {/* Metadata */}
                        <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                          {suggestion.category && (
                            <span className="flex items-center space-x-1">
                              <BookOpen className="w-4 h-4" />
                              <span>{suggestion.category}</span>
                            </span>
                          )}
                          <span className="flex items-center space-x-1">
                            <TrendingUp className="w-4 h-4" />
                            <span>{suggestion.corrections.length} corrections learned</span>
                          </span>
                        </div>

                        {/* Tags */}
                        {suggestion.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {suggestion.tags.map(tag => (
                              <span
                                key={tag}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Corrections Preview */}
                        <div className="bg-white bg-opacity-50 rounded p-3 border border-white border-opacity-50">
                          <p className="text-sm font-medium text-gray-700 mb-2">
                            Key Improvements:
                          </p>
                          <ul className="text-sm text-gray-600 space-y-1">
                            {suggestion.corrections.slice(0, 3).map((correction, i) => (
                              <li key={i} className="flex items-center space-x-2">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                                <span>{correction.correctionType} improvements</span>
                              </li>
                            ))}
                            {suggestion.corrections.length > 3 && (
                              <li className="text-xs text-gray-500">
                                +{suggestion.corrections.length - 3} more improvements
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col space-y-2 ml-4">
                        <button
                          onClick={() => createTemplateFromSuggestion(suggestion, index)}
                          disabled={isCreating || isCreated}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            isCreated
                              ? 'bg-green-100 text-green-800 cursor-not-allowed'
                              : isCreating
                              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                              : 'bg-purple-500 text-white hover:bg-purple-600'
                          }`}
                        >
                          {isCreated ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Created</span>
                            </>
                          ) : isCreating ? (
                            <>
                              <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                              <span>Creating...</span>
                            </>
                          ) : (
                            <>
                              <BookOpen className="w-4 h-4" />
                              <span>Create Template</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => dismissSuggestion(index)}
                          disabled={isCreating}
                          className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Suggestions are based on your recent project corrections and patterns
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}