# Common Ground

Build a complete working voice + visual AI review room. Primary promise: the user hovers over a real interface and speaks; the AI visibly points back, resolves ambiguity, proposes and performs a change, shows the result and supports accept/undo. This is a reciprocal conversation.

## User journey
1. Welcome screen describes pointing and talking and offers "Join voice room" / "Try a guided session".
2. Studio immediately opens with a well-designed sample product (a calm travel/stay landing page). A compact project switcher offers other examples and "Connect your project".
3. The voice call is the main interface. Captions accompany the conversation; the transcript and keyboard fallback live in a secondary drawer. Automatically detect language on every utterance, including mid-call switching; no language selector. Never pretend the microphone is connected; real permission/recording state must be accurate.
4. Hovering any preview element gives a light outline. A click locks that referent; user can choose parent/child, clear, or simply mention 'this' while hovering. Capture previous hover timeline with timestamps and element descriptions.
5. Voice/transcript plus selected element and page DOM context go to a real model. Model returns spoken response plus explicit tools (point, clarify, propose, edit, demonstrate). AI pointer moves to target and says 'this?' when ambiguous.
6. For a clear change, generate actual HTML/CSS for the preview, preserving project instructions. Replace the version after validating document; show live result, version chip and action bar Keep / Undo / Refine.
7. AI pointer tours actual changed elements while explaining. Code drawer shows actual before/after changes and download source.
8. Session history persists locally. Export transcript+element references+accepted source/diffs as JSON/Markdown. Version checkpoints survive refresh. Reset is confirmed in product.
9. Local companion connects a real local project and Claude Code; hosted app works standalone through Sarvam model generation.

## Design
Calm, premium editorial workspace. Warm parchment (#f3f1eb), deep ink (#202823), forest green (#46664e), muted lilac AI cursor. Fine borders, generous whitespace, crisp labels. Workspace hero is the actual product preview. Sidebar voice participant with live captions, bottom floating call controls. Label each cursor (You / Ground). Secondary panels for transcript, history, source and setup. Accessible names and real disabled/error/loading states. Mobile layout should be usable, desktop primary.

## Implementation contract
Parent owns server/, api/, companion/, docs/. Claude frontend worker owns src/, public/, index.html only; may add dependencies through coordination. No other file edits.

POST /api/chat JSON {messages:[{role,content}], context:{selection,hover,hoverTrail,elements,pageTitle,html}, mode:'discuss'|'edit', language:'auto'|supported_locale} -> {reply,action:'point'|'clarify'|'edit'|'none'|'keep'|'undo'|'stop'|'end_call',targets:[{id,label}],intent,html?,summary?,changes?:[{id,description}],provider}
POST /api/transcribe multipart file -> {transcript,language_code}
POST /api/speak JSON {text,language} -> {audio:base64,mimeType:'audio/wav',provider}
GET /api/health -> {ok,chat,voice,provider,companion?}
Preview bridge protocol in a sandbox iframe: postMessage type cg:hover/cg:select/cg:ready with element metadata {id,tag,text,selector,rect:{x,y,width,height},parentId,styles}; parent can send cg:point {id} and cg:clear. Stable data-cg-id auto-generated for elements. Avoid direct iframe DOM access if sandbox without same-origin; use message bridge.

## Evidence behind choices
Clark & Brennan (1991) grounding; Gergle/Kraut/Fussell shared visual workspace (2013); Microsoft shared gaze pair programming (CHI 2017); Google DeepMind AI Pointer (May 2026); Cursor Design Mode; Cua separate cursors. Voice + context + reciprocal pointing + revision loop is the product opportunity. Hover alone is ambiguous; speech timing and a locked element matter. AI pointer must communicate intent; do not animate randomly.

## Acceptance
Real API generation, transcription, speech synthesis; pointer + highlight grounded to element; plain English/Hinglish edits work; no fake successes; errors recoverable; version undo works; generated source downloadable; working deployed site and local companion instructions.
