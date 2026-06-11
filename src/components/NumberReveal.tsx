'use client';

import { motion } from 'framer-motion';
import NumberBall from './NumberBall';

interface NumberRevealProps {
  mainNumbers: number[];
  bonus: number;
  delay?: number;
}

export default function NumberReveal({ mainNumbers, bonus, delay = 0 }: NumberRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}
    >
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
        padding: '0 20px',
      }}>
        {mainNumbers.map((num, i) => (
          <NumberBall
            key={`main-${i}`}
            number={num}
            color="var(--accent)"
            delay={delay + i * 0.1}
          />
        ))}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: delay + mainNumbers.length * 0.1, type: 'spring', stiffness: 400, damping: 20 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            fontSize: 22,
            color: 'var(--text-secondary)',
            fontWeight: 300,
          }}
        >
          +
        </motion.div>
        <NumberBall
          number={bonus}
          color="var(--accent-gold)"
          delay={delay + (mainNumbers.length + 1) * 0.1}
        />
      </div>
    </motion.div>
  );
}
