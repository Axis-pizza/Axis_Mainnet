/**
 * WeightControl - Weight adjustment component (React Native)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

interface WeightControlProps {
  value: number;
  onChange: (value: number) => void;
  totalWeight: number;
  disabled?: boolean;
}

const QUICK_VALUES = [10, 25, 50];
const STEP_AMOUNT = 1;

export const WeightControl = ({
  value,
  onChange,
  totalWeight,
  disabled = false,
}: WeightControlProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    if (!isEditing) {
      setInputValue(value.toString());
    }
  }, [value, isEditing]);

  const handleChange = (newValue: number) => {
    if (disabled) return;
    onChange(Math.max(0, Math.min(100, newValue)));
  };

  const handleIncrement = () => handleChange(value + STEP_AMOUNT);
  const handleDecrement = () => handleChange(value - STEP_AMOUNT);
  const handleQuickSet = (val: number) => handleChange(val);

  const handleInputBlur = () => {
    setIsEditing(false);
    const parsed = parseInt(inputValue);
    if (!isNaN(parsed)) {
      handleChange(parsed);
    } else {
      setInputValue(value.toString());
    }
  };

  const isOverLimit = totalWeight > 100;
  const trackColor = isOverLimit ? '#EF4444' : value === 0 ? 'rgba(255,255,255,0.2)' : '#F97316';
  const textColor = isOverLimit ? '#F87171' : '#fff';

  const trackWidth = `${Math.min(100, value)}%`;

  return (
    <View style={{ gap: 12 }}>
      {/* Row 1: Track + Value */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Track */}
        <View style={{ flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
          <View
            style={{
              width: trackWidth as any,
              height: '100%',
              backgroundColor: trackColor,
              borderRadius: 4,
            }}
          />
        </View>

        {/* Value Display / Input */}
        <View style={{ width: 64 }}>
          {isEditing ? (
            <TextInput
              value={inputValue}
              onChangeText={(t) => setInputValue(t.replace(/[^0-9]/g, ''))}
              onBlur={handleInputBlur}
              onSubmitEditing={handleInputBlur}
              keyboardType="numeric"
              maxLength={3}
              autoFocus
              style={{
                height: 40,
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderWidth: 2,
                borderColor: isOverLimit ? '#EF4444' : '#F97316',
                borderRadius: 12,
                textAlign: 'center',
                fontSize: 18,
                fontWeight: 'bold',
                color: textColor,
              }}
            />
          ) : (
            <Pressable
              onPress={() => { if (!disabled) { setIsEditing(true); } }}
              disabled={disabled}
              style={{
                height: 40,
                borderRadius: 12,
                backgroundColor: disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: textColor, fontWeight: 'bold', fontSize: 18, fontFamily: 'monospace' }}>
                {value}%
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Row 2: Quick Buttons + Stepper */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* Quick Value Buttons */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {QUICK_VALUES.map((qv) => (
            <Pressable
              key={qv}
              onPress={() => handleQuickSet(qv)}
              disabled={disabled}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: value === qv ? '#F97316' : disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: value === qv ? '#fff' : disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)' }}>
                {qv}%
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1 }} />

        {/* Stepper */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable
            onPress={handleDecrement}
            disabled={disabled || value <= 0}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.1)',
              opacity: (disabled || value <= 0) ? 0.3 : 1,
            }}
          >
            <Minus size={12} color="rgba(255,255,255,0.6)" />
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: 'rgba(255,255,255,0.6)' }}>{STEP_AMOUNT}</Text>
          </Pressable>

          <Pressable
            onPress={handleIncrement}
            disabled={disabled || value >= 100}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.1)',
              opacity: (disabled || value >= 100) ? 0.3 : 1,
            }}
          >
            <Plus size={12} color="rgba(255,255,255,0.6)" />
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: 'rgba(255,255,255,0.6)' }}>{STEP_AMOUNT}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default WeightControl;
