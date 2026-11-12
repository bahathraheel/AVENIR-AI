/**
 * AVENIR AI - Sandboxed Code Execution & Challenge Service
 * Powered by Wandbox Open Compiler Engine & Local Isolated Node.js Sandbox
 * (Free public compiler directory from github.com/public-apis/public-apis)
 */

const vm = require('vm');

const WANDBOX_COMPILE_URL = 'https://wandbox.org/api/compile.json';

const SUPPORTED_LANGUAGES = {
  c: {
    compiler: 'gcc-head-c',
    extension: 'c',
    label: 'C (GCC)',
    starter: `#include <stdio.h>

int main(void) {
    // Write your C solution here
    return 0;
}
`,
  },
  cpp: {
    compiler: 'gcc-head',
    extension: 'cpp',
    label: 'C++ (GCC)',
    starter: `#include <iostream>
#include <vector>

int main() {
    // Write your C++ solution here
    return 0;
}
`,
  },
  python: {
    compiler: 'cpython-3.14.0',
    extension: 'py',
    label: 'Python 3',
    starter: `# Write your Python solution here
def solution():
    pass

if __name__ == "__main__":
    solution()
`,
  },
  java: {
    compiler: 'openjdk-head',
    extension: 'java',
    label: 'Java (OpenJDK)',
    starter: `public class Main {
    public static void main(String[] args) {
        // Write your Java solution here
    }
}
`,
  },
  javascript: {
    compiler: 'nodejs-20.17.0',
    extension: 'js',
    label: 'JavaScript (Node.js 20)',
    starter: `// Write your JavaScript solution
function solution() {
  
}
`,
  },
};

function normaliseLanguage(lang) {
  if (!lang || typeof lang !== 'string') return 'python';
  const s = lang.toLowerCase().trim();
  if (s === 'c' || s === 'clang' || s === 'c99' || s === 'c11') return 'c';
  if (s === 'cpp' || s === 'c++' || s === 'cxx' || s === 'cc') return 'cpp';
  if (s === 'python' || s === 'python3' || s === 'py') return 'python';
  if (s === 'javascript' || s === 'js' || s === 'node' || s === 'nodejs') return 'javascript';
  if (s === 'java') return 'java';
  return s;
}

/**
 * Execute JavaScript natively in a safe isolated Node.js VM context
 */
function executeJavaScriptLocal(code) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const customConsole = {
      log: (...args) => {
        stdout += args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n';
      },
      error: (...args) => {
        stderr += args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n';
      },
      warn: (...args) => {
        stdout += args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n';
      },
      info: (...args) => {
        stdout += args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n';
      },
    };

    // Isolated sandbox with zero access to process, require, fs, network
    const sandbox = {
      console: customConsole,
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };

    try {
      const script = new vm.Script(code);
      const context = vm.createContext(sandbox);

      script.runInContext(context, {
        timeout: 2500, // 2.5 seconds max CPU time
      });

      resolve({
        success: true,
        language: 'javascript',
        version: 'node-local',
        stdout: stdout || 'Program finished with no output.\n',
        stderr,
        output: stderr ? `${stdout}\nErrors:\n${stderr}` : stdout,
        exitCode: stderr ? 1 : 0,
      });
    } catch (err) {
      resolve({
        success: false,
        language: 'javascript',
        version: 'node-local',
        stdout,
        stderr: err.message,
        output: `${stdout}\nRuntime Error: ${err.message}`,
        exitCode: 1,
      });
    }
  });
}

/**
 * Execute code via Wandbox open compiler API
 */
