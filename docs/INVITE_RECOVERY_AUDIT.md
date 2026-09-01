# Invite recovery audit

Incident: the first owner signup authenticated successfully but could not attach its invitation.

Root causes:

1. The bootstrap invitation was originally hashed from a mixed-case human code while the recovery path surfaced the code in uppercase. Exact SHA-256 lookup therefore treated the same human code as a different credential.
2. Production HTML for the authenticated app could retain asset-cache headers. A browser could therefore continue loading an older recovery shell after a successful deployment.

Fixes:

- Human-facing `LNK-...` codes are normalized to uppercase before hashing.
- Migration `0004_invite_code_normalization.sql` moves the existing owner bootstrap invitation to the canonical hash without changing its privileges or usage.
- Production HTML responses use `no-store` so new app deployments always select the current hashed frontend assets.
- Regression tests cover case-insensitive Linkary invite hashing while preserving exact hashing for non-invite security tokens.

Security notes:

- The bootstrap invitation remains single-use and expiry-controlled.
- No public Superadmin privilege is created by the invitation.
- Superadmin remains a separate controlled `admin_grants` operation after a real Linkary user exists.
