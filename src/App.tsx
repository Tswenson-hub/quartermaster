import { NavRail } from './ui/components/NavRail';
import { TopBar } from './ui/components/TopBar';
import { useGame, useScenarioOver, useServiceLevel } from './ui/hooks';
import { BattlePlansScreen } from './ui/screens/BattlePlansScreen';
import { DispatchScreen } from './ui/screens/DispatchScreen';
import { PlanningScreen } from './ui/screens/PlanningScreen';
import { ProposalsScreen } from './ui/screens/ProposalsScreen';
import { TitleScreen } from './ui/screens/TitleScreen';
import { TreasuryScreen } from './ui/screens/TreasuryScreen';
import { useUiStore } from './ui/uiStore';

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
          <Screen />
        </main>
      </div>
    </div>
  );
}
