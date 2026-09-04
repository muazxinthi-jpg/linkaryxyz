# Linkary Signal UI Library

## Authenticated dashboard implementation

The production dashboard polish is implemented in `frontend/src/dashboard-polish.css` and imported last by `frontend/src/main.tsx`. Every rule is scoped beneath `.ops-shell`, so authentication, onboarding, the landing page, and rendered public profiles remain outside this layer.

`ProductWorkspace.tsx` owns the shared authenticated shell and exposes the active workspace type. Creator, Project, and Superadmin contexts remain distinct while preserving the existing routes, handlers, API requests, session behavior, and server-side permissions.

Required dashboard states include:

- actions: default, hover, focus-visible, pressed, loading, disabled, and destructive;
- fields: empty, populated, focused, valid, invalid, read-only, and disabled;
- data: loading, current, stale, partial, unavailable, empty, filtered-empty, and error;
- status: neutral, informational, Linkary-active, success, warning, and failure;
- feedback: inline alert, progress, toast, confirmation, and destructive confirmation;
- workspace: Creator, Project, and separately labeled Superadmin tools.

Dashboard QA must cover 1440px, 1024px, 768px, and 390px; keyboard-only operation; 200% zoom; reduced motion; and all authenticated routes. Public-profile regression tests are mandatory whenever dashboard CSS is changed.

Version 2.0 — 31 August 2026

This is the canonical UI overview for Linkary. The working reference implementation is `index.html`, supported by `styles.css`, `script.js`, and the supplied brand assets in `assets/brand/`.

## Product position

Linkary is a creator campaign intelligence and social growth attribution product. It connects creators, campaign activities, first-party tracking events, conversions, and qualified outcomes.

Primary promise: **Creator campaigns, connected to outcomes.**

Audience promises:

- Projects and teams: **Know which creators actually drive growth.**
- Creators: **Prove what your influence is actually worth.**
- Communities: **Build a verified performance reputation.**

Preferred vocabulary: creator campaigns, campaign intelligence, social growth attribution, qualified outcomes, first-party tracking, creator collaboration, deliverables, evidence trail, verified events, submitted evidence, campaign performance.

Avoid category language around crypto analytics, trading, alpha, tokens, investor activity, bot hunting, or “smart money.” Web3 can be market context, never the leading product category.

## Design concept: Signal System

The system visualizes an auditable path:

`Creator → Activity → Linkary event → Conversion → Qualified outcome`

The visual language combines:

- a calm dark signal field for application and attribution surfaces;
- a warm editorial canvas for marketing and reading;
- Linkary Orange for active signals, actions, and focused data;
- restrained evidence cards instead of decorative dashboard noise;
- the four-bar Linkary mark as identity, loader geometry, progress language, and active navigation cue.

### Principles

1. **Evidence before decoration.** Every visualization supports a decision.
2. **Orange means Linkary is acting.** Use orange for primary actions, active selection, focused chart series, and first-party Linkary events.
3. **Separate evidence types.** Verified events use solid treatments. Submitted evidence uses dashed treatments and explicit labels.
4. **Never turn unavailable into zero.** `— / unavailable` is not `0`.
5. **Outcome first.** Campaign objectives and qualified outcomes appear above vanity metrics.
6. **Complex data stays calm.** Use one primary chart, four or fewer top-level metrics, and clear disclosure of period and freshness.
7. **Both sides are first-class.** Teams and creators share one campaign record but receive role-appropriate experiences.

## Brand assets and logo rules

Assets:

- `assets/brand/linkary-icon-black.png`
- `assets/brand/linkary-wordmark-black.png`
- `assets/brand/linkary-banner.jpeg`

Use the black icon/wordmark on warm white or light surfaces. On dark surfaces, the coded preview uses an inverse treatment on the black icon and an HTML wordmark. A dedicated white/orange export should replace the filter treatment when available.

Clear space: at least half the icon width on every side. Minimum icon size: 24px digital. Do not stretch, recolor with gradients, rotate, add glow, or place the full splatter banner behind dense UI. The orange splatter is campaign/brand texture, not a repeating application background.

## Foundation tokens

### Core palette

