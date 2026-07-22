'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, User } from 'lucide-react'
import { logout } from '@/lib/api'
import { AdminUser } from '@/lib/types'

export default function Topbar() {
  const router = useRouter()
  const [user, setUser] = useState<AdminUser | null>(null)

  useEffect(() => {
    const userStr = localStorage.getItem('adminUser')
    if (userStr) {
      try {
        setUser(JSON.parse(userStr))
      } catch {
        setUser(null)
      }
    }
  }, [])

  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div className="text-lg font-semibold text-gray-900">Dashboard</div>
      <div className="flex items-center space-x-6">
        {user && (
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <User size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center space-x-2 text-gray-600 hover:text-red-600 transition"
        >
          <LogOut size={20} />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </div>
  )
}