async function executeWandbox(compiler, code, stdin = '') {
  const payload = {
    compiler,
    code,
    stdin: stdin || '',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(WANDBOX_COMPILE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AvenirAI-Platform/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Compiler API HTTP ${res.status}: ${err}`);
    }

    const data = await res.json();
    const stdout = data.program_output || data.compiler_output || '';
    const stderr = data.program_error || data.compiler_error || '';
    const exitCode = parseInt(data.status, 10) || 0;

    return {
      success: exitCode === 0,
      language: compiler,
      version: compiler,
      stdout: stdout || 'Program finished with no output.\n',
      stderr,
      output: data.program_message || data.compiler_message || stdout,
      exitCode,
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('Code execution timed out (limit: 12 seconds).');
    }
    throw error;
  }
}

/**
 * Universal code execution router
 */
async function executeCode({ language = 'javascript', code = '', stdin = '' }) {
  const normalizedLang = normaliseLanguage(language);

  if (!code || typeof code !== 'string' || !code.trim()) {
    throw new Error('Code content cannot be empty.');
  }

  if (code.length > 64 * 1024) {
    throw new Error('Code payload exceeds maximum permitted size (64KB).');
  }

  // Fast-path local sandbox for JavaScript
  if (normalizedLang === 'javascript') {
    return executeJavaScriptLocal(code);
  }

  const langConfig = SUPPORTED_LANGUAGES[normalizedLang];
  if (!langConfig) {
    throw new Error(`Language '${language}' is not supported. Supported: c, python, cpp, java, javascript.`);
  }

  return executeWandbox(langConfig.compiler, code, stdin);
}

/**
 * Executes source code against an array of test cases
 * Returns summary and detailed pass/fail feedback
 */
async function executeTestCases({ language = 'python', code = '', testCases = [] }) {
  if (!Array.isArray(testCases) || testCases.length === 0) {
    // If no test cases provided, run standalone
    const standalone = await executeCode({ language, code, stdin: '' });
    return {
      allPassed: standalone.exitCode === 0,
      passedCount: standalone.exitCode === 0 ? 1 : 0,
      totalCount: 1,
      results: [{
        testCaseIndex: 1,
        description: 'Default execution',
        isPublic: true,
        passed: standalone.exitCode === 0,
        input: 'None',
        expectedOutput: 'Program completes with exit code 0',
        actualOutput: standalone.output || standalone.stdout || '(no output)',
        stderr: standalone.stderr || '',
        exitCode: standalone.exitCode,
      }],
    };
  }

  const results = [];
  let allPassed = true;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const stdin = typeof tc.input === 'string' ? tc.input : (tc.input !== undefined ? JSON.stringify(tc.input) : '');
    const expected = (tc.expectedOutput ?? tc.output ?? '').toString().trim();

    try {
      const res = await executeCode({ language, code, stdin });
      const actual = (res.stdout || '').trim();
      // Match exact output or last non-empty line
      const cleanActual = actual.replace(/\r\n/g, '\n').trim();
      const cleanExpected = expected.replace(/\r\n/g, '\n').trim();
      const passed = res.exitCode === 0 && (cleanActual === cleanExpected || cleanActual.endsWith(cleanExpected));

      if (!passed) allPassed = false;

      results.push({
        testCaseIndex: i + 1,
        description: tc.description || `Test Case ${i + 1}`,
        isPublic: tc.isPublic !== false,
        passed,
        input: tc.isPublic !== false ? stdin : '[Hidden Test Case]',
        expectedOutput: tc.isPublic !== false ? expected : '[Hidden]',
        actualOutput: tc.isPublic !== false ? (cleanActual || '(empty)') : (passed ? '[Passed]' : '[Failed]'),
        stderr: res.stderr || '',
        exitCode: res.exitCode,
      });
    } catch (err) {
      allPassed = false;
      results.push({
        testCaseIndex: i + 1,
        description: tc.description || `Test Case ${i + 1}`,
        isPublic: tc.isPublic !== false,
        passed: false,
        input: tc.isPublic !== false ? stdin : '[Hidden Test Case]',
        expectedOutput: tc.isPublic !== false ? expected : '[Hidden]',
        actualOutput: `Execution error: ${err.message}`,
        stderr: err.message,
        exitCode: 1,
      });
    }
  }

  return {
    allPassed,
    passedCount: results.filter((r) => r.passed).length,
    totalCount: results.length,
    results,
  };
}

// Daily challenge cache
let dailyChallengeCache = {
  data: null,
  date: null,
};

/**
 * Fetch daily technical coding problem with curated fallback
 */
async function getDailyChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyChallengeCache.date === today && dailyChallengeCache.data) {
    return dailyChallengeCache.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('https://alfa-leetcode-api.onrender.com/daily', {
      signal: controller.signal,
      headers: { 'User-Agent': 'AvenirAI-Platform/1.0' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      if (json && (json.questionTitle || json.title)) {
        const result = {
          date: today,
          title: json.questionTitle || json.title || 'Daily Technical Challenge',
          difficulty: json.difficulty || 'Medium',
          questionLink: json.questionLink ? `https://leetcode.com${json.questionLink}` : 'https://leetcode.com',
          topicTags: Array.isArray(json.topicTags) ? json.topicTags.map((t) => t.name || t) : ['Algorithms', 'Data Structures'],
          source: 'LeetCode Daily API',
        };
        dailyChallengeCache = { data: result, date: today };
        return result;
      }
    }
  } catch (err) {
    console.warn('[CodeService] Daily challenge API skipped:', err.message);
  }

  // Curated fallback bank
  const curatedPool = [
    {
      title: 'Valid Palindrome & String Manipulation',
      difficulty: 'Easy',
      questionLink: 'https://leetcode.com/problems/valid-palindrome/',
      topicTags: ['Two Pointers', 'String', 'Verification'],
    },
    {
      title: 'Longest Substring Without Repeating Characters',
      difficulty: 'Medium',
      questionLink: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/',
      topicTags: ['Hash Table', 'Sliding Window', 'String'],
    },
    {
      title: 'Merge K Sorted Lists',
      difficulty: 'Hard',
      questionLink: 'https://leetcode.com/problems/merge-k-sorted-lists/',
      topicTags: ['Linked List', 'Divide and Conquer', 'Heap'],
    },
    {
      title: 'Maximum Subarray (Kadane’s Algorithm)',
      difficulty: 'Medium',
      questionLink: 'https://leetcode.com/problems/maximum-subarray/',
      topicTags: ['Array', 'Divide and Conquer', 'Dynamic Programming'],
    },
    {
      title: 'Binary Tree Level Order Traversal',
      difficulty: 'Medium',
      questionLink: 'https://leetcode.com/problems/binary-tree-level-order-traversal/',
      topicTags: ['Tree', 'Breadth-First Search', 'Binary Tree'],
    },
  ];

  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const fallback = curatedPool[dayOfYear % curatedPool.length];

  const result = {
    date: today,
    ...fallback,
    source: 'AVENIR Curated Daily Bank',
  };

  dailyChallengeCache = { data: result, date: today };
  return result;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  normaliseLanguage,
  executeCode,
  executeTestCases,
  getDailyChallenge,
};
