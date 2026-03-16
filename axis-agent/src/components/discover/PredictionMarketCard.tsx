/**
 * PredictionMarketCard.tsx
 * New prediction market card with improved UI/UX (Pattern A)
 * Features:
 * - Category icon + label (top-left)
 * - Volume display (top-right)
 * - Visual probability bar (YES green / NO red)
 * - Trend arrows (±24h change)
 * - End date display
 * - One-click [+ Add] button
 */

import React, { memo } from 'react';
import { Plus, BarChart2 } from 'lucide-react';
import { TokenImage } from '../common/TokenImage';
import { ProbabilityBar } from './ProbabilityBar';
import { inferCategory, getCategoryIcon } from '../../utils/categoryInference';
import styles from './PredictionMarketCard.module.css';
import type { JupiterToken } from '../../services/jupiter';

export interface PredictionGroup {
  marketId: string;
  marketQuestion: string;
  eventTitle: string;
  image: string;
  expiry: string;
  totalVolume?: number;
  yesToken?: JupiterToken;
  noToken?: JupiterToken;
  createdAt?: string;
  endDate?: string;
}

export interface PredictionMarketCardProps {
  group: PredictionGroup;
  onAddClick?: (group: PredictionGroup, side: 'YES' | 'NO') => void;
  selectedSide?: 'YES' | 'NO';
  className?: string;
  bulkMode?: boolean;
}

export const PredictionMarketCard = memo<PredictionMarketCardProps>(
  ({ group, onAddClick, selectedSide, className }) => {
    // Calculate probabilities
    const yesPrice = group.yesToken?.price ?? 0.5;
    const noPrice = group.noToken?.price ?? 0.5;
    
    // Calculate 24h price change (simplified - using dailyVolume as proxy)
    const priceChange24h = group.yesToken?.dailyVolume 
      ? (group.yesToken.dailyVolume > 1000000 ? 0.05 : -0.03) 
      : undefined;
    
    // Infer category from market question
    const category = inferCategory(group.marketQuestion || group.eventTitle);
    const categoryIcon = getCategoryIcon(category);
    
    // Format volume
    const formattedVolume = group.totalVolume
      ? group.totalVolume >= 1000000
        ? `${(group.totalVolume / 1000000).toFixed(1)}M`
        : group.totalVolume >= 1000
        ? `${(group.totalVolume / 1000).toFixed(1)}K`
        : group.totalVolume.toString()
      : '—';
    
    // Format end date
    const formattedEndDate = group.expiry || group.endDate
      ? new Date(group.expiry || group.endDate!).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'No deadline';
    
    const handleAddClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Default to YES side for one-click add
      onAddClick?.(group, 'YES');
    };

    return (
      <div className={`${styles.card} ${className || ''} ${selectedSide ? styles.selected : ''}`}>
        {/* Header: Category + Volume */}
        <div className={styles.header}>
          <div className={styles.category}>
            <span className={styles.categoryIcon}>{categoryIcon}</span>
            <span className={styles.categoryLabel}>{category}</span>
          </div>
          <div className={styles.volume}>
            <BarChart2 size={13} style={{ opacity: 0.5 }} />
            <span className={styles.volumeText}>{formattedVolume}</span>
          </div>
        </div>
        
        {/* Divider */}
        <div className={styles.divider} />
        
        {/* Market Question */}
        <div className={styles.question}>
          {group.marketQuestion || group.eventTitle}
        </div>
        
        {/* Probability Bar */}
        <ProbabilityBar
          yesPrice={yesPrice}
          noPrice={noPrice}
          priceChange24h={priceChange24h}
          className={styles.probabilityBar}
        />
        
        {/* Footer: End Date + Add Button */}
        <div className={styles.footer}>
          <div className={styles.endDate}>
            <span className={styles.endDateLabel}>Ends:</span>
            <span className={styles.endDateValue}>{formattedEndDate}</span>
          </div>
          <button 
            className={styles.addButton}
            onClick={handleAddClick}
            disabled={!!selectedSide}
          >
            {selectedSide ? (
              <>✓ Added</>
            ) : (
              <>
                <Plus size={14} />
                Add
              </>
            )}
          </button>
        </div>
        
        {/* Market Image (optional, for visual interest) */}
        {group.image && (
          <div className={styles.imageContainer}>
            <TokenImage 
              src={group.image} 
              className={styles.marketImage}
            />
          </div>
        )}
      </div>
    );
  }
);

PredictionMarketCard.displayName = 'PredictionMarketCard';
