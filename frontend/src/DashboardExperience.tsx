import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type InviteBalance={owner_type:'profile'|'organization';owner_id:string;available_credits:number;lifetime_used:number};
type Project={id:string;name:string;status:string;verification_status:string;role:string};
type Campaign={id:string;name:string;status:string};
type Summary={conversions:number;value_usd:number;tracked_clicks:number;tracking_links:number;conversion_rate:number};
async function apiJson<T>(path:string):Promise<T>{const response=await fetch(path,{credentials:'same-origin'});if(!response.ok)throw new Error('Request failed');return response.json() as Promise<T>;}
function money(value:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value||0);}

export default function DashboardExperience({me,status}:{me:ProductMe;status:ProductStatus}){
  const creatorFirst=status.profiles.find((p)=>p.profile_type==='creator')||status.profiles[0];
  const stored=window.localStorage.getItem('linkary.active.profile');
  const [profileId,setProfileId]=useState(stored&&status.profiles.some((p)=>p.id===stored)?stored:creatorFirst?.id||'');
  const profile=status.profiles.find((p)=>p.id===profileId)||creatorFirst;
  const [balance,setBalance]=useState<InviteBalance|null>(null);
  const [linkClicks,setLinkClicks]=useState<number|null>(null);
  const [project,setProject]=useState<Project|null>(null);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [totals,setTotals]=useState<Summary>({conversions:0,value_usd:0,tracked_clicks:0,tracking_links:0,conversion_rate:0});
  const [networkCount,setNetworkCount]=useState(0);
  const [walletCount,setWalletCount]=useState(0);
  function changeProfile(id:string){setProfileId(id);window.localStorage.setItem('linkary.active.profile',id);}

  useEffect(()=>{
    if(!profile)return;
    setProject(null);setCampaigns([]);setTotals({conversions:0,value_usd:0,tracked_clicks:0,tracking_links:0,conversion_rate:0});
    void apiJson<{balances:InviteBalance[]}>('/api/invites/balances').then((r)=>{const ownerType=profile.profile_type==='creator'?'profile':'organization';const ownerId=profile.profile_type==='creator'?profile.id:profile.organization_id;setBalance(r.balances.find((b)=>b.owner_type===ownerType&&b.owner_id===ownerId)||null);}).catch(()=>setBalance(null));
    void apiJson<{linkClicks:number}>(`/api/profiles/${encodeURIComponent(profile.id)}/analytics`).then((r)=>setLinkClicks(r.linkClicks)).catch(()=>setLinkClicks(null));
    void apiJson<{destinations:Array<unknown>}>(`/api/profile-wallets?profileId=${encodeURIComponent(profile.id)}`).then((r)=>setWalletCount(r.destinations.length)).catch(()=>setWalletCount(0));
    void apiJson<{organizations:Project[]}>('/api/organizations').then(async(r)=>{
      const selected=profile.organization_id?r.organizations.find((p)=>p.id===profile.organization_id):r.organizations[0];
      if(!selected)return;setProject(selected);
      const [campaignResult,networkResult]=await Promise.all([
        apiJson<{campaigns:Campaign[]}>(`/api/campaigns?organizationId=${encodeURIComponent(selected.id)}`).catch(()=>({campaigns:[]})),
        apiJson<{entities:Array<unknown>}>(`/api/network-entities?organizationId=${encodeURIComponent(selected.id)}`).catch(()=>({entities:[]})),
      ]);
      setCampaigns(campaignResult.campaigns);setNetworkCount(networkResult.entities.length);
      const summaries=await Promise.all(campaignResult.campaigns.slice(0,100).map((campaign)=>apiJson<{summary:Summary}>(`/api/campaign-outcomes?campaignId=${encodeURIComponent(campaign.id)}`).then((x)=>x.summary).catch(()=>null)));
      const aggregate=summaries.reduce<Summary>((acc,item)=>{if(!item)return acc;acc.conversions+=item.conversions;acc.value_usd+=item.value_usd;acc.tracked_clicks+=item.tracked_clicks;acc.tracking_links+=item.tracking_links;return acc;},{conversions:0,value_usd:0,tracked_clicks:0,tracking_links:0,conversion_rate:0});
      aggregate.conversion_rate=aggregate.tracked_clicks?aggregate.conversions/aggregate.tracked_clicks:0;setTotals(aggregate);
    }).catch(()=>undefined);
  },[profileId]);

  if(!profile)return null;
  const projectMode=profile.profile_type==='project';
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack dashboard-next">
      <div className="dashboard-next-hero"><div><span className="ops-kicker">OVERVIEW</span><h1>{projectMode?profile.display_name:`Welcome, ${status.user.displayName||profile.display_name}.`}</h1><p>{projectMode?'See the campaigns, people and evidence connected to this Project.':'Your public identity, network access and attributable work live in one place.'}</p></div><a className="ops-button secondary" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Public profile ↗</a></div>
      {projectMode&&project&&project.verification_status!=='verified_x'&&<section className="ops-callout verification"><div><span className="ops-kicker">ACTION REQUIRED</span><h3>Verify {project.name} with its official X account</h3><p>Campaigns and attribution stay locked until the Project identity is verified.</p></div><NavLink className="ops-button secondary" to="/settings">Open Projects</NavLink></section>}
      <section className="dashboard-next-metrics">
        {projectMode?<><article><span>CAMPAIGNS</span><strong>{campaigns.length}</strong><small>Project campaigns</small></article><article><span>TRACKED CLICKS</span><strong>{totals.tracked_clicks.toLocaleString()}</strong><small>Across campaigns</small></article><article><span>OUTCOMES</span><strong>{totals.conversions.toLocaleString()}</strong><small>{(totals.conversion_rate*100).toFixed(totals.conversion_rate?1:0)}% conversion</small></article><article><span>ATTRIBUTED VALUE</span><strong>{money(totals.value_usd)}</strong><small>Recorded outcomes</small></article></>:<><article><span>PROFILE</span><strong>{profile.visibility==='published'?'Published':'Draft'}</strong><small>{linkClicks===null?'Public identity':`${linkClicks} link click${linkClicks===1?'':'s'}`}</small></article><article><span>INVITES</span><strong>{balance?.available_credits??'—'}</strong><small>{balance?`${balance.lifetime_used} used`:'Network access'}</small></article><article><span>WALLETS</span><strong>{walletCount}</strong><small>Additional destinations</small></article><article><span>PROJECT NETWORK</span><strong>{networkCount}</strong><small>{project?'Available through managed Project':'Connect to a Project'}</small></article></>}
      </section>
      <section className="dashboard-next-actions"><NavLink to="/campaigns"><span>01</span><div><strong>Campaigns</strong><small>Create and manage Project growth campaigns.</small></div><b>→</b></NavLink><NavLink to="/creators"><span>02</span><div><strong>Network</strong><small>Manage creators, communities and campaign relationships.</small></div><b>→</b></NavLink><NavLink to="/tracking"><span>03</span><div><strong>Tracking</strong><small>Measure links, outcomes and attributable value.</small></div><b>→</b></NavLink><NavLink to="/wallets"><span>04</span><div><strong>Wallets</strong><small>Set EVM and Solana reward destinations.</small></div><b>→</b></NavLink></section>
    </div>
  </ProductWorkspace>;
}
