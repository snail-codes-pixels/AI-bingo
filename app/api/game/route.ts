import { timingSafeEqual } from 'node:crypto';
import { getPool } from '../../../lib/db';
import { promptIds, prompts } from '../../../lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function snapshot() {
  const pool = getPool();
  const [counts, participants, latest, called, winners] = await Promise.all([
    pool.query<{ prompt_id: string; count: string }>('SELECT prompt_id, count(*) AS count FROM confessions GROUP BY prompt_id'),
    pool.query<{ count: string }>('SELECT count(*) AS count FROM participants'),
    pool.query<{ id: string; prompt_id: string }>('SELECT id, prompt_id FROM calls ORDER BY id DESC LIMIT 1'),
    pool.query<{ count: string }>('SELECT count(*) AS count FROM calls'),
    pool.query<{ display_name: string; won_at: Date }>('SELECT display_name, won_at FROM winners ORDER BY won_at DESC LIMIT 20'),
  ]);
  const current = latest.rows[0];
  let yes = 0, no = 0;
  if (current) {
    const answers = await pool.query<{ answer: string; count: string }>('SELECT answer, count(*) AS count FROM call_answers WHERE call_id = $1 GROUP BY answer', [current.id]);
    yes = Number(answers.rows.find(row => row.answer === 'yes')?.count ?? 0);
    no = Number(answers.rows.find(row => row.answer === 'no')?.count ?? 0);
  }
  return {
    counts: Object.fromEntries(counts.rows.map(row => [row.prompt_id, Number(row.count)])),
    participants: Number(participants.rows[0]?.count ?? 0),
    currentCall: current ? { id: Number(current.id), promptId: current.prompt_id } : null,
    calledCount: Number(called.rows[0]?.count ?? 0), yes, no,
    winners: winners.rows.map(row => ({ name: row.display_name, wonAt: row.won_at })),
  };
}
function validPin(candidate: unknown) {
  const expected = process.env.CALLER_PIN;
  if (!expected || typeof candidate !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(candidate);
  return a.length === b.length && timingSafeEqual(a,b);
}
export async function GET() {
  try { return Response.json(await snapshot(), { headers: noStore }); }
  catch { return Response.json({ error: 'Couldn’t load the team board.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    const data = await request.json() as Record<string, unknown>;
    const pool = getPool();
    if (data.action === 'next') {
      if (!validPin(data.callerPin)) return Response.json({ error: 'Caller PIN didn’t match.' }, { status: 403 });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('ai-confessions-bingo-caller'))");
        const called = await client.query<{ prompt_id: string }>('SELECT prompt_id FROM calls');
        const used = new Set(called.rows.map(row => row.prompt_id));
        const remaining = prompts.filter(prompt => !used.has(prompt.id));
        if (!remaining.length) { await client.query('ROLLBACK'); return Response.json({ error: 'Every confession has been called.' }, { status: 409 }); }
        const choice = remaining[Math.floor(Math.random() * remaining.length)];
        await client.query('INSERT INTO calls(prompt_id) VALUES ($1)', [choice.id]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      return Response.json(await snapshot(), { headers: noStore });
    }
    if (typeof data.participantId !== 'string' || !uuid.test(data.participantId)) return Response.json({ error: 'Invalid participant.' }, { status: 400 });
    const participantId = data.participantId;
    await pool.query('INSERT INTO participants(id) VALUES ($1) ON CONFLICT DO NOTHING', [participantId]);
    if (data.action === 'answer') {
      if (data.answer !== 'yes' && data.answer !== 'no') return Response.json({ error: 'Answer yes or no.' }, { status: 400 });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('ai-confessions-bingo-caller'))");
        const latest = await client.query<{ id: string; prompt_id: string }>('SELECT id, prompt_id FROM calls ORDER BY id DESC LIMIT 1');
        const call = latest.rows[0];
        if (!call || Number(call.id) !== data.callId) { await client.query('ROLLBACK'); return Response.json({ error: 'That round has moved on. Try the current one.' }, { status: 409 }); }
        await client.query('INSERT INTO call_answers(call_id, participant_id, answer) VALUES ($1,$2,$3) ON CONFLICT(call_id, participant_id) DO UPDATE SET answer=EXCLUDED.answer', [call.id, participantId, data.answer]);
        if (data.answer === 'yes') await client.query('INSERT INTO confessions(participant_id, prompt_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [participantId, call.prompt_id]);
        else await client.query('DELETE FROM confessions WHERE participant_id=$1 AND prompt_id=$2', [participantId, call.prompt_id]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } else if (data.action === 'win') {
      const name = typeof data.name === 'string' ? data.name.trim().slice(0,24) : '';
      const card = data.card;
      if (!name || !Array.isArray(card) || card.length !== 25 || card[12] !== 'free' || new Set(card).size !== 25 || card.some(id => typeof id !== 'string' || (id !== 'free' && !promptIds.has(id)))) return Response.json({ error: 'Add a name to claim your bingo.' }, { status: 400 });
      const markedRows = await pool.query<{ prompt_id: string }>('SELECT prompt_id FROM confessions WHERE participant_id=$1', [participantId]);
      const marked = new Set(markedRows.rows.map(row => row.prompt_id));
      const on = (index: number) => card[index] === 'free' || marked.has(card[index]);
      let won = false;
      for (let n=0;n<5;n++) if ([0,1,2,3,4].every(c=>on(n*5+c)) || [0,1,2,3,4].every(r=>on(r*5+n))) won = true;
      if ([0,6,12,18,24].every(on) || [4,8,12,16,20].every(on)) won = true;
      if (!won) return Response.json({ error: 'Your bingo is still one square away.' }, { status: 400 });
      await pool.query('INSERT INTO winners(participant_id,display_name) VALUES ($1,$2) ON CONFLICT(participant_id) DO UPDATE SET display_name=EXCLUDED.display_name', [participantId,name]);
    } else if (data.promptId !== undefined) {
      if (typeof data.promptId !== 'string' || !promptIds.has(data.promptId) || typeof data.checked !== 'boolean') return Response.json({ error: 'Invalid square.' }, { status: 400 });
      if (data.checked) await pool.query('INSERT INTO confessions(participant_id,prompt_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [participantId,data.promptId]);
      else await pool.query('DELETE FROM confessions WHERE participant_id=$1 AND prompt_id=$2', [participantId,data.promptId]);
    }
    return Response.json(await snapshot(), { headers: noStore });
  } catch (error) {
    console.error('Game API error:', error);
    return Response.json({ error: 'Couldn’t save that. Try again.' }, { status: 500 });
  }
}
