import type { OrderStatus } from '../../types/order';
import { ORDER_STATUSES } from '../../types/order';
import styles from './FilterBar.module.css';

interface FilterBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  status: OrderStatus | 'all';
  onStatusChange: (value: OrderStatus | 'all') => void;
  resultCount: number;
}

export function FilterBar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  resultCount,
}: FilterBarProps) {
  return (
    <div className={styles.bar}>
      <input
        className={styles.input}
        type="text"
        placeholder="Filter by company or customer…"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <select
        className={styles.select}
        value={status}
        onChange={(event) => onStatusChange(event.target.value as OrderStatus | 'all')}
      >
        <option value="all">All statuses</option>
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s[0].toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>
      <span className={styles.count}>{resultCount} orders</span>
    </div>
  );
}
