import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Columns2 } from 'lucide-react';
import { buildSrcDoc } from '../lib/html.js';
export default function CompareView({ comparison, onChoose, onCancel }) {
  const a = useRef(null),
    b = useRef(null);
  const refs = [a, b];
  const [ready, setReady] = useState([false, false]);
  const docs = useMemo(
    () => comparison.variants.map((v) => buildSrcDoc(v.html)),
    [comparison.variants],
  );
  useEffect(() => {
    const receive = (e) => {
      const index = refs.findIndex(
        (r) => r.current?.contentWindow === e.source,
      );
      if (index < 0) return;
      if (e.data?.type === 'cg:ready') {
        setReady((v) => v.map((x, i) => (i === index ? true : x)));
        if (comparison.targetId)
          e.source.postMessage(
            {
              type: 'cg:point',
              id: comparison.targetId,
              label: 'Compare this element',
              tone: 'change',
            },
            '*',
          );
      }
      if (
        e.data?.type === 'cg:select' &&
        e.data.origin === 'user' &&
        e.data.element?.id
      )
        onChoose(index, e.data.element.id);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [comparison, onChoose]);
  return (
    <section
      className="compare-view"
      aria-label="Compare two design directions"
    >
      <header>
        <div>
          <span className="eyebrow">
            <Columns2 size={13} />
            TWO DIRECTIONS · SAME STARTING POINT
          </span>
          <h2>Which feels right?</h2>
          <p>
            Click the element you prefer, or choose a direction. The other
            preview is discarded.
          </p>
        </div>
        <button
          className="icon-btn"
          onClick={onCancel}
          aria-label="Cancel comparison"
        >
          <X size={17} />
        </button>
      </header>
      <div className="compare-grid">
        {comparison.variants.map((v, i) => (
          <article className="compare-option" key={v.id}>
            <div className="compare-option-head">
              <span className="option-letter">{i ? 'B' : 'A'}</span>
              <div>
                <h3>{v.name}</h3>
                <p>{v.intent}</p>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onChoose(i)}
              >
                <Check size={13} />
                Use {i ? 'B' : 'A'}
              </button>
            </div>
            <div className="compare-frame">
              <iframe
                ref={refs[i]}
                title={`Direction ${i ? 'B' : 'A'}: ${v.name}`}
                srcDoc={docs[i]}
                sandbox="allow-scripts"
              />
              {!ready[i] && (
                <span className="compare-loading">Loading this direction…</span>
              )}
            </div>
          </article>
        ))}
      </div>
      <footer>
        <span>Say “I prefer A” or “I prefer B” on your call.</span>
        <button onClick={onCancel}>Keep the original</button>
      </footer>
    </section>
  );
}
