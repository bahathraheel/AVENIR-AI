const { ai, getModelName } = require('../config/gemini');
const { normaliseInterviewType, getInterviewCategoryMetadata } = require('../utils/validators');

/**
 * Strips markdown code blocks (```json ... ```) and extracts raw JSON string
 */
const cleanJsonString = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return '';
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
};

/**
 * Executes a Gemini API call with intelligent retry, exponential backoff with jitter,
 * and seamless fallback across available models.
 */
const callGeminiWithRetry = async (prompt, maxRetries = 3) => {
  // Prioritize active working models with available quota
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash'
  ];

  let lastError = null;
  const requestId = Math.random().toString(36).substring(2, 9).toUpperCase();
  let geminiRawDuration = 0;
  let jsonValidationDuration = 0;
  const attemptsLog = [];

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const currentModel = candidateModels[mIdx];
    let modelAttempt = 0;
    const maxModelAttempts = 2; // Allow up to 2 attempts per working model

    while (modelAttempt < maxModelAttempts) {
      modelAttempt++;
      const tCallStart = performance.now();
      try {
        console.log(`[Gemini][Req:${requestId}] Attempting model "${currentModel}" (Attempt ${modelAttempt}/${maxModelAttempts})...`);

        // Timeout guard: 20 seconds per attempt
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), 20000);

        const response = await ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.4,
            abortSignal: controller.signal,
          },
        });
        clearTimeout(timeoutHandle);
        const callDuration = performance.now() - tCallStart;
        geminiRawDuration += callDuration;

        const tJsonStart = performance.now();
        const text = response?.text;
        if (!text) {
          throw new Error('Gemini API returned an empty response body.');
        }

        const cleaned = cleanJsonString(text);
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (parseErr) {
          // Robust JSON object/array extraction fallback for malformed or wrapped responses
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            try {
              parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
            } catch (_) {}
          }
          if (!parsed) {
            const firstSquare = cleaned.indexOf('[');
            const lastSquare = cleaned.lastIndexOf(']');
            if (firstSquare !== -1 && lastSquare !== -1 && lastSquare > firstSquare) {
              try {
                parsed = JSON.parse(cleaned.substring(firstSquare, lastSquare + 1));
              } catch (_) {}
            }
          }
          if (!parsed) {
            throw parseErr;
          }
        }
        const jsonDuration = performance.now() - tJsonStart;
        jsonValidationDuration += jsonDuration;

        attemptsLog.push({
          model: currentModel,
          attempt: modelAttempt,
          durationMs: Math.round(callDuration),
          status: 'success'
        });

        console.log(`[Gemini][Req:${requestId}] Successfully received & parsed valid JSON using "${currentModel}" in ${Math.round(callDuration)} ms.`);

        try {
          Object.defineProperty(parsed, '_timing', {
            value: {
              geminiGeneration: Math.round(geminiRawDuration),
              jsonValidation: Math.max(1, Math.round(jsonValidationDuration)),
              winningModel: currentModel,
              attempts: attemptsLog
            },
            enumerable: false,
            writable: true,
            configurable: true
          });
        } catch (_) {}

        return parsed;

      } catch (err) {
        const callDuration = performance.now() - tCallStart;
        geminiRawDuration += callDuration;
        lastError = err;
        const status = err.status || err.statusCode || (err.error && err.error.code) || 'N/A';
        const sanitizedMsg = err.message ? err.message.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]') : 'Unknown error';

        attemptsLog.push({
          model: currentModel,
          attempt: modelAttempt,
          durationMs: Math.round(callDuration),
          status: `failed (${status})`
        });

        console.warn(`[Gemini][Req:${requestId}] Model "${currentModel}" failed in ${Math.round(callDuration)} ms with HTTP ${status}: ${sanitizedMsg}`);

        // PERMANENT ERRORS: Never retry or fallback
        if (status === 401 || status === 403 || status === 400 ||
            sanitizedMsg.includes('API_KEY_INVALID') ||
            sanitizedMsg.includes('API key not valid')) {
          console.error(`[Gemini][Req:${requestId}] Permanent authentication error. Aborting.`);
          throw new Error(`Gemini authentication error (${status}): ${sanitizedMsg}`);
        }

        // 404 (Model removed) or 429 (Daily quota exhausted on this model):
        // Break out to immediately try next model
        if (status === 404 || status === 429 || sanitizedMsg.includes('no longer available') || sanitizedMsg.includes('quota')) {
          console.log(`[Gemini][Req:${requestId}] Model "${currentModel}" quota/availability exhausted (${status}). Switching to next fallback model...`);
          break;
        }

        // For 503 (temporary high demand) or timeouts, back off and retry
        if (modelAttempt < maxModelAttempts) {
          const delay = 1200 + Math.floor(Math.random() * 500);
          console.log(`[Gemini][Req:${requestId}] Transient condition on "${currentModel}". Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  // If every candidate model in the chain exhausted
  throw new Error(`AI service is temporarily busy. All candidate models failed. Details: ${lastError?.message || 'High demand on Gemini services'}`);
};

/**
 * a) generateInterviewQuestions
 * Generates an array of structured, category-specific interview questions.
 * Validates against dedicated category schemas:
 * - Coding: title, description, inputFormat, outputFormat, examples, constraints, languageSupport, starterCode, testCases
 * - HR: questionText, competency, scenarioContext, evaluationCriteria
 * - Technical: questionText, topic, expectedConcepts, evaluationCriteria
 * - Behavioral: questionText, competency, scenarioContext, starGuide, evaluationCriteria
 * - Domain-Specific: questionText, domainTopic, industryStandard, expectedConcepts, evaluationCriteria
 */
const generateInterviewQuestions = async ({
  jobRole = 'Software Engineer',
  interviewType = 'Technical Interview',
  difficulty = 'medium',
  experienceLevel = 'mid',
  questionCount = 5,
}) => {
  try {
    const category = normaliseInterviewType(interviewType);
    const categoryMeta = getInterviewCategoryMetadata(category);
    const count = Math.min(20, Math.max(1, parseInt(questionCount, 10) || 5));

    // Determine default language for coding questions
    let defaultLang = 'c';
    const roleLower = (jobRole || '').toLowerCase();
    if (roleLower.includes('python') || roleLower.includes('data') || roleLower.includes('ai') || roleLower.includes('ml')) {
      defaultLang = 'python';
    } else if (roleLower.includes('java') && !roleLower.includes('javascript')) {
      defaultLang = 'java';
    } else if (roleLower.includes('c++') || roleLower.includes('cpp')) {
      defaultLang = 'cpp';
    } else if (roleLower.includes('react') || roleLower.includes('frontend') || roleLower.includes('node') || roleLower.includes('web')) {
      defaultLang = 'javascript';
    } else {
      // Default to C for general systems/engineering unless user picks other
      defaultLang = 'c';
    }

    let prompt = '';

    if (category === 'coding') {
      prompt = `You are a Principal Software Engineer and Algorithmic Problem Designer at AVENIR AI.
Generate exactly ${count} distinct, production-grade coding problems appropriate for a ${experienceLevel}-level candidate interviewing for "${jobRole}".
Difficulty level: "${difficulty}".
Default target programming language: "${defaultLang}".

Requirements for Coding Interview:
- Each problem MUST be a self-contained coding challenge with a clear algorithmic/data structure objective.
- If the problem or role focuses on C/Systems, ensure C is the default language and C starter code includes <stdio.h>.
- If Python or C++ or Java is selected, ensure the problem can be cleanly solved in all supported languages.
- Provide REAL input/output formats, examples with explanations, realistic constraints, and verifiable test cases.
- Do NOT provide generic "Hello World" or conversational questions.

Return ONLY a valid JSON array of exactly ${count} objects matching this EXACT schema:
[
  {
    "id": 1,
    "category": "coding",
    "title": "Concise Problem Title",
    "description": "Comprehensive problem statement detailing input, output, and algorithmic objective.",
    "inputFormat": "Explanation of input structure and types.",
    "outputFormat": "Explanation of expected output structure.",
    "examples": [
      {
        "input": "Sample stdin input string",
        "output": "Sample expected stdout string",
        "explanation": "Why this output is produced."
      }
    ],
    "constraints": [
      "1 <= N <= 10^5",
      "Time Complexity target: O(N) or O(N log N)",
      "Space Complexity target: O(N)"
    ],
    "languageSupport": ["c", "cpp", "python", "java", "javascript"],
    "defaultLanguage": "${defaultLang}",
    "starterCode": {
      "c": "#include <stdio.h>\\n#include <stdlib.h>\\n\\nint main(void) {\\n    // Read input from stdin and print solution to stdout\\n    return 0;\\n}\\n",
      "cpp": "#include <iostream>\\n#include <vector>\\nusing namespace std;\\n\\nint main() {\\n    // Read input from cin and print solution to cout\\n    return 0;\\n}\\n",
      "python": "import sys\\n\\ndef solve():\\n    # Read input from sys.stdin and print solution\\n    pass\\n\\nif __name__ == '__main__':\\n    solve()\\n",
      "java": "import java.util.*;\\n\\npublic class Main {\\n    public static void main(String[] args) {\\n        Scanner sc = new Scanner(System.in);\\n        // Solution logic\\n    }\\n}\\n",
      "javascript": "const fs = require('fs');\\n\\nfunction solve() {\\n    const input = fs.readFileSync(0, 'utf-8').trim();\\n    // Solution logic\\n}\\n\\nsolve();\\n"
    },
    "testCases": [
      {
        "input": "Sample input 1",
        "expectedOutput": "Sample output 1",
        "isPublic": true,
        "description": "Public Example Case"
      },
      {
        "input": "Sample input 2",
        "expectedOutput": "Sample output 2",
        "isPublic": false,
        "description": "Hidden Boundary/Edge Case"
      }
    ],
    "difficulty": "${difficulty}"
  }
]
`;
    } else if (category === 'hr') {
      prompt = `You are a Senior Director of Human Resources and Executive Talent Partner at AVENIR AI.
Generate exactly ${count} conversational HR and cultural-alignment interview questions for a ${experienceLevel}-level candidate interviewing for "${jobRole}".
Difficulty level: "${difficulty}".

Requirements for HR Interview:
- Focus strictly on workplace communication, career motivation, overcoming interpersonal conflicts, teamwork, professional integrity, and adaptability.
- Do NOT include coding, software syntax, or technical architectural puzzles.
- Every question must assess emotional intelligence and culture fit.

Return ONLY a valid JSON array of exactly ${count} objects matching this EXACT schema:
[
  {
    "id": 1,
    "category": "hr",
    "question": "Conversational HR interview question text.",
    "questionText": "Conversational HR interview question text.",
    "competency": "Core HR Competency (e.g. Conflict Resolution, Leadership, Adaptability)",
    "scenarioContext": "Why the hiring committee asks this and what positive signals they look for.",
    "evaluationCriteria": ["relevance", "communication", "completeness", "professionalism"],
    "difficulty": "${difficulty}"
  }
]
`;
    } else if (category === 'behavioral') {
      prompt = `You are a Principal Leadership Assessor and Behavioral Interview Specialist at AVENIR AI.
Generate exactly ${count} workplace scenario questions strictly grounded in the STAR methodology (Situation, Task, Action, Result) for a ${experienceLevel}-level "${jobRole}".
Difficulty level: "${difficulty}".

Requirements for Behavioral Interview:
- Each question must prompt the candidate to recount a specific real past workplace experience.
- Include structured guidance prompts for Situation, Task, Action, and Result.
- Do NOT ask generic textbook questions.

Return ONLY a valid JSON array of exactly ${count} objects matching this EXACT schema:
[
  {
    "id": 1,
    "category": "behavioral",
    "question": "Tell me about a specific project where you faced unexpected obstacles and had to pivot strategy.",
    "questionText": "Tell me about a specific project where you faced unexpected obstacles and had to pivot strategy.",
    "competency": "Resilience & Cross-Functional Execution",
    "scenarioContext": "Grounded in STAR methodology to assess ownership and measurable business impact.",
    "starGuide": {
      "situation": "Briefly describe the business context, team setup, and the obstacle.",
      "task": "Explain your specific role, deliverables, and what was at risk.",
      "action": "Detail the concrete strategic and interpersonal actions you personally took.",
      "result": "Highlight the quantifiable outcome, post-mortem insights, and lessons learned."
    },
    "evaluationCriteria": ["starStructure", "relevance", "reflection", "communication"],
    "difficulty": "${difficulty}"
  }
]
`;
    } else if (category === 'domain-specific') {
      prompt = `You are a Recognized Industry Authority and Domain Specialist at AVENIR AI.
Generate exactly ${count} deep domain-specific questions tailored specifically for the professional discipline of "${jobRole}".
Candidate Experience: "${experienceLevel}", Difficulty: "${difficulty}".

Requirements:
- Questions must directly assess domain-specific tooling, industry compliance standards, real-world failure modes, and production best practices unique to "${jobRole}".
- Do NOT output generic software engineering questions if the role is non-software (e.g. Data Scientist, DevOps, SRE, Cyber Security, Product Manager, Embedded Systems).

Return ONLY a valid JSON array of exactly ${count} objects matching this EXACT schema:
[
  {
    "id": 1,
    "category": "domain-specific",
    "question": "Deep domain-specific question text addressing industry standards for ${jobRole}.",
    "questionText": "Deep domain-specific question text addressing industry standards for ${jobRole}.",
    "domainTopic": "Specific Domain Subfield",
    "industryStandard": "Relevant Industry Standard / Regulatory Framework (e.g. ISO, RFC, HIPAA, NIST, SRE Golden Signals)",
    "expectedConcepts": ["Key concept 1", "Key concept 2", "Key concept 3"],
    "evaluationCriteria": ["domainExpertise", "practicalImplementation", "industryStandards", "completeness"],
    "difficulty": "${difficulty}"
  }
]
`;
    } else {
      // Technical Interview
      prompt = `You are an elite Senior Technical Architect and Interviewer at AVENIR AI.
Generate exactly ${count} rigorous technical architecture, systems design, and conceptual engineering questions for a ${experienceLevel}-level candidate interviewing for "${jobRole}".
Difficulty level: "${difficulty}".

Requirements:
- Assess core systems principles, trade-offs between architectural patterns, concurrency, performance optimization, and practical engineering trade-offs.
- Frame questions for oral/written technical dialogue with optional code/architecture snippets.

Return ONLY a valid JSON array of exactly ${count} objects matching this EXACT schema:
[
  {
    "id": 1,
    "category": "technical",
    "question": "Detailed technical question explaining systems mechanics and architectural trade-offs.",
    "questionText": "Detailed technical question explaining systems mechanics and architectural trade-offs.",
    "topic": "Systems Architecture & Core Concepts",
    "expectedConcepts": ["Key technical concept 1", "Key technical concept 2", "Key technical concept 3"],
    "evaluationCriteria": ["technicalAccuracy", "reasoning", "completeness", "clarity"],
    "difficulty": "${difficulty}"
  }
]
`;
    }

    const result = await callGeminiWithRetry(prompt);
    let questions = Array.isArray(result) ? result : result.questions || [];

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error(`AI generated empty question set for category "${category}".`);
    }

    // Format and validate against dedicated category schemas
    const formatted = questions.map((q, idx) => {
      const qId = q.id || q.questionId || idx + 1;

      if (category === 'coding') {
        const title = q.title || `Algorithmic Challenge ${qId}: ${jobRole}`;
        const desc = q.description || q.question || 'Implement an optimal solution satisfying all problem constraints.';
        const starterCode = q.starterCode && typeof q.starterCode === 'object' ? q.starterCode : {
          c: `#include <stdio.h>\n\nint main(void) {\n    // Solution in C\n    return 0;\n}\n`,
          cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n`,
          python: `import sys\n\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    solve()\n`,
          java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {}\n}\n`,
          javascript: `function solve() {}\nsolve();\n`,
        };

        const testCases = Array.isArray(q.testCases) && q.testCases.length > 0 ? q.testCases : [
          { input: '1 2 3', expectedOutput: '6', isPublic: true, description: 'Sample Test Case 1' },
          { input: '0', expectedOutput: '0', isPublic: false, description: 'Edge Test Case 2' },
        ];

        return {
          id: qId,
          questionId: qId,
          category: 'coding',
          title,
          question: title, // Backwards compatibility for summary
          questionText: desc,
          description: desc,
          inputFormat: q.inputFormat || 'Read from standard input (stdin).',
          outputFormat: q.outputFormat || 'Write result to standard output (stdout).',
          examples: Array.isArray(q.examples) ? q.examples : [
            { input: '1 2 3', output: '6', explanation: 'Sum of elements is 6.' }
          ],
          constraints: Array.isArray(q.constraints) ? q.constraints : ['Time: O(N)', 'Space: O(1)'],
          languageSupport: ['c', 'cpp', 'python', 'java', 'javascript'],
          defaultLanguage: q.defaultLanguage || defaultLang,
          starterCode,
          testCases,
          difficulty: q.difficulty || difficulty,
        };
      }

      if (category === 'hr') {
        const text = q.questionText || q.question || `Describe your career experience relevant to ${jobRole}.`;
        return {
          id: qId,
          questionId: qId,
          category: 'hr',
          question: text,
          questionText: text,
          competency: q.competency || 'Workplace Professionalism & Culture',
          scenarioContext: q.scenarioContext || 'Evaluates communication clarity, emotional intelligence, and team dynamics.',
          evaluationCriteria: ['relevance', 'communication', 'completeness', 'professionalism'],
          difficulty: q.difficulty || difficulty,
        };
      }

      if (category === 'behavioral') {
        const text = q.questionText || q.question || `Tell me about a challenge you solved in a past role.`;
        return {
          id: qId,
          questionId: qId,
          category: 'behavioral',
          question: text,
          questionText: text,
          competency: q.competency || 'STAR Problem Solving & Accountability',
          scenarioContext: q.scenarioContext || 'Structured under Situation, Task, Action, and Result.',
          starGuide: q.starGuide || {
            situation: 'Describe the workplace context and challenge.',
            task: 'Explain your specific objective and role.',
            action: 'Detail the concrete actions you took.',
            result: 'Explain the outcome, metrics, and reflection.'
          },
          evaluationCriteria: ['starStructure', 'relevance', 'reflection', 'communication'],
          difficulty: q.difficulty || difficulty,
        };
      }

      if (category === 'domain-specific') {
        const text = q.questionText || q.question || `Address the practical domain requirements for ${jobRole}.`;
        return {
          id: qId,
          questionId: qId,
          category: 'domain-specific',
          question: text,
          questionText: text,
          domainTopic: q.domainTopic || 'Core Domain Discipline',
          industryStandard: q.industryStandard || 'Production Industry Standards & Frameworks',
          expectedConcepts: Array.isArray(q.expectedConcepts) ? q.expectedConcepts : ['Best Practices', 'Regulatory Compliance', 'Production Reliability'],
          evaluationCriteria: ['domainExpertise', 'practicalImplementation', 'industryStandards', 'completeness'],
          difficulty: q.difficulty || difficulty,
        };
      }

      // Technical
      const text = q.questionText || q.question || `Explain the core architecture and mechanics for ${jobRole}.`;
      return {
        id: qId,
        questionId: qId,
        category: 'technical',
        question: text,
        questionText: text,
        topic: q.topic || 'Core Engineering Principles',
        expectedConcepts: Array.isArray(q.expectedConcepts) ? q.expectedConcepts : ['Scalability', 'Fault Tolerance', 'Design Trade-offs'],
        evaluationCriteria: ['technicalAccuracy', 'reasoning', 'completeness', 'clarity'],
        difficulty: q.difficulty || difficulty,
      };
    });

    if (result && result._timing) {
      try {
        Object.defineProperty(formatted, '_timing', {
          value: result._timing,
          enumerable: false,
          writable: true,
          configurable: true,
        });
      } catch (_) {}
    }

    return formatted;
  } catch (error) {
    console.error('[Gemini Service] generateInterviewQuestions Error:', error.message);
    throw error;
  }
};

