'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from '@/components/NavBar';
import { useApp } from '@/contexts/AppContext';
import { getSettings, saveSettings, testAiConnection, fetchLmStudioModels, clearAllData, getDbStats } from '@/lib/ipc';
import type { AppSettings } from '@/lib/types';

// Cache models across re-renders so we only fetch once per session
let modelsCache: { baseUrl: string; models: { id: string }[] } | null = null;

export default function SettingsPage() {
  const { settings, setSettings } = useApp();

  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lmModels, setLmModels] = useState<{ id: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const prefetchedRef = useRef(false);

  // Clear database
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [dbStats, setDbStats] = useState<{ draws: number; jobs: number } | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLocalSettings({ ...s });
    });
    getDbStats().then(setDbStats).catch(() => {});
  }, [setSettings]);

  // Pre-fetch LM Studio models as soon as settings load
  useEffect(() => {
    if (!localSettings || prefetchedRef.current) return;
    // Use cache if baseUrl matches
    if (modelsCache && modelsCache.baseUrl === localSettings.lmstudio.baseUrl) {
      setLmModels(modelsCache.models);
      prefetchedRef.current = true;
      return;
    }
    // Fetch in background
    prefetchedRef.current = true;
    setLoadingModels(true);
    fetchLmStudioModels(localSettings.lmstudio.baseUrl)
      .then((models) => {
        setLmModels(models);
        modelsCache = { baseUrl: localSettings.lmstudio.baseUrl, models };
      })
      .catch(() => setLmModels([]))
      .finally(() => setLoadingModels(false));
  }, [localSettings]);

  if (!localSettings) {
    return (
      <>
        <NavBar title="Settings" showBack backTo="/" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading settings...</p>
        </div>
      </>
    );
  }

  const handleSave = async () => {
    if (!localSettings) return;
    await saveSettings(localSettings);
    setSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (!localSettings) return;
    setTesting(true);
    setTestResult(null);
    const provider = localSettings.aiProvider;
    const config: Record<string, string> = provider === 'lmstudio'
      ? { baseUrl: localSettings.lmstudio.baseUrl, model: localSettings.lmstudio.model, apiKey: '' }
      : { baseUrl: localSettings.openai.baseUrl, apiKey: localSettings.openai.apiKey, model: localSettings.openai.model };
    const result = await testAiConnection(provider, config);
    setTestResult(result);
    setTesting(false);
  };

  const updateProvider = (provider: 'lmstudio' | 'openai') => {
    setLocalSettings({ ...localSettings, aiProvider: provider });
  };

  const handleClearAll = async () => {
    setClearing(true);
    setClearError(null);
    try {
      await clearAllData();
      // Verify it actually cleared by re-fetching stats
      const stats = await getDbStats();
      setDbStats(stats);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear database:', err);
      setClearError(err instanceof Error ? err.message : 'Unknown error');
      // Re-fetch stats to show accurate numbers
      try {
        const stats = await getDbStats();
        setDbStats(stats);
      } catch { /* ignore */ }
    }
    setClearing(false);
  };

  return (
    <>
      <NavBar title="Settings" showBack backTo="/" />

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'clamp(16px, 2vh, 32px) clamp(20px, 4vw, 60px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(20px, 2.5vh, 30px)',
      }}>
        {/* Provider Selection */}
        <section>
          <h3 style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            AI Provider
          </h3>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['lmstudio', 'openai'] as const).map((provider) => (
              <motion.button
                key={provider}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => updateProvider(provider)}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: localSettings.aiProvider === provider ? 'var(--accent)' : 'var(--bg-card)',
                  border: localSettings.aiProvider === provider ? 'none' : '1px solid var(--border)',
                  color: localSettings.aiProvider === provider ? '#fff' : 'var(--text-primary)',
                  fontSize: 'clamp(13px, 1.3vw, 16px)',
                  fontWeight: 600,
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                {provider === 'lmstudio' ? '🖥️ LM Studio' : '☁️ Open AI'}
                <div style={{ fontSize: 'clamp(10px, 0.9vw, 12px)', fontWeight: 400, opacity: 0.7, marginTop: 2 }}>
                  {provider === 'lmstudio' ? 'Local (offline)' : 'OpenAI compatible API'}
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Provider-specific settings */}
        <AnimatePresence mode="wait">
          {localSettings.aiProvider === 'lmstudio' && (
            <motion.section
              key="lmstudio"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <h3 style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                LM Studio Configuration
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <InputField
                  label="Base URL"
                  value={localSettings.lmstudio.baseUrl}
                  onChange={(v) => setLocalSettings({
                    ...localSettings,
                    lmstudio: { ...localSettings.lmstudio, baseUrl: v },
                  })}
                  placeholder="http://localhost:1234/v1"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Model
                  </label>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setModelsOpen(!modelsOpen)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        fontSize: 'clamp(12px, 1.2vw, 15px)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {localSettings.lmstudio.model || 'Select a model...'}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 10 }}>{modelsOpen ? '▲' : '▼'}</span>
                    </button>
                    {modelsOpen && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: 180,
                        overflowY: 'auto',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        marginTop: 4,
                        zIndex: 10,
                      }}>
                        {loadingModels ? (
                          <div style={{ padding: '12px 14px', fontSize: 'clamp(12px, 1.2vw, 14px)', color: 'var(--text-secondary)' }}>Loading models...</div>
                        ) : lmModels.length === 0 ? (
                          <div style={{ padding: '12px 14px', fontSize: 'clamp(12px, 1.2vw, 14px)', color: 'var(--text-secondary)' }}>No models found. Check your Base URL.</div>
                        ) : (
                          lmModels.map((m, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                setLocalSettings({ ...localSettings, lmstudio: { ...localSettings.lmstudio, model: m.id } });
                                setModelsOpen(false);
                              }}
                              style={{
                                padding: '9px 14px',
                                fontSize: 'clamp(11px, 1.1vw, 14px)',
                                color: localSettings.lmstudio.model === m.id ? 'var(--accent)' : 'var(--text-primary)',
                                background: localSettings.lmstudio.model === m.id ? 'rgba(233, 69, 96, 0.1)' : 'transparent',
                                cursor: 'pointer',
                                fontWeight: localSettings.lmstudio.model === m.id ? 600 : 400,
                              }}
                            >
                              {m.id}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {localSettings.aiProvider === 'openai' && (
            <motion.section
              key="openai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <h3 style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Open AI Configuration
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <InputField
                  label="Base URL"
                  value={localSettings.openai.baseUrl}
                  onChange={(v) => setLocalSettings({
                    ...localSettings,
                    openai: { ...localSettings.openai, baseUrl: v },
                  })}
                  placeholder="https://api.openai.com/v1"
                />
                <InputField
                  label="API Key"
                  value={localSettings.openai.apiKey}
                  onChange={(v) => setLocalSettings({
                    ...localSettings,
                    openai: { ...localSettings.openai, apiKey: v },
                  })}
                  placeholder="sk-..."
                  type="password"
                />
                <InputField
                  label="Model"
                  value={localSettings.openai.model}
                  onChange={(v) => setLocalSettings({
                    ...localSettings,
                    openai: { ...localSettings.openai, model: v },
                  })}
                  placeholder="gpt-4o"
                />
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Test Connection */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleTest}
            disabled={testing}
            style={{
              padding: '10px 24px',
              borderRadius: 10,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 'clamp(12px, 1.2vw, 15px)',
              fontWeight: 600,
              cursor: testing ? 'not-allowed' : 'pointer',
            }}
          >
            {testing ? 'Testing...' : '🔌 Test Connection'}
          </motion.button>

          {testResult && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                fontSize: 'clamp(12px, 1.2vw, 15px)',
                fontWeight: 600,
                color: testResult.success ? 'var(--success)' : 'var(--error)',
              }}
            >
              {testResult.success ? '✓ Connected' : '✗ Failed'}
            </motion.span>
          )}
        </div>

        {testResult && !testResult.success && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            fontSize: 'clamp(11px, 1vw, 14px)',
            color: 'var(--error)',
            lineHeight: 1.5,
          }}>
            {testResult.message}
          </div>
        )}

        {/* Scraper Concurrency */}
        <section>
          <h3 style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            ⚡ Scraper Speed
          </h3>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 18px', borderRadius: 12,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <input
              type="range"
              min={1}
              max={24}
              value={localSettings.scraperConcurrency || 12}
              onChange={(e) => setLocalSettings({ ...localSettings, scraperConcurrency: parseInt(e.target.value, 10) })}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{
              fontSize: 18, fontWeight: 700, color: 'var(--accent)',
              minWidth: 36, textAlign: 'center',
            }}>
              {localSettings.scraperConcurrency || 12}
            </span>
            <span style={{ fontSize: 'clamp(10px, 0.9vw, 13px)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              parallel windows
            </span>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, marginLeft: 4 }}>
            More = faster scraping but higher CPU usage. Recommended: 6–18
          </p>
        </section>

        {/* Scrape Depth */}
        <section>
          <h3 style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            📅 History Depth
          </h3>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 18px', borderRadius: 12,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <input
              type="range"
              min={1}
              max={5}
              value={localSettings.scrapeDepthYears || 2}
              onChange={(e) => setLocalSettings({ ...localSettings, scrapeDepthYears: parseInt(e.target.value, 10) })}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{
              fontSize: 18, fontWeight: 700, color: 'var(--accent)',
              minWidth: 36, textAlign: 'center',
            }}>
              {localSettings.scrapeDepthYears || 2}
            </span>
            <span style={{ fontSize: 'clamp(10px, 0.9vw, 13px)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              years back
            </span>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, marginLeft: 4 }}>
            How many years of past draws to scrape. More = better AI context but longer scrape. Default: 2 years
          </p>
        </section>

        {/* Danger Zone — Clear Database */}
        <section>
          <h3 style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 700, color: 'var(--error)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            🗑️ Danger Zone
          </h3>
          <div style={{
            padding: '16px 20px', borderRadius: 12,
            background: 'rgba(244, 67, 54, 0.06)',
            border: '1px solid rgba(244, 67, 54, 0.25)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {dbStats
                ? `${dbStats.draws} draws · ${dbStats.jobs} predictions in database`
                : 'Loading stats...'}
              <br />
              <span style={{ fontSize: 'clamp(10px, 0.9vw, 12px)', opacity: 0.7 }}>
                This deletes all scraped draws and prediction history. You'll need to re-scrape to generate new predictions.
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setShowClearConfirm(true); setClearError(null); }}
              disabled={dbStats !== null && dbStats.draws === 0 && dbStats.jobs === 0}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                background: dbStats !== null && dbStats.draws === 0 && dbStats.jobs === 0
                  ? 'var(--border)'
                  : 'linear-gradient(135deg, var(--error), #c0392b)',
                color: '#fff',
                fontSize: 'clamp(12px, 1.2vw, 15px)',
                fontWeight: 600,
                cursor: dbStats !== null && dbStats.draws === 0 && dbStats.jobs === 0 ? 'not-allowed' : 'pointer',
                alignSelf: 'flex-start',
                opacity: dbStats !== null && dbStats.draws === 0 && dbStats.jobs === 0 ? 0.4 : 1,
              }}
            >
              🗑️ Clear All Data
            </motion.button>
          </div>
        </section>

        {/* Save */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            style={{
              padding: 'clamp(10px, 1.2vh, 16px) clamp(28px, 3vw, 44px)',
              borderRadius: 12,
              background: 'linear-gradient(135deg, var(--accent), #c0395b)',
              color: '#fff',
              fontSize: 'clamp(13px, 1.3vw, 16px)',
              fontWeight: 700,
            }}
          >
            💾 Save Settings
          </motion.button>

          {saved && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', color: 'var(--success)', fontWeight: 600 }}
            >
              ✓ Saved
            </motion.span>
          )}
        </div>
      </div>

      {/* Clear Database Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !clearing && setShowClearConfirm(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(4px)',
              }}
            />
            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              style={{
                position: 'fixed', inset: 0, zIndex: 101,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{
                pointerEvents: 'auto',
                maxWidth: 400, width: '90%',
                padding: 28,
                borderRadius: 16,
                background: 'var(--bg-card)',
                border: '1px solid rgba(244, 67, 54, 0.3)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', gap: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 'clamp(15px, 1.5vw, 18px)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Clear All Data?
                    </div>
                    <div style={{ fontSize: 'clamp(11px, 1vw, 14px)', color: 'var(--text-secondary)', marginTop: 2 }}>
                      This action cannot be undone.
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(244, 67, 54, 0.08)',
                  border: '1px solid rgba(244, 67, 54, 0.2)',
                  fontSize: 'clamp(12px, 1.2vw, 14px)', lineHeight: 1.6, color: 'var(--text-secondary)',
                }}>
                  You're about to delete{' '}
                  <strong style={{ color: 'var(--error)' }}>
                    {dbStats?.draws ?? 0} draws
                  </strong>{' '}
                  and{' '}
                  <strong style={{ color: 'var(--error)' }}>
                    {dbStats?.jobs ?? 0} prediction jobs
                  </strong>
                  . You'll need to re-scrape draws and re-run predictions.
                </div>

                {clearError && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(244, 67, 54, 0.15)',
                    border: '1px solid rgba(244, 67, 54, 0.4)',
                    fontSize: 'clamp(11px, 1vw, 13px)',
                    color: 'var(--error)',
                    lineHeight: 1.5,
                  }}>
                    ❌ Failed to clear: {clearError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setShowClearConfirm(false); setClearError(null); }}
                    disabled={clearing}
                    style={{
                      padding: '10px 20px', borderRadius: 8,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)', fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 600,
                      cursor: clearing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleClearAll}
                    disabled={clearing}
                    style={{
                      padding: '10px 20px', borderRadius: 8,
                      background: clearing
                        ? 'var(--border)'
                        : 'linear-gradient(135deg, var(--error), #c0392b)',
                      color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: clearing ? 'not-allowed' : 'pointer',
                      minWidth: 100, textAlign: 'center',
                    }}
                  >
                    {clearing ? 'Clearing...' : 'Yes, Delete All'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Reusable input field
function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: 13,
          fontFamily: 'monospace',
        }}
      />
    </div>
  );
}
