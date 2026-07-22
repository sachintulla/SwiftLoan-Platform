import { getStatusColor } from '@/lib/types'

interface StatusBadgeProps {
  status: string
  label?: string
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors = getStatusColor(status)
  const displayLabel = label || status.replace(/_/g, ' ')

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colors.badge} ${colors.text}`}>
      {displayLabel}
    </span>
  )
}
