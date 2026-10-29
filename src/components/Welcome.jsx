import { useEffect, useRef } from 'react';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { LogoMark, CursorGlyph } from './Logo.jsx';

export default function Welcome({ onEnter, onDemo }) {
  const enterRef = useRef(null);
  useEffect(() => {
    enterRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') onEnter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnter]);

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-inner">
        <header className="welcome-top">
          <span className="brand static">
            <LogoMark />
            <span>Common Ground</span>
          </span>
          <span className="welcome-kicker">A live review room for you and AI</span>
        </header>

        <div className="welcome-grid">
          <div className="welcome-copy">
            <p className="eyebrow">Point · Talk · Change</p>
            <h1 id="welcome-title">
              Point at it.
              <br />
              Say it out loud.
              <br />
              <em>Watch it change.</em>
            </h1>
            <p className="welcome-lede">
              Common Ground puts you and <strong>Ground</strong>, your AI design partner, on the same live page. Hover anything and talk like you would to a colleague. Ground points back
              when “this” is unclear, makes the change, then walks you through it.
            </p>
            <div className="welcome-actions">
              <button ref={enterRef} type="button" className="btn btn-primary btn-lg" onClick={onEnter}>
                Join voice room
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button type="button" className="btn btn-quiet btn-lg" onClick={onDemo}>
                <PlayCircle size={18} aria-hidden="true" />
                Try a guided session
              </button>
            </div>
            <p className="welcome-fine">Speak in your language. Ground detects it automatically, even when you switch. The guided session is a scripted demonstration.</p>
          </div>

          <figure className="welcome-vignette" aria-label="Illustration: your cursor and Ground’s cursor on the same page">
            <div className="vig-page">
              <div className="vig-nav">
                <i />
                <span />
                <span />
                <b />
              </div>
              <div className="vig-hero">
                <div className="vig-lines">
                  <span className="vig-h vig-h1">
                    <span className="vig-outline you" />
                  </span>
                  <span className="vig-h vig-h2" />
                  <span className="vig-p" />
                  <span className="vig-p short" />
                  <span className="vig-cta">
                    <span className="vig-outline ground" />
                  </span>
                </div>
                <div className="vig-art">
                  <i className="sun" />
                  <i className="hill" />
                  <i className="sea" />
                </div>
              </div>
            </div>
            <div className="vig-cursor you">
              <CursorGlyph who="you" size={18} />
              <span>You</span>
            </div>
            <div className="vig-cursor ground">
              <CursorGlyph who="ground" size={18} />
              <span>Ground · this button?</span>
            </div>
            <figcaption className="vig-bubbles">
              <p className="bubble you">“Can this feel warmer?”</p>
              <p className="bubble ground">“The headline, or the whole hero?”</p>
            </figcaption>
          </figure>
        </div>

        <ol className="welcome-steps">
          <li>
            <span>01</span>
            <b>Share a reference</b>
            <p>Hover to point, click to lock. Your hover trail travels with every sentence.</p>
          </li>
          <li>
            <span>02</span>
            <b>Ground points back</b>
            <p>Its own cursor confirms what it understood before it touches anything.</p>
          </li>
          <li>
            <span>03</span>
            <b>Keep, undo or refine</b>
            <p>Every change is a version with a real diff. Undo is one word away.</p>
          </li>
        </ol>

        <footer className="welcome-foot">
          Built on research into conversational grounding (Clark &amp; Brennan, 1991) and shared visual workspaces (Gergle, Kraut &amp; Fussell, 2013).
        </footer>
      </div>
    </div>
  );
}
