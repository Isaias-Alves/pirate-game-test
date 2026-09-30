import { useSubmissions } from '../api/submissionsContext';

/**
 * Shows whether a finished match has been recorded, and lets the player retry if it has not.
 * The box keeps the same size in every state (see `.record` in screens.css), so the controls below it never
 * jump while a retry is in flight — a double click on "Try again" cannot land on "Play Again".
 */
export function RecordStatus({ matchId }: { matchId: string }) {
  const { submissions, retry } = useSubmissions();
  const entry = submissions[matchId];
  if (!entry) return null;

  if (entry.status === 'confirmed') {
    return (
      <div className="record record--ok" role="status" data-testid="record-status" data-state="confirmed">
        <p>
          Match recorded in the ranking and your history.
          {entry.rank && entry.rank.position > 0 && (
            <>
              {' '}
              <strong data-testid="record-rank">
                #{entry.rank.position} of {entry.rank.of}
              </strong>{' '}
              for this setup.
            </>
          )}
        </p>
      </div>
    );
  }

  const failed = entry.status === 'failed';
  return (
    <div
      className={failed ? 'record record--failed' : 'record record--sending'}
      role={failed ? 'alert' : 'status'}
      data-testid="record-status"
      data-state={entry.status}
    >
      <p>
        {failed
          ? `Could not record this match${entry.error ? `: ${entry.error}` : '.'} Your result is saved on this device and will be sent again later.`
          : 'Recording your match…'}
      </p>
      <button
        type="button"
        className="pager__btn"
        disabled={!failed}
        onClick={() => {
          retry(matchId);
        }}
        data-testid="record-retry"
      >
        {failed ? 'Try again' : 'Sending…'}
      </button>
    </div>
  );
}
