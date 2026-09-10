# Platform Intelligence V2 security note

V2 adds no new public endpoint and no new mutation.

The existing platform-intelligence API remains protected by the Superadmin session boundary. Existing private reward and growth-target mutations continue to require CSRF verification.

The response remains private, no-store, noindex, nofollow and noarchive.

Payables is a UI projection of already protected reward records. Settlement remains an explicit Superadmin action and requires a reference before the existing transition to Paid.