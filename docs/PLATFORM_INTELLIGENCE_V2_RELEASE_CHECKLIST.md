# Platform Intelligence V2 release checklist

## Automated gates

- Full repository regression suite passes.
- Backend TypeScript passes.
- Frontend TypeScript passes.
- App build passes.
- App and tracking Wrangler dry runs pass.
- Existing Superadmin Platform Intelligence regression tests pass.

## Product acceptance

- Executive Pulse renders Profile activation, Paid conversion, Referral contribution, DAU/MAU and WAU/MAU.
- Profile activation uses distinct user accounts with profiles, not profile-row count.
- Growth Velocity renders current 30 days, previous 30 days and percentage change for users, referrals and verified revenue.
- Prior-period zero renders N/A rather than infinite growth.
- Six-month history always returns six calendar months.
- Target Attainment uses only explicit migration-0044 growth targets.
- Missing targets remain visibly unset.

## Private referral operations

- Only approved rewards appear in Payables Command Center.
- Amount to pay matches the approved reward sum.
- Unique people waiting and oldest approval age render correctly.
- Mark Paid still requires a payment, settlement or transaction reference.
- Public Invite and Network surfaces contain no reward promise or payout formula.

## Preservation

- No new migration is introduced.
- Authentication and provider identity semantics are unchanged.
- Invite redemption and seven-generation network logic are unchanged.
- Coupon/free-access behavior is unchanged.
- Billing collection and verification behavior is unchanged.
- Wallets, campaigns and public profiles are unchanged.

## Production smoke test after deploy

Open `https://sadmin.linkary.xyz/admin/platform-intelligence` as Superadmin and verify:

1. Overview loads without console/API errors.
2. Range selector still switches 30/90/180-day daily charts.
3. Executive Pulse and Growth Velocity have real values or N/A where appropriate.
4. Six-month history contains six month columns per series.
5. Referral Operations shows the Payables Command Center.
6. If an approved internal reward exists, Mark Paid requests a settlement reference before mutation.
7. Growth Plan renders Target Attainment and keeps target editing functional.
8. Mobile-width layout remains readable and operational.
