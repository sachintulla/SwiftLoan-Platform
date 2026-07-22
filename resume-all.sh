#!/bin/bash

# ============================================================
# SwiftLoan — Resume All Agents After Credit Reset
# ============================================================
# Agents read CLAUDE.md first and continue from where they stopped.
# ============================================================

echo ""
echo "🔄 Resuming SwiftLoan agents..."
echo ""

claude --resume swiftloan-backend &
echo "✅ swiftloan-backend resuming..."

claude --resume swiftloan-admin &
echo "✅ swiftloan-admin resuming..."

claude --resume swiftloan-mobile &
echo "✅ swiftloan-mobile resuming..."

wait

echo ""
echo "All agents resumed. Monitor with: claude agents"
