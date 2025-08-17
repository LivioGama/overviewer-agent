'use client'

import { useTheme } from './ThemeProvider'

export const ThemeToggle = () => {
  const { resolvedTheme, toggleTheme, mounted } = useTheme()

  const getIcon = () => {
    if (!mounted) return '🌓'
    return resolvedTheme === 'dark' ? '🌙' : '☀️'
  }

  if (!mounted) {
    return (
      <div className="p-2 rounded-md text-gray-600 dark:text-gray-300">
        <span className="text-lg">🌓</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="text-lg">{getIcon()}</span>
    </button>
  )
}
