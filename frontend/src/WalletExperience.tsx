import { useEffect, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type Destination = { id: string; chain_family: 'evm' | 'solana'; address: string; status: string; updated_at: string };
type EmbeddedWallet = { chain_family: string; address: string; account_type: string; is_primary: number };
class ApiError extends Error { constructor(readonly code: string, message: string) { super(message); } }
async function apiJson<T>(path: string, init?: RequestInit): Promise<T> { const headers = new Headers(init?.headers); if (init?.body && !headers.has('content-type')) headers.set('content-type','application/json'); const response = await fetch(path,{...init,headers,credentials:'same-origin'}); const payload=(await response.json().catch(()=>({}))) as {error?:string;message?:string}&T; if(!response.ok) throw new ApiError(payload.error||'request_failed',payload.message||'Request failed'); return payload; }
function cookie(name:string){const match=document.cookie.split('; ').find((part)=>part.startsWith(`${name}=`));return match?decodeURIComponent(match.slice(name.length+1)):null;}
function short(address:string){return address.length>18?`${address.slice(0,8)}…${address.slice(-7)}`:address;}
function safeError(error:unknown){if(!(error instanceof ApiError))return 'The wallet destination could not be saved. Please try again.';if(error.code==='invalid_evm_address')return 'Enter a valid EVM wallet address.';if(error.code==='invalid_solana_address')return 'Enter a valid Solana wallet address.';if(error.code==='forbidden')return 'Your current role cannot manage wallet destinations for this profile.';return 'The wallet destination could not be saved. Please try again.';}

export default function WalletExperience({me,status}:{me:ProductMe;status:ProductStatus}){
  const creatorFirst=status.profiles.find((p)=>p.profile_type==='creator')||status.profiles[0];
  const stored=window.localStorage.getItem('linkary.active.profile');
  const [profileId,setProfileId]=useState(stored&&status.profiles.some((p)=>p.id===stored)?stored:creatorFirst?.id||'');
  const profile=status.profiles.find((p)=>p.id===profileId)||creatorFirst;
  const [destinations,setDestinations]=useState<Destination[]>([]);
  const [embedded,setEmbedded]=useState<EmbeddedWallet[]>([]);
  const [form,setForm]=useState({evm:'',solana:''});
  const [editing,setEditing]=useState<'evm'|'solana'|null>(null);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');

  function changeProfile(id:string){setProfileId(id);window.localStorage.setItem('linkary.active.profile',id);}
  async function load(){if(!profile)return;setMessage('');try{const result=await apiJson<{destinations:Destination[];embeddedWallets:EmbeddedWallet[]}>(`/api/profile-wallets?profileId=${encodeURIComponent(profile.id)}`);setDestinations(result.destinations);setEmbedded(result.embeddedWallets);setForm({evm:result.destinations.find((d)=>d.chain_family==='evm')?.address||'',solana:result.destinations.find((d)=>d.chain_family==='solana')?.address||''});}catch{setMessage('Wallet settings are temporarily unavailable. Please try again shortly.');}}
  useEffect(()=>{void load();},[profileId]);
  async function save(chainFamily:'evm'|'solana'){if(!profile)return;const csrf=cookie('__Host-linkary_csrf');if(!csrf)return;setBusy(chainFamily);setMessage('');try{await apiJson('/api/profile-wallets',{method:'POST',headers:{'x-csrf-token':csrf},body:JSON.stringify({profileId:profile.id,chainFamily,address:form[chainFamily],action:'save'})});setEditing(null);setMessage(`${chainFamily==='evm'?'EVM':'Solana'} destination saved.`);await load();}catch(error){setMessage(safeError(error));}finally{setBusy('');}}
  async function remove(chainFamily:'evm'|'solana'){if(!profile||!window.confirm(`Remove this ${chainFamily==='evm'?'EVM':'Solana'} reward destination?`))return;const csrf=cookie('__Host-linkary_csrf');if(!csrf)return;setBusy(chainFamily);try{await apiJson('/api/profile-wallets',{method:'POST',headers:{'x-csrf-token':csrf},body:JSON.stringify({profileId:profile.id,chainFamily,action:'remove'})});setEditing(null);setMessage('Reward destination removed.');await load();}catch(error){setMessage(safeError(error));}finally{setBusy('');}}
  async function copy(address:string){try{await navigator.clipboard.writeText(address);setMessage('Wallet address copied.');}catch{setMessage('Select the address and copy it manually.');}}

  if(!profile)return null;
  const evm=destinations.find((d)=>d.chain_family==='evm');const solana=destinations.find((d)=>d.chain_family==='solana');const primary=embedded.find((w)=>w.is_primary)||embedded[0];
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack wallet-workspace">
      <div className="ops-heading-row"><div><span className="ops-kicker">WALLETS</span><h1>Wallet destinations</h1><p>Use your Linkary wallet, and optionally add EVM or Solana addresses where future rewards and airdrops can be delivered.</p></div></div>
      <section className="wallet-warning"><div className="wallet-warning-icon">!</div><div><strong>Check every address carefully before saving.</strong><p>Additional wallet addresses do not need to be connected to Linkary. If a Project sends rewards or airdrops to a saved destination, the assets may go directly to that address. Blockchain transfers to the wrong address cannot be reversed.</p></div></section>
      {message&&<div className="ops-message">{message}</div>}
      <section className="wallet-grid">
        <article className="wallet-card embedded"><div className="wallet-card-top"><span className="wallet-chain">BASE</span><span className="wallet-managed">LINKARY WALLET</span></div><h2>Your Linkary wallet</h2><p>This is your default wallet inside Linkary. You can use it without adding another address.</p>{primary?<div className="wallet-address"><code>{primary.address}</code><button onClick={()=>void copy(primary.address)}>Copy</button></div>:<div className="wallet-empty-address">Your wallet address will appear here when setup is complete.</div>}<div className="wallet-footnote">Ready to use</div></article>
        <article className="wallet-card"><div className="wallet-card-top"><span className="wallet-chain">EVM</span><span className={`wallet-state ${evm?'saved':''}`}>{evm?'Saved':'Optional'}</span></div><h2>Additional EVM wallet</h2><p>Add one EVM address you control for supported Ethereum-compatible rewards and airdrops.</p>{editing==='evm'||!evm?<div className="wallet-editor"><input value={form.evm} onChange={(e)=>setForm({...form,evm:e.target.value.trim()})} placeholder="0x..." spellCheck={false}/><div><button className="ops-button ghost" onClick={()=>{setEditing(null);setForm({...form,evm:evm?.address||''});}}>Cancel</button><button className="ops-button primary" disabled={!form.evm||busy==='evm'} onClick={()=>void save('evm')}>{busy==='evm'?'Saving...':'Save EVM address'}</button></div></div>:<><div className="wallet-address"><code title={evm.address}>{short(evm.address)}</code><button onClick={()=>void copy(evm.address)}>Copy</button></div><div className="wallet-actions"><button onClick={()=>setEditing('evm')}>Change</button><button className="danger" onClick={()=>void remove('evm')}>Remove</button></div></>}</article>
        <article className="wallet-card"><div className="wallet-card-top"><span className="wallet-chain">SOLANA</span><span className={`wallet-state ${solana?'saved':''}`}>{solana?'Saved':'Optional'}</span></div><h2>Additional Solana wallet</h2><p>Add the Solana address you control and want Projects to use for supported rewards and airdrops.</p>{editing==='solana'||!solana?<div className="wallet-editor"><input value={form.solana} onChange={(e)=>setForm({...form,solana:e.target.value.trim()})} placeholder="Solana address" spellCheck={false}/><div><button className="ops-button ghost" onClick={()=>{setEditing(null);setForm({...form,solana:solana?.address||''});}}>Cancel</button><button className="ops-button primary" disabled={!form.solana||busy==='solana'} onClick={()=>void save('solana')}>{busy==='solana'?'Saving...':'Save Solana address'}</button></div></div>:<><div className="wallet-address"><code title={solana.address}>{short(solana.address)}</code><button onClick={()=>void copy(solana.address)}>Copy</button></div><div className="wallet-actions"><button onClick={()=>setEditing('solana')}>Change</button><button className="danger" onClick={()=>void remove('solana')}>Remove</button></div></>}</article>
      </section>
      <section className="wallet-note"><strong>Only save wallets you control.</strong><span>Saving an address tells Linkary where you prefer eligible rewards to be sent. It does not connect that wallet to Linkary or give Linkary control of it.</span></section>
    </div>
  </ProductWorkspace>;
}
