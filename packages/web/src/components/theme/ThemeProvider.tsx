'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  mounted: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: React.ReactNode
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setTheme] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const savedTheme = localStorage.getItem('theme') as Theme | null
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      setTheme(savedTheme)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return

    const applyTheme = () => {
      const root = document.documentElement
      
      if (theme === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const newResolvedTheme = systemPrefersDark ? 'dark' : 'light'
        setResolvedTheme(newResolvedTheme)
        
        if (systemPrefersDark) {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      } else {
        setResolvedTheme(theme)
        if (theme === 'dark') {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }
    }

    applyTheme()

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme()
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme, mounted])

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme)
    if (mounted) {
      localStorage.setItem('theme', newTheme)
    }
  }

  const toggleTheme = () => {
    if (!mounted) return
    
    if (theme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      handleSetTheme(systemPrefersDark ? 'light' : 'dark')
    } else {
      handleSetTheme(theme === 'light' ? 'dark' : 'light')
    }
  }

  return (
    <ThemeContext.Provider value={{
      theme,
      resolvedTheme,
      setTheme: handleSetTheme,
      toggleTheme,
      mounted
    }}>
      {children}
    </ThemeContext.Provider>
  )
}