/**
 * Official 5-Category Weighted Scoring Matrix
 * Technical Accuracy: 30%
 * Problem Solving & Logical Reasoning: 25%
 * Communication & Clarity: 20%
 * Completeness & Depth: 15%
 * Practical Knowledge: 10%
 * Total: 100%
 */
const EVALUATION_WEIGHTS = {
  technicalAccuracy: 0.30,
  problemSolving: 0.25,
  communication: 0.20,
  completeness: 0.15,
  practicalKnowledge: 0.10,
};

/**
 * Calculates weighted score from standard 5 category scores (strictly 0-100)
 */
const calculateWeightedScore = (catScores) => {
  const tech = Math.min(100, Math.max(0, parseInt(catScores?.technicalAccuracy, 10) || 0));
  const prob = Math.min(100, Math.max(0, parseInt(catScores?.problemSolving, 10) || 0));
  const comm = Math.min(100, Math.max(0, parseInt(catScores?.communication, 10) || 0));
  const comp = Math.min(100, Math.max(0, parseInt(catScores?.completeness, 10) || 0));
  const pract = Math.min(100, Math.max(0, parseInt(catScores?.practicalKnowledge, 10) || 0));

  const weighted = (tech * EVALUATION_WEIGHTS.technicalAccuracy) +
    (prob * EVALUATION_WEIGHTS.problemSolving) +
    (comm * EVALUATION_WEIGHTS.communication) +
    (comp * EVALUATION_WEIGHTS.completeness) +
    (pract * EVALUATION_WEIGHTS.practicalKnowledge);

  return Math.min(100, Math.max(0, Math.round(weighted)));
};

