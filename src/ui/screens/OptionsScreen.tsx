import { useId, useState, type SyntheticEvent } from 'react';
import { DEFAULT_OPTIONS, OPTION_LIMITS, loadOptions, saveOptions, validateOptions } from '../../storage/options';
import { useFocusOnMount } from '../useFocusOnMount';

interface Field {
  name: 'sessionSeconds' | 'spawnInterval';
  label: string;
  hint: string;
  step: string;
  inputMode: 'numeric' | 'decimal';
}

const FIELDS: Field[] = [
  {
    name: 'sessionSeconds',
    label: 'Game session time (seconds)',
    hint: `Whole seconds, ${String(OPTION_LIMITS.sessionSeconds.min)} to ${String(OPTION_LIMITS.sessionSeconds.max)}.`,
    step: '1',
    inputMode: 'numeric',
  },
  {
    name: 'spawnInterval',
    label: 'Enemy spawn time (seconds)',
    hint: `Seconds between new enemies, ${String(OPTION_LIMITS.spawnInterval.min)} to ${String(OPTION_LIMITS.spawnInterval.max)}. Lower is harder.`,
    step: '0.1',
    inputMode: 'decimal',
  },
];

export function OptionsScreen({ onBack }: { onBack: () => void }) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const base = useId();
  const [values, setValues] = useState(() => {
    const o = loadOptions();
    return { sessionSeconds: String(o.sessionSeconds), spawnInterval: String(o.spawnInterval) };
  });
  const [errors, setErrors] = useState<ReturnType<typeof validateOptions>['errors']>({});
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const edit = (name: Field['name'], value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setSaved(false);
    setFailed(false);
    // Re-validate live once a field has shown an error, so the message clears as soon as it is fixed.
    if (errors[name]) setErrors((e) => ({ ...e, [name]: validateOptions({ ...values, [name]: value }).errors[name] }));
  };

  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    const result = validateOptions(values);
    setErrors(result.errors);
    if (!result.options) {
      setSaved(false);
      return;
    }
    const ok = saveOptions(result.options);
    setSaved(ok);
    setFailed(!ok);
  };

  const reset = () => {
    setValues({ sessionSeconds: String(DEFAULT_OPTIONS.sessionSeconds), spawnInterval: String(DEFAULT_OPTIONS.spawnInterval) });
    setErrors({});
    setSaved(false);
    setFailed(false);
  };

  return (
    <main className="scene options" data-testid="screen-options">
      <div className="panel options__panel">
        <h1 ref={heading} tabIndex={-1} className="options__title">
          Options
        </h1>
        <form onSubmit={submit} noValidate>
          {FIELDS.map((f) => {
            const id = `${base}-${f.name}`;
            const error = errors[f.name];
            return (
              <div className="field" key={f.name}>
                <label htmlFor={id}>{f.label}</label>
                <input
                  id={id}
                  name={f.name}
                  type="number"
                  inputMode={f.inputMode}
                  step={f.step}
                  min={OPTION_LIMITS[f.name].min}
                  max={OPTION_LIMITS[f.name].max}
                  value={values[f.name]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-hint ${id}-error`}
                  onChange={(e) => {
                    edit(f.name, e.target.value);
                  }}
                />
                <p id={`${id}-hint`} className="field__hint">
                  {f.hint}
                </p>
                <p id={`${id}-error`} className="field__error" role="alert">
                  {error}
                </p>
              </div>
            );
          })}

          <p className="options__status" role="status">
            {saved && 'Options saved.'}
            {failed && 'Could not save options in this browser.'}
          </p>

          <div className="options__actions">
            <button type="submit" className="btn" data-testid="save-options">
              Save
            </button>
            <button type="button" className="btn btn--secondary btn--small" onClick={reset} data-testid="reset-options">
              Defaults
            </button>
            <button type="button" className="btn btn--secondary btn--small" onClick={onBack} data-testid="back">
              Back
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
