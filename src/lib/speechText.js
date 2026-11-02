// Strips markdown and special characters so the speech engine reads clean prose
export function sanitizeForSpeech(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, ' ')
    .replace(/^\s*[-*+•·]\s+/gm, ' ')
    .replace(/^\s*\d+[.)]\s+/gm, ' ')
    .replace(/[*#_~<>{}[\]|\\^=+/]+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2B00}-\u{2BFF}]/gu, ' ')
    .replace(/[^\p{L}\p{N}\p{Zs}.,;:!?'"()\-–—]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}