/**
 * b) evaluateInterviewAnswer
 * Evaluates candidate's actual answer against expected concepts with zero score on skip.
 * Computes official 5 weighted categories and per-question score breakdown.
 */
const evaluateInterviewAnswer = async ({
  question,
  answer,
  jobRole = 'Software Professional',
  interviewType = 'technical',
  difficulty = 'medium',
  programmingLanguage = null,
  sourceCode = null,
  testResults = null,
  questionDetails = null,
}) => {
  try {
    const category = normaliseInterviewType(interviewType);
    const categoryMeta = getInterviewCategoryMetadata(category);

    const questionText = typeof question === 'string'
      ? question
      : (question?.questionText || question?.title || question?.description || question?.question || 'Interview Question');
    
    let knownExpected = [];
    if (Array.isArray(questionDetails?.expectedConcepts) && questionDetails.expectedConcepts.length > 0) {
      knownExpected = questionDetails.expectedConcepts;
    } else if (Array.isArray(questionDetails?.expectedTopics) && questionDetails.expectedTopics.length > 0) {
      knownExpected = questionDetails.expectedTopics;
    } else if (Array.isArray(question?.expectedTopics) && question.expectedTopics.length > 0) {
      knownExpected = question.expectedTopics;
    } else if (Array.isArray(question?.expectedConcepts) && question.expectedConcepts.length > 0) {
      knownExpected = question.expectedConcepts;
    }
    if (knownExpected.length === 0) {
      const qWords = questionText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !['what', 'when', 'where', 'which', 'explain', 'describe', 'difference', 'between', 'does', 'how', 'with', 'their'].includes(w));
      knownExpected = qWords.length > 0 ? qWords.slice(0, 5) : ['Core Concepts', 'Implementation Details', 'Edge Cases'];
    }

    const isCoding = category === 'coding' || Boolean(sourceCode);
    const effectiveAnswer = (typeof answer === 'string' ? answer : (sourceCode || '')).trim();

    // Check for explicit skip, empty, or unattempted answer
    const cleanLower = effectiveAnswer.toLowerCase();
    const isSkipped = !effectiveAnswer ||
      cleanLower === '[skipped]' ||
      cleanLower === 'skipped' ||
      cleanLower === '[skip]' ||
      cleanLower === 'skip' ||
      effectiveAnswer.length === 0;

    if (isSkipped && (!testResults || testResults.totalCount === 0)) {
      return {
        status: 'SKIPPED',
        questionIndex: questionDetails?.index ?? null,
        question: questionText,
        candidateAnswer: '[Skipped - No answer submitted]',
        expectedConcepts: knownExpected,
        correctlyExplainedConcepts: [],
        correctlyExplained: [],
        missingConcepts: knownExpected,
        incorrectStatements: [],
        technicalCorrectness: 0,
        completeness: 0,
        categoryScores: {
          technicalAccuracy: 0,
          problemSolving: 0,
          communication: 0,
          completeness: 0,
          practicalKnowledge: 0,
          technicalCorrectness: 0,
          clarity: 0,
        },
        categories: {
          technicalAccuracy: 0,
          problemSolving: 0,
          communication: 0,
          completeness: 0,
          practicalKnowledge: 0,
        },
        score: 0,
        overallScore: 0,
        explanation: 'Question was skipped by candidate. Zero marks awarded.',
        marksJustification: 'Question was skipped by candidate. Zero marks awarded.',
        explanationOfMarks: 'Question was skipped by candidate. Zero marks awarded.',
        strengths: [],
        keyStrengths: [],
        weaknesses: ['Question was skipped. Core concepts were not demonstrated.'],
        areasForImprovement: ['Question was skipped. Core concepts were not demonstrated.'],
        improvementSuggestions: ['Practice answering questions on this topic instead of skipping to gain partial credit.'],
        feedback: 'Question was skipped. 0/100 marks awarded.',
        idealAnswer: questionDetails?.idealAnswer || questionDetails?.modelAnswer || 'A strong response outlines the core concept, implementation tradeoffs, and real-world edge cases.',
      };
    }

    // Prepare evaluation prompt for Gemini
    const testSummary = testResults
      ? `${testResults.passedCount}/${testResults.totalCount} test cases passed.`
      : 'No automated test executions.';
    const testDetails = testResults?.results ? JSON.stringify(testResults.results.slice(0, 5)) : 'N/A';

    const prompt = `You are an elite, highly experienced Lead Technical Interviewer and Hiring Panel Member at AVENIR AI.
Evaluate this candidate's response to the interview question below strictly on merit.

CRITICAL EVALUATION RULES:
1. Base your evaluation ONLY on what the candidate ACTUALLY stated or implemented.
2. NEVER invent candidate knowledge, experience, or achievements.
3. Compare the response directly against standard expected concepts for "${jobRole}".
4. Accept alternative technically correct approaches or valid paradigms.
5. If the answer is partially correct, award appropriate partial marks and explicitly distinguish what was correctly stated vs what was omitted.
6. If the answer contains incorrect statements, misconceptions, or logic bugs, identify each specifically in "incorrectStatements".
7. If the answer is completely irrelevant, nonsensical, or off-topic (e.g. "I like pizza"), award 0 marks across all technical categories.
8. Score each of the 5 categories strictly between 0 and 100 based on actual evidence:
   - "technicalAccuracy": Factual accuracy of statements, algorithm validity, freedom from errors.
   - "problemSolving": Logical reasoning, handling edge cases, computational complexity, trade-off analysis.
   - "communication": Clarity of articulation, structure of thought, precision of technical vocabulary.
   - "completeness": Depth of coverage across all aspects of the prompt without omissions.
   - "practicalKnowledge": Real-world applicability, production considerations, industry standards.

Interview Context:
- Target Role: "${jobRole}"
- Track: "${categoryMeta.label}"
- Difficulty Level: "${difficulty}"
- Question: "${questionText}"
${knownExpected.length > 0 ? `- Target Expected Concepts: ${JSON.stringify(knownExpected)}` : ''}

Candidate's Actual Response:
"""
${effectiveAnswer}
"""
${isCoding ? `
Programming Language: "${programmingLanguage || 'c'}"
Candidate Source Code:
\`\`\`${programmingLanguage || 'c'}
${sourceCode || effectiveAnswer}
\`\`\`
Test Suite Summary: ${testSummary}
` : ''}

