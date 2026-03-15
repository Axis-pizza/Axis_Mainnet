/**
 * ProbabilityBar.tsx
 * Visual probability bar for prediction market tokens
 * Displays YES (green) / NO (red) probabilities with trend arrows
 */

import React from 'react';
import styles from './ProbabilityBar.module.css';

export interface ProbabilityBarProps {
  yesPrice: number;
  noPrice: number;
  priceChange24h?: number;
  className?: string;
}

export const ProbabilityBar: React.FC<ProbabilityBarProps> = ({
  yesPrice,
  noPrice,
  priceChange24h,
  className,
}) => {
  // Normalize to percentages
  const yesPercent = Math.round(yesPrice * 100);
  const noPercent = Math.round(noPrice * 100);
  
  // Calculate trend arrows
  const yesTrend = priceChange24h && priceChange24h > 0 
    ? `↑ ${Math.abs(Math.round(priceChange24h * 100))}%` 
    : '';
  const noTrend = priceChange24h && priceChange24h < 0 
    ? `↓ ${Math.abs(Math.round(priceChange24h * 100))}%` 
    : '';

  return (
    <div className={`${styles.container} ${className || ''}`}>
      <div className={styles.labels}>
        <div className={styles.yesLabel}>
          <span className={styles.labelText}>YES</span>
          <span className={styles.percentage}>{yesPercent}%</span>
          {yesTrend && <span className={styles.trend}>{yesTrend}</span>}
        </div>
        <div className={styles.noLabel}>
          {noTrend && <span className={styles.trend}>{noTrend}</span>}
          <span className={styles.percentage}>{noPercent}%</span>
          <span className={styles.labelText}>NO</span>
        </div>
      </div>
      
      <div className={styles.barContainer}>
        <div 
          className={styles.yesBar} 
          style={{ width: `${yesPercent}%` }}
        />
        <div 
          className={styles.noBar} 
          style={{ width: `${noPercent}%` }}
        />
      </div>
    </div>
  );
};
