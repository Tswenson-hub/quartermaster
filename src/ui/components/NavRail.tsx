import { useExceptionsToday, useGame, useVendorGroups } from '../hooks';
import { useUiStore, type Screen } from '../uiStore';

const TABS: { id: Screen; label: string; flavour: string; colour: string }[] = [
  { id: 'dispatch', label: 'Dispatch', flavour: 'Morning reports', colour: '#a8432a' },
  { id: 'planning', label: 'Item Planning', flavour: 'The clerk’s ledger', colour: '#2c62b0' },
  { id: 'proposals', label: 'Order Proposals', flavour: 'Requisitions', colour: '#b8862f' },
  { id: 'battle', label: 'Battle Plans', flavour: 'Sealed letters', colour: '#7a4fa0' },
  { id: 'letters', label: 'Letters', flavour: 'From command', colour: '#5a4630' },
  { id: 'treasury', label: 'Treasury', flavour: 'The war chest', colour: '#4f7d3a' },
];

export function NavRail() {
  const screen = useUiStore((s) => s.screen);
  const go = useUiStore((s) => s.go);
  const opened = useUiStore((s) => s.openedLetters);
  const read = useUiStore((s) => s.readLetters);
  const game = useGame();
  const exceptions = useExceptionsToday();
  const groups = useVendorGroups();

  const undecided = groups.reduce((a, g) => a + g.lines.filter((l) => !l.decision).length, 0);
  const sealed = game ? game.battlePlans.filter((b) => b.announcedOn <= game.today && !opened[b.id]).length : 0;
  const unread = game ? game.letters.filter((l) => !read[l.id]).length : 0;
  const badge: Partial<Record<Screen, number>> = { dispatch: exceptions.length, proposals: undecided, battle: sealed, letters: unread };

  return (
    <nav className="navrail" aria-label="Screens">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          data-testid={`nav-${t.id}`}
          className={`nav-tab ${screen === t.id ? 'active' : ''}`}
          aria-current={screen === t.id ? 'page' : undefined}
          onClick={() => go(t.id)}
        >
          <span className="icon-tile nav-icon" style={{ background: t.colour }} aria-hidden />
          <span className="nav-text">
            <span className="nav-label">{t.label}</span>
            <span className="nav-flavour">{t.flavour}</span>
          </span>
          {!!badge[t.id] && <span className="nav-badge">{badge[t.id]}</span>}
        </button>
      ))}
    </nav>
  );
}
