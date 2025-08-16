'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface User {
  id: string
  login: string
  name: string
  email: string
  avatar_url: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: () => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const signIn = () => {
    window.location.href = '/api/auth/signin'
  }

  const signOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      setUser(null)
      window.location.href = '/'
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  const value = {
    user,
    loading,
    signIn,
    signOut
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}


