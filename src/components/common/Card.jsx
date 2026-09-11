import React from 'react';

export const Card = ({ children, className = '', creatorStyle = false }) => {
  if (creatorStyle) {
    return (
      <div className={`creator-card ${className}`}>
        <div className="creator-card-inner p-6 lg:p-10 relative overflow-hidden">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-panel border border-white/10 rounded-2xl ${className}`}>
      {children}
    </div>
  );
};

export default Card;
