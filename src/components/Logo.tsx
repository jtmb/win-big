'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function Logo({ size = 28 }: { size?: number }) {
  const router = useRouter();

  const ballSize = size * 0.6;
  const fontSize = size * 0.55;

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => router.push('/')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.35,
        background: 'none',
        cursor: 'pointer',
      }}
      title="WinBig — Home"
    >
      {/* Animated lottery ball icon */}
      <div style={{ position: 'relative', width: ballSize, height: ballSize }}>
        {/* Glow */}
        <motion.div
          animate={{
            opacity: [0.3, 0.6, 0.3],
            scale: [0.9, 1.15, 0.9],
          }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            background: 'var(--accent)',
            filter: 'blur(8px)',
          }}
        />
        {/* Ball */}
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #e94560 0%, #c0392b 50%, #a93226 100%)',
            boxShadow: '0 2px 12px rgba(233, 69, 96, 0.5), inset 0 2px 4px rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Shine */}
          <div style={{
            position: 'absolute',
            top: '12%',
            left: '18%',
            width: '30%',
            height: '20%',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.3)',
            transform: 'rotate(-30deg)',
          }} />
          {/* Number */}
          <span style={{
            fontSize: ballSize * 0.42,
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            position: 'relative',
            zIndex: 1,
            lineHeight: 1,
          }}>
            W
          </span>
        </motion.div>
      </div>

      {/* Gradient text */}
      <span style={{
        fontSize,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        background: 'linear-gradient(135deg, #fff 0%, var(--accent-gold) 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1,
      }}>
        WinBig
      </span>
    </motion.button>
  );
}
