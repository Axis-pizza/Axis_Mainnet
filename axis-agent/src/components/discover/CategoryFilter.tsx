import React from 'react';
import styles from './CategoryFilter.module.css';

export type Category = 'politics' | 'sports' | 'crypto' | 'entertainment' | 'world-events' | 'other';

interface CategoryFilterProps {
  selected: Set<Category>;
  onChange: (selected: Set<Category>) => void;
  counts?: Record<Category, number>;
}

const CATEGORIES: Array<{ value: Category; label: string; icon: string }> = [
  { value: 'politics', label: 'Politics', icon: '🏛️' },
  { value: 'sports', label: 'Sports', icon: '⚽' },
  { value: 'crypto', label: 'Crypto', icon: '₿' },
  { value: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { value: 'world-events', label: 'World Events', icon: '🌍' },
  { value: 'other', label: 'Other', icon: '📌' },
];

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selected,
  onChange,
  counts = {},
}) => {
  const handleToggle = (category: Category) => {
    const newSelected = new Set(selected);
    if (newSelected.has(category)) {
      newSelected.delete(category);
    } else {
      newSelected.add(category);
    }
    onChange(newSelected);
  };

  const handleSelectAll = () => {
    if (selected.size === CATEGORIES.length) {
      // Deselect all
      onChange(new Set());
    } else {
      // Select all
      onChange(new Set(CATEGORIES.map(c => c.value)));
    }
  };

  const allSelected = selected.size === CATEGORIES.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Categories</span>
        <button onClick={handleSelectAll} className={styles.selectAllButton}>
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className={styles.list}>
        {CATEGORIES.map(({ value, label, icon }) => {
          const isSelected = selected.has(value);
          const count = counts[value] || 0;
          
          return (
            <label
              key={value}
              className={`${styles.item} ${isSelected ? styles.selected : ''}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggle(value)}
                className={styles.checkbox}
              />
              <span className={styles.icon}>{icon}</span>
              <span className={styles.label}>{label}</span>
              {count > 0 && (
                <span className={styles.count}>({count})</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
};
