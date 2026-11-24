// Tiny local LLM mock for tests: node:http on an ephemeral port (127.0.0.1),
// records every request and replies from a script. No real network involved.
import http from 'node:http';

/** Anthropic-shaped 200 response. */
export function anthropicOk(text, { input = 11, output = 7, stop = 'end_turn' } = {}) {
  return {
    status: 200,
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      stop_reason: stop,
      usage: { input_tokens: input, output_tokens: output },
    },
  };
}

/** OpenAI-shaped 200 response. */
export function openaiOk(text, { input = 13, output = 5, finish = 'stop' } = {}) {
  return {
    status: 200,
    body: {
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finish }],
      usage: { prompt_tokens: input, completion_tokens: output },
    },
  };
}

/**
 * @param script array of responses ({status, body, headers, rawBody}) consumed in order
 *               (the last one repeats), or a function (recordedRequest, index) => response.
 */
export async function startMockServer(script) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        /* leave null */
      }
      const recorded = { method: req.method, url: req.url, headers: req.headers, raw, json };
      const index = requests.length;
      requests.push(recorded);
      const r =
        typeof script === 'function' ? script(recorded, index) : script[Math.min(index, script.length - 1)];
      const payload = r.rawBody !== undefined ? r.rawBody : JSON.stringify(r.body ?? {});
      res.writeHead(r.status ?? 200, { 'content-type': 'application/json', ...(r.headers ?? {}) });
      res.end(payload);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    requests,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
