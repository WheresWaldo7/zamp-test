import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Order } from '../../types/order';
import { isV2 } from '../../variant';
import v1 from './OrdersTable.module.css';
import v2 from './OrdersTable.v2.module.css';

const ROW_HEIGHT = 44;

// The two stylesheets are structurally identical but share no class names,
// so this mapping is the whole "v2 renamed everything" change as far as the
// component is concerned.
const s = isV2
  ? {
      scrollContainer: v2.gridViewport,
      header: v2.columnHeadings,
      virtualInner: v2.virtualCanvas,
      row: v2.recordLine,
      rowSelected: v2.recordLineActive,
      cellMuted: v2.subtleCell,
      badge: v2.statusPill,
      pending: v2.pillPending,
      processing: v2.pillProcessing,
      shipped: v2.pillShipped,
      delivered: v2.pillDelivered,
      cancelled: v2.pillCancelled,
    }
  : {
      scrollContainer: v1.scrollContainer,
      header: v1.header,
      virtualInner: v1.virtualInner,
      row: v1.row,
      rowSelected: v1.rowSelected,
      cellMuted: v1.cellMuted,
      badge: v1.badge,
      pending: v1.badgePending,
      processing: v1.badgeProcessing,
      shipped: v1.badgeShipped,
      delivered: v1.badgeDelivered,
      cancelled: v1.badgeCancelled,
    };

const STATUS_BADGE_CLASS: Record<Order['status'], string> = {
  pending: s.pending,
  processing: s.processing,
  shipped: s.shipped,
  delivered: s.delivered,
  cancelled: s.cancelled,
};

/** v2 nests the rows one level deeper. `display: contents` means the extra
 *  element produces no box at all, so the table looks identical while every
 *  row's structural path gains a segment — the kind of invisible-but-real
 *  churn that quietly invalidates position-based selectors. */
function RowGroup({ children }: { children: React.ReactNode }) {
  if (!isV2) return <>{children}</>;
  return <div className={v2.rowGroup}>{children}</div>;
}

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
    <div className={s.scrollContainer} ref={scrollRef}>
      <div className={s.header}>
        <span>ID</span>
        <span>Company</span>
        <span>Customer</span>
        <span>Placed</span>
        <span>Total</span>
        <span>Status</span>
      </div>
      <div className={s.virtualInner} style={{ height: virtualizer.getTotalSize() }}>
        <RowGroup>
          {virtualizer.getVirtualItems().map((virtualRow) => {
          const order = orders[virtualRow.index];
          const cells = (
            <>
              <span className={s.cellMuted}>{order.id}</span>
              <span>{order.company}</span>
              <span>{order.customer}</span>
              <span className={s.cellMuted}>{new Date(order.placedAt).toLocaleDateString()}</span>
              <span>${order.total.toFixed(2)}</span>
              <span className={`${s.badge} ${STATUS_BADGE_CLASS[order.status]}`}>{order.status}</span>
            </>
          );

          return (
            <div
              key={order.id}
              className={`${s.row} ${order.id === selectedId ? s.rowSelected : ''}`}
              style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              onClick={() => onSelect(order.id)}
            >
              {/* v2 introduces an inner wrapper, so every cell sits one level
                  deeper than the recording expects. */}
              {isV2 ? <div className={v2.recordLineInner}>{cells}</div> : cells}
            </div>
          );
          })}
        </RowGroup>
      </div>
    </div>
  );
}
