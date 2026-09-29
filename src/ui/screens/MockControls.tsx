import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useSubmissions } from '../../api/submissionsContext';
import { resetMocks } from '../../mocks/handlers';
import { SCENARIOS, loadMockSettings, saveMockSettings, type ScenarioId } from '../../mocks/scenarios';

/**
 * Picks the behaviour of the mock backend (the game has no real one) and restores its initial state.
 * Changes apply to the very next request; cached lists are reset so the new behaviour is visible at once.
 */
export function MockControls() {
  const id = useId();
  const queryClient = useQueryClient();
  const { clearPending } = useSubmissions();
  const [settings, setSettings] = useState(loadMockSettings);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  const current = SCENARIOS.find((s) => s.id === settings.scenario);

  const refreshLists = () => {
    void queryClient.resetQueries({ queryKey: ['ranking'] });
    void queryClient.resetQueries({ queryKey: ['history'] });
  };

  const apply = (next: typeof settings, message: string) => {
    saveMockSettings(next);
    setSettings(next);
    setNote(message);
    refreshLists();
  };

  return (
    <section className="mock" aria-labelledby={`${id}-title`} data-testid="mock-controls">
      <h2 id={`${id}-title`}>Network simulation</h2>
      <p className="mock__intro">This game has no real server. Pick how the mock ranking and history API behaves to try loading, empty and failure states.</p>

      <label htmlFor={`${id}-scenario`}>Scenario</label>
      <select
        id={`${id}-scenario`}
        className="mock__select"
        value={settings.scenario}
        aria-describedby={`${id}-desc`}
        data-testid="scenario-select"
        onChange={(e) => {
          const scenario = e.target.value as ScenarioId;
          const label = SCENARIOS.find((s) => s.id === scenario)?.label ?? scenario;
          apply({ ...settings, scenario }, `Scenario set to “${label}”.`);
        }}
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <p id={`${id}-desc`} className="mock__desc" data-testid="scenario-description">
        {current?.description}
      </p>

      <label className="mock__check">
        <input
          type="checkbox"
          checked={settings.latencyScale === 0}
          data-testid="instant-toggle"
          onChange={(e) => {
            apply({ ...settings, latencyScale: e.target.checked ? 0 : 1 }, e.target.checked ? 'Responses are now instant.' : 'Simulated latency is back on.');
          }}
        />
        Instant responses (no simulated delay)
      </label>

      {confirming ? (
        <div className="mock__confirm" role="group" aria-label="Confirm reset">
          <span>Erase recorded matches and pending results?</span>
          <button
            type="button"
            className="pager__btn"
            data-testid="reset-mocks-confirm"
            onClick={() => {
              resetMocks();
              clearPending();
              setSettings(loadMockSettings());
              setConfirming(false);
              setNote('Mock data reset to its initial state.');
              refreshLists();
            }}
          >
            Yes, reset
          </button>
          <button
            type="button"
            className="pager__btn"
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="pager__btn mock__reset"
          data-testid="reset-mocks"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Reset mock data
        </button>
      )}
      <p className="mock__note" role="status" data-testid="mock-note">
        {note}
      </p>
    </section>
  );
}
