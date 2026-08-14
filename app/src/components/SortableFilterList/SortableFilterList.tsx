import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './SortableFilterList.module.css';

const DEFAULT_VIEWS = ['All orders', 'Needs attention', 'High value', 'Pending', 'Shipped today'];

function SortableItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${styles.item} ${isDragging ? styles.itemDragging : ''}`}
      {...attributes}
      {...listeners}
    >
      {id}
    </li>
  );
}

export function SortableFilterList() {
  const [views, setViews] = useState(DEFAULT_VIEWS);
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setViews((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  return (
    <div className={styles.panel}>
      <p className={styles.label}>Saved views (drag to reorder)</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={views} strategy={horizontalListSortingStrategy}>
          <ul className={styles.list}>
            {views.map((view) => (
              <SortableItem key={view} id={view} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