| Token | Value | Purpose |
| --- | --- | --- |
| `--bg` | `#05070A` | Application shell and deep matrix |
| `--s1` | `#0A0E14` | Primary dark surface |
| `--s2` | `#0F141C` | Elevated dark surface |
| `--s3` | `#151B24` | Hover/selected dark surface |
| `--canvas` | `#F6F3EC` | Marketing and auth canvas |
| `--paper` | `#FFFDF8` | Light cards and forms |
| `--ink` | `#090A0C` | Primary light-surface text |
| `--text` | `#F7F5F0` | Primary dark-surface text |
| `--muted` | `#A5ADB8` | Secondary dark text |
| `--muted2` | `#68717E` | Tertiary metadata |
| `--brand` | `#FF4F0A` | Linkary signal and primary action |
| `--brand2` | `#FF6A2A` | Brand hover |
| `--green` | `#45D483` | Successful or positive state |
| `--yellow` | `#F6B84A` | Warning, expiring, paused |
| `--red` | `#FF5C68` | Error, failed, destructive |
| `--blue` | `#70A5FF` | Informational state only |

Orange is not a generic positive color. A successful outcome is green; an active Linkary control or tracked signal is orange.

### Typography

- Display: Space Grotesk, 500–700
- UI/body: Inter, 400–700
- Metrics, IDs, dates, technical labels: IBM Plex Mono, 400–500
- Hero: `clamp(58px, 6vw, 96px)`, line-height `.94`, tracking `-.064em`
- Section display: `45–72px`, line-height `.96`
- Dashboard title: `24–32px`
- Body: `12–17px`, line-height `1.6–1.75`
- UI label: `8–11px`; uppercase is limited to technical metadata and section indices

Use tabular figures for data. Do not overuse uppercase microcopy.

### Spacing, shape, and border

Base spacing unit: 4px. Preferred steps: 8, 12, 16, 20, 24, 32, 48, 64, 80, 120.

- Standard control height: 44–48px
- Compact toolbar control: 36–40px
- Button/input radius: 7–10px
- Card radius: 9–14px
- Default border: `1px solid rgba(9,10,12,.12)` on light
- Dark border: `1px solid rgba(255,255,255,.09)`
- Avoid excessive pills. Pills are reserved for status, compact scores, and tags.
- Application cards use tonal contrast and borders; marketing product previews may use a single large shadow.

### Background fields

Use clean tonal surfaces with restrained radial light, subtle orange bloom, and sparse signal nodes. Do not use visible square grids, graph-paper lines, code rain, dense particles, or constant background animation. Product UI should create the visual interest.

## Component catalog

### Buttons

Variants:

- Brand: orange fill, black text; primary create/submit action
- Outline: neutral action on light canvas
- Dark outline: neutral action on dark canvas
- White: secondary action on dark product surfaces
- Ghost/text: low-emphasis navigation
- Danger: destructive confirmation only
- Icon: square or circular, accessible name required

States: default, hover, focus-visible, pressed, loading, disabled. Loading preserves width and uses a visible spinner plus progressive text (“Creating…”). Focus uses an orange outer ring with 3px alpha offset.

Actions use direct verbs: “Create campaign,” “Invite creator,” “Export report.” Avoid ambiguous “Get started.”

### Fields

Supported fields: text, email, password, search, select, multiselect, date/range, currency, URL slug, destination URL, textarea.

Anatomy: label → control → help/error/success. Placeholder is never the only label.

States: default, hover, focus, populated, success/available, invalid, read-only, disabled. Errors explain recovery. Prefix inputs keep `https://l.linkary.xyz/` outside the editable slug.

### Checkbox, switch, and segmented controls

- Checkbox: selected for later submission
- Switch: setting takes effect immediately; use `role="switch"` and `aria-checked`
- Segmented control: 2–4 mutually exclusive views within one context

Every option supports keyboard interaction and a visible focus state.

### Status badges

Campaign: draft, scheduled, live, paused, completed, archived, needs review.

Participation: invited, viewed, accepted, declined, active, submitted, revision requested, approved, completed, removed.

Integration: active, reauthorization needed, expired, revoked, unavailable.

Data: fresh, delayed, partial, stale, unavailable, permission restricted.

Mapping:

- Live/active/success: green
- Scheduled/informational: blue
- Paused/expiring/needs review: yellow
- Failed/blocked: red
- Draft/archived/neutral: gray
- Linkary first-party active signal: orange, only when needed

Color is always paired with text or an icon.

### Alerts, notifications, and toasts

