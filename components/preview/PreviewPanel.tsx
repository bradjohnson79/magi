"use client";

interface PreviewPanelProps {
  code: string;
}

export default function PreviewPanel({ code }: PreviewPanelProps) {
  return (
    <div className="h-full p-4">
      <div className="h-full border border-gray-200 rounded-lg bg-white">
        <div className="p-4">
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">
              Live preview is coming soon. For now, you can view and edit your code in the Code tab.
            </p>
          </div>

          {/* Placeholder preview area */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Preview</h2>
            <div className="p-8 bg-gray-50 rounded-lg text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-200 rounded-lg mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-600">
                Your application preview will appear here
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Drag and drop elements to edit them visually
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}