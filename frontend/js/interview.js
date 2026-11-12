/**
 * AVENIR AI - Live Mock Interview Room Module
 * Manages category-specific interview workflows: Coding (Wandbox compilation + test cases),
 * HR, Technical, Behavioral (STAR framework), and Domain-Specific interviews.
 */

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  initInterviewSession();
});

function initInterviewSession() {
  // 1. Retrieve session data from sessionStorage
  const rawSessionData = sessionStorage.getItem('avenir_interview_data');
  if (!rawSessionData) {
    console.warn('No active interview session found in sessionStorage. Redirecting to setup.');
    window.location.replace('interview-setup.html');
    return;
  }

  let session;
  try {
    session = JSON.parse(rawSessionData);
  } catch (e) {
    console.error('Failed to parse interview session data:', e);
    window.location.replace('interview-setup.html');
    return;
  }

  const interviewId = session.interviewId;
  const questions = session.questions || [];
  const config = session.config || {};

  if (!interviewId || questions.length === 0) {
    if (typeof showToast === 'function') {
      showToast('Interview session data is invalid. Please configure a new session.', 'error');
    }
    setTimeout(() => {
      window.location.replace('interview-setup.html');
    }, 1500);
    return;
  }

  // Determine normalized interview category
  const rawType = (config.interviewType || 'technical').toLowerCase();
  let normalizedCategory = 'technical';
  if (rawType.includes('code') || rawType.includes('coding')) {
    normalizedCategory = 'coding';
  } else if (rawType.includes('hr') || rawType.includes('human') || rawType.includes('culture') || rawType.includes('fit')) {
    normalizedCategory = 'hr';
  } else if (rawType.includes('behav') || rawType.includes('star') || rawType.includes('situa')) {
    normalizedCategory = 'behavioral';
  } else if (rawType.includes('domain') || rawType.includes('industry')) {
    normalizedCategory = 'domain-specific';
  } else {
    normalizedCategory = 'technical';
  }

  // Interview Room State
  const state = {
    interviewId,
    questions,
    config,
    category: normalizedCategory,
    currentQuestionIndex: 0,
    answers: {},
    evaluations: {},
    currentTestResults: [],
    isSubmitting: false,
    timerInterval: null,
    timeLeft: config.timerDuration || 180,
    recognition: null,
    isRecording: false,
    sessionStartTime: Date.now()
  };

  // DOM Elements - Headers & Progress
  const roomRoleBadge = document.getElementById('roomRoleBadge');
  const roomCategoryBadge = document.getElementById('roomCategoryBadge');
  const roomDifficultyBadge = document.getElementById('roomDifficultyBadge');
  const interviewTimer = document.getElementById('interviewTimer');
  const timeRemainingEl = document.getElementById('timeRemaining');
  const currentQEl = document.getElementById('currentQ');
  const totalQEl = document.getElementById('totalQ');
  const progressPercentText = document.getElementById('progressPercentText');
  const progressBar = document.getElementById('interviewProgressBar');
  const questionBadge = document.getElementById('questionBadge');
  const questionCategoryTag = document.getElementById('questionCategoryTag');

  // Standard Question Card Elements
  const standardQuestionBody = document.getElementById('standardQuestionBody');
  const questionTextEl = document.getElementById('questionText');
  const starFrameworkCard = document.getElementById('starFrameworkCard');
  const technicalConceptsBox = document.getElementById('technicalConceptsBox');
  const technicalConceptsList = document.getElementById('technicalConceptsList');

  // Coding Question Card Elements
  const codingQuestionBody = document.getElementById('codingQuestionBody');
  const codingTitle = document.getElementById('codingTitle');
  const codingDifficultyBadge = document.getElementById('codingDifficultyBadge');
  const codingCategoryTag = document.getElementById('codingCategoryTag');
  const codingDescription = document.getElementById('codingDescription');
  const codingInputFormat = document.getElementById('codingInputFormat');
  const codingOutputFormat = document.getElementById('codingOutputFormat');
  const codingExamplesList = document.getElementById('codingExamplesList');
  const codingConstraintsBox = document.getElementById('codingConstraintsBox');
  const codingConstraintsList = document.getElementById('codingConstraintsList');

  // Workspaces
  const answerSection = document.getElementById('answerSection');
  const codingWorkspaceContainer = document.getElementById('codingWorkspaceContainer');
  const conversationalWorkspaceContainer = document.getElementById('conversationalWorkspaceContainer');

  // Coding Workspace Controls
  const codingLanguageSelect = document.getElementById('codingLanguageSelect');
  const resetStarterCodeBtn = document.getElementById('resetStarterCodeBtn');
  const runTestCasesBtn = document.getElementById('runTestCasesBtn');
  const runTestCasesBtnText = document.getElementById('runTestCasesBtnText');
  const runTestCasesSpinner = document.getElementById('runTestCasesSpinner');
  const submitCodingSolutionBtn = document.getElementById('submitCodingSolutionBtn');
  const submitCodingSpinner = document.getElementById('submitCodingSpinner');
  const codingCodeEditor = document.getElementById('codingCodeEditor');
  const tabTestCasesBtn = document.getElementById('tabTestCasesBtn');
  const tabRawConsoleBtn = document.getElementById('tabRawConsoleBtn');
  const testCasesTabContent = document.getElementById('testCasesTabContent');
  const rawConsoleTabContent = document.getElementById('rawConsoleTabContent');
  const testCasesList = document.getElementById('testCasesList');
  const testCasesSummaryPill = document.getElementById('testCasesSummaryPill');
  const testExecutionTime = document.getElementById('testExecutionTime');
  const codingRawConsole = document.getElementById('codingRawConsole');

  // Conversational Workspace Controls
  const answerInput = document.getElementById('answerInput');
  const wordCounter = document.getElementById('wordCounter');
  const voiceControls = document.getElementById('voiceControls');
  const voiceToggleBtn = document.getElementById('voiceToggleBtn');
  const voiceLabel = document.getElementById('voiceLabel');
  const micIcon = document.getElementById('micIcon');
  const toggleCodeSandboxBtn = document.getElementById('toggleCodeSandboxBtn');
  const skipQuestionBtn = document.getElementById('skipQuestionBtn');
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  const submitSpinner = document.getElementById('submitSpinner');

  // Evaluation Card Elements
  const evaluationCard = document.getElementById('evaluationCard');
  const evalMetricsGroup = document.getElementById('evalMetricsGroup');
  const evalCodingAnalysisBox = document.getElementById('evalCodingAnalysisBox');
  const evalTimeComplexity = document.getElementById('evalTimeComplexity');
  const evalSpaceComplexity = document.getElementById('evalSpaceComplexity');
  const toggleModelSolutionBtn = document.getElementById('toggleModelSolutionBtn');
  const modelSolutionDrawer = document.getElementById('modelSolutionDrawer');
  const modelSolutionCode = document.getElementById('modelSolutionCode');
  const nextQuestionBtn = document.getElementById('nextQuestionBtn');
  const endInterviewBtn = document.getElementById('endInterviewBtn');
  const endConfirmModal = document.getElementById('endConfirmModal');
  const cancelEndBtn = document.getElementById('cancelEndBtn');
  const confirmEndBtn = document.getElementById('confirmEndBtn');

  // Starter code templates per language
  const starterCodeTemplates = {
    c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    // Read input from standard input (stdin)
    // Write output to standard output (stdout)
    
    return 0;
}
`,
    cpp: `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    // Read input from cin, print to cout
    
    return 0;
}
`,
    python: `import sys

