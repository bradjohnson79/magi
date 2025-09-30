"use client";

import { useState } from "react";
import ChatPanel from "@/components/chat/ChatPanel";
import PreviewPanel from "@/components/preview/PreviewPanel";
import CodeEditor from "@/components/editor/CodeEditor";
import SaveAsTemplateButton from "@/components/templates/SaveAsTemplateButton";

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<"preview" | "code">("preview");
  const [projectId] = useState("demo-project-123"); // In real app, this would come from route params or state
  const [projectName] = useState("My Project");
  const [code, setCode] = useState(`// Welcome to Magi
// Start by describing what you want to build in the chat panel

function App() {
  return (
    <div>
      <h1>Hello, Magi!</h1>
    </div>
  );
}

export default App;`);

  return (
    <div className="flex h-[calc(100vh-60px)]">
      {/* Left Panel - Chat */}
      <div className="w-1/3 border-r border-gray-200 bg-white">
        <ChatPanel />
      </div>

      {/* Right Panel - Preview/Code */}
      <div className="flex-1 bg-white">
        {/* Tab switcher and actions */}
        <div className="border-b border-gray-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex space-x-4">
              <button
                onClick={() => setActiveView("preview")}
                className={`px-3 py-1 text-sm rounded ${
                  activeView === "preview"
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setActiveView("code")}
                className={`px-3 py-1 text-sm rounded ${
                  activeView === "code"
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Code
              </button>
            </div>

            {/* Save as Template Button */}
            <SaveAsTemplateButton
              projectId={projectId}
              projectName={projectName}
              projectCode={code}
              suggestedCategory="Frontend"
              suggestedTags={["react", "javascript"]}
              onTemplateSaved={(templateId) => {
                console.log("Template saved with ID:", templateId);
              }}
              className="text-sm"
            />
          </div>
        </div>

        {/* Content area */}
        <div className="h-[calc(100%-48px)]">
          {activeView === "preview" ? (
            <PreviewPanel code={code} />
          ) : (
            <CodeEditor code={code} onChange={setCode} />
          )}
        </div>
      </div>
    </div>
  );
}