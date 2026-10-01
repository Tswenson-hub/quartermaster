import { lazy, Suspense, useEffect } from 'react';
import { BattleReport } from './ui/components/BattleReport';
import { NavRail } from './ui/components/NavRail';
import { TopBar } from './ui/components/TopBar';
import { useGame } from './ui/hooks';
import { BattlePlansScreen } from './ui/screens/BattlePlansScreen';
import { DispatchScreen } from './ui/screens/DispatchScreen';
import { GameOverScreen } from './ui/screens/GameOverScreen';
import { LettersScreen } from './ui/screens/LettersScreen';
import { ProposalsScreen } from './ui/screens/ProposalsScreen';
import { TitleScreen } from './ui/screens/TitleScreen';
import { useUiStore } from './ui/uiStore';

// Chart screens pull in Recharts; load them on demand to keep the first chunk small.
const PlanningScreen = lazy(() => import('./ui/screens/PlanningScreen').then((m) => ({ default: m.PlanningScreen })));
const MasterDataScreen = lazy(() => import('./ui/screens/MasterDataScreen').then((m) => ({ default: m.MasterDataScreen })));
const TreasuryScreen = lazy(() => import('./ui/screens/TreasuryScreen').then((m) => ({ default: m.TreasuryScreen })));

const SCREENS = {
  dispatch: DispatchScreen,
  planning: PlanningScreen,
  proposals: ProposalsScreen,
  battle: BattlePlansScreen,
  letters: LettersScreen,
  treasury: TreasuryScreen,
  masterdata: MasterDataScreen,
};

export default function App() {
  const game = useGame();
  const screen = useUiStore((s) => s.screen);
  // The end-of-campaign panel replaces the screen until the player chooses to review the ledger.
  const reviewing = useUiStore((s) => s.reviewingEnd);
  const reviewEnd = useUiStore((s) => s.reviewEnd);
  const inGame = !!game;
  // Each screen (and the first morning after the title page) starts at the top, not where the last page was scrolled.
  // Block body: scrollTo returns a Promise in recent browsers, which React would treat as a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, inGame]);
  if (!game) return <TitleScreen />;
  const ended = game.status !== 'playing';
  const Screen = SCREENS[screen];

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <NavRail />
        <main className="content">
          <Suspense fallback={<p className="empty loading">Unrolling the ledger…</p>}>
            {ended && !reviewing ? <GameOverScreen onReview={reviewEnd} /> : <Screen />}
          </Suspense>
        </main>
      </div>
      <BattleReport />
    </div>
  );
}
