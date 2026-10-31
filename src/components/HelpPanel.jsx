import { PlayCircle, BookOpen } from 'lucide-react';
import { Sheet } from './Feedback.jsx';
import { CursorGlyph } from './Logo.jsx';

export default function HelpPanel({ onClose, onDemo, onWelcome }) {
  return (
    <Sheet title="How Common Ground works" subtitle="Two cursors, one shared page" onClose={onClose}>
      <section className="help-section">
        <div className="legend">
          <span>
            <CursorGlyph who="you" size={14} /> <b>You</b> green outline = what you are pointing at; solid = locked selection
          </span>
          <span>
            <CursorGlyph who="ground" size={14} /> <b>Ground</b> lilac cursor = what Ground is referring to
          </span>
        </div>
        <ol className="help-steps">
          <li>
            <b>Point.</b> Hover anything in the preview. Click to lock it; use the arrows in the selection bar to widen to the parent or narrow to a child, or <em>Find</em> to pick by name.
          </li>
          <li>
            <b>Join the voice room.</b> Just talk; Ground waits for you to pause. It detects your language on every turn. Whatever you were pointing at when you began speaking is captured with your words. Keyboard access is available in the session transcript.
          </li>
          <li>
            <b>Ground points back.</b> If “this” could mean several things, Ground moves its cursor to each candidate and asks. Click a suggestion chip to answer.
          </li>
          <li>
            <b>Review the version.</b> Edits arrive as a new version. Keep, Undo or Refine from the bar, see the exact diff under Source, or say “undo”.
          </li>
        </ol>
      </section>
      <section className="help-section">
        <h3>Shortcuts</h3>
        <dl className="shortcuts">
          <dt>
            <kbd>/</kbd>
          </dt>
          <dd>Open transcript and keyboard access</dd>
          <dt>
            <kbd>Esc</kbd>
          </dt>
          <dd>Interrupt Ground, or clear the selection</dd>
          <dt>
            <kbd>⌘</kbd>
            <kbd>Z</kbd>
          </dt>
          <dd>Undo the current version (outside text fields)</dd>
          <dt>
            <kbd>Enter</kbd>
          </dt>
          <dd>Send · Shift+Enter for a new line</dd>
        </dl>
      </section>
      <section className="help-section">
        <h3>Create, compare and publish</h3>
        <p className="setup-copy">New page starts a fresh canvas or builds from a brief. HTML editor lets you write, import and apply source. Images uploads a photo that you can place or restyle on the call. Turn on Two directions for alternatives, then say “I prefer B” or click the element you prefer. Tour page walks through actual sections; Publish gives the current version a public link under /project/.</p>
      </section>
      <section className="help-section">
        <h3>Privacy</h3>
        <p className="setup-copy">Sessions and versions are saved in this browser. Your spoken turns go to Sarvam for transcription and voice; your words, page source and element references go to the configured AI provider. Uploaded images and pages you publish are stored publicly on Vercel. Hosted examples run in an isolated preview. The local companion runs your own trusted project and uses Claude Code for source edits.</p>
      </section>
      <div className="setup-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onDemo}>
          <PlayCircle size={14} aria-hidden="true" /> Scripted demo
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onWelcome}>
          <BookOpen size={14} aria-hidden="true" /> Welcome screen
        </button>
      </div>
      <p className="setup-copy" style={{ marginTop: 18 }}><a href="/research.html" target="_blank" rel="noreferrer">Read the research and product thesis ↗</a></p>
    </Sheet>
  );
}
