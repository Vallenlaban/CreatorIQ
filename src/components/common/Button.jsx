import React from 'react';

export const Button = ({
  children,
  variant = 'glow',
  className = '',
  onClick,
  disabled = false,
  type = 'button',
  ...props
}) => {
  const baseStyles = 'font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer select-none';

  const variants = {
    glow: 'btn-glow bg-gradient-brand text-white shadow-lg hover:scale-[1.02]',
    secondary: 'bg-white/10 hover:bg-white/20 text-white border border-white/15 shadow-md hover:scale-105',
    outline: 'bg-transparent border border-white/20 text-white hover:bg-white/10',
    purple: 'bg-accent-purple hover:bg-accent-purple/80 text-white shadow-lg'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant] || variants.glow} ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
