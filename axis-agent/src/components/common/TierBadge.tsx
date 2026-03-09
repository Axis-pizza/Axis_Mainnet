const TIER_CONFIG: Record<string, {
  label: string;
  icon: string;
  gradient: string;
  border: string;
  text: string;
  glow: string;
}> = {
  Novice: {
    label: 'Novice',
    icon: '○',
    gradient: 'from-white/5 to-white/10',
    border: 'border-white/20',
    text: 'text-white/50',
    glow: '',
  },
  Bronze: {
    label: 'Bronze',
    icon: '◆',
    gradient: 'from-[#CD7F32]/15 to-[#a0612a]/10',
    border: 'border-[#CD7F32]/50',
    text: 'text-[#CD7F32]',
    glow: 'shadow-[0_0_8px_rgba(205,127,50,0.25)]',
  },
  Silver: {
    label: 'Silver',
    icon: '◆',
    gradient: 'from-[#C0C0C0]/15 to-[#a0a0a0]/10',
    border: 'border-[#C0C0C0]/50',
    text: 'text-[#C0C0C0]',
    glow: 'shadow-[0_0_8px_rgba(192,192,192,0.25)]',
  },
  Gold: {
    label: 'Gold',
    icon: '◆',
    gradient: 'from-[#c9a84c]/20 to-[#7a5c18]/10',
    border: 'border-[#c9a84c]/50',
    text: 'text-amber-400',
    glow: 'shadow-[0_0_10px_rgba(201,168,76,0.3)]',
  },
  Diamond: {
    label: 'Diamond',
    icon: '◈',
    gradient: 'from-cyan-400/15 to-sky-500/10',
    border: 'border-cyan-400/50',
    text: 'text-cyan-300',
    glow: 'shadow-[0_0_12px_rgba(103,232,249,0.3)]',
  },
  Legend: {
    label: 'Legend',
    icon: '✦',
    gradient: 'from-purple-500/20 via-[#c9a84c]/15 to-purple-500/10',
    border: 'border-purple-400/50',
    text: 'text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-amber-300 to-purple-300',
    glow: 'shadow-[0_0_14px_rgba(168,85,247,0.35)]',
  },
};

interface TierBadgeProps {
  tier: string;
  size?: 'sm' | 'md' | 'lg';
}

export const TierBadge = ({ tier, size = 'sm' }: TierBadgeProps) => {
  const config = TIER_CONFIG[tier] ?? TIER_CONFIG.Novice;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  };

  return (
    <div
      className={`
        inline-flex items-center rounded-full font-bold
        bg-gradient-to-r ${config.gradient}
        border ${config.border}
        ${config.glow}
        ${sizeClasses[size]}
      `}
    >
      <span className={`${config.text} leading-none`}>{config.icon}</span>
      <span className={config.text}>{config.label}</span>
    </div>
  );
};
