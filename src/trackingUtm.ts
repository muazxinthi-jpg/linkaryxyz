export type TrackingUtmContext = {
  campaignName: string;
  activityTitle: string;
  activityType: string;
  assignmentKind: 'creator' | 'community' | null;
  partnerHandle: string | null;
  partnerName: string | null;
};

export type TrackingUtmResult = {
  effectiveDestinationUrl: string;
  utm: {
    source: string;
    medium: string;
    campaign: string;
    content: string;
  } | null;
};

function compactSlug(value: string, fallback: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function sourceFor(context: TrackingUtmContext): string {
  if (context.assignmentKind === 'community') return 'telegram';
  if (context.assignmentKind === 'creator') return 'x';
  if (context.activityType === 'website') return 'website';
  if (context.activityType === 'video') return 'video';
  return 'linkary';
}

function mediumFor(context: TrackingUtmContext): string {
  if (context.assignmentKind === 'community') return 'community';
  if (context.assignmentKind === 'creator') return 'creator';
  if (context.activityType === 'website') return 'website';
  if (context.activityType === 'video') return 'video';
  return 'growth';
}

export function buildTrackedDestination(destinationUrl: string, context: TrackingUtmContext): TrackingUtmResult {
  let destination: URL;
  try {
    destination = new URL(destinationUrl);
  } catch {
    return { effectiveDestinationUrl: destinationUrl, utm: null };
  }

  if (!['http:', 'https:'].includes(destination.protocol)) {
    return { effectiveDestinationUrl: destinationUrl, utm: null };
  }

  const contentSource = context.partnerHandle || context.partnerName || context.activityTitle;
  const utm = {
    source: compactSlug(sourceFor(context), 'linkary'),
    medium: compactSlug(mediumFor(context), 'growth'),
    campaign: compactSlug(context.campaignName, 'campaign'),
    content: compactSlug(contentSource, 'activity'),
  };

  if (!destination.searchParams.has('utm_source')) destination.searchParams.set('utm_source', utm.source);
  if (!destination.searchParams.has('utm_medium')) destination.searchParams.set('utm_medium', utm.medium);
  if (!destination.searchParams.has('utm_campaign')) destination.searchParams.set('utm_campaign', utm.campaign);
  if (!destination.searchParams.has('utm_content')) destination.searchParams.set('utm_content', utm.content);

  return { effectiveDestinationUrl: destination.toString(), utm };
}
