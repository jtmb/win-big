'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import LotteryCard from '@/components/LotteryCard';
import NavBar from '@/components/NavBar';
import { useApp } from '@/contexts/AppContext';
import { getSettings } from '@/lib/ipc';

export default function HomePage() {
  const router = useRouter();
  const { lottery, setLottery, setSettings, reset } = useApp();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Load settings on mount
    getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
    reset();
  }, [setSettings, reset]);

  const handleContinue = () => {
    if (!lottery) return;
    router.push(`/generate?lottery=${lottery}`);
  };

  return (
    <>
      <NavBar showSettings />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 3vh, 40px) clamp(20px, 4vw, 60px)',
        gap: 'clamp(20px, 3vh, 40px)',
      }}>
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ textAlign: 'center' }}
        >
          <h1 style={{
            fontSize: 'clamp(26px, 3vw, 44px)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-gold))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 8,
          }}>
            Choose Your Lottery
          </h1>
          <p style={{ fontSize: 'clamp(13px, 1.3vw, 17px)', color: 'var(--text-secondary)' }}>
            Select a lottery to analyze past results and generate predictions
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(12px, 1.5vh, 20px)',
            width: 'min(600px, 55vw)',
          }}
        >
          <LotteryCard
            name="Lotto 6/49"
            description="Classic Canadian lottery"
            drawDays="Wed & Sat"
            numbers="6 numbers (1–49)"
            selected={lottery === '649'}
            onClick={() => setLottery('649')}
            icon={<img src="/lotto649.png" alt="Lotto 6/49" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          />

          <LotteryCard
            name="Lotto Max"
            description="Bigger jackpots, more numbers"
            drawDays="Tue & Fri"
            numbers="7 numbers (1–50)"
            selected={lottery === 'max'}
            onClick={() => setLottery('max')}
            icon={<img src="/lottomax.png" alt="Lotto Max" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          />
        </motion.div>

        {/* Continue button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: lottery ? 1 : 0.4,
            y: 0,
          }}
          transition={{ delay: 0.3 }}
          whileHover={lottery ? { scale: 1.04 } : {}}
          whileTap={lottery ? { scale: 0.96 } : {}}
          disabled={!lottery}
          onClick={handleContinue}
          style={{
            padding: 'clamp(14px, 1.5vh, 20px) clamp(40px, 5vw, 64px)',
            borderRadius: 14,
            background: lottery
              ? 'linear-gradient(135deg, var(--accent), #c0395b)'
              : 'var(--bg-card)',
            color: '#fff',
            fontSize: 'clamp(16px, 1.6vw, 20px)',
            fontWeight: 700,
            border: lottery ? 'none' : '1px solid var(--border)',
            cursor: lottery ? 'pointer' : 'not-allowed',
            letterSpacing: 0.5,
          }}
        >
          Continue →
        </motion.button>

        {/* View History link */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          onClick={() => router.push('/history')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 13,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          📋 View Job History
        </motion.button>

        {/* Disclaimer */}
        <p style={{
          fontSize: 10,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          maxWidth: 360,
          opacity: 0.6,
          marginTop: 8,
        }}>
          This tool uses statistical analysis and AI for entertainment purposes only.
          Lottery numbers are randomly drawn. No prediction is guaranteed.
        </p>
      </div>
    </>
  );
}
