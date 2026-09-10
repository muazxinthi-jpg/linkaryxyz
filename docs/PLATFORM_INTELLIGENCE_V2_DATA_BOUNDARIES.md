# Platform Intelligence V2 data boundaries

The V2 dashboard must prefer unavailable values over inferred or fabricated business metrics.

## Allowed derived metrics

Derived metrics are allowed only when both numerator and denominator are already recorded Linkary facts and the relationship is explicitly defined in the UI or documentation.

Examples:

- DAU / MAU
- WAU / MAU
- profile activation
- paid conversion
- referral contribution
- ARPA
- revenue / MAU
- adjacent 30-day growth rates
- target attainment

## Not yet allowed

Do not expose the following as measured Linkary facts until their source ledgers exist:

- customer acquisition cost
- lifetime value
- LTV:CAC
- gross margin
- burn
- runway
- historical cohort retention
- historical MAU reconstructed from current sessions
- historical MRR reconstructed from current subscription state

## Zero denominators

When a ratio or growth calculation has no valid denominator, return null and render N/A. Never substitute zero, 100%, infinity or an arbitrary benchmark.

## Public/private boundary

Referral reward amounts, reasons, approvals, payables and settlement references remain Superadmin-only internal operations. No private reward record creates a public entitlement or a contractual promise to pay.