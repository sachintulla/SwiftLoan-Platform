import { ReactNode } from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon?: ReactNode
  trend?: {
    direction: 'up' | 'down'
    percent: number
  }
  color?: 'blue' | 'green' | 'amber' | 'red' | 'teal'
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  teal: 'bg-teal-50 text-teal-600',
}

export default function StatCard({
  title,
  value,
  icon,
  trend,
  color = 'blue',
}: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          {trend && (
            <p className={`text-sm font-medium mt-2 ${trend.direction === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend.direction === 'up' ? '↑' : '↓'} {trend.percent}%
            </p>
          )}
        </div>
        {icon && <div className={`${colorClasses[color]} p-3 rounded-lg`}>{icon}</div>}
      </div>
    </div>
  )
}