Return ONLY a valid JSON object with this exact structure (scores must be real numbers 0-100 reflecting the actual answer):
{
  "expectedConcepts": ["concept1", "concept2", "concept3"],
  "correctlyExplainedConcepts": ["concepts accurately explained by candidate"],
  "missingConcepts": ["concepts missing or incorrectly stated"],
  "incorrectStatements": ["any wrong statements or misconceptions in answer, or empty array if none"],
  "categoryScores": {
    "technicalAccuracy": 0,
    "problemSolving": 0,
    "communication": 0,
    "completeness": 0,
    "practicalKnowledge": 0
  },
  "explanation": "Clear, objective breakdown of why these marks were awarded, referencing candidate's exact statements.",
  "strengths": ["genuine demonstrated strength (empty array if answer was incorrect or poor)"],
  "weaknesses": ["specific gap or mistake"],
  "improvementSuggestions": ["concrete actionable study advice for this question"],
  "idealAnswer": "A concise, high-impact model answer demonstrating complete technical mastery."
}
`;

    let parsed = null;
    try {
      parsed = await callGeminiWithRetry(prompt);
    } catch (apiErr) {
      console.warn('[Gemini evaluateInterviewAnswer Fallback]:', apiErr.message);
      // Deterministic fallback if API fails
      const wordCount = effectiveAnswer.split(/\s+/).filter(Boolean).length;
      const isVeryShort = wordCount < 10;
      const lowerAns = effectiveAnswer.toLowerCase();
      const qWords = new Set(questionText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3));

      // Match against expected concepts, ignoring words that only repeat the prompt question
      const matchedConcepts = knownExpected.filter((c) => {
        const cLower = c.toLowerCase();
        if (lowerAns.includes(cLower)) return true;
        const words = cLower.split(/\s+/).filter((w) => w.length > 3 && !qWords.has(w));
        return words.length > 0 && words.filter((w) => lowerAns.includes(w)).length >= Math.ceil(words.length / 2);
      });
      const missing = knownExpected.filter((c) => !matchedConcepts.includes(c));
      const matchRatio = knownExpected.length > 0 ? (matchedConcepts.length / knownExpected.length) : 0;

      let baseScore;
      if (isVeryShort) {
        baseScore = matchedConcepts.length > 0 ? 60 : 5;
      } else if (matchedConcepts.length === 0) {
        // Zero concepts matched: irrelevant or completely incorrect
        baseScore = 5;
      } else if (matchRatio >= 0.5 || (wordCount >= 30 && matchedConcepts.length >= 2)) {
        baseScore = Math.min(94, Math.max(80, Math.round(78 + (matchRatio * 16))));
      } else {
        baseScore = Math.min(70, Math.max(45, Math.round(45 + (matchRatio * 25))));
      }

      parsed = {
        expectedConcepts: knownExpected,
        correctlyExplainedConcepts: matchedConcepts.length > 0 ? matchedConcepts : (isVeryShort ? [] : [knownExpected[0] || 'Foundational principles']),
        missingConcepts: missing.length > 0 ? missing : (matchedConcepts.length === 0 ? knownExpected : []),
        incorrectStatements: [],
        categoryScores: {
          technicalAccuracy: baseScore,
          problemSolving: Math.max(0, baseScore - 5),
          communication: Math.min(100, baseScore + 5),
          completeness: isVeryShort ? 20 : baseScore,
          practicalKnowledge: Math.max(0, baseScore - 8),
        },
        explanation: `Evaluated in offline fallback mode. Answer contained ${wordCount} words and addressed ${matchedConcepts.length} expected concepts.`,
        strengths: isVeryShort || baseScore < 60 ? [] : ['Attempted comprehensive response with relevant technical terminology.'],
        weaknesses: isVeryShort ? ['Response was very brief and lacked detail.'] : (missing.length > 0 ? [`Missed key topics: ${missing.slice(0, 2).join(', ')}.`] : ['Elaborate with deeper architectural specifics.']),
        improvementSuggestions: ['Review comprehensive technical documentation for this topic.'],
        idealAnswer: questionDetails?.idealAnswer || 'A structured response covering definition, implementation tradeoffs, and failure modes.'
      };
    }

    const expectedConcepts = Array.isArray(parsed?.expectedConcepts) && parsed.expectedConcepts.length > 0
      ? parsed.expectedConcepts
      : knownExpected;

    const correctlyExplained = Array.isArray(parsed?.correctlyExplainedConcepts)
      ? parsed.correctlyExplainedConcepts
      : [];
    const missingConcepts = Array.isArray(parsed?.missingConcepts)
      ? parsed.missingConcepts
      : [];
    const incorrectStatements = Array.isArray(parsed?.incorrectStatements)
      ? parsed.incorrectStatements
      : [];

    const rawCat = parsed?.categoryScores || {};

    let techAcc = Math.min(100, Math.max(0, parseInt(rawCat.technicalAccuracy, 10) || 0));
    let probSolv = Math.min(100, Math.max(0, parseInt(rawCat.problemSolving, 10) || 0));
    let comm = Math.min(100, Math.max(0, parseInt(rawCat.communication, 10) || 0));
    let comp = Math.min(100, Math.max(0, parseInt(rawCat.completeness, 10) || 0));
    let pract = Math.min(100, Math.max(0, parseInt(rawCat.practicalKnowledge, 10) || 0));

    // Guard against irrelevant / nonsense responses (e.g., "I like pizza", "asdfgh")
    const words = effectiveAnswer.split(/\s+/).filter(Boolean);
    const isNonsenseOrIrrelevant = (words.length < 4) ||
      (correctlyExplained.length === 0 && (techAcc > 20 || probSolv > 20) && missingConcepts.length >= expectedConcepts.length);

    if (isNonsenseOrIrrelevant && correctlyExplained.length === 0) {
      techAcc = Math.min(techAcc, 10);
      probSolv = Math.min(probSolv, 10);
      comp = Math.min(comp, 10);
      pract = Math.min(pract, 10);
    }

    // Calculate official weighted score
    const finalScore = Math.min(100, Math.max(0, Math.round(
      (techAcc * EVALUATION_WEIGHTS.technicalAccuracy) +
      (probSolv * EVALUATION_WEIGHTS.problemSolving) +
      (comm * EVALUATION_WEIGHTS.communication) +
      (comp * EVALUATION_WEIGHTS.completeness) +
      (pract * EVALUATION_WEIGHTS.practicalKnowledge)
    )));

    // Contradiction guards for strengths
    let strengths = Array.isArray(parsed?.strengths)
      ? parsed.strengths.filter((s) => s && typeof s === 'string' && s.trim().length > 0)
      : [];
    let weaknesses = Array.isArray(parsed?.weaknesses)
      ? parsed.weaknesses.filter((w) => w && typeof w === 'string' && w.trim().length > 0)
      : [];

    if (finalScore < 35 || techAcc < 30) {
      // Filter out contradictory praise if score is failing
      strengths = strengths.filter((s) => {
        const lower = s.toLowerCase();
        return !lower.includes('strong') && !lower.includes('deep') && !lower.includes('mastery') && !lower.includes('excellent');
      });
      if (finalScore < 25) {
        strengths = [];
      }
    }

    if (weaknesses.length === 0 && finalScore < 85) {
      if (missingConcepts.length > 0) {
        weaknesses.push(`Omitted discussion of: ${missingConcepts.slice(0, 2).join(', ')}.`);
      } else {
        weaknesses.push('Could provide deeper edge case analysis and concrete metrics.');
      }
    }

    const suggestions = Array.isArray(parsed?.improvementSuggestions) && parsed.improvementSuggestions.length > 0
      ? parsed.improvementSuggestions
      : (Array.isArray(parsed?.suggestions) ? parsed.suggestions : ['Review core principles for this question.']);

    return {
      status: 'ANSWERED',
      questionIndex: questionDetails?.index ?? null,
      question: questionText,
      candidateAnswer: effectiveAnswer,
      expectedConcepts,
      correctlyExplainedConcepts: correctlyExplained,
      correctlyExplained,
      missingConcepts,
      incorrectStatements,
      technicalCorrectness: techAcc,
      completeness: comp,
      categoryScores: {
        technicalAccuracy: techAcc,
        problemSolving: probSolv,
        communication: comm,
        completeness: comp,
        practicalKnowledge: pract,
        technicalCorrectness: techAcc,
        clarity: comm,
      },
      categories: {
        technicalAccuracy: techAcc,
        problemSolving: probSolv,
        communication: comm,
        completeness: comp,
        practicalKnowledge: pract,
      },
      score: finalScore,
      overallScore: finalScore,
      explanation: parsed?.explanation || `Awarded ${finalScore}/100 (Technical Accuracy: ${techAcc}%, Completeness: ${comp}%).`,
      marksJustification: parsed?.explanation || `Awarded ${finalScore}/100 (Technical Accuracy: ${techAcc}%, Completeness: ${comp}%).`,
      explanationOfMarks: parsed?.explanation || `Awarded ${finalScore}/100 (Technical Accuracy: ${techAcc}%, Completeness: ${comp}%).`,
      strengths,
      keyStrengths: strengths,
      weaknesses,
      areasForImprovement: weaknesses,
      improvementSuggestions: suggestions,
      suggestions,
      feedback: parsed?.explanation || `Score: ${finalScore}/100`,
      idealAnswer: parsed?.idealAnswer || questionDetails?.idealAnswer || questionDetails?.modelAnswer || 'A structured response covering definition, implementation tradeoffs, and failure modes.',
    };
  } catch (error) {
    console.error('[Gemini Service] evaluateInterviewAnswer Error:', error.message);
    throw error;
  }
};

/**
 * c) generateFollowUpQuestion
 * Adaptive question generation:
 * - If score > 75: delve deeper into edge cases, scalability, optimizations
 * - If score < 50: pivot to foundational conceptual mechanics
 * - Otherwise: probe nuance and trade-offs
 */
const generateFollowUpQuestion = async ({
  previousQuestion,
  previousAnswer,
  evaluation,
  jobRole,
  interviewType = 'technical',
  difficulty = 'medium',
}) => {
  try {
    const score = evaluation?.overallScore ?? 70;
    let strategyPrompt = 'Probe the trade-offs and alternative approaches to their solution.';
    if (score >= 75) {
      strategyPrompt = 'The candidate answered well. Ask an advanced, deeper follow-up examining edge cases, concurrency, fault-tolerance, or distributed scalability.';
    } else if (score < 50) {
      strategyPrompt = 'The candidate struggled. Pivot gently to a foundational, core concept to gauge their baseline knowledge.';
    }

    const prompt = `You are an adaptive technical interviewer at AVENIR AI.
Context:
- Job Role: "${jobRole}"
- Interview Type: "${interviewType}"
- Base Difficulty: "${difficulty}"
- Previous Question: "${previousQuestion}"
- Candidate's Answer: "${previousAnswer || 'No response'}"
- Evaluated Score: ${score}/100
- Weaknesses identified: ${JSON.stringify(evaluation?.weaknesses || [])}
- Missing concepts: ${JSON.stringify(evaluation?.missingConcepts || [])}

