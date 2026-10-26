'use client';
import { useEffect, useRef, useState } from 'react';
import { prompts } from '../lib/prompts';
import type { GameSnapshot } from '../lib/game-types';

export function useAnswerSeconds(game: GameSnapshot) {
  const [now, setNow] = useState(0);
  const shown = useRef<{ call: string; seconds: number | null }>({ call: '', seconds: null });
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const call = `${game.gameId}-${game.currentCall?.id ?? ''}`;
  const remaining = game.currentCall?.remainingMs;
  if (shown.current.call !== call) shown.current = { call, seconds: null };
  if (remaining == null || !now || !game.receivedAt) return null;
  const seconds = Math.max(0, Math.ceil((remaining - (now - game.receivedAt)) / 1000));
  // A delayed poll must never reopen an answer window that already reached zero.
  shown.current.seconds = shown.current.seconds === null ? seconds : Math.min(shown.current.seconds, seconds);
  return shown.current.seconds;
}

export function AnswerClock({ seconds, host = false }: { seconds: number | null; host?: boolean }) {
  if (seconds === null) return null;
  return <div className={`answer-clock ${host ? 'answer-clock-host' : ''} ${seconds <= 10 ? 'answer-clock-soon' : ''} ${seconds === 0 ? 'answer-clock-done' : ''}`} role="timer" aria-label={seconds === 0 ? 'Answer time is up' : `${seconds} seconds to answer`}>
    <span aria-hidden="true">⏳</span><strong>{seconds === 0 ? 'Time’s up!' : `${seconds}s`}</strong><span>{seconds === 0 ? host ? 'Call the next confession when ready' : 'Wait for the next confession' : 'to answer'}</span>
  </div>;
}

export default function CallerStrip({ game, answer, myAnswer, onAnswer, onOpenHost }: { game: GameSnapshot; answer: 'yes'|'no'|null; myAnswer: 'yes'|'no'|null; onAnswer: (answer: 'yes'|'no') => Promise<void>; onOpenHost: () => void }) {
  const seconds=useAnswerSeconds(game);
  const call=game.currentCall;
  const prompt=prompts.find(p=>p.id===call?.promptId);
  if(!call||!prompt) return <section className="caller-strip waiting"><div className="caller-icon">🎤</div><div><span className="kicker">CALLER MODE</span><h2>Waiting for the first confession</h2><p>Your caller will read it aloud. Choose “Yes, I have” or “No, I haven’t”.</p></div><button className="caller-link" onClick={onOpenHost}>Open caller screen ↗</button></section>;
  const phrase=prompt.text.startsWith("I've ")?prompt.text.slice(5):prompt.text==='AI has genuinely surprised me'?'been genuinely surprised by AI':prompt.text;
  const picked=myAnswer??answer;
  const locked=picked!==null||seconds===0;
  return <section className="caller-strip" aria-label="Current bingo call"><div className="caller-strip-top"><span className="kicker">🎤 CONFESSION {game.calledCount} OF {prompts.length}</span><span className="call-live">● LIVE CALL</span></div><div className="called-statement"><span>{prompt.emoji}</span><h2>Never have I ever… <strong>{phrase}</strong></h2></div><AnswerClock seconds={seconds}/><div className="caller-actions"><button className={`answer yes ${picked==='yes'?'chosen':''}`} aria-pressed={picked==='yes'} onClick={()=>onAnswer('yes')} disabled={locked}>🙋 Yes, I have{picked==='yes'&&<span className="answer-picked" aria-hidden="true">✓</span>}</button><button className={`answer no ${picked==='no'?'chosen':''}`} aria-pressed={picked==='no'} onClick={()=>onAnswer('no')} disabled={locked}>🙅 No, I haven&apos;t{picked==='no'&&<span className="answer-picked" aria-hidden="true">✓</span>}</button></div><div className="call-foot"><span>{answer?'Saving your answer…':myAnswer?`Answer locked in. ${myAnswer==='yes'?'Your square marks itself if it’s on your card.':''}`:seconds===0?'Answer time has ended.':'Choose one answer above. A “yes” marks your square if it’s on your card.'}</span><span>🙋 {game.yes} yes &nbsp; 🙅 {game.no} no</span></div></section>;
}