- Inline info: localized data quality or contextual information
- Warning: expiring connection, partial data, overdue work
- Error: failed import, authorization failure, blocked action
- Notification: persistent activity inbox
- Toast: short-lived result after an action

Alerts answer what happened, what is affected, and what to do next.

### Empty, loading, unavailable

Empty state: explain what is missing, why it matters, and the next action.

Skeleton: mirror the final structure only for short expected waits.

Progress: use for import, campaign setup, and long calculation, with semantic text.

Unavailable: use `—`, explicit “unavailable” copy, last successful update, and recovery action. Never render a silent zero.

### Avatar and identity

Sizes: 24, 31/32, 40/48, and 60–96px. Fallback order: verified image → initials → platform/project mark. Avatar stack overlaps 8px and ends with `+N`.

Public handles can change. Product implementation keys platform identity to immutable provider UID and keeps handle history.

### Navigation

Public header: Product, For teams, For creators, Resources, Log in, Start a campaign.

Application sidebar:

1. Overview
2. Campaigns
3. Creators
4. Activities / deliverables
5. Tracking links
6. Analytics / reports
7. Profiles
8. Integrations
9. Settings

Referral/reward navigation is entitlement-gated. Public profile editing must not duplicate deep Analytics.

### Metric card

Required anatomy: metric label, primary value, comparison and period, data freshness, optional definition/quality.

Good: `Attributed conversions · 4,892 · ↑14.8% vs prior 30D · Updated 2m ago.`

Do not show a number without units, period, or source context.

### Charts

- Orange: primary Linkary/active series
- White or gray: comparison series on dark
- Green: confirmed favorable outcome, not the default series
- Line: time trend
- Bar: categorical/ranked comparison
- Heatmap: time intensity
- Progress: bounded completion

Every chart includes a text summary, period, unit, legend when needed, exact tooltip, and freshness. Avoid donut charts when a number is clearer.

### Tables

Text left, numbers right. Sorting exposes active column and direction. Filter/selection persists across pages. Mobile summary keeps entity, primary result, and status. Creator ranking prioritizes verified outcomes and reliability, never follower count alone.

## Product recipes

### Homepage

1. Sticky navigation
2. Hero: “Know which creators actually drive growth.”
3. Real product proof with example-campaign labels
4. Capability rail
5. Problem: reach versus impact
6. Four-step workflow: Brief → Invite → Track → Prove
7. Teams/creators split
8. Attribution trace with evidence legend
9. Campaign operations feature grid
10. FAQ
11. High-contrast final CTA

Do not fabricate customer logos, totals, or quotes. Demo data is labeled as example data when published.

### Authentication

Desktop uses a split layout: dark brand/evidence panel left, focused authentication card right. Mobile removes the proof panel.

Login states: default, focused, validation error, wrong credentials, loading, reset sent, verification pending, expired invite, OAuth error, rate limited, maintenance.

Role selection occurs after account creation or within signup setup—not as a permanent User type. Initial options are Project / Team and Creator.

### Dashboard overview

Above the fold:

- greeting and operating summary;
- active campaigns;
- attributed conversions (primary);
- qualified outcomes;
- delivery rate;
- outcomes-over-time chart;
- needs-attention inbox.

Below:

- active campaign table;
- creator performance;
- recent attribution feed;
- setup checklist for new accounts only.

All metrics state period and freshness. Dashboard information architecture preserves one clear owner for deep analytics.

### Dashboard navigation and working routes

Every sidebar destination is a real view, not a decorative label. The preview supports these deep-linkable hash routes:

- `#dashboard/overview` — operating summary, attributed outcomes, attention inbox, active campaigns
- `#dashboard/campaigns` — campaign cards, status filters, objectives, progress, primary results
- `#dashboard/creators` — evidence-led creator discovery, shortlist, reliability, partial-data state
- `#dashboard/activities` — requested, in-review, approved, overdue, revision and approval workflow
- `#dashboard/tracking-links` — first-party URLs, destinations, clicks, conversions, active/paused/broken states
- `#dashboard/analytics` — deep outcome analysis, source share, freshness and attribution quality
- `#dashboard/profiles` — public project/creator identities, draft/published and setup states
- `#dashboard/integrations` — connected, available, expiring, unavailable and reauthorization states
- `#dashboard/settings` — workspace, members, notifications, billing, privacy, and archival rules

Navigation requirements:

