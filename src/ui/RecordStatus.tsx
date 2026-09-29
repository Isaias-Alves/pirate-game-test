import { useSubmissions } from '../api/submissionsContext';

/** Shows whether a finished match has been recorded, and lets the player retry if it has not. */
export function RecordStatus({ matchId }: { matchId: string }) {
  const { submissions, retry } = useSubmissions();
  const entry = submissions[matchId];
  if (!entry) return null;

  if (entry.status === 'sending') {
    return (
      <p className="record record--sending" role="status" data-testid="record-status" data-state="sending">
        Recording your match…
      </p>
    );
  }
  if (entry.status === 'confirmed') {
    return (
      <p className="record record--ok" role="status" data-testid="record-status" data-state="confirmed">
        Match recorded in the ranking and your history.
      </p>
    );
  }
  return (
    <div className="record record--failed" role="alert" data-testid="record-status" data-state="failed">
      <p>
        Could not record this match{entry.error ? `: ${entry.error}` : '.'} Your result is saved on this device and will be sent again later.
      </p>
      <button
        type="button"
        className="pager__btn"
        onClick={() => {
          retry(matchId);
        }}
        data-testid="record-retry"
      >
        Try again
      </button>
    </div>
  );
}
