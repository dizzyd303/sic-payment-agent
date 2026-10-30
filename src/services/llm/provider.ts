import axios from 'axios';

export type LLMResponse = { text: string; confidence?: number };

export async function llmComplete(prompt: string): Promise<LLMResponse> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const model = 'nvidia/nemotron-3.5-lightning-30b-a3b';
  if (nvidiaKey) {
    console.log('[LLM] Attempt NVIDIA', { endpoint, model, promptLength: prompt.length });
    try {
      const res = await axios.post(endpoint, {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      }, {
        headers: { Authorization: `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' }
      });
      const text = res.data.choices?.[0]?.message?.content ?? '';
      console.log('[LLM] NVIDIA success', { model, textLength: text.length });
      return { text };
    } catch (e:any) {
      console.error('[LLM] NVIDIA error', { endpoint, model, status: e.response?.status, data: e.response?.data, message: e.message });
      // fall through to Ollama
    }
  }
  // Ollama fallback (configurable; defaults match the previous hardcode)
  const ollamaBase = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const ollamaEndpoint = `${ollamaBase}/api/generate`;
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1';
  console.log('[LLM] Attempt Ollama fallback', { ollamaEndpoint, model: 'llama3.1' });
  try {
    const res = await axios.post(ollamaEndpoint, {
      model: ollamaModel,
      prompt,
      stream: false
    });
    const text = res.data.response ?? '';
    console.log('[LLM] Ollama success', { textLength: text.length });
    return { text };
  } catch (e:any) {
    console.error('[LLM] Ollama error', { ollamaEndpoint, status: e.response?.status, message: e.message });
  }
  throw new Error('LLM provider failed: both NVIDIA and Ollama unavailable');
}
