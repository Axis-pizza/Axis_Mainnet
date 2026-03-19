import React from 'react';
import styles from './DateFilter.module.css';

export type DateFilterValue = 'any-time' | 'next-24h' | 'this-week' | 'this-month' | 'custom';

interface DateFilterProps {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
}

const DATE_FILTER_OPTIONS: { value: DateFilterValue; label: string }[] = [
  { value: 'any-time', label: 'Any Time' },
  { value: 'next-24h', label: 'Next 24 Hours' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
];

export const DateFilter: React.FC<DateFilterProps> = ({ value, onChange }) => {
  const selectedLabel = DATE_FILTER_OPTIONS.find(opt => opt.value === value)?.label || 'Any Time';

  return (
    <div className={styles.container}>
      <label className={styles.label}>End Date</label>
      <div className={styles.selectWrapper}>
        <select
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value as DateFilterValue)}
        >
          {DATE_FILTER_OPTIONS.map((option) => (
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
