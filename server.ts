import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { validateGeneratedPlan, validatePlanInputs } from './src/lib/planValidation.ts';

const SYSTEM_INSTRUCTION =
  'You are an expert project manager creating a practical first plan for a small team. Use the stated goal and constraints to identify the smallest set of deliverables that would meet the goal. Break the deliverables into tasks that have a clear outcome and can be estimated and scheduled. Identify genuine prerequisites and allow independent tasks to run in parallel. Use plain British English.';

const PLAN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Concise project title in plain British English.',
    },
    successSummary: {
      type: Type.STRING,
      description: 'One-sentence summary of what success looks like.',
    },
    milestones: {
      type: Type.ARRAY,
      description: '3 to 5 milestones (fewer for simple goals).',
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: 'Stable short milestone ID such as M1, M2.',
          },
          name: {
            type: Type.STRING,
            description: 'Clear milestone name.',
          },
          criteria: {
            type: Type.STRING,
            description: 'Observable completion criteria for this milestone.',
          },
          requiredTaskIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Task IDs that must finish to reach this milestone.',
          },
        },
        required: ['id', 'name', 'criteria', 'requiredTaskIds'],
      },
    },
    tasks: {
      type: Type.ARRAY,
      description: '8 to 15 tasks (fewer for simple goals) with clear outcomes.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: 'Stable short task ID such as T1, T2.',
          },
          name: {
            type: Type.STRING,
            description: 'Verb-led task name.',
          },
          deliverable: {
            type: Type.STRING,
            description: 'Short concrete deliverable produced by the task.',
          },
          effortDays: {
            type: Type.INTEGER,
            description: 'Realistic whole-number positive person-days of effort (minimum 1).',
          },
          prerequisiteIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'IDs of genuine prerequisite tasks that must finish before this task starts.',
          },
        },
        required: ['id', 'name', 'deliverable', 'effortDays', 'prerequisiteIds'],
      },
    },
    assumptions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Key planning assumptions for this project.',
    },
    externalDependencies: {
      type: Type.ARRAY,
      description: 'Approvals, specialist skills, suppliers, or external dependencies.',
      items: {
        type: Type.OBJECT,
        properties: {
          description: {
            type: Type.STRING,
            description: 'Description of the external dependency, approval, skill, or supplier.',
          },
          confirmationQuestion: {
            type: Type.STRING,
            description: 'Specific question to confirm with stakeholders, or empty string if none.',
          },
        },
        required: ['description', 'confirmationQuestion'],
      },
    },
  },
  required: [
    'title',
    'successSummary',
    'milestones',
    'tasks',
    'assumptions',
    'externalDependencies',
  ],
};

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return key;
}

function isTransientOrCapacityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('"code":503') ||
    msg.includes('"code":429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('high demand') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT')
  );
}

function formatUpstreamError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
    return {
      status: 502,
      message:
        'Gemini API key was rejected. Check GEMINI_API_KEY in Settings > Secrets and try again.',
    };
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return {
      status: 429,
      message:
        'Gemini API rate limit or quota reached. Wait a moment and click Retry, or select a billing-enabled API key in Settings > Secrets.',
    };
  }
  if (msg.includes('UNAVAILABLE') || msg.includes('"code":503') || msg.includes('high demand')) {
    return {
      status: 503,
      message:
        'Gemini is temporarily experiencing high demand. Your inputs and any existing plan have been kept — please click Retry in a moment.',
    };
  }
  if (msg.includes('NOT_FOUND') || msg.includes('404')) {
    return {
      status: 502,
      message: 'Configured Gemini model could not be found by the upstream API.',
    };
  }
  return {
    status: 502,
    message: `Could not generate project plan from Gemini: ${msg}`,
  };
}

async function callModelWithTimeout(
  ai: GoogleGenAI,
  model: string,
  userPrompt: string,
  timeoutMs: number,
  thinkingLevel: ThinkingLevel,
): Promise<string> {
  const response = await Promise.race([
    ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: PLAN_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel },
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`UNAVAILABLE: Gemini request timed out after ${timeoutMs}ms.`)),
        timeoutMs,
      ),
    ),
  ]);
  return (response.text ?? '').trim();
}

