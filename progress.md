2026-03-23 - TASK-001 done
- Added centralized environment config in src/config.ts for PORT, AI_ENABLED, OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_BASE_URL, AI_TIMEOUT_MS with safe defaults.
- Switched server port wiring in server.ts from direct env access to config.port.
- Test steps passed:
  1) Started with PORT=9090 and without OPENROUTER_API_KEY.
  2) Verified server listens on 9090 and starts without crash.
  3) Verified config.ai resolves to disabled state (enabled=false, provider=null) without exceptions.
