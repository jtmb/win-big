'use client';

import { motion } from 'framer-motion';

interface NumberBallProps {
  number: number | string;
  color?: string;
  size?: number;
  delay?: number;
}

export default function NumberBall({
  number,
  color = 'var(--accent)',
  size = 52,
  delay = 0,
}: NumberBallProps) {
  return (
    <motion.div
      initial={{ scale: 0, y: 30, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 20,
        delay,
      }}
      whileHover={{ scale: 1.15, y: -4 }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${color}, ${adjustColor(color, -30)})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size > 46 ? 22 : 16,
        fontWeight: 800,
        color: '#fff',
        boxShadow: `0 4px 16px ${color}66`,
        flexShrink: 0,
      }}
    >
      {number}
    </motion.div>
  );
}

// Simple color darkening
function adjustColor(hex: string, amount: number): string {
  // For CSS variables we can't compute, so use a fallback
  if (hex.startsWith('var(')) {
    if (hex.includes('accent')) return '#b8304d';
    if (hex.includes('gold')) return '#c49a10';
    return '#444';
  }
  return hex;
}