- Update the active item and `aria-current="page"`.
- Update the breadcrumb and page title.
- Preserve browser Back/Forward through the hash route.
- Close the mobile sidebar after navigation.
- Move keyboard focus to the new view heading.
- Never present a clickable-looking sidebar label without a destination or action.

The coded preview also includes contextual actions in every view. These produce visible confirmation feedback, open a relevant state, or navigate to a related view.

### Campaign detail

Header: campaign name, objective, status, dates, primary action. Tabs: Overview, Activities, Creators, Tracking, Report. Include objective-first KPI, trend, source breakdown, deliverable status, and visible attribution limitations.

### Attribution trace

Each node includes event type, timestamp, actor/source, verification state, linked entity, and any attribution-window or qualification rule. Submitted X post URLs are evidence, not platform-verified events. Protect raw personal data.

## Responsive system

Desktop: full marketing grid; 235px dashboard sidebar; four metrics; chart plus attention rail.

Tablet: marketing sections stack; dashboard sidebar collapses to 82px; secondary panels move below primary chart.

Mobile: hero copy before product proof; workflow becomes 2×2 tabs; dashboard sidebar becomes a drawer; metrics become 2×2; tables scroll or become three-field summary rows; attribution becomes vertical. Controls are at least 44px. Attribution limits and errors never disappear.

## Accessibility

- Target WCAG 2.2 AA
- 4.5:1 normal-text contrast; 3:1 large text and essential UI graphics
- Semantic landmarks and heading hierarchy
- Complete keyboard operation
- Visible focus state
- Accessible names for icon controls
- Status never communicated by color alone
- Text summaries for charts
- Respect `prefers-reduced-motion`
- Minimum 44px mobile targets
- Error message is programmatically associated with its control in production

## Motion

Use 120–220ms transitions for hover, selection, and drawers. Use progress animation only when system activity is ongoing. No continuous decorative motion. Matrix nodes do not drift. Reduce-motion removes nonessential movement.

## Content style

Voice: direct, specific, evidence-led, calm.

- Navigation uses nouns: Campaigns, Creators, Analytics.
- Actions use verbs: Create campaign, Invite creator, Reconnect Instagram.
- Errors explain recovery.
- Metrics state the comparison basis.
- Estimates are labeled.
- Use “verified” only when Linkary can explain the verification method.

Good error: “Instagram access expired. Reconnect to resume profile updates.”

Bad error: “Something went wrong.”

## Implementation map

- `index.html`: working Home, Login/Create account, Dashboard, and UI Library preview
- `styles.css`: tokens, marketing, auth, dashboard, component states, responsive behavior
- `script.js`: preview routing, auth states, password visibility, login simulation, workflow tabs, modal, notifications, toast, mobile navigation
- `assets/brand/`: supplied Linkary logo files

The preview is dependency-free except web fonts. It can run directly or through a static server. Convert repeated patterns to typed framework components during application integration.

Recommended component groups:

- `Button`, `IconButton`, `ButtonGroup`
- `Field`, `PasswordField`, `SlugField`, `Select`, `DateRange`, `Switch`
- `StatusBadge`, `Chip`, `Avatar`, `AvatarStack`
- `Alert`, `Toast`, `EmptyState`, `Skeleton`, `Progress`
- `MetricCard`, `ChartFrame`, `DataTable`, `CreatorRow`
- `PublicHeader`, `Sidebar`, `Topbar`, `Tabs`, `Breadcrumbs`
- `CampaignCard`, `DeliverableCard`, `CreatorProfile`, `AttributionTrace`

## Pre-ship checklist

- [ ] Is Linkary positioned around creator campaigns and social growth attribution?
- [ ] Is the supplied Linkary identity used correctly?
- [ ] Is orange reserved for Linkary actions and active signals?
- [ ] Is the primary campaign objective visible?
- [ ] Are period, source, comparison, and freshness included?
- [ ] Are verified and submitted evidence visually distinct?
- [ ] Are zero and unavailable treated differently?
- [ ] Are loading, empty, error, stale, expired, paused, and disabled states covered?
- [ ] Is the interface keyboard operable with visible focus?
- [ ] Is status understandable without color?
- [ ] Does mobile preserve the primary decision and recovery action?
- [ ] Are public identity data and private analytics separated?
- [ ] Are unsupported integrations labeled rather than simulated?
- [ ] Are demo results clearly represented as example data in public use?
