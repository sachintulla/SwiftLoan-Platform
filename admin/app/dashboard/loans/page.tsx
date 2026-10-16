'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import DataTable from '@/components/ui/DataTable'
import StatusBadge from '@/components/ui/StatusBadge'
import { getLoans } from '@/lib/api'
import { Loan } from '@/lib/types'
import { inr } from '@/lib/utils'

export default function LoansPage() {
  const [data, setData] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const response = await getLoans(page, 10)
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
    { header: 'Loan ID', accessor: 'id' },
    { header: 'User ID', accessor: 'userId' },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (amount: number) => inr(amount),
    },
    {
      header: 'Rate',
      accessor: 'rate',
      render: (rate: number) => `${rate}%`,
    },
    {
      header: 'Status',
      accessor: 'status',
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
        <Link href={`/dashboard/loans/${id}`} className="text-blue-600 hover:text-blue-800">
          View Details
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Loan Pipeline</h1>
        <p className="text-gray-600">Monitor all active and completed loans</p>
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
