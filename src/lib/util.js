export function uid(prefix = 'id') {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function clip(text, n = 80) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function timeLabel(at) {
  if (!at) return '';
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function describeElement(el) {
  if (!el) return '';
  const label = clip(el.label || el.text || '', 44);
  return label ? `${el.kind || el.tag} · ${label}` : el.kind || el.tag || 'Element';
}

export function downloadFile(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function fileSlug(s) {
  return String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
}

export const UNDO_RE = /^\s*(undo|undo (that|it|this|the last (change|edit))|revert( that| it)?|go back|take (that|it) back|wapas( karo| kar do)?|pehle jaisa( karo| kar do)?|पहले जैसा.*|वापस.*)[\s.!]*$/i;
export const STOP_RE = /^\s*(stop|cancel|wait|hold on|never ?mind|ruko|ruk jao|bas|रुको|बस)[\s.!]*$/i;
export const KEEP_RE = /^\s*(keep( (it|this|that|this version))?|looks good|perfect|done|this works|keep the change|haan( ye| yahi)?( theek hai)?|yeh? (theek|sahi) hai|रखो|ठीक है)[\s.!]*$/i;

export function commandReply(command, language) {
  const replies = {
    'hi-IN': ['Haan, yahi rakhte hain. Aur kya dekhein?', 'Wapas kar diya. Ab dekhiye.'],
    'bn-IN': ['এটাই রাখলাম। এবার আর কী দেখব?', 'আগের অবস্থায় ফিরিয়ে দিয়েছি। দেখুন।'],
    'gu-IN': ['આ જ રાખ્યું. હવે બીજું શું જોઈએ?', 'પહેલાં જેવું કરી દીધું. હવે જુઓ.'],
    'kn-IN': ['ಇದನ್ನೇ ಉಳಿಸಿದ್ದೇನೆ. ಮುಂದೆ ಏನು ನೋಡೋಣ?', 'ಹಿಂದಿನ ಸ್ಥಿತಿಗೆ ತಂದಿದ್ದೇನೆ. ಈಗ ನೋಡಿ.'],
    'ml-IN': ['ഇത് സൂക്ഷിച്ചു. ഇനി എന്താണ് നോക്കേണ്ടത്?', 'പഴയ രൂപത്തിലാക്കി. ഇപ്പോൾ നോക്കൂ.'],
    'mr-IN': ['हेच ठेवले. आता आणखी काय पाहूया?', 'आधीसारखे केले. आता बघा.'],
    'od-IN': ['ଏହାକୁ ରଖିଲି। ଆଉ କଣ ଦେଖିବା?', 'ପୂର୍ବ ଅବସ୍ଥାକୁ ଫେରାଇଲି। ଏବେ ଦେଖନ୍ତୁ।'],
    'pa-IN': ['ਇਹੀ ਰੱਖ ਲਿਆ। ਹੁਣ ਹੋਰ ਕੀ ਦੇਖੀਏ?', 'ਪਹਿਲਾਂ ਵਰਗਾ ਕਰ ਦਿੱਤਾ। ਹੁਣ ਦੇਖੋ।'],
    'ta-IN': ['இதையே வைத்துக்கொண்டேன். அடுத்து எதைப் பார்க்கலாம்?', 'பழைய நிலைக்கு மாற்றிவிட்டேன். இப்போது பாருங்கள்.'],
    'te-IN': ['ఇదే ఉంచాను. తర్వాత ఏం చూద్దాం?', 'మునుపటిలా మార్చాను. ఇప్పుడు చూడండి.'],
  };
  return (replies[language] || ['Kept it. What shall we look at next?', 'Undone. Have a look.'])[command === 'undo' ? 1 : 0];
}
