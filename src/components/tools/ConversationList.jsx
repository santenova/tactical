import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

export default function ConversationList({ conversations = [], activeId, onSelect, onNew, onDelete }) {
  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <select
        className="px-2 py-1 rounded text-xs min-w-0"
        value={activeId || ''}
        onChange={e => onSelect(e.target.value)}
        title="Conversation history"
        data-desc="Conversation History"
        style={{ flex: 1, maxWidth: 230 }}
      >
        {conversations.length === 0 && <option value="">NO CONVERSATIONS</option>}
        {conversations.map(c => (
          <option key={c.id} value={c.id}>
            {c.title} · {c.messages.length}
          </option>
        ))}
      </select>
      <button className="neon-btn px-2 py-1 rounded text-xs flex items-center gap-1 flex-shrink-0"
        onClick={onNew} title="New conversation" data-desc="Start New Conversation">
        <Plus size={11} /> NEW
      </button>
      <button className="neon-btn neon-btn-danger px-2 py-1 rounded text-xs flex-shrink-0"
        onClick={onDelete} disabled={!activeId} title="Delete this conversation" data-desc="Delete Conversation">
        <Trash2 size={11} />
      </button>
    </div>
  );
}