Instruction:
${strategyPrompt}

Generate exactly ONE follow-up question.
Return a JSON object with this EXACT structure:
{
  "question": "Follow-up question text here",
  "expectedTopics": ["Topic 1", "Topic 2"],
  "difficulty": "${score >= 75 ? 'hard' : score < 50 ? 'easy' : difficulty}",
  "isFollowUp": true
}
`;

    const result = await callGeminiWithRetry(prompt);

    return {
      question: result.question || `Could you elaborate on the trade-offs of your approach for ${jobRole}?`,
      expectedTopics: Array.isArray(result.expectedTopics) ? result.expectedTopics : ['Scalability', 'Trade-offs'],
      difficulty: result.difficulty || difficulty,
      isFollowUp: true,
    };
  } catch (error) {
    console.error('[Gemini Service] generateFollowUpQuestion Error:', error.message);
    throw error;
  }
};

/**
 * Canonical skill dictionary for normalization and deduplication
 */
const CANONICAL_SKILL_MAP = {
  'js': 'JavaScript', 'javascript': 'JavaScript', 'ts': 'TypeScript', 'typescript': 'TypeScript',
  'node': 'Node.js', 'nodejs': 'Node.js', 'node.js': 'Node.js',
  'react': 'React.js', 'reactjs': 'React.js', 'react.js': 'React.js',
  'express': 'Express.js', 'expressjs': 'Express.js', 'express.js': 'Express.js',
  'py': 'Python', 'python': 'Python', 'python3': 'Python',
  'java': 'Java', 'c': 'C', 'cpp': 'C++', 'c++': 'C++', 'c#': 'C#', 'csharp': 'C#',
  'sql': 'SQL', 'mysql': 'MySQL', 'postgres': 'PostgreSQL', 'postgresql': 'PostgreSQL',
  'mongo': 'MongoDB', 'mongodb': 'MongoDB', 'docker': 'Docker', 'k8s': 'Kubernetes',
  'kubernetes': 'Kubernetes', 'aws': 'AWS', 'gcp': 'Google Cloud (GCP)', 'azure': 'Microsoft Azure',
  'git': 'Git', 'github': 'GitHub', 'graphql': 'GraphQL', 'rest': 'REST APIs',
  'rest apis': 'REST APIs', 'rest api': 'REST APIs', 'restful apis': 'REST APIs',
  'html': 'HTML5', 'html5': 'HTML5', 'css': 'CSS3', 'css3': 'CSS3',
  'bootstrap': 'Bootstrap', 'tailwind': 'Tailwind CSS', 'tailwindcss': 'Tailwind CSS',
  'firebase': 'Firebase', 'vercel': 'Vercel', 'postman': 'Postman', 'jest': 'Jest',
  'redis': 'Redis', 'nextjs': 'Next.js', 'next.js': 'Next.js',
  'ci/cd': 'CI/CD Pipelines', 'ci/cd pipelines': 'CI/CD Pipelines', 'cicd': 'CI/CD Pipelines'
};

/**
 * Normalizes skill lists into discrete, standardized skill badges.
 * Splits concatenated strings (e.g. "Python, Java, React"), maps aliases (JS -> JavaScript),
 * and eliminates duplicate entries while preserving combined tech names like "CI/CD".
 */
const normalizeSkillList = (rawInput) => {
  if (!rawInput) return [];
  const items = Array.isArray(rawInput) ? rawInput : [rawInput];
  const result = [];
  const seen = new Set();

  for (const item of items) {
    if (!item) continue;
    // Split on commas, semicolons, vertical bars, newlines, and conjunctions (preserve CI/CD)
    const parts = String(item).split(/[,;\n|]+|\s+[|/]\s+|\s+\band\b\s+|\s+&\s+/i);
    for (const part of parts) {
      let cleaned = part.trim()
        .replace(/^[-•*#\d.]+\s*/, '') // Remove bullet points or list numbers
        .replace(/[.]+$/, '')          // Remove trailing dots
        .trim();
      if (!cleaned || cleaned.length < 1) continue;

      const lower = cleaned.toLowerCase();
      const normalized = CANONICAL_SKILL_MAP[lower] || cleaned;
      const key = normalized.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(normalized);
      }
    }
  }
  return result;
};

/**
 * d) analyzeResume
 * Analyzes parsed resume text against a target job role.
 * Generates ATS compatibility scoring, skills extraction, candidate information,
 * transparent score breakdown, and comprehensive section-by-section analysis.
 */
const analyzeResume = async ({ resumeText, targetJobRole = 'Software Developer' }) => {
  try {
    const prompt = `You are a Principal Executive Career Coach and ATS (Applicant Tracking System) Engineer at AVENIR AI ("Your Future Starts Here.").
Analyze the following resume text tailored for the target job role: "${targetJobRole}".

Resume Content:
"""
${resumeText.slice(0, 15000)}
"""

REQUIREMENTS & EVALUATION RULES:
1. CANDIDATE IDENTITY & SUMMARY:
   - Extract candidate's full legal name from the top header of the resume.
   - Write a high-impact, professional executive summary (2-3 sentences) evaluating candidate background, years of experience, and primary technical specialization.

2. SKILL EXTRACTION & KEYWORD ANALYSIS:
   - "skillsFound": Extract individual, discrete technical skills verified as present in the resume (programming languages, frameworks, databases, developer tools, cloud). Return as separate array items (e.g. ["JavaScript", "Python", "Java", "React.js", "Node.js", "SQL"]). NEVER combine multiple skills into one string (never "JavaScript, Python, React").
   - "matchedKeywords": Specific keywords and role requirements present in the resume that directly align with "${targetJobRole}".
   - "partiallyMatchedKeywords": Keywords or concepts partially demonstrated or adjacent to role requirements.
   - "missingKeywords": Critical keywords and technologies recommended for "${targetJobRole}" that are GENUINELY ABSENT from the resume text. Do not list skills that are already mentioned in the resume.

3. TRANSPARENT ATS SCORING MODEL (100 Points Total):
   Calculate the ATS score using this exact 5-factor weighted formula based only on verified resume content:
   - Keyword Alignment (0 to 40 pts): Match ratio of candidate's verified skills against "${targetJobRole}" core expectations.
   - Experience Relevance (0 to 25 pts): Alignment of work experience responsibilities and measurable impact to the target role.
   - Skills Depth (0 to 20 pts): Practical breadth, libraries, frameworks, tools, and technical competencies present in the resume.
   - Education & Credentials (0 to 10 pts): Relevant STEM/CS degree, technical coursework, or industry certifications.
   - ATS Formatting & Readability (0 to 5 pts): Clear standard section headers, clean contact info, single-column readability.
   - atsScore = keywordAlignment + experienceRelevance + skillsDepth + educationCredentials + formattingStructure (Sum: 0-100).
   - Do NOT award points for skills that are not present. Do NOT invent qualifications.

4. SECTION EVALUATIONS:
   - "experienceAnalysis": In-depth evaluation of work history, bullet clarity, action verbs, and quantifiable metrics.
   - "projectAnalysis": Review of practical project implementations, full-stack architecture, complexity, and repository ownership.
   - "educationAnalysis": Evaluation of degree(s), GPA/CGPA, institutions, and relevant certifications.
   - "strengths": 3-4 specific competitive advantages found in the resume.
   - "weaknesses": 2-3 specific gaps or weak points (e.g. lack of scale metrics, missing CI/CD).
   - "improvements": 3-4 prioritized line-item resume changes using Google's X-Y-Z formula: "Accomplished [X] as measured by [Y], by doing [Z]".
   - "recommendations": 3 strategic interview preparation and career coaching recommendations for "${targetJobRole}".

