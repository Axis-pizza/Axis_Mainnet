import React from 'react';
import styles from './SortDropdown.module.css';

export type SortOption = 'volume' | 'close-race' | 'ending-soon' | 'recently-added';

interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'volume', label: 'Volume (High → Low)' },
  { value: 'close-race', label: 'Close Race (45-55%)' },
  { value: 'ending-soon', label: 'Ending Soon' },
  { value: 'recently-added', label: 'Recently Added' },
];

export const SortDropdown: React.FC<SortDropdownProps> = ({ value, onChange }) => {
  const selectedLabel = SORT_OPTIONS.find(opt => opt.value === value)?.label || 'Volume (High → Low)';

  return (
    <div className={styles.container}>
      <label className={styles.label}>Sort By</label>
      <div className={styles.selectWrapper}>
        <select
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value as SortOption)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          className={styles.icon}
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
};
