'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, TrendingUp, Zap, DownloadCloud, Bell, BarChart3, Home } from 'lucide-react'

const navItems = [
  { name: 'Overview', href: '/dashboard', icon: Home },
  { name: 'Onboarding', href: '/dashboard/onboarding', icon: TrendingUp },
  { name: 'Loan Pipeline', href: '/dashboard/loans', icon: Zap },
  { name: 'Leads', href: '/dashboard/leads', icon: Users },
  { name: 'Downloads', href: '/dashboard/downloads', icon: DownloadCloud },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-gray-900 text-white p-6 min-h-screen">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">SwiftLoan</h2>
        <p className="text-gray-400 text-sm">Admin Dashboard</p>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
