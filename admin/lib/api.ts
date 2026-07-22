import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('adminToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
  pagination?: {
    page: number
    limit: number
    total: number
  }
}

export async function login(email: string, password: string): Promise<ApiResponse> {
  try {
    const response = await apiClient.post('/api/admin/auth/login', {
      email,
      password,
    })
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Login failed',
    }
  }
}

export async function logout(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminUser')
  }
}

export async function getMe(): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/auth/me')
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to get user',
    }
  }
}

export async function getDashboardOverview(): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/dashboard/overview')
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch overview',
    }
  }
}

export async function getOnboardingFunnel(page: number = 1, limit: number = 10): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/onboarding', {
      params: { page, limit },
    })
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch onboarding data',
    }
  }
}

export async function getOnboardingJourney(id: string): Promise<ApiResponse> {
  try {
    const response = await apiClient.get(`/api/admin/onboarding/${id}`)
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch journey',
    }
  }
}

export async function getLoans(page: number = 1, limit: number = 10): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/loans', {
      params: { page, limit },
    })
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch loans',
    }
  }
}

export async function getLoan(id: string): Promise<ApiResponse> {
  try {
    const response = await apiClient.get(`/api/admin/loans/${id}`)
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch loan',
    }
  }
}

export async function getLeads(page: number = 1, limit: number = 10): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/leads', {
      params: { page, limit },
    })
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch leads',
    }
  }
}

export async function getLead(id: string): Promise<ApiResponse> {
  try {
    const response = await apiClient.get(`/api/admin/leads/${id}`)
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch lead',
    }
  }
}

export async function getUsers(page: number = 1, limit: number = 10): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/users', {
      params: { page, limit },
    })
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch users',
    }
  }
}

export async function getUser(id: string): Promise<ApiResponse> {
  try {
    const response = await apiClient.get(`/api/admin/users/${id}`)
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch user',
    }
  }
}

export async function getDownloads(page: number = 1, limit: number = 10): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/downloads', {
      params: { page, limit },
    })
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch downloads',
    }
  }
}

export async function getAnalytics(): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/analytics')
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch analytics',
    }
  }
}

export async function getNotifications(page: number = 1, limit: number = 10): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/notifications', {
      params: { page, limit },
    })
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch notifications',
    }
  }
}

export async function getLiveFeed(): Promise<ApiResponse> {
  try {
    const response = await apiClient.get('/api/admin/dashboard/live-feed')
    return response.data
  } catch (error: any) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to fetch live feed',
    }
  }
}
