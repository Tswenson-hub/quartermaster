import { lazy, Suspense } from 'react';
import { NavRail } from './ui/components/NavRail';
import { TopBar } from './ui/components/TopBar';
import { useGame, useScenarioOver, useServiceLevel } from './ui/hooks';
import { BattlePlansScreen } from './ui/screens/BattlePlansScreen';
import { DispatchScreen } from './ui/screens/DispatchScreen';
import { ProposalsScreen } from './ui/screens/ProposalsScreen';
import { TitleScreen } from './ui/screens/TitleScreen';
import { useUiStore } from './ui/uiStore';

// Chart screens pull in Recharts; load them on demand to keep the first chunk small.
const PlanningScreen = lazy(() => import('./ui/screens/PlanningScreen').then((m) => ({ default: m.PlanningScreen })));
const TreasuryScreen = lazy(() => import('./ui/screens/TreasuryScreen').then((m) => ({ default: m.TreasuryScreen })));

const SCREENS = {
  dispatch: DispatchScreen,
  planning: PlanningScreen,
  proposals: ProposalsScreen,
  battle: BattlePlansScreen,
  treasury: TreasuryScreen,
};

export default function App() {
  const game = useGame();
  const screen = useUiStore((s) => s.screen);
  const over = useScenarioOver();
  const serviceLevel = useServiceLevel();
  if (!game) return <TitleScreen />;
  const Screen = SCREENS[screen];

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <NavRail />
        <main className="content">
          {over && (
            <div className="banner">
              The campaign is over. You kept the army supplied {serviceLevel}% of the time, with morale at{' '}
              {Math.round(game.morale)}.
            </div>
          )}
          <Suspense fallback={<p className="empty loading">Unrolling the ledger…</p>}>
            <Screen />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
