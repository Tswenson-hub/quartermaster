// Pure UI state (navigation, read letters, unsaved qty edits). Not game state.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BattlePlanId, DepotId, ItemId } from '../engine/types';

export type Screen = 'dispatch' | 'planning' | 'proposals' | 'battle' | 'letters' | 'treasury';

interface UiState {
  screen: Screen;
  focus: { itemId: ItemId; depotId: DepotId } | null;
  /** Battle-plan letters whose seal the player has broken. */
  openedLetters: Record<BattlePlanId, true>;
  /** Letters from command (GameState.letters) the player has read. */
  readLetters: Record<string, true>;
  /** Battle outcomes whose report the player has dismissed. */
  seenBattles: Record<BattlePlanId, true>;
  /** Draft quantity edits per proposal index, before the player accepts. */
  draftQty: Record<number, number>;
  go: (screen: Screen) => void;
  planItem: (itemId: ItemId, depotId: DepotId) => void;
  openLetter: (id: BattlePlanId) => void;
  readLetter: (id: string) => void;
  seeBattle: (id: BattlePlanId) => void;
  setDraftQty: (index: number, qty: number | null) => void;
  clearDrafts: () => void;
  /** Forget everything tied to the current campaign. */
  resetCampaign: () => void;
}

const campaignDefaults = {
  screen: 'dispatch' as Screen,
  focus: null,
  openedLetters: {},
  readLetters: {},
  seenBattles: {},
  draftQty: {},
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...campaignDefaults,
      go: (screen) => set({ screen }),
      planItem: (itemId, depotId) => set({ screen: 'planning', focus: { itemId, depotId } }),
      openLetter: (id) => set((s) => ({ openedLetters: { ...s.openedLetters, [id]: true } })),
      readLetter: (id) => set((s) => (s.readLetters[id] ? s : { readLetters: { ...s.readLetters, [id]: true } })),
      seeBattle: (id) => set((s) => ({ seenBattles: { ...s.seenBattles, [id]: true } })),
      setDraftQty: (index, qty) =>
        set((s) => {
          const draftQty = { ...s.draftQty };
          if (qty === null) delete draftQty[index];
          else draftQty[index] = qty;
          return { draftQty };
        }),
      clearDrafts: () => set({ draftQty: {} }),
      resetCampaign: () => set(campaignDefaults),
    }),
    {
      // Read/seen markers survive a reload alongside the game save; drafts and navigation do not.
      name: 'quartermaster-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ openedLetters: s.openedLetters, readLetters: s.readLetters, seenBattles: s.seenBattles }),
    },
  ),
);
