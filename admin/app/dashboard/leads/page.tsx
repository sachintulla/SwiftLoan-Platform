'use client'

import { useState, useEffect } from 'react'
import DataTable from '@/components/ui/DataTable'
import StatusBadge from '@/components/ui/StatusBadge'
import { getLeads } from '@/lib/api'
import { AnonymousLead } from '@/lib/types'

export default function LeadsPage() {
  const [data, setData] = useState<AnonymousLead[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const response = await getLeads(page, 10)
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
    { header: 'Email', accessor: 'email' },
    { header: 'Name', accessor: 'name' },
    { header: 'Phone', accessor: 'phone' },
    { header: 'Source', accessor: 'source' },
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
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Leads & Contact Us</h1>
        <p className="text-gray-600">Manage anonymous leads and form submissions</p>
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
