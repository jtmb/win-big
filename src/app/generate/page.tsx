'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from '@/components/NavBar';
import NumberReveal from '@/components/NumberReveal';
import NumberBall from '@/components/NumberBall';
import ProgressIndicator from '@/components/ProgressIndicator';
import { useApp } from '@/contexts/AppContext';
import { scrapeAndAnalyze, onProgress, onAnalysisProgress, getSettings } from '@/lib/ipc';
import type { ScrapingProgress } from '@/lib/types';

export default function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ lottery?: string; test?: string }>;
}) {
  const params = use(searchParams);
  const lottery = (params.lottery as '649' | 'max') || '649';
  const testRequested = params.test === 'true';
  const {
    isGenerating,
    setIsGenerating,
    isAnalysisPhase,
    setIsAnalysisPhase,
    activeJobType,
    setActiveJobType,
    scrapingProgress,
    setScrapingProgress,
    prediction,
    setPrediction,
    error,
    setError,
    analysisText,
    setAnalysisText,
    settings,
    setSettings,
  } = useApp();

  const [showReasoning, setShowReasoning] = useState(false);
  const [showAnalysisLog, setShowAnalysisLog] = useState(true);
  const [testMode, setTestMode] = useState(false);
  const analysisRef = useRef<HTMLDivElement>(null);

  const lotteryIcon = lottery === '649' ? '/lotto649.png' : '/lottomax.png';

  // Auto-scroll analysis text as it streams in
  useEffect(() => {
    if (analysisRef.current) {
      analysisRef.current.scrollTop = analysisRef.current.scrollHeight;
    }
  }, [analysisText]);

  // Load settings if not already loaded
  useEffect(() => {
    if (!settings) {
      getSettings().then(setSettings);
    }
  }, [settings, setSettings]);

  // Listen for scraping progress + analysis text from main process
  useEffect(() => {
    const unsubProgress = onProgress((progress: ScrapingProgress) => {
      setScrapingProgress(progress);
      if (progress.message.includes('Starting analysis')) {
        setIsAnalysisPhase(true);
        setAnalysisText(null);
      }
    });
    const unsubAnalysis = onAnalysisProgress((text: string) => {
      setAnalysisText(text);
    });
    return () => { unsubProgress(); unsubAnalysis(); };
  }, [setScrapingProgress, setAnalysisText, setIsAnalysisPhase]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setActiveJobType(lottery);
    setPrediction(null);
    setError(null);
    setAnalysisText(null);
    setIsAnalysisPhase(false);
    setScrapingProgress({
      current: 0,
      total: 0,
      message: 'Starting scraper...',
    });

    try {
      const result = await scrapeAndAnalyze(lottery, testMode ? 5 : undefined);
      // Set prediction AND stop generating in same sync block → ONE render, no flicker
      setPrediction(result);
      setError(null);
      setIsGenerating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setIsGenerating(false);
      // Keep isAnalysisPhase & analysisText visible so user can see what AI produced
    } finally {
      setActiveJobType(null);
      setScrapingProgress(null);
    }
  }, [lottery, testMode, setIsGenerating, setIsAnalysisPhase, setActiveJobType, setPrediction, setError, setScrapingProgress, setAnalysisText]);

  const lotteryName = lottery === '649' ? 'Lotto 6/49' : 'Lotto Max';
  const providerName = settings?.aiProvider === 'openai' ? 'Open AI' : 'LM Studio';

  return (
    <>
      <NavBar title={lotteryName} showBack backTo="/" />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        padding: 'clamp(16px, 2vh, 32px) clamp(16px, 3vw, 48px)',
        gap: 'clamp(16px, 2vh, 28px)',
      }}>
        {/* Generate Button */}
        {!isGenerating && !prediction && !error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            <p style={{ fontSize: 'clamp(14px, 1.4vw, 18px)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              Ready to analyze {lotteryName} results
              {settings ? ` using ${providerName}` : ''}
            </p>
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleGenerate}
              style={{
                padding: 'clamp(16px, 2vh, 24px) clamp(48px, 6vw, 72px)',
                borderRadius: 16,
                background: 'linear-gradient(135deg, var(--accent), #c0395b)',
                color: '#fff',
                fontSize: 'clamp(17px, 1.7vw, 22px)',
                fontWeight: 800,
                letterSpacing: 0.5,
                boxShadow: '0 8px 32px rgba(233, 69, 96, 0.4)',
              }}
            >
              🎲 Generate Lottery Numbers
            </motion.button>

            {/* Test mode toggle */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: 'var(--text-secondary)',
              cursor: 'pointer', marginTop: 8,
            }}>
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              🧪 Test mode (scrape only 5 draws)
            </label>
          </motion.div>
        )}

        {/* ===== Scraping progress (spinner + bar) ===== */}
        {isGenerating && !isAnalysisPhase && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            gap: 12,
          }}>
            <motion.img
              src={lotteryIcon}
              alt={lotteryName}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              style={{
                width: 'clamp(70px, 8vw, 100px)',
                height: 'clamp(70px, 8vw, 100px)',
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 16px rgba(233, 69, 96, 0.35))',
              }}
            />
            <ProgressIndicator
              message={scrapingProgress?.message || 'Analyzing...'}
              current={scrapingProgress?.current}
              total={scrapingProgress?.total}
              drawCurrent={scrapingProgress?.drawCurrent}
              drawTotal={scrapingProgress?.drawTotal}
            />
          </div>
        )}

        {/* ===== Analysis + Results ===== */}
        {isAnalysisPhase && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            alignItems: 'center',
          }}>
            {/* Results: fades in when prediction arrives */}
            {prediction && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 28 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 24,
                  width: '100%',
                  paddingBottom: 8,
                }}
              >
                {/* Confidence */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 'clamp(12px, 1.2vw, 15px)', color: 'var(--text-secondary)',
                  }}
                >
                  <span>AI Confidence:</span>
                  <div style={{ width: 'clamp(80px, 8vw, 120px)', height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.round(prediction.confidence * 100)}%`,
                      height: '100%',
                      background: prediction.confidence > 0.7 ? 'var(--success)' : 'var(--accent-gold)',
                      borderRadius: 3,
                    }} />
                  </div>
                  <span style={{ fontWeight: 700 }}>{Math.round(prediction.confidence * 100)}%</span>
                </motion.div>

                {/* Main numbers + bonus */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 'clamp(11px, 1.1vw, 14px)', color: 'var(--text-secondary)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Predicted Numbers
                  </div>
                  <NumberReveal mainNumbers={prediction.mainNumbers} bonus={prediction.bonus} />
                </div>

                {/* Encore */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 'clamp(11px, 1.1vw, 14px)', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Encore</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {prediction.encore.split('').map((digit, i) => (
                      <NumberBall key={`encore-${i}`} number={digit} color="#7c3aed" size={38} delay={0.6 + i * 0.06} />
                    ))}
                  </div>
                </motion.div>

                {/* Gold Ball (649 only) */}
                {prediction.goldBall && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 'clamp(11px, 1.1vw, 14px)', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Gold Ball</div>
                    <div style={{
                      padding: 'clamp(6px, 0.8vh, 12px) clamp(16px, 2vw, 28px)', borderRadius: 12, background: 'linear-gradient(135deg, #f5c518, #e0a800)',
                      color: '#1a1a2e', fontSize: 'clamp(18px, 2vw, 28px)', fontWeight: 800, letterSpacing: 2,
                      boxShadow: '0 4px 16px rgba(245, 197, 24, 0.5)',
                    }}>{prediction.goldBall}</div>
                  </motion.div>
                )}

                {/* Reasoning (collapsible) */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }} style={{ width: 'min(700px, 80vw)' }}>
                  <button onClick={() => setShowReasoning(!showReasoning)}
                    style={{
                      width: '100%', padding: '10px 16px', borderRadius: 10, background: 'var(--bg-card)',
                      border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 'clamp(12px, 1.2vw, 15px)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                    }}>
                    <span>📊 AI Reasoning</span>
                    <span>{showReasoning ? '▲' : '▼'}</span>
                  </button>
                  <AnimatePresence>
                    {showReasoning && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '14px 16px', borderRadius: '0 0 10px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderTop: 'none', fontSize: 'clamp(12px, 1.1vw, 14px)', color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 'clamp(180px, 25vh, 300px)', overflowY: 'auto' }}>
                          {prediction.reasoning}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Generate Again button */}
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={handleGenerate}
                  style={{ padding: 'clamp(10px, 1.2vh, 16px) clamp(32px, 4vw, 52px)', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 'clamp(13px, 1.3vw, 16px)', fontWeight: 600 }}>
                  🔄 Generate Again
                </motion.button>
              </motion.div>
            )}

            {/* Analysis panel: no layout animation, just conditional styles */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                maxWidth: 'min(800px, 85vw)',
                margin: '0 auto',
                ...(prediction
                  ? { padding: '4px 0', gap: 4, justifyContent: 'flex-start' }
                  : { flex: 1, gap: 12, justifyContent: 'center' }),
              }}
            >
              {!prediction && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <motion.img
                    src={lotteryIcon}
                    alt={lotteryName}
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    style={{
                      width: 'clamp(56px, 6vw, 80px)',
                      height: 'clamp(56px, 6vw, 80px)',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 0 12px rgba(124, 58, 237, 0.4))',
                    }}
                  />
                  <div style={{
                    fontSize: 13, fontWeight: 600,
                    color: isGenerating ? 'var(--accent)' : 'var(--text-secondary)',
                    textAlign: 'center',
                  }}>
                    {isGenerating ? '🤖 AI is thinking...' : '🤖 AI response (parse failed)'}
                  </div>
                </div>
              )}

              {!prediction && isGenerating && (
                <div style={{ width: '100%' }}>
                  <motion.div
                    animate={{ width: ['0%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    style={{ height: 3, borderRadius: 2, background: 'linear-gradient(90deg, var(--accent), #7c3aed)' }}
                  />
                </div>
              )}

              {analysisText && (
                <div style={{ width: '100%' }}>
                  {prediction && (
                    <button
                      onClick={() => setShowAnalysisLog(!showAnalysisLog)}
                      style={{
                        width: '100%',
                        padding: '7px 14px',
                        borderRadius: '10px 10px 0 0',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderBottom: showAnalysisLog ? 'none' : '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <img
                        src={lotteryIcon}
                        alt=""
                        style={{ width: 18, height: 18, objectFit: 'contain', opacity: 0.7 }}
                      />
                      🤖 AI Analysis Log
                      <span style={{ fontSize: 10, opacity: 0.5 }}>{showAnalysisLog ? '▲' : '▼'}</span>
                    </button>
                  )}
                  {showAnalysisLog && (
                    <div
                      ref={analysisRef}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: prediction ? '0 0 10px 10px' : 12,
                        background: 'var(--bg-card)',
                        border: `1px solid ${isGenerating ? 'var(--border)' : 'var(--error)'}`,
                        borderTop: prediction ? 'none' : '1px solid var(--border)',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.65,
                        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: 350,
                        overflowY: 'auto',
                        opacity: 1,
                      }}
                    >
                      {analysisText}
                    </div>
                  )}
                </div>
              )}

              {!analysisText && isGenerating && !prediction && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Waiting for AI response...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  padding: '24px 28px',
                  borderRadius: 12,
                  background: 'rgba(244, 67, 54, 0.15)',
                  border: '1px solid var(--error)',
                  color: 'var(--error)',
                  fontSize: 13,
                  textAlign: 'center',
                  maxWidth: 400,
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Something went wrong</div>
                <div style={{ opacity: 0.8 }}>{error}</div>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleGenerate}
                  style={{
                    marginTop: 14,
                    padding: '8px 24px',
                    borderRadius: 8,
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Try Again
                </motion.button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
