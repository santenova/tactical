// Every OpenAI-conform request (chat completions, the orb comment, model pulls)
// registers its AbortController here, so the chat UI can abort them all at once.
const inflight = new Set();

export function createAIRequest() {
  const controller = new AbortController();
  inflight.add(controller);
  return {
    controller,
    signal: controller.signal,
    release: () => inflight.delete(controller),
  };
}

export function abortAllAI() {
  const count = inflight.size;
  inflight.forEach(c => { try { c.abort(); } catch {} });
  inflight.clear();
  return count;
}

export const activeAIRequests = () => inflight.size;