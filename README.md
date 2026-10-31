# Common Ground

**Point. Talk. Make it real.** A voice-first shared review room for you and an AI coworker.

Open the live product at **https://common-ground-studio-six.vercel.app**. Join the voice room, point at an element and speak naturally. No language selector is required.

Common Ground binds a conversation to the interface being discussed. Your cursor shows what you mean; Ground's violet cursor shows what it understood. Discuss a direction, see actual code changes in the preview, then keep, refine, or undo them.

## What works

- Create named HTML landing pages from a blank canvas or an AI brief; edit or import HTML directly.
- Streaming replies and real build stages, with early spoken intent and short updates during longer edits.
- Two alternative previews from the same base; choose by voice, button, or clicking the preferred element. Only the chosen version enters history.
- Upload and replace images, ask for image placement and circular/bolder styling, and reuse uploaded assets on the call.
- Dynamic website tours and change highlights based on actual element inventory and computed-style changes.
- Publish a page to `/project/<name>-<unique-suffix>` on the app’s Vercel domain; update the same link with a browser-held ownership key.

- Element hover, selection, parent targeting and reciprocal AI pointing.
- Automatic speech-language detection on every turn, including English/Hindi/Hinglish; 11 supported Indian language locales.
- Microphone recording, speech detection, Saaras transcription and Bulbul speech output.
- Real HTML/CSS generation, live previews, source downloads, version checkpoints and undo.
- Local session history and export with element references.
- Local companion that edits a project with your authenticated Claude Code installation.

The hosted room edits the HTML/CSS document in its preview. To modify an existing local repository, connect the local companion. Those are different execution modes; the interface shows which is active.

## Run locally

Requires Node 20.19+ (Node 22 or 24 recommended) and a Sarvam API key.

```sh
npm install
export SARVAM_API_KEY=your_key
npm run dev
```

Open `http://127.0.0.1:4320`. Keep the key in your shell environment or an ignored local secrets file. It is only used on the server, never embedded in the browser bundle.

```sh
npm test
npm run build
```

## Bring an existing project

Install and sign in to Claude Code. Start your project's usual development server. Then, from this repository:

```sh
npm run build
node companion/start.mjs --project /absolute/path/to/your/project --preview http://127.0.0.1:3000
```

Open `http://127.0.0.1:4319`. The companion prints a pairing token for connecting from a separate local review room. If you connect from the hosted app, allow only its exact origin:

```sh
CG_ALLOWED_ORIGINS=https://YOUR-APP.vercel.app node companion/start.mjs --project /absolute/path/to/project --preview http://127.0.0.1:3000
```

Use **Connect project** in the room. The companion binds only to loopback and accepts paired requests. Claude gets the conversation and selected element context, modifies actual source, and reports the changed files. The companion takes a checkpoint before an edit. `/undo` restores the checkpoint. Keep your development server running so edits appear through hot reload.

For standalone HTML, omit `--preview`; the companion serves the project's `index.html`.

## Voice

Microphone access needs HTTPS or localhost. You must initiate a call with a click. The main room is a voice call with live captions and shared visual attention; keyboard access is in the secondary session transcript. Language is detected afresh on each utterance and passed to the conversation and speech models. Saaras supports English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil and Telugu. English and Hinglish have been tested end to end; other locales depend on provider quality and have not been individually evaluated. Audio is sent to Sarvam only for the turn being transcribed. Responses use Bulbul. Conversation style is separate from the recognition locale: Hindi-English mix stays Hinglish through short commands, confirmations and tours. Recognition uses `codemix`; synthesis receives native-script Indic words and Latin-script English in a compressed MP3 clip. A ready reply starts audio before the complete edit decision; an ordered queue prefetches following clips and keeps the explanation ahead of its completion. Confirmed speech or a new request cancels pending audio as well as playback. Brief detected sounds first lower playback volume; discarded segments restore it. Closing the call releases the microphone. Screen pixels are not continuously recorded or uploaded; the review bridge sends structured element descriptions and the preview source.

## Deploy

The project contains Vercel API functions and a Vite frontend. Create a dedicated Vercel project, add `SARVAM_API_KEY` to its server environment, and deploy. The key is never `VITE_*` or `NEXT_PUBLIC_*`.

```sh
vercel link
vercel env add SARVAM_API_KEY production
vercel --prod
```

## Image uploads and publishing

The hosted build has a dedicated Vercel Blob store. For a new installation, connect one with `vercel blob create-store your-store --access public --yes`, then pull its server environment. The server uses `BLOB_READ_WRITE_TOKEN`; never expose it in the client. Set `PUBLIC_SITE_ORIGIN` to your app's public origin when running a fork or publishing from localhost.

Uploaded PNG/JPEG/WebP/GIF assets are public and limited to 3 MB. Published pages are sanitized HTML served under `/project/<slug>-<random-suffix>` with a restrictive content policy. A random browser-held key authorizes updates; the server stores its hash, rejects a different key, and keeps the URL stable across updates. Clearing browser data can remove that update key. This release uses project paths on the studio's Vercel domain, rather than creating a separate Vercel project/subdomain per page.

Two-direction comparison, image insertion and publishing operate in the HTML workspace. A connected source repository retains its existing single-edit/checkpoint workflow.

## Architecture

`src/` contains the room, conversation, voice lifecycle and preview bridge. `server/core.mjs` validates requests, interprets intent and generates previews. `api/` exposes chat, transcription, speech and health functions. `companion/` connects a local repository and Claude Code. `test/` checks parsing, request bounds and generated-source handling.

Chat responses stream as NDJSON: early reply, grounded intent, build/check stages, generated-character counts, and the final validated result. Provider SSE is decoded incrementally with cancellation. This removes the wait for complete HTML before the first conversational response; actual latency still depends on provider and network conditions. The `reply_ready` event marks a completed speakable reply for every action. Session JSON exports include local speech-end, transcription, reply-ready, TTS-request and actual audio-playing timestamps for voice turns. This remains a turn-based transcription/intent/synthesis pipeline, not native continuous speech-to-speech.

Preview documents are isolated in sandboxed iframes. Generated scripts, event handlers, embedded frames and navigation payloads are removed. The bridge supplies stable element identifiers for references across changes. A failed or incomplete model response leaves the current version intact.

## Current boundaries

The hosted renderer focuses on self-contained HTML/CSS documents. Arbitrary authenticated websites, Figma, canvas-based editors and cross-origin nested frames require dedicated integrations. The local companion supports existing frontend projects but code edits still need normal project-specific validation before shipping. An AI cursor shows an interpretation; it does not guarantee the interpretation is correct.

## Research

See [research](docs/RESEARCH.md) for the interaction rationale and [build brief](docs/BUILD-BRIEF.md) for the user journey and acceptance criteria.
