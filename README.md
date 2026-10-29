# Common Ground

**Point. Talk. Make it real.** A voice-first shared review room for you and an AI coworker.

Open the live product at **https://common-ground-studio-six.vercel.app**. Join the voice room, point at an element and speak naturally. No language selector is required.

Common Ground binds a conversation to the interface being discussed. Your cursor shows what you mean; Ground's violet cursor shows what it understood. Discuss a direction, see actual code changes in the preview, then keep, refine, or undo them.

## What works

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

Microphone access needs HTTPS or localhost. You must initiate a call with a click. The main room is a voice call with live captions and shared visual attention; keyboard access is in the secondary session transcript. Language is detected afresh on each utterance and passed to the conversation and speech models. Saaras supports English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil and Telugu. English and Hinglish have been tested end to end; other locales depend on provider quality and have not been individually evaluated. Audio is sent to Sarvam only for the turn being transcribed. Responses use Bulbul. Closing the call releases the microphone. Screen pixels are not continuously recorded or uploaded; the review bridge sends structured element descriptions and the preview source.

## Deploy

The project contains Vercel API functions and a Vite frontend. Create a dedicated Vercel project, add `SARVAM_API_KEY` to its server environment, and deploy. The key is never `VITE_*` or `NEXT_PUBLIC_*`.

```sh
vercel link
vercel env add SARVAM_API_KEY production
vercel --prod
```

## Architecture

`src/` contains the room, conversation, voice lifecycle and preview bridge. `server/core.mjs` validates requests, interprets intent and generates previews. `api/` exposes chat, transcription, speech and health functions. `companion/` connects a local repository and Claude Code. `test/` checks parsing, request bounds and generated-source handling.

Preview documents are isolated in sandboxed iframes. Generated scripts, event handlers, embedded frames and navigation payloads are removed. The bridge supplies stable element identifiers for references across changes. A failed or incomplete model response leaves the current version intact.

## Current boundaries

The hosted renderer focuses on self-contained HTML/CSS documents. Arbitrary authenticated websites, Figma, canvas-based editors and cross-origin nested frames require dedicated integrations. The local companion supports existing frontend projects but code edits still need normal project-specific validation before shipping. An AI cursor shows an interpretation; it does not guarantee the interpretation is correct.

## Research

See [research](docs/RESEARCH.md) for the interaction rationale and [build brief](docs/BUILD-BRIEF.md) for the user journey and acceptance criteria.
