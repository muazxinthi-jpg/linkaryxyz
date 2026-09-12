import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireAuth, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';
import { loadGrowthIntelligenceData } from '../routes/growthIntelligence';
import { organizationMembership } from '../routes/organizations';
import { executeLinkaryAI } from './runtime';

type GrowthSummaryBody = { organizationId?: string; range?: number; idempotencyKey?: string };
export type GrowthSummary = {
  executiveSummary: string;
  whatWorked: string[];
  needsAttention: string[];
  evidenceQuality: string[];
  nextActions: string[];
  dataGaps: string[];
};
type BaselineRow = { metric_key: string; metric_value: number; observed_at: string; provenance: string };

const OUTPUT_KEYS = ['executiveSummary', 'whatWorked', 'needsAttention', 'evidenceQuality', 'nextActions', 'dataGaps'] as const;

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('invalid_text');
  return value.trim();
}

function list(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 6) throw new Error('invalid_list');
  return value.map((item) => text(item, 260));
}

export function parseGrowthSummary(value: string): GrowthSummary {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_object');
    const row = parsed as Record<string, unknown>;
    if (Object.keys(row).some((key) => !OUTPUT_KEYS.includes(key as typeof OUTPUT_KEYS[number])) || OUTPUT_KEYS.some((key) => !(key in row))) throw new Error('invalid_shape');
    return {
      executiveSummary: text(row.executiveSummary, 500),
      whatWorked: list(row.whatWorked),
      needsAttention: list(row.needsAttention),
      evidenceQuality: list(row.evidenceQuality),
      nextActions: list(row.nextActions),
      dataGaps: list(row.dataGaps),
    };
  } catch {
    throw new HttpError(502, 'LinkaryAI returned an invalid growth summary. Please try again.', 'ai_output_invalid');
  }
}

function clean(value: unknown, max = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function generateGrowthSummary(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<GrowthSummaryBody>(request);
  const organizationId = clean(body.organizationId);
  if (!organizationId) throw new HttpError(400, 'Project is required', 'organization_required');
  const range = Number(body.range ?? 30);
  if (![7, 30, 90].includes(range)) throw new HttpError(400, 'Choose a 7, 30, or 90 day range', 'invalid_growth_range');

  const db = new Db(requireDb(env));
  const membership = await organizationMembership(db, auth.user.id, organizationId);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) {
    throw new HttpError(403, 'Growth Summary requires Project Owner, Admin or Marketing Manager access', 'forbidden');
  }
  const project = await db.first<{ name: string; status: string; verification_status: string }>(
    'SELECT name, status, verification_status FROM organizations WHERE id = ? LIMIT 1', [organizationId],
  );
  if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') {
    throw new HttpError(409, 'Verify the Project before using Growth Summary', 'project_verification_required');
  }

  const [intelligence, baselines] = await Promise.all([
    loadGrowthIntelligenceData(db, organizationId, range),
    db.all<BaselineRow>(
      `SELECT metric_key, metric_value, observed_at, provenance
         FROM project_growth_baselines
        WHERE organization_id = ?
        ORDER BY observed_at DESC, created_at DESC
        LIMIT 50`,
      [organizationId],
    ),
  ]);
  const evidenceSignals = Object.values(intelligence.summary.evidence_mix).reduce((sum, amount) => sum + Number(amount || 0), 0);
  if (intelligence.summary.campaigns === 0 && intelligence.summary.activities === 0 && evidenceSignals === 0 && baselines.length === 0) {
    throw new HttpError(409, 'Add Project growth evidence before asking LinkaryAI for a summary', 'ai_evidence_insufficient');
  }

  const campaignPerformance = intelligence.campaigns.slice(0, 10);
  const activityPerformance = intelligence.activities.slice(0, 15);
  const partnerPerformance = intelligence.partners.slice(0, 10);
  const channelPerformance = intelligence.channels.slice(0, 10);
  const evidence = {
    project: { id: organizationId, name: project.name },
    selectedRangeDays: intelligence.trend_range_days,
    dataScope: {
      aggregateAndBreakdowns: 'Authoritative current Growth Intelligence aggregate and comparison rows',
      trend: `Authoritative ${intelligence.trend_range_days}-day daily trend selected by the founder`,
    },
    summary: intelligence.summary,
    campaignPerformance,
    activityPerformance,
    partnerPerformance,
    channelPerformance,
    includedRows: {
      campaigns: { included: campaignPerformance.length, total: intelligence.campaigns.length },
      activities: { included: activityPerformance.length, total: intelligence.activities.length },
      partners: { included: partnerPerformance.length, total: intelligence.partners.length },
      channels: { included: channelPerformance.length, total: intelligence.channels.length },
    },
    trend: intelligence.trend,
    partnerAttributionProvenance: intelligence.partner_attribution,
    methodology: intelligence.methodology,
    growthBaselines: baselines.map((item) => ({ ...item, metric_value: Number(item.metric_value) })),
    evidenceRules: {
      nullMeansUnavailable: true,
      manualIsNotVerified: true,
      estimatedMustRemainEstimated: true,
      attributionDoesNotProveCausality: true,
    },
  };
  const result = await executeLinkaryAI(env, {
    actorUserId: auth.user.id,
    ownerType: 'organization',
    ownerId: organizationId,
    organizationId,
    taskKey: 'growth_summary',
    input: JSON.stringify(evidence),
    evidenceRefs: [
      `organization:${organizationId}`,
      `growth_range:${range}`,
      `campaigns:${intelligence.campaigns.length}`,
      `activities:${intelligence.activities.length}`,
      `partners:${intelligence.partners.length}`,
      `growth_baselines:${baselines.length}`,
    ],
    validateOutput: (text) => { parseGrowthSummary(text); },
    idempotencyKey: clean(body.idempotencyKey) || `growth-summary:${organizationId}:${range}:${crypto.randomUUID()}`,
  });

  return json({
    summary: parseGrowthSummary(result.text),
    range: intelligence.trend_range_days,
    ai: { eventId: result.eventId, promptVersion: result.promptVersion, usageCredits: result.usageCredits },
  });
}
