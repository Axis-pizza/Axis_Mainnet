import React from 'react';
import { View, Text, Pressable, Modal, Image, SafeAreaView } from 'react-native';
import { X, Check } from 'lucide-react-native';
import type { PredictionGroup } from './PredictionEventCard';
import type { JupiterToken } from '../../../services/jupiter';

interface Props {
  group: PredictionGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: JupiterToken) => void;
  selectedTokenAddress?: string;
}

export const PredictionSelectModal = ({ group, isOpen, onClose, onSelect, selectedTokenAddress }: Props) => {
  if (!group) return null;

  const yesProb = group.yesToken?.price != null ? (group.yesToken.price * 100).toFixed(1) : '50.0';
  const noProb = group.noToken?.price != null ? (group.noToken.price * 100).toFixed(1) : '50.0';

  const isYesSelected = selectedTokenAddress === group.yesToken?.address;
  const isNoSelected = selectedTokenAddress === group.noToken?.address;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: '#111',
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
            padding: 24,
            paddingBottom: 40,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flex: 1, paddingRight: 8 }}>
              <Image
                source={{ uri: group.image }}
                style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)' }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }} numberOfLines={1}>
                  {group.eventTitle}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff', lineHeight: 22 }} numberOfLines={3}>
                  {group.marketQuestion}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20 }}
            >
              <X size={20} color="rgba(255,255,255,0.4)" />
            </Pressable>
          </View>

          {/* Probability Bar */}
          <View style={{ marginBottom: 32 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 14, color: '#34D399', fontWeight: 'bold', fontFamily: 'monospace' }}>YES {yesProb}%</Text>
              <Text style={{ fontSize: 14, color: '#F87171', fontWeight: 'bold', fontFamily: 'monospace' }}>NO {noProb}%</Text>
            </View>
            <View style={{ height: 12, width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6, flexDirection: 'row', overflow: 'hidden' }}>
              <View style={{ width: `${yesProb}%` as any, height: '100%', backgroundColor: '#10B981' }} />
              <View style={{ width: `${noProb}%` as any, height: '100%', backgroundColor: '#EF4444' }} />
            </View>
          </View>

          {/* Yes / No Buttons */}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable
              onPress={() => {
                if (group.yesToken) onSelect(group.yesToken);
                onClose();
              }}
              style={{
                flex: 1,
                alignItems: 'center',
                padding: 20,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: isYesSelected ? 'rgba(16,185,129,0.5)' : 'transparent',
                backgroundColor: isYesSelected ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                position: 'relative',
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#34D399', marginBottom: 4 }}>YES</Text>
              <Text style={{ fontSize: 20, color: '#fff', fontFamily: 'monospace' }}>{yesProb}%</Text>
              {isYesSelected && (
                <View style={{ position: 'absolute', top: 12, right: 12 }}>
                  <Check size={20} color="#10B981" />
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                if (group.noToken) onSelect(group.noToken);
                onClose();
              }}
              style={{
                flex: 1,
                alignItems: 'center',
                padding: 20,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: isNoSelected ? 'rgba(239,68,68,0.5)' : 'transparent',
                backgroundColor: isNoSelected ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                position: 'relative',
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#F87171', marginBottom: 4 }}>NO</Text>
              <Text style={{ fontSize: 20, color: '#fff', fontFamily: 'monospace' }}>{noProb}%</Text>
              {isNoSelected && (
                <View style={{ position: 'absolute', top: 12, right: 12 }}>
                  <Check size={20} color="#EF4444" />
                </View>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