def solve():
    # Read input from standard input
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    # Process solution
    
if __name__ == "__main__":
    solve()
`,
    java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws Exception {
        Scanner scanner = new Scanner(System.in);
        // Solution logic
        
    }
}
`,
    javascript: `const fs = require('fs');

function solve() {
    const input = fs.readFileSync('/dev/stdin', 'utf-8').trim();
    // Solution logic
}

solve();
`
  };

  // Set initial header badges
  if (roomRoleBadge) roomRoleBadge.textContent = config.jobRole || 'Software Developer';
  if (roomCategoryBadge) {
    const categoryLabels = {
      coding: 'Coding Interview',
      hr: 'HR Interview',
      behavioral: 'Behavioral Interview',
      'domain-specific': 'Domain-Specific Interview',
      technical: 'Technical Interview'
    };
    roomCategoryBadge.textContent = categoryLabels[state.category] || config.interviewType || 'Technical';
  }
  if (roomDifficultyBadge) roomDifficultyBadge.textContent = config.difficulty || 'Medium';
  if (totalQEl) totalQEl.textContent = questions.length;

  if (!config.timerEnabled && interviewTimer) {
    interviewTimer.style.display = 'none';
  }

  // Setup Web Speech Recognition
  setupSpeechRecognition();

  // Setup Optional Snippet for Technical interviews
  setupTechnicalSnippet();

  // Navigation Guard during active interview
  const beforeUnloadHandler = (e) => {
    e.preventDefault();
    e.returnValue = 'You have an active interview session in progress. Are you sure you want to leave?';
    return e.returnValue;
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  /**
   * Determine preferred coding language
   */
  function determineDefaultLanguage(qObj) {
    const roleLower = (config.jobRole || '').toLowerCase();
    const qLower = typeof qObj === 'string' ? qObj.toLowerCase() : (qObj.question || qObj.title || '').toLowerCase();

    if (qObj && qObj.preferredLanguage) return qObj.preferredLanguage.toLowerCase();
    if (roleLower.includes('embedded') || roleLower.includes('c developer') || roleLower.includes('c programmer') || qLower.includes('in c ') || qLower.includes('using c')) {
      return 'c';
    }
    if (roleLower.includes('c++') || qLower.includes('c++')) return 'cpp';
    if (roleLower.includes('python') || qLower.includes('python')) return 'python';
    if (roleLower.includes('java ') || roleLower.includes('java developer') || qLower.includes('java')) return 'java';
    if (roleLower.includes('frontend') || roleLower.includes('javascript') || roleLower.includes('react')) return 'javascript';
    return 'c'; // Default to C as requested for rigorous systems/coding tracks
  }

  /**
   * Display Question by Index
   */
  function displayQuestion(index) {
    if (index < 0 || index >= questions.length) return;
    state.currentQuestionIndex = index;
    state.currentTestResults = [];

    const currentQuestionObj = questions[index];
    const isCoding = state.category === 'coding' || (currentQuestionObj && currentQuestionObj.testCases && currentQuestionObj.testCases.length > 0);

    // Update Progress Bar
    if (currentQEl) currentQEl.textContent = index + 1;
    const progressPercent = Math.round(((index) / questions.length) * 100);
    if (progressPercentText) progressPercentText.textContent = `${progressPercent}%`;
    if (progressBar) progressBar.style.width = `${progressPercent}%`;

    // Update Category Tags
    if (questionBadge) questionBadge.textContent = `Question ${index + 1}`;
    if (questionCategoryTag) {
      questionCategoryTag.textContent = isCoding ? 'Coding Challenge' : (currentQuestionObj.category || config.interviewType || 'Interview Question');
    }

    // Toggle Workspace Displays
    if (isCoding) {
      renderCodingQuestion(currentQuestionObj);
    } else {
      renderConversationalQuestion(currentQuestionObj);
    }

    // Hide Evaluation & Reveal Answer Section
    hideEvaluation();

    // Reset and Start Timer
    if (config.timerEnabled) {
      startTimer(config.timerDuration || (isCoding ? 600 : 180));
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  /**
   * Render Dedicated Coding Question Experience
   */
  function renderCodingQuestion(qObj) {
    // Switch Question Body
    if (standardQuestionBody) standardQuestionBody.classList.add('hidden');
    if (codingQuestionBody) codingQuestionBody.classList.remove('hidden');

    // Switch Workspaces
    if (conversationalWorkspaceContainer) conversationalWorkspaceContainer.style.display = 'none';
    if (codingWorkspaceContainer) codingWorkspaceContainer.style.display = 'flex';

    // Populate Problem Title & Metadata
    const title = qObj.title || (typeof qObj === 'string' ? qObj.slice(0, 60) : qObj.question?.slice(0, 60)) || 'Algorithm Challenge';
    if (codingTitle) codingTitle.textContent = title;

    if (codingDifficultyBadge) {
      const diff = (qObj.difficulty || config.difficulty || 'medium').toLowerCase();
      codingDifficultyBadge.className = `difficulty-pill ${diff}`;
      codingDifficultyBadge.textContent = diff.toUpperCase();
    }

    // Populate Description
    const description = qObj.description || qObj.question || 'Solve the problem according to the specifications.';
    if (codingDescription) codingDescription.textContent = description;

    // Populate I/O Format
    if (codingInputFormat) codingInputFormat.textContent = qObj.inputFormat || 'Read inputs from standard input (stdin).';
    if (codingOutputFormat) codingOutputFormat.textContent = qObj.outputFormat || 'Print answer to standard output (stdout).';

    // Populate Examples
    if (codingExamplesList) {
      codingExamplesList.innerHTML = '';
      const examples = qObj.examples || [];
      if (examples.length === 0 && qObj.testCases && qObj.testCases.length > 0) {
        // Use first test case as example
        examples.push({
          input: qObj.testCases[0].input,
          output: qObj.testCases[0].expectedOutput,
          explanation: 'Sample test case.'
        });
      }

      examples.forEach((ex, idx) => {
        const box = document.createElement('div');
        box.className = 'example-box';
        box.innerHTML = `
          <div class="example-box-title">Example ${idx + 1}</div>
          <div class="example-row"><span class="example-lbl">Input:</span> <span class="example-code">${escapeHtml(ex.input || '(empty)')}</span></div>
          <div class="example-row"><span class="example-lbl">Output:</span> <span class="example-code">${escapeHtml(ex.output || ex.expectedOutput || '')}</span></div>
          ${ex.explanation ? `<div class="example-explanation">${escapeHtml(ex.explanation)}</div>` : ''}
        `;
        codingExamplesList.appendChild(box);
      });
    }

    // Populate Constraints
    if (codingConstraintsList) {
      codingConstraintsList.innerHTML = '';
      const constraints = qObj.constraints || ['Standard algorithm execution time limit: 5.0 seconds.', 'Memory limit: 256MB.'];
      constraints.forEach((c) => {
        const span = document.createElement('span');
        span.className = 'constraint-badge';
        span.textContent = c;
        codingConstraintsList.appendChild(span);
      });
    }

    // Determine Language and Load Starter Code
    const defaultLang = determineDefaultLanguage(qObj);
    if (codingLanguageSelect) {
      codingLanguageSelect.value = defaultLang;
    }

    loadStarterCodeForLanguage(defaultLang, qObj);

    // Reset Test Cases Panel
    resetTestCasesPanel(qObj);
  }

  function loadStarterCodeForLanguage(lang, qObj) {
    if (!codingCodeEditor) return;
    const currentQ = qObj || questions[state.currentQuestionIndex];
    if (currentQ && currentQ.starterCode && typeof currentQ.starterCode === 'object' && currentQ.starterCode[lang]) {
      codingCodeEditor.value = currentQ.starterCode[lang];
    } else if (currentQ && typeof currentQ.starterCode === 'string' && lang === 'c') {
      codingCodeEditor.value = currentQ.starterCode;
    } else if (starterCodeTemplates[lang]) {
      codingCodeEditor.value = starterCodeTemplates[lang];
    } else {
      codingCodeEditor.value = `// Write your ${lang} solution here...\n`;
    }
  }

  function resetTestCasesPanel(qObj) {
    if (testCasesList) {
      const testCases = (qObj && qObj.testCases) || [];
      if (testCases.length > 0) {
        testCasesList.innerHTML = testCases.map((tc, idx) => `
          <div class="testcase-card" id="testcaseCard_${idx}">
            <div class="testcase-card-header">
              <strong>Test Case #${idx + 1}</strong>
              <span class="testcase-status-badge">Ready</span>
            </div>
            <div class="testcase-details-grid">
              <div class="testcase-col">
                <span class="testcase-col-lbl">Input</span>
                <span class="testcase-col-val">${escapeHtml(tc.input || '(empty)')}</span>
              </div>
              <div class="testcase-col">
                <span class="testcase-col-lbl">Expected Output</span>
                <span class="testcase-col-val">${escapeHtml(tc.expectedOutput || '')}</span>
              </div>
              <div class="testcase-col">
                <span class="testcase-col-lbl">Your Output</span>
                <span class="testcase-col-val" id="testcaseActual_${idx}">—</span>
              </div>
            </div>
          </div>
        `).join('');
      } else {
        testCasesList.innerHTML = '<div class="testcase-placeholder-hint">Click &ldquo;Run & Test Cases&rdquo; to execute your solution against test cases.</div>';
      }
    }

    if (testCasesSummaryPill) {
      const total = (qObj && qObj.testCases && qObj.testCases.length) || 0;
      testCasesSummaryPill.className = 'test-summary-pill';
      testCasesSummaryPill.textContent = `0/${total} Passed`;
    }

    if (testExecutionTime) testExecutionTime.textContent = '';
    if (codingRawConsole) codingRawConsole.textContent = 'Ready. Click "Run & Test Cases" to execute in Wandbox sandbox.';
  }

  /**
   * Render Conversational Question (HR, Technical, Behavioral, Domain)
   */
  function renderConversationalQuestion(qObj) {
    // Switch Question Body
    if (codingQuestionBody) codingQuestionBody.classList.add('hidden');
    if (standardQuestionBody) standardQuestionBody.classList.remove('hidden');

    // Switch Workspaces
    if (codingWorkspaceContainer) codingWorkspaceContainer.style.display = 'none';
    if (conversationalWorkspaceContainer) conversationalWorkspaceContainer.style.display = 'block';

    const questionText = typeof qObj === 'string' ? qObj : (qObj.question || 'Interview Question');
    if (questionTextEl) questionTextEl.textContent = questionText;

    // Reset Answer Input
    if (answerInput) {
      answerInput.value = '';
      answerInput.disabled = false;
      answerInput.focus();
    }
    if (wordCounter) wordCounter.textContent = '0 words';

    // Behavioral STAR Framework Card
    if (starFrameworkCard) {
      if (state.category === 'behavioral') {
        starFrameworkCard.classList.remove('hidden');
      } else {
        starFrameworkCard.classList.add('hidden');
      }
    }

    // Technical Concepts / Domain Chips
    if (technicalConceptsBox) {
      const concepts = qObj.keyConcepts || qObj.concepts || [];
      if ((state.category === 'technical' || state.category === 'domain-specific') && concepts.length > 0) {
        technicalConceptsBox.classList.remove('hidden');
        if (technicalConceptsList) {
          technicalConceptsList.innerHTML = concepts.map(c => `<span class="concept-chip">${escapeHtml(c)}</span>`).join('');
        }
      } else {
        technicalConceptsBox.classList.add('hidden');
      }
    }

    // Technical Snippet Toggle button (only for Technical interviews)
    if (toggleCodeSandboxBtn) {
      if (state.category === 'technical') {
        toggleCodeSandboxBtn.classList.remove('hidden');
      } else {
        toggleCodeSandboxBtn.classList.add('hidden');
      }
    }
  }

  /**
   * Coding Workspace Event Listeners
   */
  if (codingLanguageSelect) {
    codingLanguageSelect.addEventListener('change', () => {
      const newLang = codingLanguageSelect.value;
      const qObj = questions[state.currentQuestionIndex];
      const confirmChange = confirm(`Switch editor to ${newLang.toUpperCase()}? Unsaved edits in the current language will be replaced with the starter template.`);
      if (confirmChange) {
        loadStarterCodeForLanguage(newLang, qObj);
      }
    });
  }

  if (resetStarterCodeBtn) {
    resetStarterCodeBtn.addEventListener('click', () => {
      const lang = codingLanguageSelect ? codingLanguageSelect.value : 'c';
      const qObj = questions[state.currentQuestionIndex];
      const confirmReset = confirm('Reset editor to the initial starter template? Your current edits will be cleared.');
      if (confirmReset) {
        loadStarterCodeForLanguage(lang, qObj);
      }
    });
  }

  // Tab switching in Coding Test Panel
  if (tabTestCasesBtn && tabRawConsoleBtn) {
    tabTestCasesBtn.addEventListener('click', () => {
      tabTestCasesBtn.classList.add('active');
      tabRawConsoleBtn.classList.remove('active');
      testCasesTabContent.classList.remove('hidden');
      rawConsoleTabContent.classList.add('hidden');
    });

    tabRawConsoleBtn.addEventListener('click', () => {
      tabRawConsoleBtn.classList.add('active');
      tabTestCasesBtn.classList.remove('active');
      rawConsoleTabContent.classList.remove('hidden');
      testCasesTabContent.classList.add('hidden');
    });
  }

  // Run & Test Cases Action (Wandbox Execution)
  if (runTestCasesBtn) {
    runTestCasesBtn.addEventListener('click', async () => {
      const code = codingCodeEditor ? codingCodeEditor.value.trim() : '';
      const lang = codingLanguageSelect ? codingLanguageSelect.value : 'c';
      const qObj = questions[state.currentQuestionIndex];
      const testCases = (qObj && qObj.testCases) || [];

      if (!code) {
        if (typeof showToast === 'function') {
          showToast('Please write code before running test cases.', 'warning');
        }
        return;
      }

      runTestCasesBtn.disabled = true;
      if (runTestCasesSpinner) runTestCasesSpinner.classList.remove('hidden');
      if (runTestCasesBtnText) runTestCasesBtnText.textContent = 'Compiling & Running...';

      if (codingRawConsole) {
        codingRawConsole.textContent = `[Wandbox Runner] Compiling ${lang.toUpperCase()} solution...\nTesting against ${testCases.length} problem test cases...`;
      }

      try {
        const startTime = Date.now();
        const testRes = await testCode(lang, code, testCases);
        const elapsedMs = Date.now() - startTime;

        if (testExecutionTime) {
          testExecutionTime.textContent = `Completed in ${elapsedMs}ms`;
        }

        if (testRes && testRes.success) {
          const results = testRes.results || [];
          state.currentTestResults = results;

          let passedCount = 0;
          results.forEach((r, idx) => {
            if (r.passed) passedCount++;
            const card = document.getElementById(`testcaseCard_${idx}`);
            const actualVal = document.getElementById(`testcaseActual_${idx}`);

            if (card) {
              card.className = `testcase-card ${r.passed ? 'pass' : 'fail'}`;
              const badge = card.querySelector('.testcase-status-badge');
              if (badge) {
                badge.className = `testcase-status-badge ${r.passed ? 'pass' : 'fail'}`;
                badge.textContent = r.passed ? 'Passed' : 'Failed';
              }
            }
            if (actualVal) {
              actualVal.textContent = r.actualOutput || (r.status === 'error' ? (r.stderr || 'Execution Error') : '(empty)');
            }
          });

          // Summary pill
          if (testCasesSummaryPill) {
            testCasesSummaryPill.textContent = `${passedCount}/${results.length} Passed`;
            testCasesSummaryPill.className = `test-summary-pill ${passedCount === results.length ? 'passed-all' : 'failed-any'}`;
          }

          if (codingRawConsole) {
            const rawLog = results.map(r => `--- Test Case ${r.caseIndex} [${r.passed ? 'PASS' : 'FAIL'}] ---\nInput: ${r.input}\nExpected: ${r.expectedOutput}\nActual: ${r.actualOutput || ''}\n${r.stderr ? `Errors: ${r.stderr}\n` : ''}`).join('\n');
            codingRawConsole.textContent = rawLog;
          }

          if (typeof showToast === 'function') {
            if (passedCount === results.length) {
              showToast(`All ${results.length} test cases passed! Great job!`, 'success');
            } else {
              showToast(`${passedCount}/${results.length} test cases passed. Review failures and refine code.`, 'warning');
            }
          }
        } else {
          const errDetail = testRes.error || testRes.compileError || 'Compilation or runtime failed.';
          if (codingRawConsole) {
            codingRawConsole.textContent = `[Execution Failure]:\n${errDetail}`;
          }
          if (tabRawConsoleBtn) tabRawConsoleBtn.click();
          if (typeof showToast === 'function') {
            showToast('Code execution failed. See console tab for compiler errors.', 'error');
          }
        }
      } catch (err) {
        console.error('Test execution error:', err);
        if (codingRawConsole) {
          codingRawConsole.textContent = `[Error]: ${err.message}`;
        }
        if (typeof showToast === 'function') {
          showToast('Execution error: ' + err.message, 'error');
        }
      } finally {
        runTestCasesBtn.disabled = false;
        if (runTestCasesSpinner) runTestCasesSpinner.classList.add('hidden');
        if (runTestCasesBtnText) runTestCasesBtnText.textContent = 'Run & Test Cases';
      }
    });
  }

  // Submit Coding Solution
  if (submitCodingSolutionBtn) {
    submitCodingSolutionBtn.addEventListener('click', async () => {
      const code = codingCodeEditor ? codingCodeEditor.value.trim() : '';
      const lang = codingLanguageSelect ? codingLanguageSelect.value : 'c';

      if (!code) {
        if (typeof showToast === 'function') {
          showToast('Editor is empty. Write your solution before submitting.', 'warning');
        }
        return;
      }

      const qObj = questions[state.currentQuestionIndex];
      const hasRunTests = state.currentTestResults && state.currentTestResults.length > 0;
      if (!hasRunTests) {
        const proceedWithoutRun = confirm('You have not run the test cases yet. Would you like to submit your code directly for AI evaluation?');
        if (!proceedWithoutRun) return;
      }

      state.isSubmitting = true;
      clearInterval(state.timerInterval);

      submitCodingSolutionBtn.disabled = true;
      if (submitCodingSpinner) submitCodingSpinner.classList.remove('hidden');

      const qText = qObj.title || (typeof qObj === 'string' ? qObj : (qObj.question || 'Coding Problem'));

      try {
        const evalPayload = {
          interviewId: state.interviewId,
          questionIndex: state.currentQuestionIndex,
          question: qText,
          answer: code,
          sourceCode: code,
          programmingLanguage: lang,
          testResults: state.currentTestResults || [],
          jobRole: config.jobRole || 'Software Developer',
          interviewType: 'Coding',
          difficulty: config.difficulty || 'Medium'
        };

        const evalResult = await evaluateAnswer(evalPayload);
        const evaluation = evalResult.evaluation || evalResult;

        state.answers[state.currentQuestionIndex] = {
          code,
          language: lang,
          testResults: state.currentTestResults || []
        };
        state.evaluations[state.currentQuestionIndex] = evaluation;

        showEvaluation(evaluation);
      } catch (err) {
        console.error('Coding evaluation error:', err);
        if (typeof showToast === 'function') {
          showToast('Evaluation error: ' + err.message, 'error');
        } else {
          alert('Evaluation failed: ' + err.message);
        }
      } finally {
        state.isSubmitting = false;
        submitCodingSolutionBtn.disabled = false;
        if (submitCodingSpinner) submitCodingSpinner.classList.add('hidden');
      }
    });
  }

  /**
   * Conversational Word Counter & Dictation
   */
  if (answerInput && wordCounter) {
    answerInput.addEventListener('input', () => {
      const words = answerInput.value.trim().split(/\s+/).filter(w => w.length > 0);
      wordCounter.textContent = `${words.length} word${words.length === 1 ? '' : 's'}`;
    });
  }

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (voiceControls) voiceControls.style.display = 'none';
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        state.isRecording = true;
        if (voiceToggleBtn) voiceToggleBtn.classList.add('recording');
        if (voiceLabel) voiceLabel.textContent = 'Listening... Click to pause';
        if (micIcon) micIcon.style.color = '#EF4444';
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        if (answerInput) {
          const currentVal = answerInput.value;
          const separator = currentVal && !currentVal.endsWith(' ') ? ' ' : '';
          answerInput.value = currentVal + separator + transcript;
          const words = answerInput.value.trim().split(/\s+/).filter(w => w.length > 0);
          if (wordCounter) wordCounter.textContent = `${words.length} word${words.length === 1 ? '' : 's'}`;
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        stopRecording();
      };

      recognition.onend = () => {
        stopRecording();
      };

      state.recognition = recognition;

      if (voiceToggleBtn) {
        voiceToggleBtn.addEventListener('click', () => {
          if (state.isRecording) {
            recognition.stop();
          } else {
            try {
              recognition.start();
            } catch (err) {
              console.error('Recognition start error:', err);
            }
          }
        });
      }
    } catch (err) {
      console.warn('Speech recognition setup failed:', err);
      if (voiceControls) voiceControls.style.display = 'none';
    }
  }

  function stopRecording() {
    state.isRecording = false;
    if (voiceToggleBtn) voiceToggleBtn.classList.remove('recording');
    if (voiceLabel) voiceLabel.textContent = 'Click to speak';
    if (micIcon) micIcon.style.color = 'inherit';
  }

  /**
   * Technical Snippet Drawer (for Technical Interviews)
   */
  function setupTechnicalSnippet() {
    const toggleBtn = document.getElementById('toggleCodeSandboxBtn');
    const panel = document.getElementById('codeSandboxPanel');
    const btnText = document.getElementById('codeSandboxBtnText');
    const langSelect = document.getElementById('sandboxLangSelect');
    const codeInput = document.getElementById('sandboxCodeInput');
    const runBtn = document.getElementById('runSandboxCodeBtn');
    const attachBtn = document.getElementById('attachCodeToAnswerBtn');
    const consoleOutput = document.getElementById('sandboxConsoleOutput');
    const clearBtn = document.getElementById('clearSandboxConsoleBtn');

    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener('click', () => {
      const isHidden = panel.classList.contains('hidden');
      if (isHidden) {
        panel.classList.remove('hidden');
        if (btnText) btnText.textContent = 'Hide Snippet';
      } else {
        panel.classList.add('hidden');
        if (btnText) btnText.textContent = 'Code Snippet';
      }
      if (window.lucide) window.lucide.createIcons();
    });

    if (clearBtn && consoleOutput) {
      clearBtn.addEventListener('click', () => {
        consoleOutput.textContent = 'Console cleared.';
      });
    }

    if (runBtn && codeInput && consoleOutput) {
      runBtn.addEventListener('click', async () => {
        const code = codeInput.value;
        const lang = langSelect ? langSelect.value : 'javascript';
        if (!code.trim()) return;

        runBtn.disabled = true;
        consoleOutput.textContent = 'Running snippet in Wandbox...';
        try {
          const res = await executeCode(lang, code);
          if (res && res.success) {
            consoleOutput.textContent = res.output || res.stdout || 'Program completed with no output.';
          } else {
            consoleOutput.textContent = res.error || res.stderr || 'Execution failed.';
          }
        } catch (err) {
          consoleOutput.textContent = 'Execution error: ' + err.message;
        } finally {
          runBtn.disabled = false;
        }
      });
    }

    if (attachBtn && codeInput && answerInput) {
      attachBtn.addEventListener('click', () => {
        const code = codeInput.value.trim();
        const lang = langSelect ? langSelect.value : 'code';
        if (!code) return;
        const formatted = `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
        answerInput.value = (answerInput.value || '') + formatted;
        answerInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof showToast === 'function') {
          showToast('Code snippet attached to your response!', 'success');
        }
      });
    }
  }

  /**
   * Conversational Submit Answer Handler
   */
  async function submitCurrentAnswer(isAutoSubmit = false) {
    if (state.isSubmitting) return;

    if (state.recognition && state.isRecording) {
      state.recognition.stop();
    }

    const answerText = answerInput ? answerInput.value.trim() : '';

    if (!isAutoSubmit && !answerText) {
      const confirmEmpty = confirm('Your answer is currently empty. Would you like to submit an empty answer?');
      if (!confirmEmpty) {
        answerInput?.focus();
        return;
      }
    }

    state.isSubmitting = true;
    clearInterval(state.timerInterval);

    if (submitAnswerBtn) {
      submitAnswerBtn.disabled = true;
      if (submitSpinner) submitSpinner.classList.remove('hidden');
    }

    const currentQObj = questions[state.currentQuestionIndex];
    const qText = typeof currentQObj === 'string' ? currentQObj : (currentQObj.question || 'Interview Question');

    try {
      const evalPayload = {
        interviewId: state.interviewId,
        questionIndex: state.currentQuestionIndex,
        question: qText,
        answer: answerText || 'No answer provided.',
        jobRole: config.jobRole || 'Software Developer',
        interviewType: config.interviewType || 'Technical',
        difficulty: config.difficulty || 'Medium'
      };

      const evalResult = await evaluateAnswer(evalPayload);
      const evaluation = evalResult.evaluation || evalResult;

      state.answers[state.currentQuestionIndex] = answerText;
      state.evaluations[state.currentQuestionIndex] = evaluation;

      showEvaluation(evaluation);
    } catch (error) {
      console.error('Answer evaluation failed:', error);
      if (typeof showToast === 'function') {
        showToast('Evaluation error: ' + error.message, 'error');
      } else {
        alert('Evaluation failed: ' + error.message);
      }
    } finally {
      state.isSubmitting = false;
      if (submitAnswerBtn) {
        submitAnswerBtn.disabled = false;
        if (submitSpinner) submitSpinner.classList.add('hidden');
      }
    }
  }

  if (submitAnswerBtn) {
    submitAnswerBtn.addEventListener('click', () => submitCurrentAnswer(false));
  }

  /**
   * Skip Question Handler
   */
  if (skipQuestionBtn) {
    skipQuestionBtn.addEventListener('click', async () => {
      const proceed = confirm('Are you sure you want to skip this question? It will receive zero points.');
      if (!proceed) return;

      clearInterval(state.timerInterval);
      if (state.recognition && state.isRecording) {
        state.recognition.stop();
      }

      state.answers[state.currentQuestionIndex] = '[Skipped]';
      const skippedEval = {
        score: 0,
        overallScore: 0,
        feedback: 'Question was skipped by candidate.',
        categoryScores: {
          metric1: 0,
          metric2: 0,
          metric3: 0,
          metric4: 0
        },
        strengths: ['Question was skipped by candidate.'],
        weaknesses: ['Did not provide an answer. Practice responding to questions in this category.']
      };
      state.evaluations[state.currentQuestionIndex] = skippedEval;

      showEvaluation(skippedEval, true);
    });
  }

  /**
   * Show Instant AI Evaluation View with Dynamic Category Metrics
   */
  function showEvaluation(evalData, isSkipped = false) {
    if (!evaluationCard) return;

    if (answerSection) answerSection.classList.add('hidden');
    evaluationCard.classList.remove('hidden');

    const scoreVal = isSkipped ? 0 : Math.min(100, Math.max(0, evalData.overallScore ?? evalData.score ?? 0));
    const questionScoreEl = document.getElementById('questionScore');
    const scoreCircleEl = document.getElementById('questionScoreCircle');
    const scoreStatusText = document.getElementById('scoreStatusText');
    const evalStatusSubtitle = document.getElementById('evalStatusSubtitle');
    const evalStatusBadge = document.getElementById('evalStatusBadge');
    const evalTitle = document.getElementById('evalTitle');

    if (questionScoreEl) questionScoreEl.textContent = scoreVal;
    if (scoreCircleEl) {
      scoreCircleEl.style.setProperty('--score-pct', `${scoreVal}%`);
    }

    if (evalStatusBadge) {
      if (isSkipped) {
        evalStatusBadge.classList.remove('hidden');
        evalStatusBadge.classList.add('skipped');
      } else {
        evalStatusBadge.classList.add('hidden');
        evalStatusBadge.classList.remove('skipped');
      }
    }

    if (evalTitle) {
      const titles = {
        coding: 'Coding Solution Evaluation',
        hr: 'HR & Cultural Assessment',
        behavioral: 'Behavioral STAR Evaluation',
        'domain-specific': 'Domain Competency Evaluation',
        technical: 'Technical Assessment'
      };
      evalTitle.textContent = titles[state.category] || 'Instant AI Evaluation';
    }

    if (evalStatusSubtitle) {
      evalStatusSubtitle.textContent = isSkipped 
        ? 'Question skipped — no evaluation score awarded'
        : 'Detailed rubric evaluation generated by Google Gemini AI';
    }

    if (scoreStatusText) {
      scoreStatusText.textContent = isSkipped ? 'Skipped (0/100)' : 'Overall Score';
    }

    // Render Category-Specific Metrics
    renderCategoryMetrics(evalData, isSkipped);

    // Coding-specific complexity & model solution drawer
    if (state.category === 'coding' && !isSkipped) {
      if (evalCodingAnalysisBox) evalCodingAnalysisBox.classList.remove('hidden');
      if (evalTimeComplexity) evalTimeComplexity.textContent = evalData.timeComplexity || 'O(N)';
      if (evalSpaceComplexity) evalSpaceComplexity.textContent = evalData.spaceComplexity || 'O(1)';

      const currentQ = questions[state.currentQuestionIndex];
      const modelSol = evalData.optimalApproach || (currentQ && (currentQ.modelSolution || currentQ.solution)) || '// Optimal approach covered in feedback';
      if (modelSolutionCode) modelSolutionCode.textContent = modelSol;
    } else {
      if (evalCodingAnalysisBox) evalCodingAnalysisBox.classList.add('hidden');
    }

    // Interviewer Feedback Notes
    const feedbackTextEl = document.getElementById('evalFeedbackText');
    if (feedbackTextEl) {
      feedbackTextEl.textContent = isSkipped
        ? 'Question was skipped by candidate. No points were awarded.'
        : (evalData.feedback || evalData.overallFeedback || 'Answer evaluated successfully.');
    }

    // Strengths
    const strengthsEl = document.getElementById('evalStrengths');
    if (strengthsEl) {
      strengthsEl.innerHTML = '';
      const list = isSkipped ? ['Question was skipped by candidate.'] : (evalData.strengths || []);
      if (list.length === 0) list.push('Clear attempt at addressing the core topic.');
      list.forEach((s) => {
        const li = document.createElement('li');
        li.textContent = s;
        strengthsEl.appendChild(li);
      });
    }

    // Areas to Improve
    const weaknessesEl = document.getElementById('evalWeaknesses');
    if (weaknessesEl) {
      weaknessesEl.innerHTML = '';
      const list = isSkipped ? ['Review this core topic and practice answering in future sessions.'] : (evalData.weaknesses || evalData.areasForImprovement || []);
      if (list.length === 0) list.push('Review edge cases and provide more concrete production examples.');
      list.forEach((w) => {
        const li = document.createElement('li');
        li.textContent = w;
        weaknessesEl.appendChild(li);
      });
    }

    // Next Question Button Text
    const isLast = state.currentQuestionIndex >= questions.length - 1;
    const nextQuestionBtnText = document.getElementById('nextQuestionBtnText');
    if (nextQuestionBtnText) {
      nextQuestionBtnText.textContent = isLast ? 'Finish & View Results' : 'Next Question';
    }

    evaluationCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  /**
   * Render Dynamic Metrics per Category
   */
  function renderCategoryMetrics(evalData, isSkipped) {
    if (!evalMetricsGroup) return;
    const catScores = evalData.categoryScores || {};
    const overall = isSkipped ? 0 : Math.min(100, Math.max(0, evalData.overallScore ?? evalData.score ?? 0));

    let metricsConfig = [];

    if (state.category === 'coding') {
      metricsConfig = [
        { label: 'Correctness & Test Cases', val: isSkipped ? 0 : (catScores.correctness ?? catScores.technicalAccuracy ?? overall) },
        { label: 'Algorithm Efficiency', val: isSkipped ? 0 : (catScores.efficiency ?? overall) },
        { label: 'Edge Cases Handling', val: isSkipped ? 0 : (catScores.edgeCases ?? overall) },
        { label: 'Code Quality & Cleanliness', val: isSkipped ? 0 : (catScores.codeQuality ?? overall) }
      ];
    } else if (state.category === 'hr') {
      metricsConfig = [
        { label: 'Relevance & Context', val: isSkipped ? 0 : (catScores.relevance ?? overall) },
        { label: 'Communication Clarity', val: isSkipped ? 0 : (catScores.communication ?? catScores.communicationClarity ?? overall) },
        { label: 'Completeness & Depth', val: isSkipped ? 0 : (catScores.completeness ?? overall) },
        { label: 'Professionalism & Culture Fit', val: isSkipped ? 0 : (catScores.professionalism ?? overall) }
      ];
    } else if (state.category === 'behavioral') {
      metricsConfig = [
        { label: 'STAR Structure', val: isSkipped ? 0 : (catScores.starStructure ?? overall) },
        { label: 'Relevance to Situation', val: isSkipped ? 0 : (catScores.relevance ?? overall) },
        { label: 'Impact & Results Orientation', val: isSkipped ? 0 : (catScores.impactResults ?? overall) },
        { label: 'Communication Clarity', val: isSkipped ? 0 : (catScores.communication ?? overall) }
      ];
    } else if (state.category === 'domain-specific') {
      metricsConfig = [
        { label: 'Domain Accuracy & Knowledge', val: isSkipped ? 0 : (catScores.domainAccuracy ?? overall) },
        { label: 'Industry Best Practices', val: isSkipped ? 0 : (catScores.industryStandards ?? overall) },
        { label: 'Completeness', val: isSkipped ? 0 : (catScores.completeness ?? overall) },
        { label: 'Practical Feasibility', val: isSkipped ? 0 : (catScores.practicalFeasibility ?? overall) }
      ];
    } else {
      // Technical
      metricsConfig = [
        { label: 'Technical Accuracy', val: isSkipped ? 0 : (catScores.technicalAccuracy ?? catScores.technicalCorrectness ?? overall) },
        { label: 'Depth & Architectural Reasoning', val: isSkipped ? 0 : (catScores.depthReasoning ?? overall) },
        { label: 'Completeness', val: isSkipped ? 0 : (catScores.completeness ?? overall) },
        { label: 'Problem Solving', val: isSkipped ? 0 : (catScores.problemSolving ?? catScores.clarity ?? overall) }
      ];
    }

    evalMetricsGroup.innerHTML = metricsConfig.map(m => {
      const v = Math.min(100, Math.max(0, Math.round(m.val)));
      return `
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">${escapeHtml(m.label)}</span>
            <span class="metric-val">${v}%</span>
          </div>
          <div class="metric-bar-track">
            <div class="metric-bar-fill" style="width: ${v}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Model Solution Drawer Toggle
  if (toggleModelSolutionBtn && modelSolutionDrawer) {
    toggleModelSolutionBtn.addEventListener('click', () => {
      const isHidden = modelSolutionDrawer.classList.contains('hidden');
      if (isHidden) {
        modelSolutionDrawer.classList.remove('hidden');
        toggleModelSolutionBtn.innerHTML = '<i data-lucide="eye-off"></i> Hide Solution';
      } else {
        modelSolutionDrawer.classList.add('hidden');
        toggleModelSolutionBtn.innerHTML = '<i data-lucide="code"></i> View Optimal Solution';
      }
      if (window.lucide) window.lucide.createIcons();
    });
  }

  function hideEvaluation() {
    if (evaluationCard) evaluationCard.classList.add('hidden');
    if (answerSection) answerSection.classList.remove('hidden');
  }

  /**
   * Timer management
   */
  function startTimer(durationSeconds) {
    clearInterval(state.timerInterval);
    state.timeLeft = durationSeconds;
    updateTimerDisplay();

    state.timerInterval = setInterval(() => {
      state.timeLeft--;
      updateTimerDisplay();

      if (state.timeLeft <= 0) {
        clearInterval(state.timerInterval);
        handleTimeExpired();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    if (!timeRemainingEl) return;
    const minutes = Math.floor(Math.max(0, state.timeLeft) / 60);
    const seconds = Math.max(0, state.timeLeft) % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    timeRemainingEl.textContent = formatted;

    if (interviewTimer) {
      if (state.timeLeft <= 10) {
        interviewTimer.style.borderColor = '#EF4444';
        interviewTimer.style.color = '#EF4444';
      } else if (state.timeLeft <= 30) {
        interviewTimer.style.borderColor = '#FF5841';
        interviewTimer.style.color = '#FF5841';
      } else {
        interviewTimer.style.borderColor = '#E5E7EB';
        interviewTimer.style.color = '#252525';
      }
    }
  }

  function handleTimeExpired() {
    if (state.isSubmitting) return;
    if (typeof showToast === 'function') {
      showToast('Time expired for this question. Auto-submitting response...', 'warning');
    }
    if (state.category === 'coding') {
      if (submitCodingSolutionBtn) submitCodingSolutionBtn.click();
    } else {
      submitCurrentAnswer(true);
    }
  }

  /**
   * Next Question / Finish Button
   */
  let isNavigatingNext = false;
  if (nextQuestionBtn) {
    nextQuestionBtn.addEventListener('click', async () => {
      if (isNavigatingNext) return;
      isNavigatingNext = true;
      nextQuestionBtn.disabled = true;

      const isLast = state.currentQuestionIndex >= questions.length - 1;
      if (isLast) {
        await finishAndCompleteInterview();
      } else {
        displayQuestion(state.currentQuestionIndex + 1);
        isNavigatingNext = false;
        nextQuestionBtn.disabled = false;
      }
    });
  }

  // End Interview from Evaluation Card
  const evalEndEarlyBtn = document.getElementById('evalEndEarlyBtn');
  if (evalEndEarlyBtn && endConfirmModal) {
    evalEndEarlyBtn.addEventListener('click', () => {
      endConfirmModal.classList.remove('hidden');
    });
  }

  /**
   * Finalize and Complete Mock Interview
   */
  let isFinalizing = false;
  async function finishAndCompleteInterview() {
    if (isFinalizing) return;
    isFinalizing = true;

    window.removeEventListener('beforeunload', beforeUnloadHandler);
    clearInterval(state.timerInterval);

    // Fill in any unanswered questions up to total question count as [Skipped]
    for (let i = 0; i < questions.length; i++) {
      if (!state.answers[i]) {
        state.answers[i] = '[Skipped]';
        state.evaluations[i] = {
          score: 0,
          overallScore: 0,
          feedback: 'Question was skipped by candidate.',
          categoryScores: { metric1: 0, metric2: 0, metric3: 0, metric4: 0 },
          strengths: ['Question was skipped.'],
          weaknesses: ['Question was skipped without an answer.']
        };
      }
    }

    if (nextQuestionBtn) {
      nextQuestionBtn.disabled = true;
      nextQuestionBtn.innerHTML = `
        <span class="btn-spinner"><i data-lucide="loader" class="spinner-icon"></i></span>
        <span>Synthesizing Full Report...</span>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    if (confirmEndBtn) {
      confirmEndBtn.disabled = true;
      confirmEndBtn.textContent = 'Finalizing...';
    }

    try {
      await completeInterview(state.interviewId, state.answers, state.evaluations);
      sessionStorage.setItem('avenir_last_completed_id', state.interviewId);
      window.location.href = `results.html?id=${state.interviewId}`;
    } catch (error) {
      console.error('Failed to complete and save interview in Firestore:', error);
      isFinalizing = false;
      if (confirmEndBtn) {
        confirmEndBtn.disabled = false;
        confirmEndBtn.textContent = 'End & Save Session';
      }
      if (nextQuestionBtn) {
        nextQuestionBtn.disabled = false;
        nextQuestionBtn.innerHTML = `<span>Submit Answer</span>`;
      }
      if (typeof showToast === 'function') {
        showToast('Unable to save interview session to Firestore. Please try again.', 'error');
      }
    }
  }

  /**
   * Early Termination Modal Handlers
   */
  if (endInterviewBtn && endConfirmModal) {
    endInterviewBtn.addEventListener('click', () => {
      endConfirmModal.classList.remove('hidden');
    });
  }

  if (cancelEndBtn && endConfirmModal) {
    cancelEndBtn.addEventListener('click', () => {
      endConfirmModal.classList.add('hidden');
    });
  }

  if (confirmEndBtn) {
    confirmEndBtn.addEventListener('click', async () => {
      if (endConfirmModal) endConfirmModal.classList.add('hidden');
      await finishAndCompleteInterview();
    });
  }

  // Kick off first question
  displayQuestion(0);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
