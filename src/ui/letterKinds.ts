import type { LetterKind } from '../engine/types';

export const LETTER_KIND: Record<LetterKind, { label: string; seal: string }> = {
  reprimand: { label: 'Reprimand', seal: '#a8202a' },
  commendation: { label: 'Commendation', seal: '#3f7a2c' },
  promotion: { label: 'Promotion', seal: '#d9a441' },
  demotion: { label: 'Demotion', seal: '#5a4630' },
  'battle-won': { label: 'Victory', seal: '#2c62b0' },
  'battle-lost': { label: 'Defeat', seal: '#3b2a1a' },
  'game-over': { label: 'Dismissal', seal: '#1f150c' },
};