async function generateWithRetry(ai: GoogleGenAI, userPrompt: string): Promise<string> {
  const deadlineMs = Date.now() + 35_000;
  let lastError: unknown;

  const attempts: Array<{ model: string; thinking: ThinkingLevel }> = [
    { model: 'gemini-4-hydrogen', thinking: ThinkingLevel.LOW },
    { model: 'gemini-3.1-flash-lite', thinking: ThinkingLevel.MINIMAL },
  ];

  for (let i = 0; i < attempts.length; i += 1) {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 1500) break;

    const { model, thinking } = attempts[i];
    try {
      const perAttemptMs = Math.min(remainingMs, i === 0 ? 15_000 : 12_000);
      return await callModelWithTimeout(ai, model, userPrompt, perAttemptMs, thinking);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generate-plan] attempt ${i + 1} (${model}) failed: ${msg}`);
      if (!isTransientOrCapacityError(err)) {
        throw err;
      }
      if (i < attempts.length - 1 && deadlineMs - Date.now() > 2500) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/generate-plan', async (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    const goal = typeof body?.goal === 'string' ? body.goal : '';
    const startDate = typeof body?.startDate === 'string' ? body.startDate : '';
    const deadlineDate = typeof body?.deadlineDate === 'string' ? body.deadlineDate : '';
    const teamSize = body?.teamSize as string | number;
    const context = typeof body?.context === 'string' ? body.context.trim() : '';

    const inputCheck = validatePlanInputs({
      goal,
      startDate,
      deadlineDate,
      teamSize: teamSize ?? '',
    });

    if (!inputCheck.valid || !inputCheck.parsedTeamSize || !inputCheck.effectiveStartDate) {
      res.status(400).json({
        error: 'Invalid planning inputs.',
        details: inputCheck.errors,
      });
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const userPrompt = [
      `Project goal: ${goal.trim()}`,
      `Team size: ${inputCheck.parsedTeamSize} ${inputCheck.parsedTeamSize === 1 ? 'person' : 'people'}`,
      `Effective start date: ${inputCheck.effectiveStartDate}`,
      `Requested deadline: ${deadlineDate}`,
      context ? `Additional context, deliverables, constraints or approvals:\n${context}` : null,
      '',
      'Planning instructions:',
      '- Aim for 3 to 5 milestones and 8 to 15 tasks (fewer if the goal is very simple).',
      '- Use stable IDs (M1, M2... for milestones; T1, T2... for tasks).',
      '- Use verb-led task names and concise deliverables.',
      '- Include validation, testing/review, or handover tasks where relevant.',
      '- Flag any required approvals, specialist skills, and suppliers in externalDependencies and assumptions, with a confirmationQuestion where relevant.',
      '- Preserve realistic person-day effort estimates (whole-number positive integers) regardless of the requested deadline; do not artificially shrink effort to fit a tight deadline.',
      '- Allow independent tasks to have empty or minimal prerequisiteIds so the team can work in parallel.',
      '- Do not include calendar dates anywhere in the JSON; the application calculates all dates.',
    ]
      .filter((line) => line !== null)
      .join('\n');

    try {
      const rawText = await generateWithRetry(ai, userPrompt);
      if (!rawText) {
        res.status(502).json({
          error: 'Gemini returned an empty response. Please retry.',
        });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        res.status(422).json({
          error: 'Gemini returned malformed JSON. Please retry.',
        });
        return;
      }

      const validation = validateGeneratedPlan(parsed);
      if (!validation.ok) {
        res.status(422).json({
          error: `Generated plan failed validation: ${validation.error}`,
        });
        return;
      }

      res.json({ plan: validation.plan });
    } catch (err) {
      const formatted = formatUpstreamError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Project Plan Builder server listening on http://localhost:${port}`);
  });
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
