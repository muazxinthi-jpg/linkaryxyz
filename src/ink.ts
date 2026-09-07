export const INK_V1_VERSION = 'ink-v1' as const;
export const INK_MAX_SCORE = 10_000;

export const INK_COMPONENTS = [
  { key: 'network_strength', label: 'Network Strength', maxScore: 3_000 },
  { key: 'verified_contribution', label: 'Verified Contribution', maxScore: 2_500 },
  { key: 'trust_votes', label: 'Trust & Votes', maxScore: 2_000 },
  { key: 'network_economic_footprint', label: 'Network Economic Footprint', maxScore: 1_000 },
  { key: 'integrity_reliability', label: 'Integrity & Reliability', maxScore: 1_500 },
] as const;

export type InkComponentKey = typeof INK_COMPONENTS[number]['key'];
export type InkStatus = 'building' | 'active';

export type InkNetworkEvidence = {
  available: boolean;
  summary: {
    directInvites: number;
    totalNetwork: number;
    creators: number;
    projects: number;
  };
  generations: Array<{ depth: number; members: number }>;
};

export type InkComponentPayload = {
  key: InkComponentKey;
  label: string;
  score: number | null;
  maxScore: number;
  status: InkStatus;
  evidenceSummary: string[];
};

export type InkV1Payload = {
  version: typeof INK_V1_VERSION;
  status: InkStatus;
  totalScore: number | null;
  maxScore: typeof INK_MAX_SCORE;
  methodology: 'evidence_first';
  scoringActivated: boolean;
  explanation: string;
  components: InkComponentPayload[];
};

const configuredMaximum = INK_COMPONENTS.reduce((sum, component) => sum + component.maxScore, 0);
if (configuredMaximum !== INK_MAX_SCORE) {
  throw new Error(`INK component caps must total ${INK_MAX_SCORE}; received ${configuredMaximum}`);
}

function networkEvidenceSummary(network: InkNetworkEvidence): string[] {
  if (!network.available) return ['Seven-generation network evidence is not available yet.'];

  const populatedGenerations = network.generations
    .filter((generation) => generation.members > 0)
    .map((generation) => `Gen ${generation.depth}: ${generation.members} member${generation.members === 1 ? '' : 's'}`);

  return [
    `${network.summary.directInvites} direct invitation${network.summary.directInvites === 1 ? '' : 's'}`,
    `${network.summary.totalNetwork} total network member${network.summary.totalNetwork === 1 ? '' : 's'}`,
    `${network.summary.creators} people / creator${network.summary.creators === 1 ? '' : 's'}`,
    `${network.summary.projects} Project${network.summary.projects === 1 ? '' : 's'}`,
    ...populatedGenerations,
  ];
}

export function buildInkV1Evidence(network: InkNetworkEvidence): InkV1Payload {
  return {
    version: INK_V1_VERSION,
    status: 'building',
    totalScore: null,
    maxScore: INK_MAX_SCORE,
    methodology: 'evidence_first',
    scoringActivated: false,
    explanation: 'INK V1 is collecting evidence. Numeric points remain unpublished until the scoring methodology is locked and versioned, so network size or other signals are not presented as verified reputation without a defined methodology.',
    components: INK_COMPONENTS.map((component) => ({
      key: component.key,
      label: component.label,
      score: null,
      maxScore: component.maxScore,
      status: 'building',
      evidenceSummary: component.key === 'network_strength'
        ? networkEvidenceSummary(network)
        : ['Evidence source is being connected.'],
    })),
  };
}
