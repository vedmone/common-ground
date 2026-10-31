// Speech recognition reports a locale, not whether the speaker is mixing languages.
const DEVANAGARI = /[\u0900-\u097f]/;
const ROMAN_HINDI =
  /\b(?:kitna|kitni|lagega|bacha|intezaar|intazaar|yeh?|yah|yehi|isko|isme|iss?ko|idhar|udhar|yahan|yahaan|wahan|thoda|thodi|aur|nahi|nahin|mujhe|humko|aap|tum|kaisa|kaise|kyun|kyu|kya|wala|wali|wale|karo|karna|kardo|karke|karen|dikhao|dikhana|chahiye|lagta|lag|raha|rahi|rakho|bada|chhota|achha|accha|saaf|banao|hai|hain|ho|mein|mera|meri)\b/gi;
const ENGLISH =
  /\b(?:time|wait|waiting|ready|progress|processing|preview|build|this|that|the|make|change|show|add|remove|please|can|want|with|more|less|like|looks?|feel|feels|buttons?|headings?|headers?|footers?|images?|photos?|colors?|colours?|warm|cool|green|blue|white|round|rounded|circular|bold|premium|clean|cleaner|bigger|smaller|vibe|spacing|fonts?|layouts?|designs?|pages?|websites?|landing|sections?|hero|versions?|options?|borders?|text|background|size|update|edit|keep|undo|contrast|upload|publish|tour|alignment|padding|margin|cta|soft|softer)\b/i;
const BRIEF_COMMAND =
  /^(?:yes|yeah|yep|no|nope|ok(?:ay)?|sure|nice|thanks?(?: you)?|great|done|perfect|stop|cancel|wait|hold on|undo(?: that| it| this)?|keep(?: it| this| that| this version)?|looks good|go ahead|do it|haan(?: ji| yahi| ye| theek hai)?|han|nahi|theek hai|sahi hai|ruko|bas|ठीक है|हाँ|हां|नहीं|रुको|रखो|(?:i prefer |use |choose |keep |option |version )?[ab12]|(?:pehla|doosra)(?: wala)?|पहला|दूसरा)$/i;
