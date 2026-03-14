import { useState, useEffect } from 'react';

/**
 * Tracks window.visualViewport.height so containers can shrink
 * when the iOS keyboard opens (with Keyboard.resize: 'none').
 */
export function useViewportHeight() {
  const [height, setHeight] = useState(() =>
    window.visualViewport?.height ?? window.innerHeight
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => setHeight(vv.height);
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return height;
}
