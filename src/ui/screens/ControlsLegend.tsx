/** Key list, shared by the main menu legend and the pause dialog. Keys match input/KeyboardInput.ts. */
export function ControlsList() {
  return (
    <dl className="controls__list">
      <div>
        <dt>Sail forward</dt>
        <dd>
          <kbd>W</kbd> <kbd>↑</kbd>
        </dd>
      </div>
      <div>
        <dt>Turn left / right</dt>
        <dd>
          <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd>
        </dd>
      </div>
      <div>
        <dt>Fire front cannon</dt>
        <dd>
          <kbd>Space</kbd>
        </dd>
      </div>
      <div>
        <dt>Fire left broadside</dt>
        <dd>
          <kbd>Q</kbd>
        </dd>
      </div>
      <div>
        <dt>Fire right broadside</dt>
        <dd>
          <kbd>E</kbd>
        </dd>
      </div>
      <div>
        <dt>Pause / resume</dt>
        <dd>
          <kbd>Esc</kbd> <kbd>P</kbd>
        </dd>
      </div>
      <div>
        <dt>Sound on / off</dt>
        <dd>
          <kbd>M</kbd>
        </dd>
      </div>
    </dl>
  );
}

/** Controls reference shown on the main menu. */
export function ControlsLegend() {
  return (
    <section className="controls" aria-labelledby="controls-title">
      <h2 id="controls-title">Controls</h2>
      <ControlsList />
      <p className="controls__note">On touch screens, use the buttons on the sides of the arena. Hold several at once to sail and fire together.</p>
    </section>
  );
}
