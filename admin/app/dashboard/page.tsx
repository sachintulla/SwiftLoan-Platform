'use client'

import { useState, useEffect } from 'react'
import { Users, TrendingUp, Zap, Activity } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
import { getDashboardOverview } from '@/lib/api'
import { DashboardOverview } from '@/lib/types'

export default function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const response = await getDashboardOverview()
      if (response.success && response.data) {
        setOverview(response.data)
      }
      setLoading(false)
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm animate-pulse h-32" />
        ))}
      </div>
    )
  }

  if (!overview) {
    return <div className="text-center text-gray-500 py-8">Failed to load dashboard data</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Overview</h1>
        <p className="text-gray-600">Key metrics and performance indicators</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Users"
          value={overview.totalUsers}
          icon={<Users size={24} />}
          color="blue"
          trend={{ direction: 'up', percent: 12 }}
        />
        <StatCard
          title="Active Loans"
          value={overview.activeLoans}
          icon={<Zap size={24} />}
          color="green"
          trend={{ direction: 'up', percent: 8 }}
        />
        <StatCard
          title="Total Leads"
          value={overview.totalLeads}
          icon={<TrendingUp size={24} />}
          color="amber"
          trend={{ direction: 'down', percent: 3 }}
        />
        <StatCard
          title="Conversion Rate"
          value={`${(overview.conversionRate * 100).toFixed(1)}%`}
          icon={<Activity size={24} />}
          color="teal"
          trend={{ direction: 'up', percent: 5 }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Onboarding Metrics</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Completion Rate</span>
              <span className="text-2xl font-bold text-gray-900">{(overview.onboardingCompletionRate * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${overview.onboardingCompletionRate * 100}%` }}
              />
            </div>
            <div className="flex justify-between items-center pt-4">
              <span className="text-gray-600">Avg Time to Complete</span>
              <span className="text-2xl font-bold text-gray-900">{Math.round(overview.avgTimeToCompletion / 60)}m</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Activity</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">New Users</span>
              <span className="text-2xl font-bold text-gray-900">{overview.todayNewUsers}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">New Loans</span>
              <span className="text-2xl font-bold text-gray-900">{overview.todayNewLoans}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
