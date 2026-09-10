# Platform Intelligence V2 deployment note

No database migration is introduced by V2.

Normal protected CI and production deployment are sufficient. Migration 0044 must remain present because the existing private reward and growth-target write operations depend on it.

After deployment, perform the Superadmin smoke checks in `PLATFORM_INTELLIGENCE_V2_RELEASE_CHECKLIST.md`.