// The guided session is a SCRIPTED demonstration. It never calls the AI; every line and the edit
// below are predetermined so first-time visitors can see the full loop without a microphone.

export const DEMO_STEPS = [
  {
    caption: 'You point at the headline while speaking. Common Ground records what you were hovering.',
    wait: 2600,
    run: (d) => {
      d.simulateHover('hero-title', 'Heading');
      d.say('user', 'This headline feels a bit generic.', { ref: 'hero-title' });
    },
  },
  {
    caption: '“This” is ambiguous, so Ground points back to check the scope instead of guessing.',
    wait: 4200,
    run: (d) => {
      d.simulateHover(null);
      d.say('assistant', 'Do you mean just this headline, or the whole hero with the search bar?', {
        action: 'clarify',
        targets: [
          { id: 'hero-title', label: 'just this headline' },
          { id: 'hero', label: 'the whole hero' },
        ],
      });
      d.point(
        [
          { id: 'hero-title', label: 'just this headline' },
          { id: 'hero', label: 'the whole hero' },
        ],
        'clarify',
        'Do you mean just this headline, or the whole hero with the search bar?',
      );
    },
  },
  {
    caption: 'You answer naturally. The locked selection makes the referent unambiguous.',
    wait: 2600,
    run: (d) => {
      d.select('hero-title');
      d.say('user', 'Just the headline. Make it warmer, more personal.', { ref: 'hero-title', locked: true });
    },
  },
  {
    caption: 'Ground makes a real, reversible change to the page and creates a new version.',
    wait: 4600,
    run: (d) => {
      d.applyEdit(
        (doc) => {
          const h1 = doc.querySelector('[data-cg-id="hero-title"]');
          if (h1) h1.innerHTML = 'Slow mornings, salt air and <em>a host who knows your name.</em>';
          const lede = doc.querySelector('[data-cg-id="hero-lede"]');
          if (lede) lede.textContent = 'Fourteen small homes between Alibag and Goa, each run by someone who will tell you when the tide turns and where lunch is worth the walk.';
          const style = doc.createElement('style');
          style.textContent = '.hero h1{font-size:62px;line-height:1.04}.hero h1 em{display:block;margin-top:6px}';
          doc.head.appendChild(style);
        },
        {
          summary: 'Warmer, more personal headline',
          reply: 'I rewrote the headline around the host and the place, and set the second half in a warm italic. I also softened the intro to match.',
          changes: [
            { id: 'hero-title', description: 'Headline rewritten around the host, with a warm italic line' },
            { id: 'hero-lede', description: 'Intro copy softened to match the new tone' },
          ],
        },
      );
    },
  },
  {
    caption: 'Ground walks you through exactly what changed. Keep it, undo it or refine it from the bar.',
    wait: 5200,
    run: (d) => {
      d.select(null);
      d.point(
        [
          { id: 'hero-title', label: 'new headline' },
          { id: 'hero-lede', label: 'softer intro' },
        ],
        'change',
        'I rewrote the headline around the host and the place, and softened the intro to match.',
      );
    },
  },
  {
    caption: 'That’s the loop. Now try it yourself: start a call or type, and point at anything.',
    wait: 0,
    final: true,
    run: (d) => {
      d.say('note', 'End of the scripted demonstration. The edit above is a real version you can keep or undo.');
    },
  },
];
