import { useState } from 'react';
import styles from './CookieBanner.module.css';

// Deliberately non-deterministic: shows on ~50% of page loads so the
// recorder/replayer has to treat this step as optional, not assume it exists.
function shouldShowOnThisLoad(): boolean {
  return Math.random() < 0.5;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(shouldShowOnThisLoad);

  if (!visible) return null;

  return (
    <div className={styles.banner}>
      <p className={styles.text}>
        We use cookies to keep this order console running smoothly. Choose an
        option to continue.
      </p>
      <div className={styles.actions}>
        <button
          className={`${styles.button} ${styles.decline}`}
          onClick={() => setVisible(false)}
        >
          Decline
        </button>
        <button
          className={`${styles.button} ${styles.accept}`}
          onClick={() => setVisible(false)}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
