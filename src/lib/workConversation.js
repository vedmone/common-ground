// Conversation about a build is separate from the request that is building the page.
// Unknown follow-ups are queued; they never implicitly cancel an in-flight generation.
const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bi'll\b/g, 'i will')
    .replace(/\bwhat's\b/g, 'what is')
    .replace(/\bit's\b/g, 'it is')
    .replace(/[,.!?।:;—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function classifyWorkUtterance(text) {
  const value = normalize(text);
  if (
    /^(?:(?:please|just) )?(?:stop talking|stop speaking|be quiet|quiet please|pause (?:your )?(?:voice|speech)|mute (?:yourself|the voice)|keep (?:building|working) (?:but |and )?(?:stop talking|be quiet))$/.test(
      value,
    ) ||
    /^(?:बोलना बंद करो|आवाज़ बंद करो|चुप रहो|bolna band karo|chup raho)$/.test(
      value,
    )
  )
    return 'silence';
  if (
    /^(?:wait|hold on|wait a (?:second|sec|moment)|one (?:second|sec|moment))$/.test(
      value,
    )
  )
    return 'silence';
  if (
    /^(?:(?:please|just) )?(?:stop|cancel|abort|ruko|ruk jao|bas|cancel karo|रुको|बस)(?: (?:this|the|current|my|is|yeh?|build|building|generation|generating|page|change|edit|request|preview|process|kaam|काम|बनाना|बंद|करो|कर दो))*$/.test(
      value,
    ) ||
    /^(?:nahi|nahin|नहीं) (?:ruko|रुको)$/.test(value) ||
    /^(?:बनाना बंद करो|काम रोक दो|इसे रद्द करो)$/.test(value)
  )
    return 'cancel';
  if (
    /^(?:(?:okay|ok|please|haan|हाँ) )?(?:continue|resume|retry|try again|start again|start over|carry on|go on|keep going|keep working|proceed|continue building|resume (?:the )?(?:build|page|preview)|phir se (?:banao|shuru karo)|dobara (?:banao|shuru karo)|jaari rakho|banate raho|जारी रखो|फिर से बनाओ|दोबारा बनाओ|दोबारा शुरू करो)$/.test(
      value,
    )
  )
    return 'resume';
  if (
    /^(?:(?:okay|ok|alright|cool|sure|haan|हाँ|ठीक है)[ ]*)?(?:(?:i will|i can|i am|i m|i ll|i) )?(?:wait|waiting|take your time|no rush|no problem|i understand|sounds good|looks good|keep it|keep this|thanks|thank you|yes|yeah|yep|theek hai|sahi hai|haan|हाँ|ठीक है|main wait karunga|mein wait karunga|mai wait karunga|main intezaar karunga|मैं इंतजार करूँगा|मैं इंतज़ार करूँगा|मैं wait करूँगा)(?: (?:no problem|thanks|thank you|okay|ok|theek hai))?$/.test(
      value,
    ) ||
    /^(?:okay|ok|alright|cool|sure|great|perfect|done|haan|हाँ|ठीक है|अच्छा)$/.test(
      value,
    )
  )
    return 'acknowledge';
  // A request to add a timer is an edit, rather than a question about our own remaining time.
  if (
    /^(?:(?:please|also|and) )?(?:add|make|change|update|replace|create|build|redesign|move|remove|insert|put|use|set|increase|decrease|show me two|can you (?:add|make|change|create|build|replace))\b/.test(
      value,
    )
  )
    return 'revision';
  if (
    /\b(?:how (?:much (?:more )?time|long|much longer)|time (?:left|remaining)|remaining time|what (?:is|are) (?:happening|going on|you doing|the status|the progress)|how (?:is|s) it going|are you (?:still )?(?:working|building|generating)|is (?:it|the (?:page|preview|build)) (?:ready|done|finished)|any (?:update|progress)|what happened|nothing (?:is )?happen(?:ing|ed)|(?:preview|page|html).*(?:blank|empty)|(?:blank|empty).*(?:preview|page|html)|are you (?:on hold|stuck)|why (?:is|did).*(?:stop|blank|empty|bubble)|status|progress|eta)\b/.test(
      value,
    ) ||
    /(?:kitna|kitni|aur kitna).*(?:time|samay|waqt|der|baaki|baki)|(?:time|samay).*(?:lagega|bacha|baaki|baki)|kya (?:ho raha|hua|chal raha)|(?:ban|bana) (?:raha|rahe)|ho gaya|taiyaar (?:hai|hua)|tayyar (?:hai|hua)|कितन[ाी].*(?:समय|वक्त|टाइम|देर|बाकी)|क्या (?:हो रहा|हुआ|चल रहा)|(?:तैयार|तैयार|हो गया).*(?:है|क्या)|कहाँ तक|कब तक|और कितन[ाी]/.test(
      value,
    )
  )
    return 'status';
  return 'revision';
}
export function isCreationRequest(text) {
  const value = normalize(text);
  if (
    /^(?:what|why|how to|can you explain|could you explain|explain|tell me|describe)\b/.test(
      value,
    )
  )
    return false;
  return /(?:create|build|make|design|generate|want|need|banao|bana|chahiye|बना|चाहिए).*(?:landing page|web ?site|web ?page|page|site|studio|store|business|पेज|वेबसाइट)|(?:landing page|web ?site|web ?page|page|पेज|वेबसाइट).*(?:create|build|banao|bana|chahiye|बना|चाहिए)|^(?:please )?(?:create|build|make|generate) something$/.test(
    value,
  );
}
export function continueCreation(original, extra) {
  return `${String(original).slice(0, 3500)}\nAdditional user details: ${String(extra).slice(0, 1400)}`;
}
export function hasPageContent(html) {
  if (
    typeof html !== 'string' ||
    !html.trim() ||
    html.includes('A FRESH CANVAS')
  )
    return false;
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return !body || !!body[1].trim();
}
export function recoverableBuild(session) {
  const work = session.work;
  if (
    work &&
    ['running', 'cancelled', 'failed', 'interrupted'].includes(work.state) &&
    work.request?.trim()
  )
    return work;
  if (work) return null;
  const current =
    session.versions.find((v) => v.id === session.currentVersionId) ||
    session.versions[0];
  if (hasPageContent(current?.html)) return null;
  const previous = [...session.messages]
    .reverse()
    .find(
      (m) =>
        m.role === 'user' &&
        (m.via === 'brief' || isCreationRequest(m.content)) &&
        classifyWorkUtterance(m.content) === 'revision',
    );
  return previous
    ? {
        id: 'recovered-' + previous.id,
        request: previous.content,
        task: 'create',
        state: 'interrupted',
        startedAt: previous.at,
      }
    : null;
}
export function workReply(
  kind,
  {
    active,
    work,
    turn = {},
    hasPage,
    language = 'en-IN',
    now = Date.now(),
  } = {},
) {
  const mix = language === 'hinglish',
    hi = language === 'hi-IN';
  if (!active) {
    if (work?.awaitingClarification)
      return mix
        ? `Build शुरू करने से पहले एक detail चाहिए: ${work.question || 'page किस बारे में है?'}`
        : hi
          ? `काम शुरू करने से पहले एक जानकारी चाहिए: ${work.question || 'पृष्ठ किस बारे में है?'}`
          : `I need one detail before I can build it: ${work.question || 'what is this page for?'}`;
    if (
      work &&
      ['running', 'cancelled', 'failed', 'interrupted'].includes(work.state)
    )
      return mix
        ? 'यह build अभी रुका हुआ है. “Resume build” बोलिए — original request से दोबारा शुरू करूँगा.'
        : hi
          ? 'यह काम अभी रुका हुआ है। “फिर से बनाओ” कहिए, मैं मूल अनुरोध से दोबारा शुरू करूँगा।'
          : 'That build is interrupted. Say “resume build” to restart the original request.';
    return hasPage
      ? mix
        ? 'Preview ready है. अभी कोई build नहीं चल रहा — page पर changes देख सकते हैं.'
        : hi
          ? 'पृष्ठ तैयार है। अभी कोई काम नहीं चल रहा है।'
          : 'Your preview is ready. There is no build running right now.'
      : mix
        ? 'अभी कोई build नहीं चल रहा. बताइए, कैसी page बनानी है?'
        : hi
          ? 'अभी कोई काम नहीं चल रहा है। बताइए, कैसा पृष्ठ बनाना है?'
          : 'There is no build running. Tell me what page you want to create.';
  }
  if (kind === 'acknowledge' || kind === 'resume')
    return mix
      ? 'ठीक है, build जारी है. Ready होते ही दिखाऊँगा.'
      : hi
        ? 'ठीक है, काम जारी है। तैयार होते ही दिखाऊँगा।'
        : 'I’m still working on it. I’ll show you when it’s ready.';
  if (kind === 'revision')
    return mix
      ? 'यह change अगला है. पहले current preview पूरा करूँगा, फिर इसे apply करूँगा.'
      : hi
        ? 'यह बदलाव अगला है। पहले वर्तमान पृष्ठ पूरा करूँगा, फिर यह बदलाव करूँगा।'
        : 'I’ve queued that next. I’ll finish the current preview, then apply this change.';
  const seconds = Math.max(
    0,
    Math.floor((now - (work?.startedAt || turn.startedAt || now)) / 1000),
  );
  const stage = turn.phase || turn.stage || work?.stage || 'thinking';
  const checking = ['validating', 'applying'].includes(stage);
  const understanding = ['understanding', 'thinking'].includes(stage);
  const waiting =
    !checking &&
    !understanding &&
    turn.lastProgressAt &&
    now - turn.lastProgressAt > 30000;
  const phase = mix
    ? checking
      ? 'Preview बन गया है; अभी check और apply कर रहा हूँ.'
      : understanding
        ? 'आपकी request समझ रहा हूँ; फिर preview बनाऊँगा.'
        : waiting
          ? 'Builder के response का wait कर रहा हूँ; request अभी active है.'
          : 'Build चल रहा है — layout और styling बना रहा हूँ.'
    : hi
      ? checking
        ? 'पृष्ठ बन गया है, अभी जाँच रहा हूँ।'
        : understanding
          ? 'आपका अनुरोध समझ रहा हूँ। फिर पृष्ठ बनाऊँगा।'
          : waiting
            ? 'निर्माण सेवा के उत्तर की प्रतीक्षा है। अनुरोध अभी चल रहा है।'
            : 'पृष्ठ बनाने का काम चल रहा है।'
      : checking
        ? 'The page is generated; I’m checking and applying it.'
        : understanding
          ? 'I’m understanding your request before building the preview.'
          : waiting
            ? 'I’m waiting for the builder to respond. The request is still active.'
            : 'I’m still building the layout and styling.';
  return mix
    ? `${phase}${seconds >= 5 ? ` ${seconds} seconds हो गए हैं.` : ''} Exact remaining time अभी नहीं बता सकता.`
    : hi
      ? `${phase}${seconds >= 5 ? ` ${seconds} सेकंड हो गए हैं।` : ''} अभी शेष समय का सटीक अनुमान नहीं है।`
      : `${phase}${seconds >= 5 ? ` It’s been ${seconds} seconds.` : ''} I don’t have a reliable estimate of the time remaining.`;
}
export function cleanWork(raw) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof raw.request !== 'string' ||
    !raw.request.trim() ||
    raw.request.length > 5000 ||
    ![
      'running',
      'cancelled',
      'failed',
      'ready',
      'answered',
      'interrupted',
    ].includes(raw.state)
  )
    return null;
  return {
    id: String(raw.id || '').slice(0, 120),
    request: raw.request,
    awaitingClarification: !!raw.awaitingClarification,
    question:
      typeof raw.question === 'string' ? raw.question.slice(0, 400) : '',
    task: raw.task === 'create' ? 'create' : 'edit',
    state: raw.state,
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : 0,
    finishedAt: Number.isFinite(raw.finishedAt) ? raw.finishedAt : undefined,
    target:
      raw.target && typeof raw.target.id === 'string'
        ? {
            id: raw.target.id.slice(0, 120),
            label: String(raw.target.label || '').slice(0, 200),
            tag: String(raw.target.tag || '').slice(0, 30),
            locked: !!raw.target.locked,
          }
        : null,
    stage: ['understanding', 'building', 'validating', 'applying'].includes(
      raw.stage,
    )
      ? raw.stage
      : 'understanding',
    error: typeof raw.error === 'string' ? raw.error.slice(0, 400) : '',
    followups: Array.isArray(raw.followups)
      ? raw.followups
          .slice(0, 8)
          .filter((x) => typeof x === 'string' && x.trim())
          .map((x) => x.slice(0, 5000))
          .slice(0, 8)
      : [],
  };
}
