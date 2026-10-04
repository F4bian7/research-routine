// Minimal change notification: repos call notifyChange() after a write,
// screens re-run their queries via useQuery().
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyChange() {
  for (const l of listeners) l();
}

export function subscribeChanges(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
