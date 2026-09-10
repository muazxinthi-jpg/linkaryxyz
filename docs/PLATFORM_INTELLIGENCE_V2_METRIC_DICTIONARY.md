# Platform Intelligence V2 metric dictionary

| Metric | Definition | Source | Window |
| --- | --- | --- | --- |
| DAU | Distinct authenticated non-Superadmin users seen | sessions | rolling 24h |
| WAU | Distinct authenticated non-Superadmin users seen | sessions | rolling 7d |
| MAU | Distinct authenticated non-Superadmin users seen | sessions | rolling 30d |
| DAU/MAU | DAU divided by MAU | derived | current |
| WAU/MAU | WAU divided by MAU | derived | current |
| Profile activation | Distinct active non-Superadmin users with at least one non-archived profile divided by active registered non-Superadmin users | users + profiles | current |
| Paid conversion | Active paid accounts divided by active registered non-Superadmin users | subscription periods + users | current |
| Referral contribution | Active referral edges created in the latest 30d divided by new non-Superadmin users created in the same 30d | referral edges + users | rolling 30d |
| MRR | Current active subscription-period price total by paid account | billing subscription periods | current |
| 30D revenue | Verified billing payment value | billing payments | rolling 30d |
| ARPA | MRR divided by active paid accounts | derived | current |
| Revenue/MAU | 30D verified revenue divided by MAU | derived | rolling 30d |
| Discount rate | Paid checkout base price less final price, divided by base price | checkout intents | rolling 30d |
| Reversal ratio | Refunded/reversed payment value divided by recorded payment value | billing payments | all recorded payments |
| New-user velocity | Latest 30d new users vs preceding 30d | users | 30d vs prior 30d |
| Referral velocity | Latest 30d referral edges vs preceding 30d | referral edges | 30d vs prior 30d |
| Revenue velocity | Latest 30d verified revenue vs preceding 30d | billing payments | 30d vs prior 30d |
| Amount to pay | Sum of approved private referral rewards | internal referral rewards | current ledger |

Percentage velocity is unavailable when the preceding period is zero.

Metrics such as CAC, LTV, burn, runway, gross margin, historical MRR and cohort retention remain intentionally unavailable until Linkary records the necessary source data.