import { useGameActions, useScenarioList } from '../hooks';
import { useUiStore } from '../uiStore';

export function TitleScreen() {
  const scenarios = useScenarioList();
  const { loadScenario } = useGameActions();
  const go = useUiStore((s) => s.go);

  return (
    <main className="title-screen">
      <div className="title-card panel">
        <h1 className="title-logo">Quartermaster</h1>
        <p className="title-sub">
          The army marches on its stomach. Keep the stores above the <strong>Must Order Point</strong> on the second
          delivery day, and the banners stay high.
        </p>
        <h2 className="title-choose">Choose a campaign</h2>
        <ul className="scenario-list">
          {scenarios.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="scenario-card"
                data-testid={`start-scenario-${s.id}`}
                onClick={() => {
                  loadScenario(s);
                  go('dispatch');
                }}
              >
                <span className="scenario-title">{s.title}</span>
                <span className="scenario-brief">{s.briefing}</span>
                <span className="scenario-meta">
                  {s.lengthDays} days · teaches {s.teaches.join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
