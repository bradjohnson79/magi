import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-xl font-semibold">
              Magi
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/dashboard/projects" className="text-sm text-gray-600 hover:text-gray-900">
                Projects
              </Link>
              <Link href="/dashboard/teams" className="text-sm text-gray-600 hover:text-gray-900">
                Teams
              </Link>
              <Link href="/dashboard/settings" className="text-sm text-gray-600 hover:text-gray-900">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            {/* File selector dropdown placeholder */}
            <select className="text-sm border border-gray-300 rounded px-3 py-1">
              <option>Select file...</option>
            </select>
            {/* Restore points dropdown placeholder */}
            <select className="text-sm border border-gray-300 rounded px-3 py-1">
              <option>Restore points...</option>
            </select>
            <UserButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}