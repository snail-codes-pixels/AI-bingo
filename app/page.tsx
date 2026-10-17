'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import CallerStrip from '../components/CallerStrip';
import { completedLineIds } from '../lib/bingo-lines';
import type { GameSnapshot } from '../lib/game-types';
import { prompts } from '../lib/prompts';

const ids=prompts.map(p=>p.id);
const promptMap=Object.fromEntries(prompts.map(p=>[p.id,p]));
const empty:GameSnapshot={gameId:0,counts:{},participants:0,currentCall:null,calledCount:0,yes:0,no:0,winners:[]};
function shuffleCard(){const a=[...ids];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return [...a.slice(0,12),'free',...a.slice(12,24)];}
function storedLines(key:string){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return new Set<string>(Array.isArray(value)?value.filter((line):line is string=>typeof line==='string'):[]);}catch{return new Set<string>();}}
export default function Home(){
  const [card,setCard]=useState<string[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [game,setGame]=useState<GameSnapshot>(empty);
  const [status,setStatus]=useState('');
  const [bingoQueue,setBingoQueue]=useState<string[]>([]);
  const [busy,setBusy]=useState<Set<string>>(new Set());
  const [answering,setAnswering]=useState<'yes'|'no'|null>(null);
  const [myAnswer,setMyAnswer]=useState<'yes'|'no'|null>(null);
  const [winnerName,setWinnerName]=useState('');
  const [claiming,setClaiming]=useState(false);
  const [announcedLines,setAnnouncedLines]=useState<Set<string>>(new Set());
  const person=useRef('');
  const cardRef=useRef<string[]>([]);
  const selectedRef=useRef<Set<string>>(new Set());
  const notifiedLines=useRef<Set<string>>(new Set());
  const announcedRef=useRef<Set<string>>(new Set());
  const lastCall=useRef<number|null>(null);
  const gameIdRef=useRef<number|null>(null);
  const applySnapshot=useCallback((next:GameSnapshot)=>{
    next.receivedAt=Date.now();
    if(gameIdRef.current!==null&&next.gameId<gameIdRef.current)return;
    if(gameIdRef.current!==null&&next.gameId>gameIdRef.current){
      const id=crypto.randomUUID(),newCard=shuffleCard();person.current=id;cardRef.current=newCard;selectedRef.current=new Set();notifiedLines.current=new Set();announcedRef.current=new Set();lastCall.current=null;
      for(const key of Object.keys(localStorage))if(key.startsWith('ai-bingo-answer-'))localStorage.removeItem(key);
      localStorage.setItem('ai-bingo-id',id);localStorage.setItem('ai-bingo-card',JSON.stringify(newCard));localStorage.setItem('ai-bingo-picked','[]');localStorage.setItem('ai-bingo-notified-lines','[]');localStorage.setItem('ai-bingo-announced-lines','[]');localStorage.removeItem('ai-bingo-announced');
      setCard(newCard);setSelected(new Set());setAnnouncedLines(new Set());setBingoQueue([]);setMyAnswer(null);setStatus('✨ New game! Everyone has a fresh card.');
    }
    gameIdRef.current=next.gameId;localStorage.setItem('ai-bingo-game-id',String(next.gameId));setGame(next);
  },[]);
  const refresh=useCallback(async()=>{try{const r=await fetch('/api/game',{cache:'no-store'});if(!r.ok)throw Error();applySnapshot(await r.json() as GameSnapshot);}catch{setStatus('Live totals are taking a little break.');}},[applySnapshot]);
  const save=useCallback(async(extra:Record<string,unknown>)=>{const r=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({participantId:person.current,gameId:gameIdRef.current,...extra})});const payload=await r.json() as GameSnapshot & {error?:string};if(!r.ok)throw Error(payload.error||'Couldn’t save that.');applySnapshot(payload);setStatus('');return payload;},[applySnapshot]);
  useEffect(()=>{
    let id=localStorage.getItem('ai-bingo-id');if(!id){id=crypto.randomUUID();localStorage.setItem('ai-bingo-id',id);}person.current=id;
    let c:string[]=[];try{c=JSON.parse(localStorage.getItem('ai-bingo-card')||'[]');}catch{/* new card */}
    if(c.length!==25||c[12]!=='free'||new Set(c).size!==25||c.some(x=>x!=='free'&&!ids.includes(x as typeof ids[number]))){c=shuffleCard();localStorage.setItem('ai-bingo-card',JSON.stringify(c));}cardRef.current=c;setCard(c);
    let old:string[]=[];try{old=JSON.parse(localStorage.getItem('ai-bingo-picked')||'[]');}catch{/* empty */}
    const s=new Set(old.filter(x=>ids.includes(x as typeof ids[number])));selectedRef.current=s;setSelected(s);
    const completed=completedLineIds(c,s);
    const notified=storedLines('ai-bingo-notified-lines');if(localStorage.getItem('ai-bingo-notified-lines')===null)completed.forEach(line=>notified.add(line));notifiedLines.current=notified;localStorage.setItem('ai-bingo-notified-lines',JSON.stringify([...notified]));
    const announced=storedLines('ai-bingo-announced-lines');if(localStorage.getItem('ai-bingo-announced-lines')===null&&localStorage.getItem('ai-bingo-announced')==='yes'&&completed[0])announced.add(completed[0]);announcedRef.current=announced;setAnnouncedLines(announced);localStorage.setItem('ai-bingo-announced-lines',JSON.stringify([...announced]));setWinnerName(localStorage.getItem('ai-bingo-name')||'');
    const previousGame=Number(localStorage.getItem('ai-bingo-game-id'));gameIdRef.current=previousGame>0?previousGame:null;
    refresh();
    const timer=setInterval(refresh,2500);return()=>clearInterval(timer);
  },[refresh,save]);
  useEffect(()=>{if(game.gameId>0)save({}).catch(()=>setStatus('Live totals are taking a little break.'));},[game.gameId,save]);
  useEffect(()=>{const callId=game.currentCall?.id??null;if(callId!==lastCall.current){lastCall.current=callId;setMyAnswer(callId?localStorage.getItem(`ai-bingo-answer-${callId}`) as 'yes'|'no'|null:null);}},[game.currentCall?.id]);
  function mark(id:string,checked:boolean){const next=new Set(selectedRef.current);if(checked)next.add(id);else next.delete(id);selectedRef.current=next;setSelected(next);localStorage.setItem('ai-bingo-picked',JSON.stringify([...next]));if(!checked)return;const fresh=completedLineIds(cardRef.current,next).filter(line=>!notifiedLines.current.has(line));if(fresh.length){fresh.forEach(line=>notifiedLines.current.add(line));localStorage.setItem('ai-bingo-notified-lines',JSON.stringify([...notifiedLines.current]));setBingoQueue(old=>[...old,...fresh]);}}
  async function toggle(id:string){if(busy.has(id))return;const checked=!selectedRef.current.has(id);const startedIn=gameIdRef.current;setBusy(old=>new Set(old).add(id));try{await save({promptId:id,checked});if(startedIn===gameIdRef.current)mark(id,checked);}catch(e){setStatus(e instanceof Error?e.message:'That square didn’t save.');}finally{setBusy(old=>{const next=new Set(old);next.delete(id);return next;});}}
  async function answer(value:'yes'|'no'){const call=game.currentCall;if(!call||answering)return;const startedIn=gameIdRef.current;setAnswering(value);try{await save({action:'answer',callId:call.id,answer:value});if(startedIn!==gameIdRef.current)return;localStorage.setItem(`ai-bingo-answer-${call.id}`,value);setMyAnswer(value);if(cardRef.current.includes(call.promptId))mark(call.promptId,value==='yes');else if(value==='yes')setStatus('That confession counts for the team. It isn’t on this card.');}catch(e){setStatus(e instanceof Error?e.message:'Couldn’t save your answer.');}finally{setAnswering(null);}}
  function mix(){const c=shuffleCard();cardRef.current=c;setCard(c);localStorage.setItem('ai-bingo-card',JSON.stringify(c));setBingoQueue([]);}
  async function claim(){const lineId=bingoQueue[0];if(!winnerName.trim()||!lineId)return;const startedIn=gameIdRef.current;setClaiming(true);try{await save({action:'win',name:winnerName.trim(),card:cardRef.current,lineId});if(startedIn!==gameIdRef.current)return;localStorage.setItem('ai-bingo-name',winnerName.trim());const next=new Set(announcedRef.current);next.add(lineId);announcedRef.current=next;setAnnouncedLines(next);localStorage.setItem('ai-bingo-announced-lines',JSON.stringify([...next]));setBingoQueue(old=>old.slice(1));}catch(e){setStatus(e instanceof Error?e.message:'Couldn’t announce your bingo.');}finally{setClaiming(false);}}
  const count=(id:string)=>game.counts[id]||0;
  const top=[...prompts].sort((a,b)=>count(b.id)-count(a.id)).slice(0,4);
  const total=Object.values(game.counts).reduce((a,b)=>a+b,0);
  const votes=game.yes+game.no;
  const yesPercent=votes?Math.round(game.yes/votes*100):0;
  const marked=Math.max(0,card.filter(id=>id==='free'||selected.has(id)).length-1);
  const unclaimedLines=completedLineIds(card,selected).filter(line=>!announcedLines.has(line));
  return <main className="shell">
    <header className="top"><div className="brand"><span className="brand-icon">🤖</span>little big moments</div><div className="top-right"><a className="host-shortcut" href="/caller" target="_blank">🎤 Caller screen</a><span className="players">👋 {game.participants} playing</span><span className="live"><i/> LIVE TEAM BOARD</span></div></header>
    <section className="hero"><span className="eyebrow">✨ THE OFF-SITE ICEBREAKER</span><h1>AI Confessions <em>Bingo</em></h1><p>Say yes or no. Your card marks itself. Your confessions stay anonymous. 🤫</p></section>
    <CallerStrip game={game} answer={answering} myAnswer={myAnswer} onAnswer={answer} onOpenHost={()=>window.open('/caller','_blank')} />
    <div className="layout"><section className="panel game" aria-label="Your bingo card"><div className="panel-head"><h2>✳️ Your bingo card</h2><button className="mix" onClick={mix}>↻ &nbsp; Mix it up</button></div><div className="letters" aria-hidden="true">{['B','I','N','G','O'].map(x=><span key={x}>{x}</span>)}</div><div className="card">{card.map((id,i)=>id==='free'?<div className="tile free" key="free"><span>⭐</span><b>FREE<br/>SPACE!</b></div>:<button key={id+i} className={`tile ${selected.has(id)?'checked':''} ${game.currentCall?.promptId===id?'called':''}`} aria-pressed={selected.has(id)} aria-label={`${promptMap[id].text}. ${selected.has(id)?'Checked':'Not checked'}`} disabled={busy.has(id)} onClick={()=>toggle(id)}><span>{promptMap[id].emoji}</span><b>{promptMap[id].text}</b>{selected.has(id)&&<small>✓</small>}</button>)}</div><div className="game-foot"><span>✦ One row, column or diagonal = BINGO!</span><span className="progress"><i><i style={{width:`${marked/24*100}%`}}/></i>{marked}/24</span></div>{unclaimedLines.length>0&&<button className="claim-again" onClick={()=>setBingoQueue(unclaimedLines)}>🎉 Announce my BINGO! {unclaimedLines.length>1?`(${unclaimedLines.length})`:''}</button>}</section>
    <aside className="side"><section className="panel side-panel"><h2>🙋 This round</h2><p>{game.currentCall?'How the room answered this confession.':'Waiting for the first confession.'}</p>{game.currentCall?<div className="round-results"><div className="round-result-label"><span>Yes, I have</span><strong>{game.yes} · {yesPercent}%</strong></div><div className="round-bar"><i style={{width:`${yesPercent}%`}}/></div><div className="round-result-label"><span>No, I haven&apos;t</span><strong>{game.no} · {votes?100-yesPercent:0}%</strong></div><div className="round-bar no"><i style={{width:`${votes?100-yesPercent:0}%`}}/></div><div className="round-votes">{votes} {votes===1?'answer':'answers'} so far ✨</div></div>:<div className="round-empty">✨ The results will appear here as people answer.</div>}</section><section className="panel side-panel"><h2>The most relatable 👀</h2><p>Anonymous, of course.</p><div className="top-list">{top.map((p,i)=><div className="top-row" key={p.id}><span className="rank">{i+1}</span><span>{p.emoji}</span><b>{p.text}</b><strong>{count(p.id)}</strong></div>)}</div></section><div className="note"><span>💛</span><div><h3>Same room, same game</h3><p>Whether you&apos;re here or joining from afar, everyone&apos;s taps warm up this board. {total} confessions so far!</p></div></div></aside></div>
    <p className="status" role="status">{status}</p>
    {bingoQueue.length>0&&<div className="overlay" role="dialog" aria-modal="true" aria-label="Bingo celebration"><div className="modal"><span className="confetti a">🎉</span><span className="confetti b">✨</span><span className="confetti c">🎊</span><span className="confetti d">⭐</span><div className="big">🥳</div><h2>BINGO!</h2><p>Want to claim a chocolate? Add a name for the caller screen.</p><label className="winner-label">Your name or nickname<input value={winnerName} onChange={e=>setWinnerName(e.target.value)} maxLength={24} placeholder="e.g. Laura" autoFocus /></label><button onClick={claim} disabled={claiming||!winnerName.trim()}>{claiming?'Announcing…':'Announce my BINGO! 🎉'}</button><button className="modal-later" onClick={()=>setBingoQueue([])}>Maybe later</button></div></div>}
  </main>;
}
