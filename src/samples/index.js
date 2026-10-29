import saltmarsh from './saltmarsh.js';
import { ledgerline, morningPages } from './others.js';

export const SAMPLE_PROJECTS = [
  {
    id: 'saltmarsh',
    name: 'Saltmarsh Stays',
    kind: 'Travel landing page',
    description: 'Calm coastal stays. Hero, search, listings and a newsletter.',
    swatch: ['#f5eee2', '#bf6440', '#23423e'],
    html: saltmarsh,
    suggestions: [
      'Hover the headline: “Make this feel warmer and more personal.”',
      'Click the stay cards: “Can these feel more premium?”',
      'Point at the search bar: “Isme vibe nahi aa rahi.”',
    ],
  },
  {
    id: 'ledgerline',
    name: 'Ledgerline Pricing',
    kind: 'SaaS pricing page',
    description: 'Three plans, billing toggle and an FAQ.',
    swatch: ['#f6f6f3', '#16181a', '#c9d36a'],
    html: ledgerline,
    suggestions: ['Point at the Studio plan: “Make this stand out more.”', '“Is the pricing headline clear enough?”'],
  },
  {
    id: 'morning-pages',
    name: 'Morning Pages',
    kind: 'App landing page',
    description: 'A gentle journaling app with a phone mock-up.',
    swatch: ['#eef0ea', '#5d7552', '#22261f'],
    html: morningPages,
    suggestions: ['Hover the phone: “Give this more personality.”', '“Make the download buttons friendlier.”'],
  },
];

export const COMPANION_PROJECT = {
  id: 'companion',
  name: 'Your local project',
  kind: 'Connected through the companion',
  description: 'Review the real app running on your machine. Claude Code makes the edits.',
  swatch: ['#ffffff', '#46664e', '#202823'],
  html: '',
  suggestions: ['Point at anything in your app and describe the change.'],
};

export function projectById(id) {
  return SAMPLE_PROJECTS.find((p) => p.id === id) || (id === 'companion' ? COMPANION_PROJECT : null);
}
