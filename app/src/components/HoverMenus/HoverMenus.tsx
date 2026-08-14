import { useState } from 'react';
import styles from './HoverMenus.module.css';

const EXPORT_OPTIONS = ['Export as CSV', 'Export as PDF', 'Export as JSON'];
const HELP_OPTIONS = ['Documentation', 'Keyboard shortcuts', 'Contact support'];

export function HoverMenus() {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className={styles.toolbar}>
      {/* React-driven hover menu: open state lives in useState, toggled via
          onMouseEnter/onMouseLeave. Fully replayable via dispatched events. */}
      <div
        className={styles.menuWrap}
        onMouseEnter={() => setExportOpen(true)}
        onMouseLeave={() => setExportOpen(false)}
      >
        <button className={styles.trigger}>Export ▾</button>
        <div className={exportOpen ? styles.dropdown : styles.reactDropdownHidden}>
          {EXPORT_OPTIONS.map((option) => (
            <div key={option} className={styles.dropdownItem}>
              {option}
            </div>
          ))}
        </div>
      </div>

      {/* CSS-only hover menu: visibility comes from `.cssMenuWrap:hover
          .cssDropdown`. No event fires, so dispatching mouseover/mouseenter
          does not open it — only real pointer input through the rendering
          engine does. */}
      <div className={`${styles.menuWrap} ${styles.cssMenuWrap}`}>
        <button className={styles.trigger}>Help ▾</button>
        <div className={`${styles.dropdown} ${styles.cssDropdown}`}>
          {HELP_OPTIONS.map((option) => (
            <div key={option} className={styles.dropdownItem}>
              {option}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
