// Asks the local model for a single short spoken remark about a finished answer.
// Keep it brief — this is the orb's one-liner, not a second answer.
export async function fetchOrbComment({ endpoint, model, prompt, result, persona }) {
  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `${persona || 'You are Tactical, a voice orb.'}\nYou just answered and now summarise it out loud in ONE minimal spoken line, ten words maximum. A terse summary only. Do not restate the question, do not repeat the answer, no lists, no preamble, no quotes, no emoji.`,
        },
        {
          role: 'user',
          content: `QUESTION: ${String(prompt).slice(0, 400)}\n\nANSWER: ${String(result).slice(0, 1500)}\n\nYour one-sentence spoken comment:`,
        },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').trim();
  const firstLine = raw.split('\n').map(l => l.trim()).find(Boolean) || '';
  return firstLine.replace(/^["'`]+|["'`]+$/g, '').trim();
}