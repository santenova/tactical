// Prompt flavors available for text-box messages sent to the orb.
// Each flavor is only an instruction prefix — the user's message is always
// appended by wrapOrbPrompt, so it can never be dropped from a flavor.
export const ORB_FLAVORS = [
  {
    id: 'simplify',
    label: 'SIMPLIFY',
    title: 'Simplify and summarize',
    instruction: 'Simplify and summarize the user message below, then explain it clearly.',
  },
  {
    id: 'expand',
    label: 'EXPAND',
    title: 'Expand and summarize',
    instruction: 'Expand on the user message below, add relevant detail and context, then summarize the result clearly.',
  },
  {
    id: 'summarize',
    label: 'SUMMARIZE',
    title: 'Summarize',
    instruction: 'Summarize the user message below concisely and clearly.',
  },
];

export function wrapOrbPrompt(flavorId, text) {
  const flavor = ORB_FLAVORS.find(f => f.id === flavorId) || ORB_FLAVORS[0];
  return `${flavor.instruction}\n\nUSER MESSAGE:\n"""${text}"""`;
}