'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import DataTable from '@/components/ui/DataTable'
import StatusBadge from '@/components/ui/StatusBadge'
import { getOnboardingFunnel } from '@/lib/api'
import { OnboardingRecord } from '@/lib/types'

export default function OnboardingPage() {
  const [data, setData] = useState<OnboardingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const response = await getOnboardingFunnel(page, 10)
      if (response.success && response.data) {
        setData(response.data)
        if (response.pagination) {
          setTotal(response.pagination.total)
        }
      }
      setLoading(false)
    }

    fetchData()
  }, [page])

  const columns = [
    { header: 'User ID', accessor: 'userId' },
    {
      header: 'Steps Completed',
      accessor: 'steps',
      render: (steps: any[]) => steps.filter((s) => s.status === 'completed').length,
    },
    {
      header: 'Status',
      accessor: 'conversionStatus',
      render: (status: string) => <StatusBadge status={status} />,
    },
    {
      header: 'Created',
      accessor: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      header: 'Action',
      accessor: 'id',
      render: (id: string) => (
        <Link href={`/dashboard/onboarding/${id}`} className="text-blue-600 hover:text-blue-800">
          View Details
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Onboarding Funnel</h1>
        <p className="text-gray-600">Track user onboarding progress and completion</p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        pagination={{
          page,
          limit: 10,
          total,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}
