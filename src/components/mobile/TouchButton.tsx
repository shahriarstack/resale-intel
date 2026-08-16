'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './TouchButton.module.css';

interface TouchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: ReactNode;
}

export default function TouchButton({
  children,
  variant = 'primary',
  icon,
  className = '',
  ...props
}: TouchButtonProps) {
  const variantClass = styles[variant] || styles.primary;
  
  // Optional haptic feedback could be triggered here via navigator.vibrate
  const handleTouch = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      // Light haptic feedback
      navigator.vibrate(10);
    }
  };

  return (
    <button 
      className={`${styles.button} ${variantClass} ${className}`}
      onTouchStart={handleTouch}
      {...props}
    >
      {icon && <span className={styles.iconWrapper}>{icon}</span>}
      {children}
    </button>
  );
}
