import { timingSafeEqual } from 'node:crypto';
import { completedLineIds } from '../../../lib/bingo-lines';
import { getPool } from '../../../lib/db';
import { promptIds, prompts } from '../../../lib/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const gameLock = "SELECT pg_advisory_xact_lock(hashtext('ai-confessions-bingo-caller'))";

async function snapshot(participantId?: string) {
  const pool = getPool();
  const [state, counts, participants, latest, called, winners] = await Promise.all([
    pool.query<{ game_id: string }>('SELECT game_id FROM game_state WHERE id=1'),
    pool.query<{ prompt_id: string; count: string }>(`SELECT calls.prompt_id, count(*) AS count FROM call_answers
      JOIN calls ON calls.id = call_answers.call_id WHERE call_answers.answer = 'yes' GROUP BY calls.prompt_id`),
    pool.query<{ count: string }>('SELECT count(*) AS count FROM participants'),
    pool.query<{ id: string; prompt_id: string; remaining_ms: number | null }>(`SELECT id, prompt_id,
      CASE WHEN answer_ends_at IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(EPOCH FROM (answer_ends_at - now())) * 1000)::integer END AS remaining_ms
      FROM calls ORDER BY id DESC LIMIT 1`),
    pool.query<{ count: string }>('SELECT count(*) AS count FROM calls'),
    pool.query<{ id: string; display_name: string; won_at: Date; win_number: string }>(`SELECT id, display_name, won_at,
      row_number() OVER (PARTITION BY participant_id ORDER BY won_at, id) AS win_number
      FROM winner_events ORDER BY won_at DESC, id DESC LIMIT 20`),
  ]);
  const current = latest.rows[0];
  let yes = 0, no = 0;
  if (current) {
    const answers = await pool.query<{ answer: string; count: string }>('SELECT answer, count(*) AS count FROM call_answers WHERE call_id = $1 GROUP BY answer', [current.id]);
    yes = Number(answers.rows.find(row => row.answer === 'yes')?.count ?? 0);
    no = Number(answers.rows.find(row => row.answer === 'no')?.count ?? 0);
  }
  const markedPromptIds = participantId ? (await pool.query<{ prompt_id: string }>(`SELECT calls.prompt_id FROM call_answers
    JOIN calls ON calls.id = call_answers.call_id WHERE call_answers.participant_id = $1 AND call_answers.answer = 'yes'`, [participantId])).rows.map(row => row.prompt_id) : undefined;
  return {
    gameId: Number(state.rows[0]?.game_id ?? 1),
    counts: Object.fromEntries(counts.rows.map(row => [row.prompt_id, Number(row.count)])),
    participants: Number(participants.rows[0]?.count ?? 0),
    currentCall: current ? { id: Number(current.id), promptId: current.prompt_id, remainingMs: current.remaining_ms } : null,
    calledCount: Number(called.rows[0]?.count ?? 0), yes, no, markedPromptIds,
    winners: winners.rows.map(row => ({ id: Number(row.id), name: row.display_name, wonAt: row.won_at, winNumber: Number(row.win_number) })),
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
    if (data.action === 'next' || data.action === 'reset') {
      if (!validPin(data.callerPin)) return Response.json({ error: 'Caller PIN didn’t match.' }, { status: 403 });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(gameLock);
        if (data.action === 'reset') {
          await client.query('DELETE FROM winner_events');
          await client.query('DELETE FROM winners');
          await client.query('DELETE FROM call_answers');
          await client.query('DELETE FROM calls');
          await client.query('DELETE FROM confessions');
          await client.query('DELETE FROM participants');
          await client.query('UPDATE game_state SET game_id=game_id+1 WHERE id=1');
        } else {
          const called = await client.query<{ prompt_id: string }>('SELECT prompt_id FROM calls');
          const used = new Set(called.rows.map(row => row.prompt_id));
          const remaining = prompts.filter(prompt => !used.has(prompt.id));
          if (!remaining.length) { await client.query('ROLLBACK'); return Response.json({ error: 'Every confession has been called.' }, { status: 409 }); }
          const choice = remaining[Math.floor(Math.random() * remaining.length)];
          await client.query("INSERT INTO calls(prompt_id, answer_ends_at) VALUES ($1, now() + interval '30 seconds')", [choice.id]);
        }
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      return Response.json(await snapshot(), { headers: noStore });
    }
    if (typeof data.participantId !== 'string' || !uuid.test(data.participantId)) return Response.json({ error: 'Invalid participant.' }, { status: 400 });
    const participantId = data.participantId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(gameLock);
      const state = await client.query<{ game_id: string }>('SELECT game_id FROM game_state WHERE id=1');
      if (Number(state.rows[0]?.game_id) !== data.gameId) {
        await client.query('ROLLBACK');
        return Response.json({ error: 'A new game has started. Your card will refresh now.' }, { status: 409 });
      }
      await client.query('INSERT INTO participants(id) VALUES ($1) ON CONFLICT DO NOTHING', [participantId]);
      if (data.action === 'answer') {
        if (data.answer !== 'yes' && data.answer !== 'no') { await client.query('ROLLBACK'); return Response.json({ error: 'Answer yes or no.' }, { status: 400 }); }
        const latest = await client.query<{ id: string; prompt_id: string; answer_open: boolean }>('SELECT id, prompt_id, (answer_ends_at IS NULL OR answer_ends_at > now()) AS answer_open FROM calls ORDER BY id DESC LIMIT 1');
        const call = latest.rows[0];
        if (!call || Number(call.id) !== data.callId) { await client.query('ROLLBACK'); return Response.json({ error: 'That round has moved on. Try the current one.' }, { status: 409 }); }
        if (!call.answer_open) { await client.query('ROLLBACK'); return Response.json({ error: 'Time is up for this confession. Wait for the next one.' }, { status: 409 }); }
        await client.query('INSERT INTO call_answers(call_id, participant_id, answer) VALUES ($1,$2,$3) ON CONFLICT(call_id, participant_id) DO UPDATE SET answer=EXCLUDED.answer', [call.id, participantId, data.answer]);
        if (data.answer === 'yes') await client.query('INSERT INTO confessions(participant_id, prompt_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [participantId, call.prompt_id]);
        else await client.query('DELETE FROM confessions WHERE participant_id=$1 AND prompt_id=$2', [participantId, call.prompt_id]);
      } else if (data.action === 'win') {
        const name = typeof data.name === 'string' ? data.name.trim().slice(0,24) : '';
        const card = data.card;
        const lineId = data.lineId;
        if (!name || typeof lineId !== 'string' || !Array.isArray(card) || card.length !== 25 || card[12] !== 'free' || new Set(card).size !== 25 || card.some(id => typeof id !== 'string' || (id !== 'free' && !promptIds.has(id)))) { await client.query('ROLLBACK'); return Response.json({ error: 'Add a name to claim your bingo.' }, { status: 400 }); }
        const markedRows = await client.query<{ prompt_id: string }>(`SELECT calls.prompt_id FROM call_answers
          JOIN calls ON calls.id = call_answers.call_id WHERE call_answers.participant_id=$1 AND call_answers.answer='yes'`, [participantId]);
        const marked = new Set(markedRows.rows.map(row => row.prompt_id));
        if (!completedLineIds(card, marked).includes(lineId)) { await client.query('ROLLBACK'); return Response.json({ error: 'That bingo line is still one square away.' }, { status: 400 }); }
        await client.query('INSERT INTO winner_events(participant_id,line_id,display_name) VALUES ($1,$2,$3) ON CONFLICT(participant_id,line_id) DO NOTHING', [participantId,lineId,name]);
      } else if (data.promptId !== undefined) {
        await client.query('ROLLBACK');
        return Response.json({ error: 'Squares mark when you answer a called confession.' }, { status: 400 });
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return Response.json(await snapshot(participantId), { headers: noStore });
  } catch (error) {
    console.error('Game API error:', error);
    return Response.json({ error: 'Couldn’t save that. Try again.' }, { status: 500 });
  }
}
