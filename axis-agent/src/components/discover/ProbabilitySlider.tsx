import React, { useRef } from 'react';
import styles from './ProbabilitySlider.module.css';

interface ProbabilitySliderProps {
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

type PresetType = 'all' | 'close' | 'likely' | 'unlikely';

const PRESETS: Record<PresetType, [number, number]> = {
  all: [0, 100],
  close: [45, 55],
  likely: [70, 100],
  unlikely: [0, 30],
};

export const ProbabilitySlider: React.FC<ProbabilitySliderProps> = ({ value, onChange }) => {
  const rangeRef = useRef<HTMLDivElement>(null);
  const [min, max] = value;

  const handlePreset = (preset: PresetType) => {
    onChange(PRESETS[preset]);
  };

  const isActivePreset = (preset: PresetType): boolean => {
    const [presetMin, presetMax] = PRESETS[preset];
    return min === presetMin && max === presetMax;
  };

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = Math.min(Number(e.target.value), max - 1);
    onChange([newMin, max]);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = Math.max(Number(e.target.value), min + 1);
    onChange([min, newMax]);
  };

  const minPercent = min;
  const maxPercent = max;

  return (
    <div className={styles.container}>
      <label className={styles.label}>Probability Range</label>

      <div className={styles.sliderWrapper} ref={rangeRef}>
        <div className={styles.rangeTrack}>
          <div
            className={styles.rangeHighlight}
            style={{ left: `${minPercent}%`, width: `${maxPercent - minPercent}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={min}
            onChange={handleMinChange}
            className={styles.rangeInput}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={max}
            onChange={handleMaxChange}
            className={styles.rangeInput}
          />
        </div>
      </div>

      <div className={styles.valueDisplay}>
        <span className={styles.valueLabel}>{min}%</span>
        <span className={styles.valueLabel}>{max}%</span>
      </div>

      <div className={styles.presets}>
        {(['all', 'close', 'likely', 'unlikely'] as PresetType[]).map((preset) => (
          <button
            key={preset}
            className={`${styles.presetBtn} ${isActivePreset(preset) ? styles.active : ''}`}
            onClick={() => handlePreset(preset)}
          >
            {preset === 'all' && 'All'}
            {preset === 'close' && 'Close (45-55%)'}
            {preset === 'likely' && 'Likely (>70%)'}
            {preset === 'unlikely' && 'Unlikely (<30%)'}
          </button>
        ))}
      </div>
    </div>
  );
};
