import React from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
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
  const handlePreset = (preset: PresetType) => {
    onChange(PRESETS[preset]);
  };

  const isActivePreset = (preset: PresetType): boolean => {
    const [presetMin, presetMax] = PRESETS[preset];
    return value[0] === presetMin && value[1] === presetMax;
  };

  return (
    <div className={styles.container}>
      <label className={styles.label}>Probability Range</label>
      
      <div className={styles.sliderWrapper}>
        <Slider
          range
          min={0}
          max={100}
          value={value}
          onChange={(val) => {
            if (Array.isArray(val) && val.length === 2) {
              onChange([val[0] as number, val[1] as number]);
            }
          }}
          className={styles.slider}
          trackStyle={[{ backgroundColor: '#22c55e' }]}
          handleStyle={[
            { borderColor: '#22c55e', backgroundColor: '#fff' },
            { borderColor: '#22c55e', backgroundColor: '#fff' },
          ]}
          railStyle={{ backgroundColor: '#e5e7eb' }}
        />
      </div>

      <div className={styles.valueDisplay}>
        <span className={styles.valueLabel}>{value[0]}%</span>
        <span className={styles.valueLabel}>{value[1]}%</span>
      </div>

      <div className={styles.presets}>
        <button
          className={`${styles.presetBtn} ${isActivePreset('all') ? styles.active : ''}`}
          onClick={() => handlePreset('all')}
        >
          All
        </button>
        <button
          className={`${styles.presetBtn} ${isActivePreset('close') ? styles.active : ''}`}
          onClick={() => handlePreset('close')}
        >
          Close (45-55%)
        </button>
        <button
          className={`${styles.presetBtn} ${isActivePreset('likely') ? styles.active : ''}`}
          onClick={() => handlePreset('likely')}
        >
          Likely (&gt;70%)
        </button>
        <button
          className={`${styles.presetBtn} ${isActivePreset('unlikely') ? styles.active : ''}`}
          onClick={() => handlePreset('unlikely')}
        >
          Unlikely (&lt;30%)
        </button>
      </div>
    </div>
  );
};
