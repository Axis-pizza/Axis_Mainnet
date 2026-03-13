import React, { useState, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import type { PredictionGroup } from '../create/manual/PredictionEventCard';
import { PredictionMarketCard } from './PredictionMarketCard';
import styles from './BulkSelectMode.module.css';

interface BulkSelectModeProps {
  markets: PredictionGroup[];
  onAddBulk: (selections: Array<{ group: PredictionGroup; side: 'YES' | 'NO' }>) => void;
  onCancel: () => void;
  alreadySelected: Set<string>;
}

interface BulkSelection {
  group: PredictionGroup;
  side: 'YES' | 'NO';
}

export const BulkSelectMode: React.FC<BulkSelectModeProps> = ({
  markets,
  onAddBulk,
  onCancel,
  alreadySelected,
}) => {
  const [selections, setSelections] = useState<Map<string, BulkSelection>>(new Map());
  const [selectAllChecked, setSelectAllChecked] = useState(false);

  const handleToggleMarket = useCallback(
    (group: PredictionGroup, side: 'YES' | 'NO') => {
      setSelections(prev => {
        const newMap = new Map(prev);
        const key = `${group.marketId}-${side}`;
        
        if (newMap.has(key)) {
          newMap.delete(key);
        } else {
          // Remove any existing selection for this market (different side)
          const otherKey = `${group.marketId}-${side === 'YES' ? 'NO' : 'YES'}`;
          newMap.delete(otherKey);
          
          newMap.set(key, { group, side });
        }
        
        return newMap;
      });
    },
    []
  );

  const handleSelectAll = useCallback(() => {
    if (selectAllChecked) {
      // Deselect all
      setSelections(new Map());
      setSelectAllChecked(false);
    } else {
      // Select all (YES side by default)
      const newMap = new Map<string, BulkSelection>();
      markets.forEach(group => {
        if (group.yesToken && !alreadySelected.has(group.yesToken.address)) {
          const key = `${group.marketId}-YES`;
          newMap.set(key, { group, side: 'YES' });
        }
      });
      setSelections(newMap);
      setSelectAllChecked(true);
    }
  }, [selectAllChecked, markets, alreadySelected]);

  const handleAddToETF = useCallback(() => {
    const selectedArray = Array.from(selections.values());
    if (selectedArray.length > 0) {
      onAddBulk(selectedArray);
    }
  }, [selections, onAddBulk]);

  const isMarketSelected = useCallback(
    (marketId: string): 'YES' | 'NO' | undefined => {
      const yesKey = `${marketId}-YES`;
      const noKey = `${marketId}-NO`;
      
      if (selections.has(yesKey)) return 'YES';
      if (selections.has(noKey)) return 'NO';
      return undefined;
    },
    [selections]
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <label className={styles.selectAllLabel}>
            <input
              type="checkbox"
              checked={selectAllChecked}
              onChange={handleSelectAll}
              className={styles.checkbox}
            />
            <span>Select All</span>
          </label>
          <div className={styles.divider}>|</div>
          <span className={styles.counter}>
            {selections.size} Selected
          </span>
        </div>
        <div className={styles.headerRight}>
          <button
            onClick={handleAddToETF}
            disabled={selections.size === 0}
            className={`${styles.addButton} ${selections.size === 0 ? styles.disabled : ''}`}
          >
            Add to ETF
          </button>
          <button onClick={onCancel} className={styles.cancelButton}>
            Cancel
          </button>
        </div>
      </div>

      <div className={styles.marketList}>
        {markets.map(group => {
          const selectedSide = isMarketSelected(group.marketId);
          const yesAlreadyAdded = group.yesToken && alreadySelected.has(group.yesToken.address);
          const noAlreadyAdded = group.noToken && alreadySelected.has(group.noToken.address);

          return (
            <div key={group.marketId} className={styles.marketRow}>
              <div className={styles.checkboxColumn}>
                {!yesAlreadyAdded && !noAlreadyAdded && (
                  <input
                    type="checkbox"
                    checked={selectedSide !== undefined}
                    onChange={() => {
                      if (selectedSide) {
                        const key = `${group.marketId}-${selectedSide}`;
                        setSelections(prev => {
                          const newMap = new Map(prev);
                          newMap.delete(key);
                          return newMap;
                        });
                      } else {
                        handleToggleMarket(group, 'YES');
                      }
                    }}
                    className={styles.checkbox}
                  />
                )}
              </div>
              <div className={styles.marketCard}>
                <PredictionMarketCard
                  group={group}
                  selectedSide={yesAlreadyAdded ? 'YES' : noAlreadyAdded ? 'NO' : selectedSide}
                  onAddClick={(g, side) => {
                    if (!yesAlreadyAdded && !noAlreadyAdded) {
                      handleToggleMarket(g, side);
                    }
                  }}
                  bulkMode={!yesAlreadyAdded && !noAlreadyAdded}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
