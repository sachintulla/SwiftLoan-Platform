#!/bin/bash

# ============================================================
# SwiftLoan — Full Parallel Build Script
# ============================================================
# Launches all 3 agents in parallel as background sessions.
#
# What this does:
#   swiftloan-backend  → extends server/ with tracking + admin APIs
#   swiftloan-admin    → builds admin/ dashboard (Next.js 14, port 4001)
#   swiftloan-mobile   → adds tracking side-effects to src/api/client.ts
#
# What this does NOT touch:
#   - Existing src/screens/ (all 29 screens stay as-is)
#   - Existing server/ routes and Prisma models
#   - src/state/store.ts logic (only adds side-effects)
#
# BEFORE RUNNING:
# 1. Copy CLAUDE.md to your SwiftLoan project root
# 2. Make executable: chmod +x build-all.sh resume-all.sh
# 3. Run from inside the SwiftLoan project folder
# ============================================================

echo ""
echo "🚀 Starting all 3 SwiftLoan agents in parallel..."
echo ""

# Backend extension (server/ — tracking + admin APIs)
claude -n "swiftloan-backend" --bg "$(cat backend-prompt.txt)"
echo "✅ Backend agent started — session: swiftloan-backend"

# Admin Dashboard (new admin/ directory — Next.js 14)
claude -n "swiftloan-admin" --bg "$(cat admin-dashboard-prompt.txt)"
echo "✅ Admin agent started   — session: swiftloan-admin"

# Mobile tracking (additive only — no screen changes)
claude -n "swiftloan-mobile" --bg "$(cat mobile-prompt.txt)"
echo "✅ Mobile agent started  — session: swiftloan-mobile"

echo ""
echo "============================================================"
echo "All 3 agents running in parallel."
echo ""
echo "Monitor all:           claude agents"
echo "Watch backend:         claude attach swiftloan-backend"
echo "Watch admin:           claude attach swiftloan-admin"
echo "Watch mobile:          claude attach swiftloan-mobile"
echo ""
echo "After credit reset:    ./resume-all.sh"
echo "============================================================"