const SCRIPT_LANGUAGES = [
  [/[\u0980-\u09ff]/, 'bn-IN'],
  [/[\u0a80-\u0aff]/, 'gu-IN'],
  [/[\u0a00-\u0a7f]/, 'pa-IN'],
  [/[\u0b00-\u0b7f]/, 'od-IN'],
  [/[\u0b80-\u0bff]/, 'ta-IN'],
  [/[\u0c00-\u0c7f]/, 'te-IN'],
  [/[\u0c80-\u0cff]/, 'kn-IN'],
  [/[\u0d00-\u0d7f]/, 'ml-IN'],
];
const LOCALES = new Set([
  'en-IN',
  'hi-IN',
  'bn-IN',
  'gu-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'od-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
]);
export function speechLocale(style) {
  return style === 'hinglish' ? 'hi-IN' : LOCALES.has(style) ? style : 'en-IN';
}
export function conversationLanguage(messages, hint = 'auto') {
  let style = hint === 'hinglish' ? hint : LOCALES.has(hint) ? hint : 'en-IN';
  for (const message of messages.filter((m) => m.role === 'user').slice(-16)) {
    const text = String(message.content || '')
      .split(/\n\[pointing at /)[0]
      .trim();
    const plain = text
      .replace(/[,.!?।—-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain || BRIEF_COMMAND.test(plain)) continue;
    if (
      /\bhinglish\b|hindi[ -]*(?:and |aur |english|inglish)|हिंदी[ -]*(?:और |English)/i.test(
        text,
      )
    ) {
      style = 'hinglish';
      continue;
    }
    if (
      /(?:reply|respond|speak|talk|answer|bolo|boliye).{0,20}(?:only )?english|english (?:only|mein|me|please)|अंग्रेज़ी में/i.test(
        text,
      )
    ) {
      style = 'en-IN';
      continue;
    }
    if (
      /(?:reply|respond|speak|answer).{0,20}(?:only |pure )?hindi|(?:sirf|shuddh|pure) hindi|हिंदी में (?:बोलो|जवाब)/i.test(
        text,
      )
    ) {
      style = 'hi-IN';
      continue;
    }
    const otherScript = SCRIPT_LANGUAGES.find(([re]) => re.test(text));
    if (otherScript) {
      style = otherScript[1];
      continue;
    }
    if (DEVANAGARI.test(text)) {
      style = /[a-z]{2}/i.test(text)
        ? 'hinglish'
        : hint === 'mr-IN'
          ? 'mr-IN'
          : 'hi-IN';
      continue;
    }
    const hindiWords = text.match(ROMAN_HINDI) || [];
    if (hindiWords.length) {
      style = ENGLISH.test(text) ? 'hinglish' : 'hi-IN';
      continue;
    }
    if (/[a-z]{3}/i.test(text)) {
      if (style === 'hinglish' && plain.split(/\s+/).length <= 4) continue;
      style = 'en-IN';
    }
  }
  return { style, language: speechLocale(style) };
}
export function languageGuidance(profile) {
  const style = typeof profile === 'string' ? profile : profile.style;
  if (style === 'hinglish')
    return `The user speaks Hindi-English mix (Hinglish). Reply in natural conversational Hinglish with roughly their balance of Hindi and English. Do NOT translate the conversation into only English or formal Hindi. Keep everyday design words such as button, spacing, image, font, clean, premium and layout in English. Write Hindi words in Devanagari and English words in Latin for clear speech synthesis; this is still mixed spoken language, not a change of conversational style. Example: user "Is button mein vibe nahi aa rahi, thoda premium karo" -> reply "हाँ, इसी button को थोड़ा premium बनाता हूँ — spacing बढ़ाऊँगा और corners softer करूँगा." Short commands like yes, undo or option B do not change the established language mix. Use the same mix for reply and human-readable change/tour descriptions.`;
  return `Reply naturally in ${style}. Follow an explicit language change from the user. A short yes, undo or option B does not change the conversation's established language. Speech-recognition locale is only a hint; the user's actual words take precedence. Write Indic words in their native script for speech synthesis. Keep quoted website copy and proper names unchanged.`;
}
export function spokenUI(kind, style, data = {}) {
  const mix = style === 'hinglish',
    hindi = style === 'hi-IN';
  const lines = {
    nothingUndo: mix
      ? 'अभी कोई change नहीं हुआ — ये original version ही है.'
      : hindi
        ? 'अभी कोई बदलाव नहीं हुआ है। यह मूल पृष्ठ है।'
        : 'There’s nothing to undo yet. This is the original page.',
    keep: mix
      ? 'हाँ, यही version keep कर लिया. अब आगे क्या देखें?'
      : hindi
        ? 'ठीक है, यही रखा है। अब आगे क्या देखें?'
        : 'Kept this version. What shall we look at next?',
    undo: mix
      ? 'Undo कर दिया — पिछला version वापस आ गया.'
      : hindi
        ? 'पिछली स्थिति वापस कर दी है। अब देखिए।'
        : 'Undone. The previous version is back.',
    progress: mix
      ? 'Layout और styling पर काम चल रहा है. Ready होते ही दिखाता हूँ.'
      : hindi
        ? 'बनावट पर काम चल रहा है। तैयार होते ही दिखाता हूँ।'
        : 'I’m working on the layout and styling. I’ll show you when it’s ready.',
    compare: mix
      ? 'दोनों options ready हैं. A या B — कौनसा बेहतर लग रहा है?'
      : hindi
        ? 'दोनों विकल्प तैयार हैं। पहला या दूसरा, कौन सा बेहतर लग रहा है?'
        : 'Both options are ready. Which do you prefer, A or B?',
    chosen: mix
      ? `${data.name || 'यह option'} keep कर लिया. दूसरी preview हटा दी है.`
      : hindi
        ? `${data.name || 'यह विकल्प'} रख लिया है। दूसरा हटा दिया है।`
        : `${data.name || 'This option'} is now your page. The other preview has been discarded.`,
    error: mix
      ? 'अभी यह change apply नहीं हो पाया. आपकी current page safe है. फिर try करें?'
      : hindi
        ? 'अभी बदलाव नहीं हो पाया। आपका पृष्ठ सुरक्षित है। फिर कोशिश करें?'
        : 'I couldn’t apply that change. Your current page is safe. Shall we try again?',
    complete: mix
      ? 'हो गया.'
      : hindi
        ? 'बदलाव हो गया है। अब देखिए।'
        : 'The change is ready. Have a look.',
  };
  return lines[kind] || '';
}
