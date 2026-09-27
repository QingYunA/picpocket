import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeBaseUrl, fetchAvailableModels } from '../modelFetcher';

describe('modelFetcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeBaseUrl', () => {
    it('normalizes various base URL formats', () => {
      expect(normalizeBaseUrl('api.openai.com/v1/')).toBe('https://api.openai.com/v1');
      expect(normalizeBaseUrl('http://localhost:11434///')).toBe('http://localhost:11434');
      expect(normalizeBaseUrl('  https://api.siliconflow.cn/v1  ')).toBe('https://api.siliconflow.cn/v1');
      expect(normalizeBaseUrl('')).toBe('');
    });
  });

  describe('fetchAvailableModels', () => {
    it('parses standard OpenAI format { data: [{ id }] }', async () => {
      const mockResponse = {
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-4o-mini' },
          { id: 'dall-e-3' },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }) as any;

      const models = await fetchAvailableModels({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
      });

      expect(models).toEqual(['dall-e-3', 'gpt-4o', 'gpt-4o-mini']);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer sk-test',
        },
        signal: undefined,
      });
    });

    it('parses Google/models.dev style { models: [{ name }] }', async () => {
      const mockResponse = {
        models: [
          { name: 'models/gemini-2.0-flash' },
          { name: 'models/gemini-2.0-pro' },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }) as any;

      const models = await fetchAvailableModels({
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      });

      expect(models).toEqual(['gemini-2.0-flash', 'gemini-2.0-pro']);
    });

    it('throws friendly error on 401 unauthorized', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      }) as any;

      await expect(
        fetchAvailableModels({
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'invalid-key',
        })
      ).rejects.toThrow('身份验证失败 (401)');
    });

    it('throws friendly error on 404 not found', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }) as any;

      await expect(
        fetchAvailableModels({
          baseUrl: 'https://api.custom.com/v1',
        })
      ).rejects.toThrow('端点未找到 (404)');
    });
  });
});
