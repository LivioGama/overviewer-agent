'use client'

import { useAuth } from '@/components/auth/AuthProvider'
import Link from 'next/link'

export const Navbar = () => {
  const { user, signIn, signOut } = useAuth()

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">OT</span>
              </div>
              <span className="text-xl font-bold text-gray-900">
                Ollama Turbo Agent
              </span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  href="/installations"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Installations
                </Link>
                <Link
                  href="/jobs"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Jobs
                </Link>
                
                <div className="flex items-center space-x-3">
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {user.name || user.login}
                  </span>
                  <button
                    onClick={signOut}
                    className="text-gray-600 hover:text-gray-900 text-sm"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={signIn}
                className="btn btn-primary"
              >
                Sign in with GitHub
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}


