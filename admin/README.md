# SwiftLoan Admin Dashboard

A Next.js 14 admin dashboard for the SwiftLoan application, running on port 4001 and connecting to the server backend at http://localhost:4000.

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Running SwiftLoan server on http://localhost:4000

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure the API URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:4001](http://localhost:4001) in your browser.

### Building for Production

```bash
npm run build
npm run start
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Project Structure

```
admin/
├── app/                           # Next.js app directory
│   ├── dashboard/                 # Protected dashboard routes
│   │   ├── onboarding/           # Onboarding funnel
│   │   ├── loans/                # Loan pipeline
│   │   ├── leads/                # Leads & contact us
│   │   ├── downloads/            # App downloads
│   │   ├── analytics/            # Analytics
│   │   ├── notifications/        # Notifications
│   │   ├── layout.tsx            # Dashboard layout with sidebar/topbar
│   │   └── page.tsx              # Dashboard overview
│   ├── page.tsx                   # Login page
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global Tailwind styles
├── components/
│   ├── Sidebar.tsx               # Navigation sidebar
│   ├── Topbar.tsx                # Top bar with user info
│   └── ui/                       # Shared UI components
│       ├── StatusBadge.tsx       # Status badge component
│       ├── StatCard.tsx          # Statistics card
│       └── DataTable.tsx         # Generic data table
├── lib/
│   ├── api.ts                    # API client for server communication
│   ├── types.ts                  # TypeScript types and constants
│   └── utils.ts                  # Utility functions
├── middleware.ts                  # Authentication middleware
├── tailwind.config.ts            # Tailwind CSS config
├── tsconfig.json                 # TypeScript config
├── next.config.js                # Next.js config
└── package.json                  # Dependencies
```

## Features

### Implemented
- ✅ Login/authentication
- ✅ Dashboard overview with key metrics
- ✅ Onboarding funnel tracking
- ✅ Loan pipeline management
- ✅ Leads & contact us list
- ✅ Responsive sidebar navigation
- ✅ User profile in topbar
- ✅ Status badges with color coding
- ✅ Generic data table with pagination
- ✅ TypeScript throughout

### Coming Soon
- App downloads analytics
- Advanced analytics charts
- Notification management
- Individual detail pages for onboarding, loans, and leads

## API Integration

The admin dashboard communicates with the backend server through:

**Base URL:** `http://localhost:4000`

### Endpoints Used

- `POST /api/admin/auth/login` - Login
- `GET /api/admin/auth/me` - Get current user
- `GET /api/admin/dashboard/overview` - Dashboard overview
- `GET /api/admin/onboarding` - List onboarding records
- `GET /api/admin/loans` - List loans
- `GET /api/admin/leads` - List leads
- `GET /api/admin/users` - List users
- `GET /api/admin/downloads` - List downloads
- `GET /api/admin/analytics` - Get analytics data
- `GET /api/admin/notifications` - List notifications

## Authentication

The admin dashboard uses JWT token-based authentication. Tokens are stored in localStorage and included in the Authorization header for API requests.

Demo credentials (when backend seed is run):
- Email: admin@swiftloan.com
- Password: password123

## Styling

Uses Tailwind CSS for styling with a custom color palette aligned with SwiftLoan branding:
- Primary: Blue (#2563EB)
- Success: Green (#16A34A)
- Warning: Amber (#D97706)
- Error: Red (#DC2626)
- Info: Teal (#0D9488)

## Contributing

When adding new pages:
1. Create a new directory under `app/dashboard/`
2. Add `page.tsx` with the page component
3. Update `components/Sidebar.tsx` to add navigation link
4. Use existing UI components (`StatusBadge`, `StatCard`, `DataTable`)
5. Follow TypeScript types from `lib/types.ts`
