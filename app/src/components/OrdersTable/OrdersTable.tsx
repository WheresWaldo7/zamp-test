import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Order } from '../../types/order';
import styles from './OrdersTable.module.css';

const ROW_HEIGHT = 44;

const STATUS_BADGE_CLASS: Record<Order['status'], string> = {
  pending: styles.badgePending,
  processing: styles.badgeProcessing,
  shipped: styles.badgeShipped,
  delivered: styles.badgeDelivered,
  cancelled: styles.badgeCancelled,
};

interface OrdersTableProps {
  orders: Order[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function OrdersTable({ orders, selectedId, onSelect }: OrdersTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className={styles.scrollContainer} ref={scrollRef}>
      <div className={styles.header}>
        <span>ID</span>
        <span>Company</span>
        <span>Customer</span>
        <span>Placed</span>
        <span>Total</span>
        <span>Status</span>
      </div>
      <div
        className={styles.virtualInner}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const order = orders[virtualRow.index];
          return (
            <div
              key={order.id}
              className={`${styles.row} ${order.id === selectedId ? styles.rowSelected : ''}`}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onSelect(order.id)}
            >
              <span className={styles.cellMuted}>{order.id}</span>
              <span>{order.company}</span>
              <span>{order.customer}</span>
              <span className={styles.cellMuted}>
                {new Date(order.placedAt).toLocaleDateString()}
              </span>
              <span>${order.total.toFixed(2)}</span>
              <span className={`${styles.badge} ${STATUS_BADGE_CLASS[order.status]}`}>
                {order.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
