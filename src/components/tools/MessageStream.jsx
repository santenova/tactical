import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

export default function MessageStream({ messages = [], streamingText = '', isGenerating, onSendToOrb }) {
  const boxRef = useRef(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages, streamingText]);

  const empty = messages.length === 0 && !isGenerating;

  return (
    <div ref={boxRef} className="rounded p-3 flex flex-col gap-3 overflow-y-auto"
      style={{ height: 340, background: 'rgba(0,8,8,0.5)', border: '1px solid rgba(0,255,204,0.1)' }}>
      {empty && (
        <div className="m-auto text-center text-xs tracking-widest uppercase" style={{ color: 'rgba(0,255,204,0.25)', lineHeight: 2 }}>
          No messages yet<br />Send a prompt to start this conversation
        </div>
      )}
      {messages.map(m => <MessageBubble key={m.id} message={m} onSendToOrb={onSendToOrb} />)}
      {isGenerating && (
        <MessageBubble message={{ id: 'streaming', role: 'assistant', content: streamingText, ts: Date.now() }} />
      )}
    </div>
  );
}