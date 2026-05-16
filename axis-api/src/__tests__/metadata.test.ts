import { describe, expect, it } from 'vitest';
import {
  mergeStrategyConfigForStorage,
  readLogoUrlFromConfig,
} from '../services/strategy/metadata';

describe('strategy metadata helpers', () => {
  it('persists ETF logo and metadata URI without dropping existing config', () => {
    const config = mergeStrategyConfigForStorage(
      { protocol: 'axis-vault', weightsBps: [5000, 5000] },
      {
        logoUrl: 'https://axis.example/upload/image/strategy/logo.webp',
        metadataUri: 'https://axis.example/metadata/mint/ETFmint',
      },
    );

    expect(config).toEqual({
      protocol: 'axis-vault',
      weightsBps: [5000, 5000],
      logoUrl: 'https://axis.example/upload/image/strategy/logo.webp',
      metadataUri: 'https://axis.example/metadata/mint/ETFmint',
    });
  });

  it('reads creator logo URL from stored strategy config JSON', () => {
    expect(
      readLogoUrlFromConfig(
        JSON.stringify({ logoUrl: 'https://axis.example/upload/image/logo.webp' }),
      ),
    ).toBe('https://axis.example/upload/image/logo.webp');
  });

  it('ignores invalid or blank logo config values', () => {
    expect(readLogoUrlFromConfig('{')).toBeNull();
    expect(readLogoUrlFromConfig({ logoUrl: '   ' })).toBeNull();
    expect(readLogoUrlFromConfig({ logoUrl: 123 })).toBeNull();
  });
});
