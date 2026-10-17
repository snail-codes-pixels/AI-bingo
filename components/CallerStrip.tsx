'use client';
import { prompts } from '../lib/prompts';
import type { GameSnapshot } from '../lib/game-types';

export default function CallerStrip({ game, answer, myAnswer, onAnswer, onOpenHost }: { game: GameSnapshot; answer: 'yes'|'no'|null; myAnswer: 'yes'|'no'|null; onAnswer: (answer: 'yes'|'no') => Promise<void>; onOpenHost: () => void }) {
  const call=game.currentCall;
  const prompt=prompts.find(p=>p.id===call?.promptId);
  if(!call||!prompt) return <section className="caller-strip waiting"><div className="caller-icon">🎤</div><div><span className="kicker">CALLER MODE</span><h2>Waiting for the first confession</h2><p>Your caller will read it aloud. Tap Yes or No to answer.</p></div><button className="caller-link" onClick={onOpenHost}>Open caller screen ↗</button></section>;
  const phrase=prompt.text.startsWith("I've ")?prompt.text.slice(5):prompt.text==='AI has genuinely surprised me'?'been genuinely surprised by AI':prompt.text;
  return <section className="caller-strip" aria-label="Current bingo call"><div className="caller-strip-top"><span className="kicker">🎤 CONFESSION {game.calledCount} OF {prompts.length}</span><span className="call-live">● LIVE CALL</span></div><div className="called-statement"><span>{prompt.emoji}</span><h2>Never have I ever… <strong>{phrase}</strong></h2></div><div className="caller-actions"><button className={`answer yes ${myAnswer==='yes'?'chosen':''}`} onClick={()=>onAnswer('yes')} disabled={answer!==null}>🙋 Yes, me!</button><button className={`answer no ${myAnswer==='no'?'chosen':''}`} onClick={()=>onAnswer('no')} disabled={answer!==null}>🙅 Not me</button></div><div className="call-foot"><span>{myAnswer ? `You answered ${myAnswer.toUpperCase()}. ${myAnswer==='yes'?'Square marked if it’s on your card!':''}` : 'A “yes” marks your square automatically if it’s on your card.'}</span><span>🙋 {game.yes} yes &nbsp; 🙅 {game.no} no</span></div></section>;
}
