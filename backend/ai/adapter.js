'use strict';

const env = require('../config/env');
const { getDb } = require('../database/db');
const { redactSecrets } = require('../security/sanitizer');

// Approximate reference pricing per 1M tokens (USD) only for rough estimate when provider returns token usage
const COST_PER_1M = {
  'deepseek-chat': { in: 0.27, out: 1.10 },
  'deepseek-reasoner': { in: 0.55, out: 2.19 },
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'gpt-4o': { in: 2.50, out: 10.00 },
  'gemini-2.0-flash': { in: 0.10, out: 0.40 },
  'gemini-1.5-flash': { in: 0.075, out: 0.30 }
};

function estimateCost(model, promptTokens, completionTokens) {
  const rate = COST_PER_1M[model];
  if (!rate || (!promptTokens && !completionTokens)) return null;
  const usd = (promptTokens / 1e6) * rate.in + (completionTokens / 1e6) * rate.out;
  return Number(usd.toFixed(6));
}

function getTaskSettings(taskType) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ai_provider_settings WHERE task_type = ?').get(taskType);
  return row || {
    task_type: taskType,
    provider: 'deepseek',
    model: env.aiDefaultModels.deepseek,
    is_enabled: 0,
    timeout_ms: 25000,
    max_retries: 2,
    allow_external_send: 0
  };
}

function getProviderKeyStatus() {
  return {
    openai: Boolean(env.aiKeys.openai()),
    deepseek: Boolean(env.aiKeys.deepseek()),
    gemini: Boolean(env.aiKeys.gemini())
  };
}

async function callSingleProvider({ provider, model, system, user, timeoutMs = 25000, temperature = 0.2 }) {
  const apiKeyFn = env.aiKeys[provider];
  const apiKey = apiKeyFn ? apiKeyFn() : '';
  if (!apiKey) {
    const err = new Error(`کلید API برای ارائه‌دهنده «${provider}» در متغیرهای محیطی سرور (ENV) تنظیم نشده است.`);
    err.code = 'NO_API_KEY';
    throw err;
  }

  const chosenModel = model || env.aiDefaultModels[provider] || 'deepseek-chat';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url, headers, body;
    if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: chosenModel,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature
      };
    } else if (provider === 'deepseek') {
      url = 'https://api.deepseek.com/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      body = {
        model: chosenModel,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature
      };
    } else if (provider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      headers = { 'Content-Type': 'application/json' };
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { temperature }
      };
    } else {
      throw new Error(`ارائه‌دهنده ناشناخته: ${provider}`);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const err = new Error(redactSecrets(`خطای سرویس AI (${res.status}): ${errBody.slice(0, 220)}`));
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    let text = '';
    let promptTokens = 0;
    let completionTokens = 0;

    if (provider === 'gemini') {
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      promptTokens = data.usageMetadata?.promptTokenCount || 0;
      completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
    } else {
      text = data.choices?.[0]?.message?.content || '';
      promptTokens = data.usage?.prompt_tokens || 0;
      completionTokens = data.usage?.completion_tokens || 0;
    }

    if (!text.trim()) throw new Error('پاسخ خالی از مدل هوش مصنوعی دریافت شد.');

    return {
      text,
      provider,
      model: chosenModel,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd: estimateCost(chosenModel, promptTokens, completionTokens)
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`زمان انتظار ارتباط با ${provider} به پایان رسید (Timeout ${timeoutMs}ms).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function runAITask({ taskType, projectId = null, userId = null, system, user, temperature = 0.2, overrideProvider = null, overrideModel = null, consentConfirmed = false }) {
  const settings = getTaskSettings(taskType);
  const provider = overrideProvider || settings.provider;
  const model = overrideModel || settings.model;

  if (!settings.is_enabled && !overrideProvider) {
    const err = new Error(`استفاده از هوش مصنوعی برای وظیفه «${taskType}» در تنظیمات غیرفعال است.`);
    err.code = 'TASK_DISABLED';
    throw err;
  }

  if (!settings.allow_external_send && !consentConfirmed) {
    const err = new Error('ارسال متن به سرویس خارجی هوش مصنوعی نیازمند اجازه صریح کاربر است.');
    err.code = 'CONSENT_REQUIRED';
    throw err;
  }

  const maxRetries = Math.max(0, Math.min(3, Number(settings.max_retries) || 0));
  const started = Date.now();
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callSingleProvider({
        provider,
        model,
        system,
        user,
        timeoutMs: settings.timeout_ms || 25000,
        temperature
      });

      const latencyMs = Date.now() - started;
      getDb().prepare(`
        INSERT INTO ai_jobs (project_id, task_type, provider, model, status, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, latency_ms, created_by)
        VALUES (?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, ?)
      `).run(
        projectId, taskType, result.provider, result.model,
        result.promptTokens, result.completionTokens, result.totalTokens,
        result.estimatedCostUsd, latencyMs, userId
      );

      return { ...result, latencyMs };
    } catch (err) {
      lastError = err;
      // Do not retry auth or config errors
      if (err.code === 'NO_API_KEY' || err.status === 401 || err.status === 403) break;
    }
  }

  const latencyMs = Date.now() - started;
  getDb().prepare(`
    INSERT INTO ai_jobs (project_id, task_type, provider, model, status, latency_ms, error_message, created_by)
    VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)
  `).run(projectId, taskType, provider, model, latencyMs, redactSecrets(lastError.message).slice(0, 500), userId);

  throw lastError;
}

module.exports = {
  getTaskSettings,
  getProviderKeyStatus,
  callSingleProvider,
  runAITask
};
