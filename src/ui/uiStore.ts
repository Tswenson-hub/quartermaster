// Pure UI state (navigation, open letters, unsaved qty edits). Not game state.

import { create } from 'zustand';
import type { BattlePlanId, DepotId, ItemId } from '../engine/types';

export type Screen = 'dispatch' | 'planning' | 'proposals' | 'battle' | 'treasury';

interface UiState {
  screen: Screen;
  focus: { itemId: ItemId; depotId: DepotId } | null;
  openedLetters: Record<BattlePlanId, true>;
  /** Draft quantity edits per proposal index, before the player accepts. */
  draftQty: Record<number, number>;
  go: (screen: Screen) => void;
  planItem: (itemId: ItemId, depotId: DepotId) => void;
  openLetter: (id: BattlePlanId) => void;
  setDraftQty: (index: number, qty: number | null) => void;
  clearDrafts: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'dispatch',
  focus: null,
  openedLetters: {},
  draftQty: {},
  go: (screen) => set({ screen }),
  planItem: (itemId, depotId) => set({ screen: 'planning', focus: { itemId, depotId } }),
  openLetter: (id) => set((s) => ({ openedLetters: { ...s.openedLetters, [id]: true } })),
  setDraftQty: (index, qty) =>
    set((s) => {
      const draftQty = { ...s.draftQty };
      if (qty === null) delete draftQty[index];
      else draftQty[index] = qty;
      return { draftQty };
    }),
  clearDrafts: () => set({ draftQty: {} }),
}));