Return a valid JSON object matching this EXACT schema:
{
  "atsScore": 85,
  "candidateName": "Alex Morgan",
  "targetRole": "${targetJobRole}",
  "professionalSummary": "High-impact 2-3 sentence executive summary...",
  "skillsFound": ["JavaScript", "Python", "Java", "React.js", "Node.js", "SQL", "Git", "Docker"],
  "matchedKeywords": ["Full-Stack Development", "REST APIs", "Database Optimization", "Agile / Scrum"],
  "partiallyMatchedKeywords": ["Cloud Deployment", "Microservices"],
  "missingKeywords": ["Kubernetes", "CI/CD Pipelines", "GraphQL", "Redis"],
  "scoreBreakdown": {
    "keywordAlignment": 34,
    "experienceRelevance": 21,
    "skillsDepth": 17,
    "educationCredentials": 9,
    "formattingStructure": 4,
    "calculationExplanation": "Calculated using a transparent 100-point model: 40% Role Keyword Alignment, 25% Experience Relevance, 20% Technical Skill Depth, 10% Education & Credentials, and 5% ATS Formatting. Points are awarded exclusively for verified qualifications present in the resume."
  },
  "experienceAnalysis": "Detailed evaluation of candidate work history...",
  "educationAnalysis": "Evaluation of degree(s), academic focus, relevant coursework...",
  "projectAnalysis": "In-depth review of listed practical projects, technical depth...",
  "strengths": ["Clear technical experience", "Solid foundational skill set"],
  "weaknesses": ["Quantifiable business impact metrics could be amplified"],
  "improvements": ["Rewrite bullet points using Google's X-Y-Z formula..."],
  "recommendations": ["Practice targeted interview questions for ${targetJobRole}"]
}`;

    const result = await callGeminiWithRetry(prompt);

    const candidateName = (result.candidateName && result.candidateName !== 'Candidate Full Name extracted from top of resume')
      ? String(result.candidateName).trim()
      : 'Candidate Profile';

    // 1. Normalize and deduplicate all skill and keyword collections
    const rawSkillsFound = Array.isArray(result.skillsFound) && result.skillsFound.length > 0
      ? result.skillsFound
      : (Array.isArray(result.skills?.detected) ? result.skills.detected : ['Technical Problem Solving']);
    const skillsFound = normalizeSkillList(rawSkillsFound);

    const rawMatched = Array.isArray(result.matchedKeywords) && result.matchedKeywords.length > 0
      ? result.matchedKeywords
      : (Array.isArray(result.keywords?.found) ? result.keywords.found : skillsFound.slice(0, 5));
    const matchedKeywords = normalizeSkillList(rawMatched);

    const rawPartial = Array.isArray(result.partiallyMatchedKeywords) ? result.partiallyMatchedKeywords : [];
    const partiallyMatchedKeywords = normalizeSkillList(rawPartial);

    const rawMissing = Array.isArray(result.missingKeywords) && result.missingKeywords.length > 0
      ? result.missingKeywords
      : (Array.isArray(result.skills?.missing) ? result.skills.missing : ['Cloud Architecture', 'CI/CD Pipelines']);
    const normalizedMissing = normalizeSkillList(rawMissing);

    // 2. Strict missing keyword validation: check against resume text
    // If a missing keyword is actually mentioned in the resume text, remove it from missing keywords
    const lowerResumeText = resumeText.toLowerCase();
    const verifiedMissingKeywords = normalizedMissing.filter((kw) => {
      const kwLower = kw.toLowerCase();
      // Check if word or common alias appears in resume
      if (lowerResumeText.includes(kwLower)) return false;
      if (kwLower === 'docker' && lowerResumeText.includes('docker')) return false;
      if (kwLower === 'aws' && lowerResumeText.includes('aws')) return false;
      if (kwLower === 'sql' && lowerResumeText.includes('sql')) return false;
      if (kwLower === 'python' && lowerResumeText.includes('python')) return false;
      if (kwLower === 'java' && lowerResumeText.includes('java')) return false;
      return true;
    });

    // 3. Transparent ATS Scoring Breakdown
    const sb = result.scoreBreakdown || {};
    const keywordAlignment = Math.min(40, Math.max(0, parseInt(sb.keywordAlignment, 10) || Math.round((Math.min(matchedKeywords.length, 6) / 6) * 35)));
    const experienceRelevance = Math.min(25, Math.max(0, parseInt(sb.experienceRelevance, 10) || 20));
    const skillsDepth = Math.min(20, Math.max(0, parseInt(sb.skillsDepth, 10) || Math.min(20, Math.max(10, skillsFound.length * 2))));
    const educationCredentials = Math.min(10, Math.max(0, parseInt(sb.educationCredentials, 10) || 9));
    const formattingStructure = Math.min(5, Math.max(0, parseInt(sb.formattingStructure, 10) || 4));

    const computedTotal = keywordAlignment + experienceRelevance + skillsDepth + educationCredentials + formattingStructure;
    const atsScore = Math.min(100, Math.max(0, parseInt(result.atsScore, 10) || computedTotal));

    const scoreBreakdown = {
      keywordAlignment: { score: keywordAlignment, max: 40, label: 'Role & Keyword Alignment', weight: '40%' },
      experienceRelevance: { score: experienceRelevance, max: 25, label: 'Work Experience & Impact', weight: '25%' },
      skillsDepth: { score: skillsDepth, max: 20, label: 'Technical Skills Depth', weight: '20%' },
      educationCredentials: { score: educationCredentials, max: 10, label: 'Education & Credentials', weight: '10%' },
      formattingStructure: { score: formattingStructure, max: 5, label: 'ATS Layout & Readability', weight: '5%' },
      calculationExplanation: sb.calculationExplanation || `The ATS score of ${atsScore}/100 is calculated using a transparent weighted model: 40% Role Keyword Alignment (${keywordAlignment}/40), 25% Experience Relevance (${experienceRelevance}/25), 20% Technical Skill Depth (${skillsDepth}/20), 10% Education & Credentials (${educationCredentials}/10), and 5% ATS Readability (${formattingStructure}/5). Points are awarded strictly for verified credentials present in the document.`
    };

    const strengths = Array.isArray(result.strengths) && result.strengths.length > 0
      ? result.strengths
      : ['Clear technical experience', 'Solid foundational skill set'];

    const weaknesses = Array.isArray(result.weaknesses) && result.weaknesses.length > 0
      ? result.weaknesses
      : ['Quantifiable business impact metrics could be amplified'];

    const improvements = Array.isArray(result.improvements) && result.improvements.length > 0
      ? result.improvements
      : ['Add measurable performance metrics to project descriptions'];

    const recommendations = Array.isArray(result.recommendations) && result.recommendations.length > 0
      ? result.recommendations
      : [`Practice targeted interview questions for ${targetJobRole}`];

    // Build structured output complying with Requirement #4 + backward compatibility
    return {
      atsScore,
      candidateName,
      targetRole: result.targetRole || targetJobRole,
      professionalSummary: result.professionalSummary || 'Dedicated software engineering professional with hands-on experience delivering reliable production software.',
      skillsFound,
      matchedKeywords,
      partiallyMatchedKeywords,
      missingKeywords: verifiedMissingKeywords.length > 0 ? verifiedMissingKeywords : normalizedMissing,
      scoreBreakdown,
      experienceAnalysis: result.experienceAnalysis || 'Work experience demonstrates relevant technical capabilities for the target role.',
      educationAnalysis: result.educationAnalysis || 'Educational and technical background provides foundational competency.',
      projectAnalysis: result.projectAnalysis || 'Demonstrates practical project implementations and architectural problem-solving.',
      strengths,
      weaknesses,
      improvements,
      recommendations,

      // Backward-compatible properties
      overallScore: atsScore,
      atsCompatibility: {
        score: atsScore,
        disclaimer: 'ATS compatibility score is an estimation based on standard keyword density, header conventions, and role alignment.',
        verdict: atsScore >= 80 ? 'High Compatibility' : atsScore >= 60 ? 'Moderate Compatibility' : 'Needs Optimization',
      },
      skills: {
        detected: skillsFound,
        matched: matchedKeywords,
        missing: verifiedMissingKeywords.length > 0 ? verifiedMissingKeywords : normalizedMissing,
        suggestions: improvements,
      },
      experience: {
        relevance: atsScore >= 75 ? 'High' : 'Moderate',
        feedback: result.experienceAnalysis || 'Good overall alignment with target role expectations.',
      },
      keywords: {
        found: matchedKeywords,
        missing: verifiedMissingKeywords.length > 0 ? verifiedMissingKeywords : normalizedMissing,
      },
      formatting: [
        'Use clean standard headers and single-column layout for ATS readability.',
        'Ensure contact information and email are clearly parseable at the document top.'
      ]
    };
  } catch (error) {
    console.error('[Gemini Service] analyzeResume Error:', error.message);
    throw error;
  }
};

/**
 * e) generateLearningRoadmap
 * Creates a structured 7-day personalized curriculum tailored to candidate performance,
 * weak interview areas, job role, and resume skill gaps.
 */
const generateLearningRoadmap = async ({
  weakTopics = [],
  jobRole = 'Software Engineer',
  experienceLevel = 'mid',
  interviewCategory = 'Technical Interview',
  performanceSummary = '',
  resumeSkills = [],
}) => {
  try {
    const topicsList = Array.isArray(weakTopics) && weakTopics.length > 0
      ? weakTopics.join(', ')
      : 'Core Technical Principles, Architecture, and Practical Problem-Solving';

    const resumeContext = Array.isArray(resumeSkills) && resumeSkills.length > 0
      ? `Existing Candidate Skills: ${resumeSkills.slice(0, 10).join(', ')}.`
      : '';

    const perfContext = performanceSummary
      ? `Recent Interview Assessment Notes: ${performanceSummary}.`
      : 'Note: Candidate is building foundational mastery for upcoming interviews.';

    const prompt = `You are a Principal Technical Interview Coach and Staff Engineering Mentor at AVENIR AI ("Your Future Starts Here.").
Create a personalized, intensive 7-day learning roadmap tailored for a candidate with ${experienceLevel} experience targeting the position of "${jobRole}".

Interview Category Focus: ${interviewCategory}
Identified Weak Areas / Improvement Focus: ${topicsList}
${resumeContext}
${perfContext}

