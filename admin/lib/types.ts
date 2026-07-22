export interface AdminUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'superadmin'
  createdAt: string
}

export interface OnboardingStep {
  id: string
  stepNumber: number
  stepName: string
  status: 'completed' | 'in_progress' | 'abandoned' | 'not_started'
  timeSpentSeconds: number
  timestamp: string
}

export interface OnboardingRecord {
  id: string
  userId: string
  steps: OnboardingStep[]
  conversionStatus: 'converted' | 'abandoned' | 'in_progress'
  completedAt?: string
  createdAt: string
}

export interface LoanStep {
  stepName: string
  status: 'completed' | 'in_progress' | 'on_hold' | 'failed'
  timeSpentSeconds: number
  holdReason?: string
  timestamp: string
}

export interface Loan {
  id: string
  userId: string
  applicationId: string
  status: 'active' | 'completed' | 'failed' | 'paused'
  amount: number
  rate: number
  steps: LoanStep[]
  disbursedAt?: string
  createdAt: string
}

export interface AnonymousLead {
  id: string
  email: string
  name?: string
  phone?: string
  source: string
  status: 'anonymous' | 'converted'
  convertedUserId?: string
  createdAt: string
}

export interface AppDownload {
  id: string
  platform: 'ios' | 'android'
  version: string
  count: number
  date: string
}

export interface ActivityEvent {
  id: string
  userId: string
  eventType: string
  eventName: string
  screen: string
  metadata?: Record<string, any>
  createdAt: string
}

export interface DashboardOverview {
  totalUsers: number
  activeLoans: number
  totalLeads: number
  conversionRate: number
  todayNewUsers: number
  todayNewLoans: number
  onboardingCompletionRate: number
  avgTimeToCompletion: number
}

export interface StatusColor {
  bg: string
  text: string
  badge: string
}

export const STATUS_COLORS: Record<string, StatusColor> = {
  completed: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    badge: 'bg-green-100',
  },
  approved: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    badge: 'bg-green-100',
  },
  disbursed: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    badge: 'bg-green-100',
  },
  in_progress: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    badge: 'bg-blue-100',
  },
  submitted: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    badge: 'bg-blue-100',
  },
  active: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    badge: 'bg-blue-100',
  },
  paused: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    badge: 'bg-amber-100',
  },
  on_hold: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    badge: 'bg-amber-100',
  },
  pending: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    badge: 'bg-amber-100',
  },
  abandoned: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    badge: 'bg-red-100',
  },
  rejected: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    badge: 'bg-red-100',
  },
  failed: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    badge: 'bg-red-100',
  },
  anonymous: {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    badge: 'bg-gray-100',
  },
  not_started: {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    badge: 'bg-gray-100',
  },
  converted: {
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    badge: 'bg-teal-100',
  },
}

export function getStatusColor(status: string): StatusColor {
  return STATUS_COLORS[status.toLowerCase()] || STATUS_COLORS.not_started
}
