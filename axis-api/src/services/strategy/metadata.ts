type StrategyConfig = Record<string, unknown>;

function isRecord(value: unknown): value is StrategyConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function mergeStrategyConfigForStorage(
  config: unknown,
  opts: {
    protocol?: unknown;
    logoUrl?: unknown;
    metadataUri?: unknown;
  } = {},
): StrategyConfig {
  const merged: StrategyConfig = isRecord(config) ? { ...config } : {};
  const protocol = optionalString(opts.protocol);
  const logoUrl = optionalString(opts.logoUrl);
  const metadataUri = optionalString(opts.metadataUri);

  if (protocol) merged.protocol = protocol;
  if (logoUrl) merged.logoUrl = logoUrl;
  if (metadataUri) merged.metadataUri = metadataUri;

  return merged;
}

export function readLogoUrlFromConfig(config: unknown): string | null {
  let parsed = config;
  if (typeof config === 'string') {
    try {
      parsed = JSON.parse(config);
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed)) return null;
  return optionalString(parsed.logoUrl) ?? null;
}
