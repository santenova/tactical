// A conversation is one thread of user + assistant messages, kept in local storage.
const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES = 200;

export function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function titleFrom(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

export function createConversation(text) {
  const now = Date.now();
  return { id: makeId(), title: titleFrom(text), created: now, updated: now, messages: [] };
}

// Appends a message and floats the thread to the top of the history
export function addMessage(list, conversationId, message) {
  return list
    .map(c => (c.id !== conversationId ? c : {
      ...c,
      updated: Date.now(),
      messages: [...c.messages, message].slice(-MAX_MESSAGES),
    }))
    .sort((a, b) => b.updated - a.updated);
}

export function answerMessage(content, meta, extra = {}) {
  return { id: makeId(), role: 'assistant', content, ts: Date.now(), ...(meta ? { meta } : {}), ...extra };
}

export function conversationMessages(list, conversationId) {
  return list.find(c => c.id === conversationId)?.messages || [];
}

// Finds the thread the next message belongs to, or starts a new one
export function ensureConversation(list, conversationId, text) {
  if (conversationId && list.some(c => c.id === conversationId)) return { list, id: conversationId };
  const conv = createConversation(text);
  return { list: [conv, ...list].slice(0, MAX_CONVERSATIONS), id: conv.id };
}

// The turns to send as context — everything already answered in this thread
export function historyFor(messages, limit = 12) {
  return messages
    .filter(m => m.content && !m.stopped && !m.streaming)
    .slice(-limit)
    .map(m => ({ role: m.role, content: m.content }));
}

export function removeConversation(list, conversationId) {
  return list.filter(c => c.id !== conversationId);
}