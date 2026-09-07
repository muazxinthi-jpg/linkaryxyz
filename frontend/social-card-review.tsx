import React from 'react';
import { createRoot } from 'react-dom/client';
import ProfileSocialCard from './src/ProfileSocialCard';
const analytics = {
  linkClicks: 9400, sections: 13, connectedChannels: 6,
  x: { handle: 'creator', followers: 18700, source: 'provider' },
  monthlyClicks: [160,240,190,380,420,390,630,760,710,1050,1320,1490].map((count, i) => ({ month: `2025-${String(i + 1).padStart(2, '0')}`, count })),
  platformClicks: [{ platform: 'X', count: 640 }, { platform: 'Telegram', count: 180 }, { platform: 'Farcaster', count: 90 }, { platform: 'YouTube', count: 50 }, { platform: 'Other', count: 40 }],
  proof: { metrics: [{ label: 'Accepted campaigns', value: '17' }, { label: 'Verified outcomes', value: '29' }] },
};
createRoot(document.getElementById('root')!).render(<ProfileSocialCard profile={{ username: 'creator', display_name: 'Creator Name', profile_type: 'creator' }} data={{ displayName: 'Creator Name', bio: 'Content Creator · Educator · Web3 Storyteller', avatarUrl: null, visibility: 'published' }} analytics={analytics} completionPercent={100} />);
