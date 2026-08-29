import { useEffect, useState } from 'react';
import type { Order, OrderStatus } from '../../types/order';
import { ORDER_STATUSES } from '../../types/order';
import { isV2 } from '../../variant';
import { RatingField } from '../RatingWidget/RatingField';
import v1 from './OrderDetailDrawer.module.css';
import v2 from './OrderDetailDrawer.v2.module.css';

const s = isV2
  ? {
      drawer: v2.detailPane,
      empty: v2.detailPaneEmpty,
      title: v2.orderName,
      subtitle: v2.orderMeta,
      field: v2.fieldGroup,
      label: v2.fieldCaption,
      select: v2.dropdown,
      textarea: v2.noteArea,
      saveButton: v2.commitAction,
      savedNotice: v2.commitConfirmation,
    }
  : {
      drawer: v1.drawer,
      empty: v1.empty,
      title: v1.title,
      subtitle: v1.subtitle,
      field: v1.field,
      label: v1.label,
      select: v1.select,
      textarea: v1.textarea,
      saveButton: v1.saveButton,
      savedNotice: v1.savedNotice,
    };

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
    return <div className={s.empty}>Select an order to view details</div>;
  }

  const handleSave = () => {
    onSave(order.id, { status, rating, notes });
    setSavedAt(Date.now());
  };

  const saveButton = (
    <button className={s.saveButton} onClick={handleSave}>
      Save order
    </button>
  );

  const heading = (
    <div>
      <p className={s.title}>{order.company}</p>
      <p className={s.subtitle}>
        {order.id} · {order.customer} · {order.email}
      </p>
    </div>
  );

  return (
    <div className={s.drawer}>
      {/* The only behavioural difference between versions: in v2 the save
          action lives in a toolbar beside the heading rather than at the
          bottom of the form. Its accessible name is unchanged, which is
          exactly the kind of thing a role-based selector should survive and
          a structural one should not. */}
      {isV2 ? (
        <div className={v2.paneToolbar}>
          <div className={v2.paneHeading}>{heading}</div>
          {saveButton}
        </div>
      ) : (
        heading
      )}

      <div className={s.field}>
        <label className={s.label} htmlFor="order-status">
          Status
        </label>
        <select
          id="order-status"
          className={s.select}
          value={status}
          onChange={(event) => setStatus(event.target.value as OrderStatus)}
        >
          {ORDER_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option[0].toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <span className={s.label}>Rating</span>
        <RatingField value={rating} onChange={setRating} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="order-notes">
          Notes
        </label>
        <textarea
          id="order-notes"
          className={s.textarea}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Internal notes about this order…"
        />
      </div>

      {!isV2 && saveButton}
      {savedAt !== null && <p className={s.savedNotice}>Saved</p>}
    </div>
  );
}
