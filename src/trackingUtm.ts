export type TrackingUtmContext = {
  campaignName: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  assignmentKind: 'creator' | 'community' | null;
  partnerHandle: string | null;
  partnerName: string | null;
  creatorProfileId: string | null;
  utmTerm?: string | null;
};

export type TrackingUtmResult = {
  effectiveDestinationUrl: string;
  utm: {
    source: string;
    medium: string;
    campaign: string;
    content: string;
    term: string | null;
    linkaryActivity: string;
    linkaryCreator: string | null;
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

function setIfMissing(params: URLSearchParams, key: string, value: string | null | undefined): void {
  if (value && !params.has(key)) params.set(key, value);
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
  const generated = {
    source: compactSlug(sourceFor(context), 'linkary'),
    medium: compactSlug(mediumFor(context), 'growth'),
    campaign: compactSlug(context.campaignName, 'campaign'),
    content: compactSlug(contentSource, 'activity'),
  };

  setIfMissing(destination.searchParams, 'utm_source', generated.source);
  setIfMissing(destination.searchParams, 'utm_medium', generated.medium);
  setIfMissing(destination.searchParams, 'utm_campaign', generated.campaign);
  setIfMissing(destination.searchParams, 'utm_content', generated.content);
  setIfMissing(destination.searchParams, 'utm_term', context.utmTerm?.trim().slice(0, 120));

  // Linkary-owned attribution parameters are authoritative. Unlike customer UTMs,
  // these values must always describe the actual Linkary activity/creator that
  // created the tracked link, even if the destination already contains stale keys.
  destination.searchParams.set('linkary_activity', context.activityId);
  if (context.assignmentKind === 'creator' && context.creatorProfileId) {
    destination.searchParams.set('linkary_creator', context.creatorProfileId);
  } else {
    destination.searchParams.delete('linkary_creator');
  }

  return {
    effectiveDestinationUrl: destination.toString(),
    utm: {
      source: destination.searchParams.get('utm_source') || generated.source,
      medium: destination.searchParams.get('utm_medium') || generated.medium,
      campaign: destination.searchParams.get('utm_campaign') || generated.campaign,
      content: destination.searchParams.get('utm_content') || generated.content,
      term: destination.searchParams.get('utm_term'),
      linkaryActivity: context.activityId,
      linkaryCreator: context.assignmentKind === 'creator' ? context.creatorProfileId : null,
    },
  };
}
