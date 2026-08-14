import { useEffect, useState } from 'react';
import type { Order, OrderStatus } from '../../types/order';
import { ORDER_STATUSES } from '../../types/order';
import { RatingField } from '../RatingWidget/RatingField';
import styles from './OrderDetailDrawer.module.css';

interface OrderDetailDrawerProps {
  order: Order | null;
  onSave: (id: string, changes: Partial<Order>) => void;
}

export function OrderDetailDrawer({ order, onSave }: OrderDetailDrawerProps) {
  const [status, setStatus] = useState<OrderStatus>('pending');
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!order) return;
    setStatus(order.status);
    setRating(order.rating);
    setNotes(order.notes);
    setSavedAt(null);
  }, [order]);

  if (!order) {
    return <div className={styles.empty}>Select an order to view details</div>;
  }

  const handleSave = () => {
    onSave(order.id, { status, rating, notes });
    setSavedAt(Date.now());
  };

  return (
    <div className={styles.drawer}>
      <div>
        <p className={styles.title}>{order.company}</p>
        <p className={styles.subtitle}>
          {order.id} · {order.customer} · {order.email}
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="order-status">
          Status
        </label>
        <select
          id="order-status"
          className={styles.select}
          value={status}
          onChange={(event) => setStatus(event.target.value as OrderStatus)}
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Rating</span>
        <RatingField value={rating} onChange={setRating} />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="order-notes">
          Notes
        </label>
        <textarea
          id="order-notes"
          className={styles.textarea}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Internal notes about this order…"
        />
      </div>

      <button className={styles.saveButton} onClick={handleSave}>
        Save order
      </button>
      {savedAt !== null && <p className={styles.savedNotice}>Saved</p>}
    </div>
  );
}
