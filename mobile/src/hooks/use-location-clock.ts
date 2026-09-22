import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Age labels keep advancing even when React Query structurally shares unchanged data. */
export function useLocationClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => setNow(Date.now());
    const sync = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (AppState.currentState === 'active') {
        update();
        timer = setInterval(update, 30_000);
      }
    };
    sync();
    const sub = AppState.addEventListener('change', sync);
    return () => { if (timer) clearInterval(timer); sub.remove(); };
  }, []);
  return now;
}