Generate a comprehensive, actionable study curriculum and daily timeline.
Return a valid JSON object matching this EXACT schema without additional formatting:
{
  "objectives": [
    "Master core foundational principles and edge-case handling in ${topicsList}",
    "Gain confidence delivering structured, high-scoring technical responses under interview pressure"
  ],
  "topics": [
    {
      "name": "Topic Title (e.g., Asynchronous Concurrency & Event Loop Mechanics)",
      "category": "${interviewCategory}",
      "priority": "High",
      "description": "Clear explanation of core technical fundamentals, performance trade-offs, and why interviewers test this.",
      "resources": [
        "MDN Web Docs: Concurrency Model and Event Loop",
        "Deep-dive technical whitepaper or reference guide"
      ],
      "exercises": [
        "Implement a custom Promise.all with fail-fast semantics and timeout handling",
        "Predict and debug microtask vs macrotask execution orders"
      ],
      "interviewTask": "Explain how node.js handles heavy I/O operations without blocking the single event loop thread."
    }
  ],
  "sevenDayPlan": [
    {
      "day": 1,
      "focus": "Foundations & Core Algorithmic Principles",
      "goals": [
        "Review foundational time and space complexity trade-offs",
        "Implement 2 core data structure operations from scratch"
      ],
      "practiceTask": "Simulate a live 15-minute whiteboarding explanation of hash map collisions.",
      "recommendedHours": 2
    },
    {
      "day": 2,
      "focus": "Practical Architecture & Design Patterns",
      "goals": [
        "Analyze clean architecture patterns and dependency inversion",
        "Review production error handling and idempotency"
      ],
      "practiceTask": "Design an idempotent API endpoint using distributed cache locks.",
      "recommendedHours": 2
    },
    {
      "day": 3,
      "focus": "Deep-Dive into Weak Technical Competencies",
      "goals": [
        "Resolve specific weak points identified in recent assessments",
        "Write unit tests covering edge-case failures"
      ],
      "practiceTask": "Refactor a legacy algorithmic solution to achieve O(N) linear runtime.",
      "recommendedHours": 2
    },
    {
      "day": 4,
      "focus": "Data Flow, Caching & Performance Optimization",
      "goals": [
        "Master cache invalidation strategies (Cache-aside, Write-through)",
        "Optimize database query plans and indexing"
      ],
      "practiceTask": "Benchmark latency differences between indexed vs unindexed lookups.",
      "recommendedHours": 2
    },
    {
      "day": 5,
      "focus": "Communication, STAR Method & Trade-off Articulation",
      "goals": [
        "Structure clear 2-minute architectural elevator pitches",
        "Apply the STAR framework to challenging past engineering hurdles"
      ],
      "practiceTask": "Record a spoken answer explaining a time a production system failed.",
      "recommendedHours": 2
    },
    {
      "day": 6,
      "focus": "Hands-on Mock Interview Simulation",
      "goals": [
        "Conduct a full-length mock interview in the AVENIR AI interview room",
        "Identify hesitation triggers and refine answer timing"
      ],
      "practiceTask": "Complete a 5-question technical drill without pauses.",
      "recommendedHours": 3
    },
    {
      "day": 7,
      "focus": "Comprehensive Synthesis & Readiness Assessment",
      "goals": [
        "Review AI scorecards and performance metrics across all 7 days",
        "Consolidate cheat-sheet of critical frameworks and syntax shortcuts"
      ],
      "practiceTask": "Deliver a flawless final mock session targeting 85%+ overall score.",
      "recommendedHours": 2
    }
  ]
}

Provide 4 to 6 distinct, high-impact topics in "topics" with realistic, concrete resources and exercises.
Ensure "sevenDayPlan" contains exactly 7 sequential days (Day 1 through Day 7).`;

    const result = await callGeminiWithRetry(prompt);

    // Validate objectives
    const objectives = Array.isArray(result.objectives) && result.objectives.length > 0
      ? result.objectives
      : [
          `Master core foundational concepts in ${topicsList}`,
          `Build structured confidence for ${jobRole} interview evaluations`
        ];

    // Validate topics
    const rawTopics = Array.isArray(result.topics) && result.topics.length > 0
      ? result.topics
      : [
          {
            name: `${jobRole} Core Architectural Fundamentals`,
            category: interviewCategory,
            priority: 'High',
            description: `Master foundational principles and high-frequency questions for ${jobRole}.`,
            resources: ['Official Language & Framework Documentation', 'System Design Best Practices Handbook'],
            exercises: ['Build a sample modular project demonstrating separation of concerns', 'Implement core unit test suite'],
            interviewTask: 'Explain trade-offs between monolithic vs microservices architectures.'
          }
        ];

    const validatedTopics = rawTopics.map((t, idx) => ({
      id: t.id || `topic_${idx + 1}`,
      name: t.name || t.title || `Core Mastery Topic ${idx + 1}`,
      category: t.category || interviewCategory,
      priority: ['High', 'Medium', 'Low'].includes(t.priority) ? t.priority : 'High',
      description: t.description || 'Master key principles, performance considerations, and interview articulation.',
      resources: Array.isArray(t.resources) && t.resources.length > 0 ? t.resources : ['Official Documentation & Technical Whitepapers'],
      exercises: Array.isArray(t.exercises) && t.exercises.length > 0 ? t.exercises : ['Hands-on coding drill and trade-off analysis'],
      interviewTask: t.interviewTask || 'Live mock interview evaluation scenario.'
    }));

    // Validate 7-day plan
    let rawDays = Array.isArray(result.sevenDayPlan) && result.sevenDayPlan.length >= 7
      ? result.sevenDayPlan
      : (Array.isArray(result.weeklyPlan) && result.weeklyPlan.length >= 7 ? result.weeklyPlan : []);

    if (rawDays.length < 7) {
      // Default 7-day structured timeline if Gemini returned fewer
      rawDays = [
        { day: 1, focus: 'Foundations & Algorithmic Complexity', goals: ['Review Big-O analysis and space/time trade-offs', 'Solve 2 foundational problem sets'], practiceTask: 'Explain complexity trade-offs out loud.', recommendedHours: 2 },
        { day: 2, focus: 'Core Data Structures & Pointers', goals: ['Two Pointers, Hash Maps, and Sliding Window techniques', 'String manipulation and edge cases'], practiceTask: 'Code an O(N) array sliding window solution.', recommendedHours: 2 },
        { day: 3, focus: 'System Architecture & Edge-Case Handling', goals: ['Analyze modular components and defensive programming', 'Trace asynchronous task flows'], practiceTask: 'Draft a system architecture diagram.', recommendedHours: 2 },
        { day: 4, focus: 'Caching, Databases & Performance Trade-offs', goals: ['Redis caching patterns and DB indexing strategies', 'Concurrency handling and race conditions'], practiceTask: 'Implement cache-aside pattern with TTL.', recommendedHours: 2 },
        { day: 5, focus: 'Behavioral & STAR Communication Mastery', goals: ['Draft 3 STAR stories for leadership and failure scenarios', 'Practice concise 2-minute answers'], practiceTask: 'Record audio responses in mock room.', recommendedHours: 2 },
        { day: 6, focus: 'Full-Length Timed Mock Interview Session', goals: ['Complete full mock interview under real exam constraints', 'Evaluate AI feedback and weak spots'], practiceTask: 'Target 80%+ score on all categories.', recommendedHours: 3 },
        { day: 7, focus: 'Synthesis, Review & Final Polish', goals: ['Review all 7 days of practice solutions', 'Final quick-fire mock session'], practiceTask: 'Final warm-up drill before live interview.', recommendedHours: 2 }
      ];
    }

    const validatedSevenDayPlan = rawDays.slice(0, 7).map((d, idx) => ({
      day: idx + 1,
      focus: d.focus || `Day ${idx + 1} Study Focus`,
      goals: Array.isArray(d.goals) && d.goals.length > 0 ? d.goals : [`Master daily learning objective for ${jobRole}`],
      practiceTask: d.practiceTask || d.task || 'Hands-on practice drill and self-assessment.',
      recommendedHours: typeof d.recommendedHours === 'number' ? d.recommendedHours : 2,
    }));

    return {
      objectives,
      topics: validatedTopics,
      sevenDayPlan: validatedSevenDayPlan,
      weeklyPlan: validatedSevenDayPlan // Kept for backward compatibility
    };
  } catch (error) {
    console.error('[Gemini Service] generateLearningRoadmap Error:', error.message);
    throw error;
  }
};

/**
 * f) generateInterviewReport
 * Produces an accurate, mathematically verified interview synthesis based on actual candidate responses.
 * Enforces weighted scoring across 5 categories and prevents contradictory feedback.
 */
const generateInterviewReport = async ({
  questions = [],
  answers = [],
  evaluations = [],
  jobRole = 'Software Professional',
  interviewType = 'technical',
  difficulty = 'medium',
}) => {
  try {
    const category = normaliseInterviewType(interviewType);
    const categoryMeta = getInterviewCategoryMetadata(category);

    const evaluatedQuestions = [];
    let totalScoreSum = 0;
    let totalTechSum = 0;
    let totalProbSum = 0;
    let totalCommSum = 0;
    let totalCompSum = 0;
    let totalPractSum = 0;
    let answeredCount = 0;
    let skippedCount = 0;

    const N = Math.max(1, questions.length);

    // Step 1: Ensure 100% of questions have a complete, verified evaluation
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qIdxStr = String(i);
      const rawAns = (answers && typeof answers === 'object' && !Array.isArray(answers))
        ? (answers[qIdxStr] ?? answers[q.id] ?? '')
        : (Array.isArray(answers) ? (answers[i] || '') : '');

      const existingEval = (evaluations && typeof evaluations === 'object' && !Array.isArray(evaluations))
        ? (evaluations[qIdxStr] ?? evaluations[q.id] ?? null)
        : (Array.isArray(evaluations) ? evaluations[i] : null);

      const effectiveAns = typeof rawAns === 'string' ? rawAns.trim() : (rawAns?.code || '');
      const cleanLower = effectiveAns.toLowerCase();
      const isSkip = !effectiveAns ||
        cleanLower === '[skipped]' ||
        cleanLower === 'skipped' ||
        cleanLower === '[skip]' ||
        cleanLower === 'skip' ||
        effectiveAns.length === 0;

      let qEval = existingEval;

      if (!qEval || !qEval.categoryScores || (isSkip && qEval.status !== 'SKIPPED')) {
        qEval = await evaluateInterviewAnswer({
          question: q,
          answer: isSkip ? '[Skipped]' : effectiveAns,
          jobRole,
          interviewType,
          difficulty,
          questionDetails: { ...(typeof q === 'object' ? q : {}), index: i },
        });
      }

      if (isSkip || qEval.status === 'SKIPPED') {
        skippedCount++;
        qEval = {
          ...qEval,
          status: 'SKIPPED',
          score: 0,
          overallScore: 0,
          technicalCorrectness: 0,
          completeness: 0,
          categoryScores: {
            technicalAccuracy: 0,
            problemSolving: 0,
            communication: 0,
            completeness: 0,
            practicalKnowledge: 0,
            technicalCorrectness: 0,
            clarity: 0,
          },
          strengths: [],
          candidateAnswer: '[Skipped - No answer submitted]',
        };
      } else {
        answeredCount++;
      }

      const cat = qEval.categoryScores || {};
      totalTechSum += (cat.technicalAccuracy || 0);
      totalProbSum += (cat.problemSolving || 0);
      totalCommSum += (cat.communication || 0);
      totalCompSum += (cat.completeness || 0);
      totalPractSum += (cat.practicalKnowledge || 0);
      totalScoreSum += (qEval.score ?? qEval.overallScore ?? 0);

      evaluatedQuestions.push({
        ...qEval,
        questionIndex: i,
        question: typeof q === 'string' ? q : (q.title || q.questionText || q.question || `Question ${i + 1}`),
        candidateAnswer: isSkip ? '[Skipped - No answer submitted]' : effectiveAns,
      });
    }

    // Step 2: Compute verified category averages across all N questions
    const techAvg = Math.min(100, Math.max(0, Math.round(totalTechSum / N)));
    const probAvg = Math.min(100, Math.max(0, Math.round(totalProbSum / N)));
    const commAvg = Math.min(100, Math.max(0, Math.round(totalCommSum / N)));
    const compAvg = Math.min(100, Math.max(0, Math.round(totalCompSum / N)));
    const practAvg = Math.min(100, Math.max(0, Math.round(totalPractSum / N)));

    const finalOverallScore = Math.min(100, Math.max(0, Math.round(
      (techAvg * EVALUATION_WEIGHTS.technicalAccuracy) +
      (probAvg * EVALUATION_WEIGHTS.problemSolving) +
      (commAvg * EVALUATION_WEIGHTS.communication) +
      (compAvg * EVALUATION_WEIGHTS.completeness) +
      (practAvg * EVALUATION_WEIGHTS.practicalKnowledge)
    )));

    const categoryScores = {
      technicalAccuracy: techAvg,
      problemSolving: probAvg,
      communication: commAvg,
      completeness: compAvg,
      practicalKnowledge: practAvg,
      // Backward compatibility aliases
      technicalCorrectness: techAvg,
      clarity: commAvg,
    };

    // Step 3: All Questions Skipped Scenario
    if (answeredCount === 0) {
      const allExpected = [];
      evaluatedQuestions.forEach((eq) => {
        (eq.expectedConcepts || []).forEach((c) => {
          if (!allExpected.includes(c)) allExpected.push(c);
        });
      });

      return {
        overallScore: 0,
        isInsufficientData: true,
        status: 'skipped_all',
        category,
        categoryLabel: categoryMeta.label,
        categoryScores: {
          technicalAccuracy: 0,
          problemSolving: 0,
          communication: 0,
          completeness: 0,
          practicalKnowledge: 0,
          technicalCorrectness: 0,
          clarity: 0,
        },
        weights: EVALUATION_WEIGHTS,
        scoreCalculationExplanation: 'All questions were skipped by candidate. Score: 0/100.',
        strengths: [],
        keyStrengths: [],
        weaknesses: ['All interview questions were skipped. No technical or problem-solving capability was demonstrated.'],
        areasForImprovement: ['All interview questions were skipped. No technical or problem-solving capability was demonstrated.'],
        missedConcepts: allExpected.slice(0, 8),
        executiveSummary: 'Interview incomplete: All questions were skipped by the candidate. Insufficient data to evaluate interview readiness.',
        improvementPlan: [
          {
            title: 'Attempt Every Question',
            desc: 'In technical interviews, skipping awards 0 points. Providing even a partial attempt or brute-force approach allows evaluators to score problem-solving and communication.'
          },
          {
            title: `Review Core ${jobRole} Syllabus`,
            desc: 'Revise core concepts and practice under timed interview conditions to build response confidence.'
          }
        ],
        recommendations: ['Schedule a new mock interview session and attempt every question.'],
        questionEvaluations: evaluatedQuestions,
        answeredCount: 0,
        skippedCount: N,
        totalQuestions: N,
      };
    }

    // Step 4: Candidate Answered Questions - Call Gemini for synthesis
    const isPartial = answeredCount < Math.ceil(N / 2);

    const transcript = evaluatedQuestions.map((eq, i) => {
      return `[Question ${i + 1}]: "${eq.question}"
