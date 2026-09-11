import React from 'react';

export const Badge = ({ children, variant = 'purple', className = '' }) => {
  const variantStyles = {
    purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
    pink: 'bg-accent-pink/10 text-accent-pink border-accent-pink/20',
    cyan: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
    blue: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    brand: 'bg-gradient-brand text-white border-transparent'
  };

  return (
    <span
      className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border inline-flex items-center gap-1.5 ${variantStyles[variant] || variantStyles.purple} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
