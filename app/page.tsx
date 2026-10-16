'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import CallerStrip from '../components/CallerStrip';
import type { GameSnapshot } from '../lib/game-types';
import { prompts } from '../lib/prompts';

const ids=prompts.map(p=>p.id);
const promptMap=Object.fromEntries(prompts.map(p=>[p.id,p]));
const empty:GameSnapshot={counts:{},participants:0,currentCall:null,calledCount:0,yes:0,no:0,winners:[]};
function shuffleCard(){const a=[...ids];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return [...a.slice(0,12),'free',...a.slice(12,24)];}
function winningLines(card:string[],selected:Set<string>){const on=(i:number)=>card[i]==='free'||selected.has(card[i]);const lines:string[]=[];for(let n=0;n<5;n++){if([0,1,2,3,4].every(c=>on(n*5+c)))lines.push('r'+n);if([0,1,2,3,4].every(r=>on(r*5+n)))lines.push('c'+n);}if([0,6,12,18,24].every(on))lines.push('d1');if([4,8,12,16,20].every(on))lines.push('d2');return lines;}
export default function Home(){
  const [card,setCard]=useState<string[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [game,setGame]=useState<GameSnapshot>(empty);
  const [focus,setFocus]=useState('thanks');
  const [status,setStatus]=useState('');
  const [bingo,setBingo]=useState(false);
  const [busy,setBusy]=useState<Set<string>>(new Set());
  const [answering,setAnswering]=useState<'yes'|'no'|null>(null);
  const [myAnswer,setMyAnswer]=useState<'yes'|'no'|null>(null);
  const [winnerName,setWinnerName]=useState('');
  const [claiming,setClaiming]=useState(false);
  const [announced,setAnnounced]=useState(false);
  const person=useRef('');
  const cardRef=useRef<string[]>([]);
  const selectedRef=useRef<Set<string>>(new Set());
  const seen=useRef<Set<string>>(new Set());
  const lastCall=useRef<number|null>(null);
  const refresh=useCallback(async()=>{try{const r=await fetch('/api/game',{cache:'no-store'});if(!r.ok)throw Error();setGame(await r.json());setStatus('');}catch{setStatus('Live totals are taking a little break.');}},[]);
  const save=useCallback(async(extra:Record<string,unknown>)=>{const r=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({participantId:person.current,...extra})});const payload=await r.json() as GameSnapshot & {error?:string};if(!r.ok)throw Error(payload.error||'Couldn’t save that.');setGame(payload);setStatus('');return payload;},[]);
  useEffect(()=>{
    let id=localStorage.getItem('ai-bingo-id');if(!id){id=crypto.randomUUID();localStorage.setItem('ai-bingo-id',id);}person.current=id;
    let c:string[]=[];try{c=JSON.parse(localStorage.getItem('ai-bingo-card')||'[]');}catch{/* new card */}
    if(c.length!==25||c[12]!=='free'||new Set(c).size!==25||c.some(x=>x!=='free'&&!ids.includes(x as typeof ids[number]))){c=shuffleCard();localStorage.setItem('ai-bingo-card',JSON.stringify(c));}cardRef.current=c;setCard(c);
    let old:string[]=[];try{old=JSON.parse(localStorage.getItem('ai-bingo-picked')||'[]');}catch{/* empty */}
    const s=new Set(old.filter(x=>ids.includes(x as typeof ids[number])));selectedRef.current=s;setSelected(s);seen.current=new Set(winningLines(c,s));setWinnerName(localStorage.getItem('ai-bingo-name')||'');
    refresh();save({}).catch(()=>setStatus('Live totals are taking a little break.'));
    const timer=setInterval(refresh,2500);return()=>clearInterval(timer);
  },[refresh,save]);
  useEffect(()=>{const callId=game.currentCall?.id??null;if(callId!==lastCall.current){lastCall.current=callId;setMyAnswer(callId?localStorage.getItem(`ai-bingo-answer-${callId}`) as 'yes'|'no'|null:null);}},[game.currentCall?.id]);
  function mark(id:string,checked:boolean){const next=new Set(selectedRef.current);if(checked)next.add(id);else next.delete(id);selectedRef.current=next;setSelected(next);localStorage.setItem('ai-bingo-picked',JSON.stringify([...next]));const lines=winningLines(cardRef.current,next);if(lines.some(line=>!seen.current.has(line)))setBingo(true);seen.current=new Set(lines);}
  async function toggle(id:string){if(busy.has(id))return;const checked=!selectedRef.current.has(id);setBusy(old=>new Set(old).add(id));try{await save({promptId:id,checked});mark(id,checked);}catch(e){setStatus(e instanceof Error?e.message:'That square didn’t save.');}finally{setBusy(old=>{const next=new Set(old);next.delete(id);return next;});}}
  async function answer(value:'yes'|'no'){const call=game.currentCall;if(!call||answering)return;setAnswering(value);try{await save({action:'answer',callId:call.id,answer:value});localStorage.setItem(`ai-bingo-answer-${call.id}`,value);setMyAnswer(value);if(cardRef.current.includes(call.promptId))mark(call.promptId,value==='yes');else if(value==='yes')setStatus('That confession counts for the team. It isn’t on this card.');}catch(e){setStatus(e instanceof Error?e.message:'Couldn’t save your answer.');}finally{setAnswering(null);}}
  function mix(){const c=shuffleCard();cardRef.current=c;setCard(c);localStorage.setItem('ai-bingo-card',JSON.stringify(c));seen.current=new Set(winningLines(c,selectedRef.current));setBingo(false);}
  async function claim(){if(!winnerName.trim())return;setClaiming(true);try{await save({action:'win',name:winnerName.trim(),card:cardRef.current});localStorage.setItem('ai-bingo-name',winnerName.trim());setAnnounced(true);setBingo(false);}catch(e){setStatus(e instanceof Error?e.message:'Couldn’t announce your bingo.');}finally{setClaiming(false);}}
  const count=(id:string)=>game.counts[id]||0;
  const max=Math.max(1,...Object.values(game.counts));
  const top=[...prompts].sort((a,b)=>count(b.id)-count(a.id)).slice(0,4);
  const active=promptMap[focus]||prompts[0];
  const total=Object.values(game.counts).reduce((a,b)=>a+b,0);
  const marked=Math.max(0,card.filter(id=>id==='free'||selected.has(id)).length-1);
  const hasBingo=card.length===25&&winningLines(card,selected).length>0;
  return <main className="shell">
    <header className="top"><div className="brand"><span className="brand-icon">🤖</span>little big moments</div><div className="top-right"><a className="host-shortcut" href="/caller" target="_blank">🎤 Caller screen</a><span className="players">👋 {game.participants} playing</span><span className="live"><i/> LIVE TEAM BOARD</span></div></header>
    <section className="hero"><span className="eyebrow">✨ THE OFF-SITE ICEBREAKER</span><h1>AI Confessions <em>Bingo</em></h1><p>Say yes or no. Your card marks itself. Your confessions stay anonymous. 🤫</p></section>
    <CallerStrip game={game} answer={answering} myAnswer={myAnswer} onAnswer={answer} onOpenHost={()=>window.open('/caller','_blank')} />
    <div className="layout"><section className="panel game" aria-label="Your bingo card"><div className="panel-head"><h2>✳️ Your bingo card</h2><button className="mix" onClick={mix}>↻ &nbsp; Mix it up</button></div><div className="letters" aria-hidden="true">{['B','I','N','G','O'].map(x=><span key={x}>{x}</span>)}</div><div className="card">{card.map((id,i)=>id==='free'?<div className="tile free" key="free"><span>⭐</span><b>FREE<br/>SPACE!</b></div>:<button key={id+i} className={`tile ${selected.has(id)?'checked':''} ${game.currentCall?.promptId===id?'called':''}`} aria-pressed={selected.has(id)} aria-label={`${promptMap[id].text}. ${selected.has(id)?'Checked':'Not checked'}`} disabled={busy.has(id)} onClick={()=>toggle(id)}><span>{promptMap[id].emoji}</span><b>{promptMap[id].text}</b>{selected.has(id)&&<small>✓</small>}</button>)}</div><div className="game-foot"><span>✦ One row, column or diagonal = BINGO!</span><span className="progress"><i><i style={{width:`${marked/24*100}%`}}/></i>{marked}/24</span></div>{hasBingo&&!announced&&<button className="claim-again" onClick={()=>setBingo(true)}>🎉 Announce my BINGO!</button>}</section>
    <aside className="side"><section className="panel side-panel"><h2>Team confession heatmap 🔥</h2><p>The more confessions, the warmer it gets.</p><div className="heat" aria-label="Team confession heatmap">{prompts.map(p=>{const n=count(p.id),level=n?Math.min(4,Math.ceil(n/max*4)):0;return <button key={p.id} className={`cell level${level} ${focus===p.id?'active':''}`} title={p.text} aria-label={`${p.text}: ${n} confessions`} onClick={()=>setFocus(p.id)}/>})}</div><div className="legend">shy <span><i/><i/><i/><i/><i/></span> very relatable</div><div className="detail"><span>{active.emoji}</span><b>{active.text}</b><strong>{count(active.id)} said yes</strong></div></section><section className="panel side-panel"><h2>The most relatable 👀</h2><p>Anonymous, of course.</p><div className="top-list">{top.map((p,i)=><div className="top-row" key={p.id}><span className="rank">{i+1}</span><span>{p.emoji}</span><b>{p.text}</b><strong>{count(p.id)}</strong></div>)}</div></section><div className="note"><span>💛</span><div><h3>Same room, same game</h3><p>Whether you&apos;re here or joining from afar, everyone&apos;s taps warm up this board. {total} confessions so far!</p></div></div></aside></div>
    <p className="status" role="status">{status}</p>
    {bingo&&<div className="overlay" role="dialog" aria-modal="true" aria-label="Bingo celebration"><div className="modal"><span className="confetti a">🎉</span><span className="confetti b">✨</span><span className="confetti c">🎊</span><span className="confetti d">⭐</span><div className="big">🥳</div><h2>BINGO!</h2><p>Want to claim a chocolate? Add a name for the caller screen.</p><label className="winner-label">Your name or nickname<input value={winnerName} onChange={e=>setWinnerName(e.target.value)} maxLength={24} placeholder="e.g. Laura" autoFocus /></label><button onClick={claim} disabled={claiming||!winnerName.trim()}>{claiming?'Announcing…':'Announce my BINGO! 🎉'}</button><button className="modal-later" onClick={()=>setBingo(false)}>Maybe later</button></div></div>}
  </main>;
}
