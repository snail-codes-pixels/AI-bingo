'use client';
import { useEffect, useRef, useState } from 'react';
import { prompts } from '../lib/prompts';
import type { GameSnapshot } from '../lib/game-types';

type Recognition = { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export default function CallerStrip({ game, answer, myAnswer, onAnswer, onOpenHost }: { game: GameSnapshot; answer: 'yes'|'no'|null; myAnswer: 'yes'|'no'|null; onAnswer: (answer: 'yes'|'no') => Promise<void>; onOpenHost: () => void }) {
  const [listening,setListening]=useState(false),[hint,setHint]=useState('');
  const rec=useRef<Recognition|null>(null);
  const call=game.currentCall;
  const prompt=prompts.find(p=>p.id===call?.promptId);
  useEffect(()=>{rec.current?.stop();rec.current=null;setListening(false);setHint('');},[call?.id]);
  function listen(){
    const browser=window as SpeechWindow;
    const Ctor=browser.SpeechRecognition||browser.webkitSpeechRecognition;
    if(!Ctor){setHint('Voice isn’t available here. Tap Yes or No below.');return;}
    try { const r=new Ctor();rec.current=r;r.lang='en-US';r.interimResults=false;
      r.onresult=e=>{const heard=e.results[0]?.[0]?.transcript?.toLowerCase().trim()||'';setHint(`Heard: “${heard}”`);if(/\byes\b|\byeah\b|\byep\b|\byup\b/.test(heard))onAnswer('yes');else if(/\bno\b|\bnope\b|\bnah\b/.test(heard))onAnswer('no');else setHint('Didn’t catch yes or no. Tap a button below.');};
      r.onerror=()=>{setHint('Couldn’t hear that. Tap Yes or No below.');setListening(false);};r.onend=()=>setListening(false);r.start();setListening(true);setHint('Listening for “yes” or “no”…');
    } catch {setHint('Mic is unavailable. Tap Yes or No below.');setListening(false);}
  }
  if(!call||!prompt) return <section className="caller-strip waiting"><div className="caller-icon">🎤</div><div><span className="kicker">CALLER MODE</span><h2>Waiting for the first confession</h2><p>Your caller will read it aloud. You can answer by voice or tap.</p></div><button className="caller-link" onClick={onOpenHost}>Open caller screen ↗</button></section>;
  const phrase=prompt.text.startsWith("I've ")?prompt.text.slice(5):prompt.text==='AI has genuinely surprised me'?'been genuinely surprised by AI':prompt.text;
  return <section className="caller-strip" aria-label="Current bingo call"><div className="caller-strip-top"><span className="kicker">🎤 CONFESSION {game.calledCount} OF {prompts.length}</span><span className="call-live">● LIVE CALL</span></div><div className="called-statement"><span>{prompt.emoji}</span><h2>Never have I ever… <strong>{phrase}</strong></h2></div><div className="caller-actions"><button className={`answer yes ${myAnswer==='yes'?'chosen':''}`} onClick={()=>onAnswer('yes')} disabled={answer!==null}>🙋 Yes, me!</button><button className={`answer no ${myAnswer==='no'?'chosen':''}`} onClick={()=>onAnswer('no')} disabled={answer!==null}>🙅 Not me</button><button className={`voice ${listening?'listening':''}`} onClick={listen} disabled={listening||answer!==null}>🎙️ {listening?'Listening…':'Say yes / no'}</button></div><div className="call-foot"><span>{hint|| (myAnswer ? `You answered ${myAnswer.toUpperCase()}. ${myAnswer==='yes'?'Square marked if it’s on your card!':''}` : 'A “yes” marks your square automatically if it’s on your card.')}</span><span>🙋 {game.yes} yes &nbsp; 🙅 {game.no} no</span></div></section>;
}