Status: ${eq.status}
Candidate Answer: "${eq.candidateAnswer}"
Score: ${eq.score}/100 (Tech: ${eq.categoryScores?.technicalAccuracy}%, ProblemSolving: ${eq.categoryScores?.problemSolving}%, Comm: ${eq.categoryScores?.communication}%)
Correctly Explained: ${JSON.stringify(eq.correctlyExplainedConcepts || [])}
Missed Concepts: ${JSON.stringify(eq.missingConcepts || [])}
Feedback: ${eq.explanation}`;
    }).join('\n\n');

    const synthesisPrompt = `You are the Lead Hiring Panel Reviewer at AVENIR AI.
Synthesize the final mock interview report for a candidate interviewing for "${jobRole}" (${difficulty} level).

CANDIDATE PERFORMANCE SUMMARY:
- Total Questions: ${N}
- Answered Questions: ${answeredCount}
- Skipped Questions: ${skippedCount}
- Verified Technical Accuracy: ${techAvg}%
- Verified Problem Solving: ${probAvg}%
- Verified Communication: ${commAvg}%
- Verified Completeness: ${compAvg}%
- Verified Practical Knowledge: ${practAvg}%
- Final Weighted Score: ${finalOverallScore}/100

DETAILED PER-QUESTION TRANSCRIPT:
"""
${transcript}
"""

CRITICAL SYNTHESIS RULES:
1. Synthesize an objective executive summary reflecting the candidate's actual answers.
2. Strengths: List 2-4 genuine strengths demonstrated in the answered questions. NEVER praise skipped or incorrect topics. If performance was poor, return only what was verified.
3. Weaknesses: List 2-4 specific areas for improvement, addressing errors, omissions, or skipped questions.
4. Missed Concepts: Extract 3-6 unique concepts the candidate missed or struggled with.
5. Improvement Plan: 3 actionable study topics with title and description tailored to the candidate's missed concepts.
6. Recommendations: 2 concrete next career steps.

Return ONLY a valid JSON object matching this schema:
{
  "executiveSummary": "...",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "missedConcepts": ["..."],
  "improvementPlan": [
    { "title": "Topic Title", "desc": "Concrete study guidance." }
  ],
  "recommendations": ["..."]
}
`;

    let synthesis = null;
    try {
      synthesis = await callGeminiWithRetry(synthesisPrompt);
    } catch (synthErr) {
      console.warn('[Gemini Service] Synthesis fallback:', synthErr.message);
      synthesis = {
        executiveSummary: `Candidate completed ${answeredCount} of ${N} questions for ${jobRole} with an overall weighted score of ${finalOverallScore}%.`,
        strengths: evaluatedQuestions.filter((q) => q.score >= 70).flatMap((q) => q.strengths).slice(0, 4),
        weaknesses: evaluatedQuestions.filter((q) => q.score < 60).flatMap((q) => q.weaknesses).slice(0, 4),
        missedConcepts: Array.from(new Set(evaluatedQuestions.flatMap((q) => q.missingConcepts || []))).slice(0, 6),
        improvementPlan: [
          { title: `Core ${jobRole} Fundamentals`, desc: 'Review key architecture patterns and practice problem solving under timed conditions.' }
        ],
        recommendations: ['Review questions with lower scores in the detailed accordion below.']
      };
    }

    // Contradiction guards
    let reportStrengths = Array.isArray(synthesis?.strengths) ? synthesis.strengths : [];
    let reportWeaknesses = Array.isArray(synthesis?.weaknesses) ? synthesis.weaknesses : [];

    if (finalOverallScore < 35 || techAvg < 25) {
      reportStrengths = reportStrengths.filter((s) => {
        const lower = s.toLowerCase();
        return !lower.includes('strong') && !lower.includes('deep') && !lower.includes('mastery') && !lower.includes('excellent');
      });
      if (finalOverallScore < 20) {
        reportStrengths = [];
      }
    }

    if (skippedCount > 0 && !reportWeaknesses.some((w) => w.toLowerCase().includes('skip'))) {
      reportWeaknesses.unshift(`Candidate skipped ${skippedCount} of ${N} questions, which significantly reduced the overall score.`);
    }

    return {
      overallScore: finalOverallScore,
      isInsufficientData: isPartial,
      status: 'completed',
      category,
      categoryLabel: categoryMeta.label,
      categoryScores,
      weights: EVALUATION_WEIGHTS,
      scoreCalculationExplanation: `Weighted calculation: (${techAvg} * 0.30) + (${probAvg} * 0.25) + (${commAvg} * 0.20) + (${compAvg} * 0.15) + (${practAvg} * 0.10) = ${finalOverallScore}/100.`,
      executiveSummary: synthesis?.executiveSummary || `Candidate completed ${answeredCount} of ${N} questions with a score of ${finalOverallScore}%.`,
      strengths: reportStrengths,
      keyStrengths: reportStrengths,
      weaknesses: reportWeaknesses,
      areasForImprovement: reportWeaknesses,
      missedConcepts: Array.isArray(synthesis?.missedConcepts) ? synthesis.missedConcepts : [],
      improvementPlan: Array.isArray(synthesis?.improvementPlan) ? synthesis.improvementPlan : [],
      recommendations: Array.isArray(synthesis?.recommendations) ? synthesis.recommendations : [],
      questionEvaluations: evaluatedQuestions,
      answeredCount,
      skippedCount,
      totalQuestions: N,
    };
  } catch (error) {
    console.error('[Gemini Service] generateInterviewReport Error:', error.message);
    throw error;
  }
};

module.exports = {
  EVALUATION_WEIGHTS,
  calculateWeightedScore,
  generateInterviewQuestions,
  evaluateInterviewAnswer,
  generateFollowUpQuestion,
  analyzeResume,
  generateLearningRoadmap,
  generateInterviewReport,
};
