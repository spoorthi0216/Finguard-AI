import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

import { spawn, ChildProcess } from 'child_process';
import { createProxyMiddleware } from 'http-proxy-middleware';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Reverse Proxy for Python FastAPI Validation Service
const pythonPort = process.env.PYTHON_PORT || '8001';
const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || `http://127.0.0.1:${pythonPort}`;

let pythonProcess: ChildProcess | null = null;

function startPythonBackend() {
  if (process.env.AUTO_START_PYTHON === 'false') {
    return;
  }
  try {
    const backendDir = path.resolve(__dirname, 'backend');
    pythonProcess = spawn(
      'python3',
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', pythonPort, '--reload'],
      {
        cwd: backendDir,
        env: {
          ...process.env,
          PYTHONPATH: backendDir,
          PORT: pythonPort,
          PYTHON_PORT: pythonPort,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    pythonProcess.stdout?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[Python FastAPI] ${msg}`);
    });

    pythonProcess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[Python FastAPI] ${msg}`);
    });

    pythonProcess.on('error', (err) => {
      console.warn('[Python FastAPI] Failed to spawn child process:', err.message);
    });

    pythonProcess.on('exit', (code, signal) => {
      console.log(`[Python FastAPI] Process exited with code ${code}, signal ${signal}`);
      pythonProcess = null;
    });

    const cleanup = () => {
      if (pythonProcess) {
        pythonProcess.kill('SIGTERM');
        pythonProcess = null;
      }
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  } catch (err: any) {
    console.warn('[Python FastAPI] Error launching background service:', err.message);
  }
}

// Start Python FastAPI background worker
startPythonBackend();

app.use(
  '/api/py',
  createProxyMiddleware({
    target: pythonServiceUrl,
    changeOrigin: true,
    pathRewrite: {
      '^/api/py': '',
    },
    on: {
      error: (err: any, _req: any, res: any) => {
        if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'PYTHON_BACKEND_UNAVAILABLE',
              message: `Python validation service at ${pythonServiceUrl} is unreachable.`,
              details: err?.message,
            })
          );
        }
      },
    },
  })
);

app.use(express.json());

// Initialize Gemini API client on server if key is present
const geminiApiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (geminiApiKey) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.error('Failed to initialize GoogleGenAI client:', err);
  }
}

// Health & System Info endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: Boolean(geminiApiKey && aiClient),
    timestamp: new Date().toISOString(),
    service: 'FinGuard AI Intelligence Engine',
  });
});

// AI Assistant Endpoint for Financial Data Quality Explanations
app.post('/api/gemini/assist', async (req, res) => {
  try {
    const { prompt, datasetSummary, selectedRecord, validationIssues } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!aiClient || !geminiApiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY_NOT_CONFIGURED',
        message: 'Server-side Gemini API key is not configured in environment secrets.',
      });
    }

    const systemInstruction = `You are FinGuard AI, an expert Financial Data Engineering and Quality Intelligence Assistant.
You specialize in financial statement reconciliation, data quality pipelines (dbt, Great Expectations, PySpark), and data integrity validation.
Rules:
1. Always be precise, technical, and objective.
2. Ground your explanations exclusively in the provided dataset metrics, records, and validation violations. Do NOT invent numbers, record IDs, finding IDs, or company names.
3. When explaining profit discrepancies, explain that mathematical discrepancies reflect accounting classification differences, unmapped footnote disclosures, discontinued operations, or data entry errors—NOT proof of fraud or credit default.
4. Distinguish mathematical validation errors from actual credit risk. Never claim that a reconciliation mismatch proves fraud, establishes creditworthiness, or directly causes a credit rating downgrade.
5. If evidence is insufficient, explicitly state that evidence is insufficient.
6. If requested, provide actionable SQL validation queries (e.g., dbt test format) or data remediation suggestions.
7. Format your answer with clean markdown, bullet points, and code snippets when helpful.`;

    const contextPayload = {
      datasetSummary: datasetSummary || 'Not provided',
      selectedRecord: selectedRecord || 'None selected',
      relevantIssuesSample: (validationIssues || []).slice(0, 10),
    };

    const userContent = `User Question / Task:
${prompt}

Current Financial Data Context:
\`\`\`json
${JSON.stringify(contextPayload, null, 2)}
\`\`\`

Provide a clear, authoritative analysis based on the actual financial records and data quality checks above.`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userContent,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    const replyText = response.text || 'No response generated by model.';
    return res.json({
      text: replyText,
      source: 'gemini-3.8-flash',
      status: 'success',
    });
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({
      error: 'GEMINI_API_ERROR',
      message: error?.message || 'Error executing Gemini model request',
    });
  }
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`FinGuard AI Server running at http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
