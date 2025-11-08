import { App, Notice, setIcon, setTooltip, TFile, TAbstractFile, getFrontMatterInfo } from "obsidian";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { QuizSettings } from "../../settings/config";
import { Question, QuizResult } from "../../utils/types";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse
} from "../../utils/typeGuards";
import ModalButton from "../components/ModalButton";
import TrueFalseQuestion from "./TrueFalseQuestion";
import MultipleChoiceQuestion from "./MultipleChoiceQuestion";
import SelectAllThatApplyQuestion from "./SelectAllThatApplyQuestion";
import FillInTheBlankQuestion from "./FillInTheBlankQuestion";
import MatchingQuestion from "./MatchingQuestion";
import ShortOrLongAnswerQuestion from "./ShortOrLongAnswerQuestion";
import QuizSaver from "../../services/quizSaver";
import { hashString } from "../../utils/helpers";
import ConversationModeModal from "./ConversationModeModal";
import StreakTracker from "../../services/streakTracker";
import QuizSummaryModal from "./QuizSummaryModal";
import ElevenLabsService from "../../services/elevenLabsService";
import SoundManager from "../../services/soundManager";
import ConfettiEffect from "../components/ConfettiEffect";
import ElevenLabsCreditCheckModal from "./ElevenLabsCreditCheckModal";
import type QuizGenerator from "../../main";
import SelectorModal from "../selector/selectorModal";
import GeneratorFactory from "../../generators/generatorFactory";
import ReviewModal from "./ReviewModal";

type DraftResponse = string | string[] | { leftOption: string, rightOption: string }[];

interface QuizModalProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	quizSaver: QuizSaver;
	reviewing: boolean;
	hasBeenTaken: boolean;
	previousAttempts: Map<string, boolean>;
	questionWrongCounts?: Map<string, number>;
	plugin?: QuizGenerator;
	handleClose: () => void;
	onQuizComplete?: (results: QuizResult[], questionHashes: string[], timestamp: string) => void;
	existingQuizFile?: TFile;
	contentSelectionMode?: string;
}

const QuizModal = ({ app, settings, quiz: initialQuiz, quizSaver, reviewing, hasBeenTaken, previousAttempts, questionWrongCounts, plugin, handleClose, onQuizComplete, existingQuizFile, contentSelectionMode }: QuizModalProps) => {
	const [skipCorrect, setSkipCorrect] = useState<boolean>(false);
	const [questionIndex, setQuestionIndex] = useState<number>(0);
	const [quiz, setQuiz] = useState<Question[]>(initialQuiz);
	const [quizResults, setQuizResults] = useState<Map<number, boolean>>(new Map());
	const [answerOrder, setAnswerOrder] = useState<boolean[]>([]); // Track answers in order answered
	const [userAnswers, setUserAnswers] = useState<Map<number, any>>(new Map()); // Track user's actual answers
	const [isScoring, setIsScoring] = useState<boolean>(false); // Loading state for scoring
	const [showUnansweredOnly, setShowUnansweredOnly] = useState<boolean>(false); // Filter to unanswered questions
	const [unansweredSnapshot, setUnansweredSnapshot] = useState<Set<number> | null>(null); // Snapshot of unanswered question indices when entering unanswered-only mode
	const [correctStreak, setCorrectStreak] = useState<number>(0);
	const [elapsedTime, setElapsedTime] = useState<number>(0);
	const [questionTimer, setQuestionTimer] = useState<number>(0);
	const [quizCompleted, setQuizCompleted] = useState<boolean>(false);
	const [showConfetti, setShowConfetti] = useState<boolean>(false);
	const [soundsMuted, setSoundsMuted] = useState<boolean>(settings.gamification?.soundsMuted ?? false);
	const [voiceMuted, setVoiceMuted] = useState<boolean>(settings.gamification?.voiceMuted ?? false);
	const [audioPreGenerated, setAudioPreGenerated] = useState<boolean>(false);
	const [showHotkeyOverlays, setShowHotkeyOverlays] = useState<boolean>(false);
	const [hintsUsed, setHintsUsed] = useState<number>(0);
	const [currentHint, setCurrentHint] = useState<string | null>(null);
	const [generatingHint, setGeneratingHint] = useState<boolean>(false);
	const [cursorLeaveCountdown, setCursorLeaveCountdown] = useState<number | null>(null);
	const [cheatingDetected, setCheatingDetected] = useState<boolean>(false);
	const [draftResponses, setDraftResponses] = useState<Record<string, DraftResponse>>({});
	const [quizFileName, setQuizFileName] = useState<string | null>(existingQuizFile?.basename ?? null);
	const userAnswersRef = useRef<Map<number, any>>(new Map()); // Ref to store answers immediately (before state updates)
	const hintCacheRef = useRef<Map<string, string>>(new Map()); // Cache hints by question hash
	const hintButtonRef = useRef<HTMLButtonElement>(null);
	const cursorLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const cursorLeaveCountdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const streakTrackerRef = useRef<StreakTracker>(new StreakTracker(app));
	const elevenLabsRef = useRef<ElevenLabsService | null>(null);
	const soundManagerRef = useRef<SoundManager | null>(null);
	const startTimeRef = useRef<number>(Date.now());
	const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const questionTimerRef = useRef<NodeJS.Timeout | null>(null);
	const tickingIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const autoProgressRef = useRef<NodeJS.Timeout | null>(null);
	const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
	const voiceMuteButtonRef = useRef<HTMLButtonElement>(null);
	const soundMuteButtonRef = useRef<HTMLButtonElement>(null);
	const keyboardIconButtonRef = useRef<HTMLButtonElement>(null);
	const audioPreGeneratedRef = useRef<boolean>(false);
	const audioPlayedForQuestionRef = useRef<number | null>(null); // Track which question has had audio played
	const conversationModalPausedTimeRef = useRef<number>(0); // Track paused time for main timer
	const conversationModalPausedAtRef = useRef<number | null>(null); // When modal was opened
	const previousCorrectStreakRef = useRef<number>(0); // Track previous streak to detect flame activation
	const hotkeyOverlayRefs = useRef<Map<string, HTMLDivElement>>(new Map()); // Store overlay elements
	const modalContainerRef = useRef<HTMLDivElement | null>(null);
	const currentQuizFilePathRef = useRef<string | null>(existingQuizFile?.path ?? null);
	
	// Generate hashes for all questions - memoized to prevent recalculation
	const allQuestionHashes = useMemo(() => quiz.map(q => hashString(JSON.stringify(q))), [quiz]);
	
	// Helper function to check if a question is answered (including draft text for text input questions in review mode)
	const isQuestionAnswered = useCallback((originalIndex: number, question: Question, hash: string, hideResults: boolean): boolean => {
		// Check if explicitly answered
		const userAnswer = userAnswersRef.current.get(originalIndex) ?? userAnswers.get(originalIndex);
		
		// For matching questions, check if all pairs are matched
		if (isMatching(question)) {
			if (userAnswer && Array.isArray(userAnswer)) {
				// A matching question is only answered when all pairs are matched
				return userAnswer.length === question.answer.length;
			}
			return false;
		}
		
		// For other question types, check if there's an answer
		if (userAnswer !== undefined && userAnswer !== null) {
			return true;
		}
		
		// In review mode, check if there's draft text for text input questions or incomplete matching pairs
		if (hideResults) {
			const draftValue = draftResponses[hash];
			if (isFillInTheBlank(question)) {
				// For fill-in-the-blank, check if any input has text
				if (Array.isArray(draftValue) && draftValue.length > 0 && typeof draftValue[0] === 'string') {
					return (draftValue as string[]).some(val => val && val.trim().length > 0);
				}
			} else if (isShortOrLongAnswer(question)) {
				// For short/long answer, check if there's text
				if (typeof draftValue === "string") {
					return draftValue.trim().length > 0;
				}
			} else if (isMatching(question)) {
				// For matching, check if there are any incomplete pairs saved
				if (Array.isArray(draftValue) && draftValue.length > 0 && typeof draftValue[0] === 'object' && 'leftOption' in draftValue[0]) {
					return true; // Has some pairs matched, even if not complete
				}
			}
		}
		
		return false;
	}, [userAnswers, draftResponses]);
	
	// Filter questions based on skipCorrect setting and unanswered filter - memoized to prevent infinite loops
	const filteredQuizData = useMemo(() => {
		let filtered = quiz.map((q, index) => ({
			question: q,
			originalIndex: index,
			hash: allQuestionHashes[index]
		}));
		
		// Filter by skipCorrect setting
		if (skipCorrect) {
			filtered = filtered.filter(item => {
				const wasCorrect = previousAttempts.get(item.hash);
				return wasCorrect !== true; // Include if never attempted or was incorrect
			});
		}
		
		// Filter to unanswered questions if showUnansweredOnly is true
		// Use snapshot if available, otherwise calculate on the fly
		if (showUnansweredOnly) {
			if (unansweredSnapshot) {
				// Use snapshot to filter - don't recalculate during review
				filtered = filtered.filter(item => unansweredSnapshot.has(item.originalIndex));
			} else {
				// Fallback: calculate on the fly (shouldn't happen, but just in case)
				filtered = filtered.filter(item => {
					const hideResults = settings.showResultsAtEndOnly ?? false;
					return !isQuestionAnswered(item.originalIndex, item.question, item.hash, hideResults);
				});
			}
		}
		
		return filtered;
	}, [quiz, skipCorrect, previousAttempts, allQuestionHashes, showUnansweredOnly, unansweredSnapshot, isQuestionAnswered, settings.showResultsAtEndOnly]);
	
	const activeQuestions = useMemo(() => filteredQuizData.map(item => item.question), [filteredQuizData]);
	const activeOriginalIndices = useMemo(() => filteredQuizData.map(item => item.originalIndex), [filteredQuizData]);
	const questionHashes = useMemo(() => filteredQuizData.map(item => item.hash), [filteredQuizData]);
	const currentQuestionHash = questionHashes[questionIndex];
	
	// Auto-navigate to score page when all unanswered questions are answered
	useEffect(() => {
		const hideResults = settings.showResultsAtEndOnly ?? false;
		if (!hideResults || !showUnansweredOnly) return;
		
		// Check if there are any remaining unanswered questions in the full active set
		const allActiveOriginalIndices = quiz.map((q, idx) => ({
			originalIndex: idx,
			hash: allQuestionHashes[idx]
		})).filter(item => {
			if (skipCorrect) {
				const wasCorrect = previousAttempts.get(item.hash);
				return wasCorrect !== true;
			}
			return true;
		}).map(item => item.originalIndex);
		
		const remainingUnanswered = allActiveOriginalIndices.filter(origIdx => {
			const question = quiz[origIdx];
			const hash = allQuestionHashes[origIdx];
			return !isQuestionAnswered(origIdx, question, hash, hideResults);
		});
		
		// If no more unanswered questions and we're in unanswered-only mode, go to score page
		if (remainingUnanswered.length === 0 && showUnansweredOnly) {
			setShowUnansweredOnly(false);
			setUnansweredSnapshot(null); // Clear snapshot when exiting unanswered-only mode
			setQuestionIndex(allActiveOriginalIndices.length); // Go to score page
		}
	}, [settings, showUnansweredOnly, userAnswers, quiz, skipCorrect, previousAttempts, allQuestionHashes, isQuestionAnswered]);
	
	// Note: Unanswered count is recalculated in renderQuestion() every time the score page is rendered
	// This ensures the button count is always up-to-date when returning to the score page
	
	const wrongCountForQuestion = currentQuestionHash ? questionWrongCounts?.get(currentQuestionHash) : undefined;
	const showWrongBadge = wrongCountForQuestion !== undefined && wrongCountForQuestion > 0;
	const showSkipInline = !showWrongBadge && currentQuestionHash !== undefined && previousAttempts.get(currentQuestionHash) === true;
	const updateDraftResponse = useCallback((hash: string, value: DraftResponse | null) => {
		if (!hash) return;
		setDraftResponses(prev => {
			if (value === null) {
				if (!(hash in prev)) return prev;
				const { [hash]: _, ...rest } = prev;
				return rest;
			}
			const normalizedValue: DraftResponse = Array.isArray(value) 
				? (value as string[] | { leftOption: string, rightOption: string }[]).slice() 
				: value;
			const existing = prev[hash];
			if (Array.isArray(normalizedValue) && Array.isArray(existing)) {
				// Check if both are string arrays
				if (normalizedValue.length > 0 && typeof normalizedValue[0] === 'string' && 
				    existing.length > 0 && typeof existing[0] === 'string') {
					if (normalizedValue.length === existing.length && normalizedValue.every((val, index) => val === (existing as string[])[index])) {
						return prev;
					}
				} else if (normalizedValue.length > 0 && typeof normalizedValue[0] === 'object' && 'leftOption' in normalizedValue[0] &&
				           existing.length > 0 && typeof existing[0] === 'object' && 'leftOption' in existing[0]) {
					// Both are matching pairs arrays - compare by JSON stringify
					if (JSON.stringify(normalizedValue) === JSON.stringify(existing)) {
						return prev;
					}
				}
			} else if (!Array.isArray(normalizedValue) && existing === normalizedValue) {
				return prev;
			}
			return { ...prev, [hash]: normalizedValue };
		});
	}, []);

	const clearDraftResponses = useCallback((hashes: string[]) => {
		if (hashes.length === 0) return;
		setDraftResponses(prev => {
			let changed = false;
			const next: Record<string, DraftResponse> = { ...prev };
			for (const hash of hashes) {
				if (hash && hash in next) {
					delete next[hash];
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, []);

	useEffect(() => {
		const allowed = new Set(allQuestionHashes);
		setDraftResponses(prev => {
			let changed = false;
			const next: Record<string, DraftResponse> = {};
			for (const [hash, value] of Object.entries(prev)) {
				if (allowed.has(hash)) {
					next[hash] = value;
				} else {
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [allQuestionHashes]);

	
	// Use consistent timestamp for this entire quiz session
	const [sessionTimestamp] = useState<string>(new Date().toISOString());
	
	// Gamification enabled check
	const gamification = settings.gamification || {
		enabled: true,
		showStreakCounter: true,
		showDailyStreak: true,
		showTimer: true,
		showTimerDuringQuiz: false,
		showAccuracy: true,
		showReflection: true,
		showStarRating: true,
		enableFlameEffect: true,
		questionTimerEnabled: false,
		questionTimerSeconds: 30,
		shortAnswerTimerEnabled: false, // Deprecated, kept for backward compatibility
		shortAnswerTimerSeconds: 120,
		longAnswerTimerEnabled: false, // Deprecated, kept for backward compatibility
		longAnswerTimerSeconds: 300,
		elevenLabsEnabled: false,
		elevenLabsApiKey: "",
		elevenLabsVoiceId: "",
		soundEffectsEnabled: false,
		tickingSoundEnabled: false,
		soundVolume: 50,
		autoProgressEnabled: true,
		autoProgressSeconds: 3,
		paginationEnabled: false,
	};
	
	// Initialize sound manager
	useEffect(() => {
		const volume = (gamification.soundVolume ?? 50) / 100; // Convert 0-100 to 0-1
		if (!soundManagerRef.current) {
			soundManagerRef.current = new SoundManager(gamification.soundEffectsEnabled || false, volume);
		} else {
			soundManagerRef.current.setEnabled(gamification.soundEffectsEnabled || false);
			soundManagerRef.current.setVolume(volume);
		}
		return () => {
			if (soundManagerRef.current) {
				soundManagerRef.current.setEnabled(false);
			}
		};
	}, [gamification.soundEffectsEnabled, gamification.soundVolume]);
	
	// Initialize ElevenLabs service if enabled
	// Audio is now pre-generated in QuizModalLogic before rendering, so we just initialize the service here
	useEffect(() => {
		if (gamification.enabled && gamification.elevenLabsEnabled && gamification.elevenLabsApiKey && gamification.elevenLabsVoiceId) {
			elevenLabsRef.current = new ElevenLabsService(gamification.elevenLabsApiKey, gamification.elevenLabsVoiceId);
			
			// Load cached audio into audioCacheRef for this quiz session
			// Wait for cache to load BEFORE marking audio as pre-generated to prevent double-play
			import("../../services/audioCache").then(({ default: AudioCache }) => {
				const persistentCache = AudioCache.getInstance();
				initialQuiz.forEach((q, index) => {
					const hash = hashString(JSON.stringify(q));
					const cacheKey = `q-${index}-${hash}`;
					const cached = persistentCache.get(cacheKey);
					if (cached) {
						audioCacheRef.current.set(cacheKey, cached);
					}
				});
				
				// Only mark as ready AFTER cache is loaded
				setAudioPreGenerated(true);
				audioPreGeneratedRef.current = true;
			});
		} else {
			// ElevenLabs not enabled
			setAudioPreGenerated(true);
			audioPreGeneratedRef.current = true;
		}
		
		return () => {
			// Clear local audio cache on unmount (not persistent cache)
			audioCacheRef.current.clear();
		};
	}, []); // Empty dependency array - only run once on mount
	
	// Set icons for mute/voice/repeat buttons
	useEffect(() => {
		if (soundMuteButtonRef.current) {
			setIcon(soundMuteButtonRef.current, soundsMuted ? "volume-x" : "volume-2");
			setTooltip(soundMuteButtonRef.current, soundsMuted ? "Unmute sound effects (M)" : "Mute sound effects (M)");
			// Add data attribute for CSS positioning
			soundMuteButtonRef.current.setAttribute("data-tooltip-position", "bottom");
		}
	}, [soundsMuted]);

	useEffect(() => {
		if (voiceMuteButtonRef.current) {
			setIcon(voiceMuteButtonRef.current, voiceMuted ? "user-x" : "user");
			setTooltip(voiceMuteButtonRef.current, voiceMuted ? "Unmute voice (V)" : "Mute voice (V)");
			// Add data attribute for CSS positioning
			voiceMuteButtonRef.current.setAttribute("data-tooltip-position", "bottom");
		}
	}, [voiceMuted]);


	useEffect(() => {
		if (keyboardIconButtonRef.current) {
			setIcon(keyboardIconButtonRef.current, "keyboard");
			setTooltip(keyboardIconButtonRef.current, "Show keyboard shortcuts");
			keyboardIconButtonRef.current.setAttribute("data-tooltip-position", "bottom");
		}
	}, []);

	// Set icon for re-generate button
	const regenerateButtonRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (regenerateButtonRef.current) {
			setIcon(regenerateButtonRef.current, "refresh-cw");
			setTooltip(regenerateButtonRef.current, "Re-generate quiz from same sources");
			regenerateButtonRef.current.setAttribute("data-tooltip-position", "bottom");
		}
	}, []);

	// Render hotkey overlays when showHotkeyOverlays is true
	useEffect(() => {
		if (!showHotkeyOverlays) {
			// Remove all overlays when hidden
			hotkeyOverlayRefs.current.forEach(overlay => overlay.remove());
			hotkeyOverlayRefs.current.clear();
			return;
		}

		// Remove existing overlays first
		hotkeyOverlayRefs.current.forEach(overlay => overlay.remove());
		hotkeyOverlayRefs.current.clear();

		const modal = document.querySelector('.modal-qg');
		if (!modal) return;

		// Helper to create and position overlay
		const createOverlay = (text: string, element: HTMLElement | null, key: string) => {
			if (!element) return;

			const rect = element.getBoundingClientRect();
			const overlay = document.createElement('div');
			overlay.className = 'hotkey-overlay-qg';
			overlay.textContent = text;
			overlay.setAttribute('data-key', key);
			
			// Special positioning for number key overlays
			if (key.startsWith('num-')) {
				// Position in top-right corner of the button
				overlay.style.left = `${rect.right - 35}px`;
				overlay.style.top = `${rect.top + 5}px`;
			} else {
				// Default positioning for other overlays
				overlay.style.left = `${rect.right + 10}px`;
				overlay.style.top = `${rect.top + (rect.height / 2) - 10}px`;
			}
			
			document.body.appendChild(overlay);
			hotkeyOverlayRefs.current.set(key, overlay);
		};

		// Create overlays for each hotkey
		setTimeout(() => {
			// Navigation overlays (if pagination enabled)
			if (gamification.paginationEnabled) {
				const buttons = modal.querySelectorAll('.modal-button-container-qg button');
				// Back button is typically the first button when pagination is enabled
				// Find it by looking for arrow-left icon
				const backButton = Array.from(buttons).find(btn => {
					const icon = btn.querySelector('.lucide-arrow-left');
					return icon !== null;
				});
				if (backButton) {
					createOverlay('← / K', backButton as HTMLElement, 'back');
				}
				
				// Next button is typically the last button when pagination is enabled
				// Find it by looking for arrow-right icon
				const nextButton = Array.from(buttons).find(btn => {
					const icon = btn.querySelector('.lucide-arrow-right');
					return icon !== null;
				});
				if (nextButton) {
					createOverlay('→ / J', nextButton as HTMLElement, 'next');
				}
			}

			// Sound mute button
			if (soundMuteButtonRef.current) {
				createOverlay('M', soundMuteButtonRef.current, 'sound');
			}

			// Voice mute button
			if (voiceMuteButtonRef.current && gamification.elevenLabsEnabled) {
				createOverlay('V', voiceMuteButtonRef.current, 'voice');
			}

			// Close button
			const closeButton = modal.querySelector('.modal-close-button');
			if (closeButton) {
				createOverlay('Esc', closeButton as HTMLElement, 'close');
			}

			// Submit/Enter overlay
			const questionContainer = modal.querySelector('.question-content-wrapper-qg');
			if (questionContainer) {
				const submitButton = questionContainer.querySelector('button[type="submit"]') || 
					Array.from(questionContainer.querySelectorAll('button')).find(btn => 
						btn.textContent?.toLowerCase().includes('submit')
					);
				if (submitButton) {
					createOverlay('Enter', submitButton as HTMLElement, 'submit');
				} else {
					// If no submit button, show Enter overlay near the question
					const questionEl = questionContainer.querySelector('.question-qg');
					if (questionEl) {
						createOverlay('Enter (Submit)', questionEl as HTMLElement, 'enter');
					}
				}
			}

			// Tab overlay (near inputs)
			const inputs = modal.querySelectorAll('input[type="text"], textarea');
			if (inputs.length > 0) {
				const firstInput = inputs[0] as HTMLElement;
				createOverlay('Tab (Switch)', firstInput, 'tab');
			}

			// Space overlay (for multiple choice/true-false)
			const currentQuestion = activeQuestions[questionIndex];
			if (currentQuestion && (isMultipleChoice(currentQuestion) || isTrueFalse(currentQuestion) || isSelectAllThatApply(currentQuestion))) {
				const options = modal.querySelectorAll('.multiple-choice-button-qg, .true-false-button-qg, .select-all-that-apply-button-qg');
				if (options.length > 0) {
					const firstOption = options[0] as HTMLElement;
					createOverlay('Space (Select)', firstOption, 'space');
				}
			}
			
			// Number key overlays on answer choices
			const currentQuestion2 = activeQuestions[questionIndex];
			if (currentQuestion2) {
				const choiceButtons = modal.querySelectorAll(
					'[data-choice-number]:not([disabled])'
				);
				choiceButtons.forEach((button) => {
					const choiceNumber = button.getAttribute('data-choice-number');
					if (choiceNumber) {
						const num = parseInt(choiceNumber, 10);
						if (num >= 1 && num <= 9) {
							createOverlay(num.toString(), button as HTMLElement, `num-${num}`);
						}
					}
				});
			}
		}, 50); // Small delay to ensure DOM is ready

		// Cleanup on unmount or when hiding
		return () => {
			hotkeyOverlayRefs.current.forEach(overlay => overlay.remove());
			hotkeyOverlayRefs.current.clear();
		};
	}, [showHotkeyOverlays, gamification.paginationEnabled, questionIndex, activeQuestions]);

	// Close overlays when clicking outside
	useEffect(() => {
		if (!showHotkeyOverlays) return;

		const handleClick = (e: MouseEvent) => {
			// Don't close if clicking the keyboard icon button
			if (keyboardIconButtonRef.current && keyboardIconButtonRef.current.contains(e.target as Node)) {
				return;
			}
			setShowHotkeyOverlays(false);
		};

		document.addEventListener('click', handleClick);
		return () => document.removeEventListener('click', handleClick);
	}, [showHotkeyOverlays]);

	// Note: Repeat button icons are now set directly in question components
	
	// Keyboard shortcuts handler
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Stop all keyboard events from reaching the background editor
			event.stopPropagation();
			
			const target = event.target as HTMLElement;
			const isInputField = target instanceof HTMLInputElement || 
				target instanceof HTMLTextAreaElement || 
				target.isContentEditable ||
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA';
			
			// Don't trigger shortcuts if user is typing in an input field or textarea
			if (isInputField) {
				// Allow Tab to work naturally for focus within question components
				// Question components will handle their own Tab navigation
				if (event.key === 'Tab') {
					// Check if we're in a question container - let it handle Tab
					const questionContainer = document.querySelector('.question-container-qg');
					if (questionContainer && questionContainer.contains(target)) {
						// Still prevent default to avoid tabbing to background
						event.preventDefault();
						return; // Let question component handle Tab
					}
					// Prevent Tab from reaching background
					event.preventDefault();
					return;
				}
				// Allow Enter in textareas/inputs to work naturally (except for submit)
				if (event.key === 'Enter') {
					// For fill-in-the-blank inputs, Enter should still submit
					if (target.closest('.fill-blank-input-qg')) {
						// Let the input's own handler deal with it
						return;
					}
					// For textareas, allow normal behavior
					if (target instanceof HTMLTextAreaElement || target.tagName === 'TEXTAREA') {
						return;
					}
				}
				// For other keys in inputs, don't trigger shortcuts
				return;
			}
			
			const currentQuestion = activeQuestions[questionIndex];
			const key = event.key.toLowerCase();
			
			// Hide hotkey overlays on any keystroke
			if (showHotkeyOverlays) {
				setShowHotkeyOverlays(false);
			}
			
			// Mute sounds (m key) - toggle
			if (key === 'm' || key === 'M') {
				event.preventDefault();
				// Toggle sound effects mute
				setSoundsMuted(prev => {
					const newValue = !prev;
					if (plugin) {
						plugin.settings.gamification.soundsMuted = newValue;
						plugin.saveSettings();
					}
					return newValue;
				});
				return;
			}
			
			// Mute voice (v key) - toggle
			if (key === 'v' || key === 'V') {
				event.preventDefault();
				if (gamification.elevenLabsEnabled) {
					// Toggle voice mute
					setVoiceMuted(prev => {
						const newValue = !prev;
						if (plugin) {
							plugin.settings.gamification.voiceMuted = newValue;
							plugin.saveSettings();
						}
						return newValue;
					});
				}
				return;
			}
			
			
			// Escape to close
			if (event.key === 'Escape') {
				event.preventDefault();
				handleClose();
				return;
			}
			
			// Navigation shortcuts - only work if pagination is enabled
			if (gamification.paginationEnabled) {
				if (event.key === 'ArrowLeft' || key === 'j') {
					event.preventDefault();
					// Go to previous question
					if (questionIndex > 0) {
						handlePreviousQuestion();
					}
					return;
				}
				
				if (event.key === 'ArrowRight' || key === 'k') {
					event.preventDefault();
					const hideResults = settings.showResultsAtEndOnly ?? false;
					// Go to next question or Score My Quiz page
					if (hideResults && questionIndex === activeQuestions.length - 1) {
						// Go to Score My Quiz page
						setQuestionIndex(questionIndex + 1);
					} else if (questionIndex < activeQuestions.length - 1) {
						handleNextQuestion();
					}
					return;
				}
			}
			
			if (event.key === 'Enter') {
				event.preventDefault();
				// Check if there's a focused button first
				const focusedElement = document.activeElement;
				if (focusedElement instanceof HTMLButtonElement && !focusedElement.disabled) {
					focusedElement.click();
					return;
				}
				
				// For fill-in-the-blank and short/long answer, Enter should submit
				if (isFillInTheBlank(currentQuestion) || isShortOrLongAnswer(currentQuestion)) {
					const modalElement = document.querySelector('.modal-qg');
					if (modalElement) {
						const questionContainer = modalElement.querySelector('.question-content-wrapper-qg');
						if (questionContainer) {
							const buttons = questionContainer.querySelectorAll('button');
							for (const button of Array.from(buttons)) {
								const buttonText = button.textContent?.toLowerCase() || '';
								if ((buttonText.includes('submit') || buttonText.includes('check')) && !button.disabled) {
									button.click();
									return;
								}
							}
						}
					}
				}
				return;
			}
			
			if (event.key === ' ') {
				event.preventDefault();
				// Check if there's a focused button first
				const focusedElement = document.activeElement;
				if (focusedElement instanceof HTMLButtonElement && !focusedElement.disabled) {
					focusedElement.click();
					return;
				}
				
				// Space to select/activate (for multiple choice, true/false, select all that apply)
				// Only work if question has been answered
				if (isMultipleChoice(currentQuestion) || isTrueFalse(currentQuestion) || isSelectAllThatApply(currentQuestion)) {
					const hideResults = settings.showResultsAtEndOnly ?? false;
					const originalIndex = activeOriginalIndices[questionIndex];
					// Check if question has been answered
					const isAnswered = hideResults 
						? (userAnswersRef.current.has(originalIndex) || userAnswers.has(originalIndex))
						: quizResults.has(originalIndex);
					
					if (isAnswered) {
						const modalElement = document.querySelector('.modal-qg');
						if (modalElement) {
							const questionContainer = modalElement.querySelector('.question-content-wrapper-qg');
							if (questionContainer) {
								// Find first non-disabled button
								const buttons = questionContainer.querySelectorAll('button:not([disabled])');
								if (buttons.length > 0) {
									const firstButton = buttons[0] as HTMLElement;
									firstButton.click();
									firstButton.focus(); // Focus it for next time
								}
							}
						}
					}
				}
				return;
			}
		};
		
		document.addEventListener('keydown', handleKeyDown);
		
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [questionIndex, activeQuestions]);
	
	// Start timer if enabled (always track, but only show if setting enabled)
	useEffect(() => {
		if (gamification.enabled && gamification.showTimer) {
			timerIntervalRef.current = setInterval(() => {
				// Adjust start time by paused duration
				const adjustedStartTime = startTimeRef.current + conversationModalPausedTimeRef.current;
				// If currently paused, don't update elapsed time
				if (conversationModalPausedAtRef.current === null) {
					setElapsedTime(Math.floor((Date.now() - adjustedStartTime) / 1000));
				}
			}, 1000);
		}
		
		return () => {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}
		};
	}, [gamification.enabled, gamification.showTimer]);
	
	// Helper function to play question audio - stored in ref to avoid dependency issues
	const playQuestionAudioRef = useRef<(() => void) | null>(null);
	
	// Update the ref function when dependencies change
	useEffect(() => {
		playQuestionAudioRef.current = () => {
			if (!gamification.elevenLabsEnabled || !elevenLabsRef.current || voiceMuted) {
				return;
			}

			// Don't play audio if not pre-generated yet (waiting for credit check)
			if (!audioPreGeneratedRef.current) {
				return;
			}

			// Stop any currently playing audio first
			elevenLabsRef.current.stopAllAudio();

			const currentQuestion = activeQuestions[questionIndex];
			const originalIndex = activeOriginalIndices[questionIndex];
			const questionHash = questionHashes[questionIndex];
			const cacheKey = `q-${originalIndex}-${questionHash}`;

			if (audioCacheRef.current.has(cacheKey)) {
				const audio = audioCacheRef.current.get(cacheKey)!.cloneNode(true) as HTMLAudioElement;
				// Track this audio element
				elevenLabsRef.current.trackAudio(audio);
				// Wait 1 second before playing
				setTimeout(() => {
					if (!voiceMuted && elevenLabsRef.current) {
						audio.play().then(() => {
							// Audio play started successfully
						}).catch(err => {
							console.error('[QuizModal] Audio play error:', err);
						});
					}
				}, 1000);
			} else {
				// Fallback: generate on demand if pre-generation failed
				// Replace blank markers with "BLANK" for audio, then clean markdown
				let questionText = currentQuestion.question.replace(/`_+`/g, ' BLANK ');
				questionText = questionText.replace(/[`*_\[\]()]/g, '').trim();
				if (questionText) {
					elevenLabsRef.current.generateAudio(questionText, cacheKey).then(audio => {
						if (audio && !voiceMuted) {
							audioCacheRef.current.set(cacheKey, audio);
							const cloned = audio.cloneNode(true) as HTMLAudioElement;
							// Track this audio element
							elevenLabsRef.current!.trackAudio(cloned);
							// Wait 1 second before playing
							setTimeout(() => {
								if (!voiceMuted && elevenLabsRef.current) {
									cloned.play().then(() => {
										// On-demand audio play started successfully
									}).catch(err => {
										console.error('[QuizModal] On-demand audio play error:', err);
									});
								}
							}, 1000);
						}
					}).catch(err => {
						console.error('[QuizModal] Error generating audio on demand:', err);
					});
				}
			}
		};
	}, [questionIndex, activeQuestions, gamification.elevenLabsEnabled, voiceMuted, activeOriginalIndices, questionHashes]);

	// Clear hint when question changes (but keep cached hint available)
	useEffect(() => {
		setCurrentHint(null);
		// Check if we have a cached hint for this question
		const currentHash = questionHashes[questionIndex];
		if (currentHash && hintCacheRef.current.has(currentHash)) {
			setCurrentHint(hintCacheRef.current.get(currentHash) || null);
		}
	}, [questionIndex, questionHashes]);

	// Set icon for hint button
	useEffect(() => {
		if (hintButtonRef.current) {
			setIcon(hintButtonRef.current, "lightbulb");
		}
	}, []);

	// Question timer effect
	useEffect(() => {
		const currentQuestion = activeQuestions[questionIndex];
		let timerEnabled = false;
		let timerSeconds = 0;
		
		// If question timer is enabled, use it for all question types
		// Different durations for short/long answer questions
		if (gamification.questionTimerEnabled) {
			if (isShortOrLongAnswer(currentQuestion)) {
				// Check if it's a long answer (has newlines) or short answer
				const questionText = currentQuestion.question;
				const isLongAnswer = questionText.includes('\n') || questionText.length > 200;
				
				if (isLongAnswer) {
					timerEnabled = true;
					timerSeconds = gamification.longAnswerTimerSeconds || 300;
				} else {
					// Short answer question
					timerEnabled = true;
					timerSeconds = gamification.shortAnswerTimerSeconds || 120;
				}
			} else {
				// Other question types use the general timer
				timerEnabled = true;
				timerSeconds = gamification.questionTimerSeconds || 30;
			}
		}
		
		// Reset and start question timer when question changes
		if (timerEnabled) {
			setQuestionTimer(timerSeconds);
			
			// Clear existing timer
			if (questionTimerRef.current) {
				clearInterval(questionTimerRef.current);
			}
			
			// Start countdown
			questionTimerRef.current = setInterval(() => {
				// If paused, don't decrement
				if (conversationModalPausedAtRef.current !== null) {
					return;
				}
				
				setQuestionTimer(prev => {
					// If paused, return current value without decrementing
					if (conversationModalPausedAtRef.current !== null) {
						return prev;
					}
					
					const newTime = prev - 1;
					
					// Check if we're in the last 1/3 of time for ticking sound
					if (gamification.tickingSoundEnabled && soundManagerRef.current) {
						const oneThirdTime = Math.ceil(timerSeconds / 3);
						if (newTime <= oneThirdTime && newTime > 0) {
							// Start ticking if not already started
							if (!tickingIntervalRef.current) {
								tickingIntervalRef.current = setInterval(() => {
									if (soundManagerRef.current && !soundsMuted && conversationModalPausedAtRef.current === null) {
										soundManagerRef.current.playTick();
									}
								}, 1000); // Tick once per second
							}
						} else if (newTime > oneThirdTime && tickingIntervalRef.current) {
							// Stop ticking when we're back above 1/3
							clearInterval(tickingIntervalRef.current);
							tickingIntervalRef.current = null;
						}
					}
					
					if (newTime <= 0) {
						// Stop ticking
						if (tickingIntervalRef.current) {
							clearInterval(tickingIntervalRef.current);
							tickingIntervalRef.current = null;
						}
						
						// Time's up - mark as incorrect if no answer was selected
						// Use a functional update to get the latest state
						setQuizResults(currentResults => {
							setAnswerOrder(currentOrder => {
								const currentQuestionIndex = questionIndex;
								const originalIndex = activeOriginalIndices[currentQuestionIndex];
								
								// Only mark as wrong if not already answered
								if (!currentResults.has(originalIndex)) {
									const newResults = new Map(currentResults);
									newResults.set(originalIndex, false);
									
									const newAnswerOrder = [...currentOrder, false];
									setAnswerOrder(newAnswerOrder);
									
									// Play wrong sound
									if (soundManagerRef.current && !soundsMuted) {
										soundManagerRef.current.playWrong();
									}
									
									// Save result
									const results: QuizResult[] = Array.from(newResults.entries()).map(([index, correct]) => ({
										questionIndex: index,
										correct
									}));
									onQuizComplete?.(results, allQuestionHashes, sessionTimestamp);
									
									// Move to next question
									setTimeout(() => {
										setQuestionIndex(currentIdx => {
											if (currentIdx < activeQuestions.length - 1) {
												return currentIdx + 1;
											}
											return currentIdx;
										});
									}, 100);
								}
								
								return currentOrder;
							});
							
							return currentResults;
						});
						
						return 0;
					}
					return newTime;
				});
			}, 1000);
			
			// Don't play audio here - use separate effect below
		} else {
			// No timer enabled, clear it
			setQuestionTimer(0);
			if (questionTimerRef.current) {
				clearInterval(questionTimerRef.current);
				questionTimerRef.current = null;
			}
			if (tickingIntervalRef.current) {
				clearInterval(tickingIntervalRef.current);
				tickingIntervalRef.current = null;
			}
			// Don't play audio here - use separate effect below
		}
		
		return () => {
			if (questionTimerRef.current) {
				clearInterval(questionTimerRef.current);
			}
			if (tickingIntervalRef.current) {
				clearInterval(tickingIntervalRef.current);
				tickingIntervalRef.current = null;
			}
			if (autoProgressRef.current) {
				clearTimeout(autoProgressRef.current);
				autoProgressRef.current = null;
			}
			// Stop audio when question changes
			if (elevenLabsRef.current) {
				elevenLabsRef.current.stopAllAudio();
			}
		};
	}, [questionIndex, activeQuestions.length, gamification.questionTimerEnabled, gamification.questionTimerSeconds, gamification.shortAnswerTimerSeconds, gamification.longAnswerTimerSeconds]);

	// Separate effect to play audio when question changes - only runs when audio is ready
	useEffect(() => {
		// Stop any currently playing audio when question changes
		if (elevenLabsRef.current) {
			elevenLabsRef.current.stopAllAudio();
		}

		// Only play audio if it's been pre-generated
		if (!audioPreGeneratedRef.current) {
			return;
		}

		// Prevent double-play: only play if we haven't already played for this question
		if (audioPlayedForQuestionRef.current === questionIndex) {
			return;
		}

		audioPlayedForQuestionRef.current = questionIndex; // Mark as played
		if (playQuestionAudioRef.current) {
			playQuestionAudioRef.current();
		}
	}, [questionIndex, audioPreGenerated]); // audioPreGenerated as state to trigger when it changes

	const handlePreviousQuestion = () => {
		// Only allow navigation if pagination is enabled
		if (!gamification.paginationEnabled) return;
		
		// Clear auto-progress if navigating manually
		if (autoProgressRef.current) {
			clearTimeout(autoProgressRef.current);
			autoProgressRef.current = null;
		}
		
		const hideResults = settings.showResultsAtEndOnly ?? false;
		
		// If we're on the Score My Quiz page, go back to last question and reset filter
		if (hideResults && questionIndex === activeQuestions.length) {
			setShowUnansweredOnly(false); // Reset filter when going back from score page
			setUnansweredSnapshot(null); // Clear snapshot when exiting unanswered-only mode
			// Get all active questions (not filtered) to determine the last question index
			const allActiveOriginalIndices = quiz.map((q, idx) => ({
				originalIndex: idx,
				hash: allQuestionHashes[idx]
			})).filter(item => {
				if (skipCorrect) {
					const wasCorrect = previousAttempts.get(item.hash);
					return wasCorrect !== true;
				}
				return true;
			}).map(item => item.originalIndex);
			
			const allActiveQuestionsCount = allActiveOriginalIndices.length;
			setQuestionIndex(Math.max(0, allActiveQuestionsCount - 1));
			return;
		}
		
		if (questionIndex > 0) {
			setQuestionIndex(questionIndex - 1);
		}
	};

	const handleNextQuestion = () => {
		// Only allow navigation if pagination is enabled
		if (!gamification.paginationEnabled) return;
		
		// Clear auto-progress if navigating manually
		if (autoProgressRef.current) {
			clearTimeout(autoProgressRef.current);
			autoProgressRef.current = null;
		}
		
		const hideResults = settings.showResultsAtEndOnly ?? false;
		
		// If we're on the last question and hideResults is true, go to "Score My Quiz" page
		// Also reset unanswered filter when reaching the score page
		if (hideResults && questionIndex === activeQuestions.length - 1) {
			setShowUnansweredOnly(false); // Reset filter when going to score page
			setUnansweredSnapshot(null); // Clear snapshot when exiting unanswered-only mode
			setQuestionIndex(questionIndex + 1);
			return;
		}
		
		if (questionIndex < activeQuestions.length - 1) {
			setQuestionIndex(questionIndex + 1);
		}
	};
	
	// Listen for custom auto-progress event from short/long answer questions
	useEffect(() => {
		const handleAutoProgress = () => {
			if (questionIndex < activeQuestions.length - 1) {
				setQuestionIndex(questionIndex + 1);
			}
		};
		
		window.addEventListener('quiz-auto-progress', handleAutoProgress);
		return () => {
			window.removeEventListener('quiz-auto-progress', handleAutoProgress);
		};
	}, [questionIndex, activeQuestions.length]);
	
	// Listen for navigation events from question components (e.g., Enter in review mode)
	useEffect(() => {
		const handleNavigateNext = () => {
			// Only allow navigation if pagination is enabled
			if (!gamification.paginationEnabled) return;
			
			// Clear auto-progress if navigating manually
			if (autoProgressRef.current) {
				clearTimeout(autoProgressRef.current);
				autoProgressRef.current = null;
			}
			
			const hideResults = settings.showResultsAtEndOnly ?? false;
			
			// If we're on the last question and hideResults is true, go to "Score My Quiz" page
			// Also reset unanswered filter when reaching the score page
			if (hideResults && questionIndex === activeQuestions.length - 1) {
				setShowUnansweredOnly(false); // Reset filter when going to score page
				setUnansweredSnapshot(null); // Clear snapshot when exiting unanswered-only mode
				setQuestionIndex(questionIndex + 1);
				return;
			}
			
			if (questionIndex < activeQuestions.length - 1) {
				setQuestionIndex(questionIndex + 1);
			}
		};
		
		window.addEventListener('quiz-navigate-next', handleNavigateNext);
		return () => {
			window.removeEventListener('quiz-navigate-next', handleNavigateNext);
		};
	}, [questionIndex, activeQuestions.length, settings.showResultsAtEndOnly, gamification.paginationEnabled]);

	const handleRequestHint = async () => {
		if (!settings.hintsEnabled) {
			new Notice("Hints are not enabled. Enable them in plugin settings.");
			return;
		}

		const currentQuestion = activeQuestions[questionIndex];
		if (!currentQuestion) return;

		// Check cache first - if cached, allow showing it regardless of max hints limit
		const currentHash = questionHashes[questionIndex];
		const cachedHint = hintCacheRef.current.get(currentHash);
		
		if (cachedHint) {
			// Use cached hint - allowed even if max hints reached
			setCurrentHint(cachedHint);
			new Notice(cachedHint, 10000); // Show for 10 seconds
			return;
		}

		// Only enforce max hints limit when generating a new hint
		const maxHints = settings.gamification?.maxHintsPerQuiz ?? null;
		if (maxHints !== null && hintsUsed >= maxHints) {
			new Notice(`Maximum hints (${maxHints}) reached for this quiz session.`);
			return;
		}

		// Generate new hint
		setGeneratingHint(true);
		try {
			const generator = GeneratorFactory.createInstance(settings);
			
			// Format answer based on question type
			let answer: string | boolean | number | number[] | string[] | Array<{leftOption: string; rightOption: string}>;
			if (isTrueFalse(currentQuestion)) {
				answer = currentQuestion.answer;
			} else if (isMultipleChoice(currentQuestion)) {
				answer = currentQuestion.answer;
			} else if (isSelectAllThatApply(currentQuestion)) {
				answer = currentQuestion.answer;
			} else if (isFillInTheBlank(currentQuestion)) {
				answer = currentQuestion.answer;
			} else if (isMatching(currentQuestion)) {
				answer = currentQuestion.answer;
			} else {
				answer = currentQuestion.answer;
			}

			const hint = await generator.generateHint(currentQuestion.question, answer);
			if (hint) {
				// Cache the hint
				hintCacheRef.current.set(currentHash, hint);
				setCurrentHint(hint);
				setHintsUsed(prev => prev + 1);
				// Show hint in a notice
				new Notice(hint, 10000); // Show for 10 seconds
			} else {
				new Notice("Failed to generate hint. Please try again.");
			}
		} catch (error) {
			console.error("Error generating hint:", error);
			new Notice("Error generating hint. Please try again.");
		} finally {
			setGeneratingHint(false);
		}
	};

	const handleDeleteQuestion = () => {
		if (activeQuestions.length <= 1) {
			new Notice("Cannot delete the last question");
			return;
		}

		// Get the original index of the current question
		const originalIndexToDelete = activeOriginalIndices[questionIndex];
		
		// Remove from quiz
		const newQuiz = quiz.filter((_, index) => index !== originalIndexToDelete);
		setQuiz(newQuiz);
		
		// Adjust questionIndex if needed
		if (questionIndex >= activeQuestions.length - 1) {
			// Deleted the last question, move to previous
			setQuestionIndex(Math.max(0, questionIndex - 1));
		}
		// If deleting from middle, stay on same index (which now shows next question)
		
		new Notice("Question deleted");
	};

	// Calculate scores for all questions (used in review-at-end mode)
	const calculateAllScores = async (): Promise<QuizResult[]> => {
		const results: QuizResult[] = [];
		const hideResults = settings.showResultsAtEndOnly ?? false;
		
		// Get all active questions (not filtered by unanswered filter)
		const allActiveQuestions = quiz.map((q, idx) => ({
			question: q,
			originalIndex: idx,
			hash: allQuestionHashes[idx]
		})).filter(item => {
			if (skipCorrect) {
				const wasCorrect = previousAttempts.get(item.hash);
				return wasCorrect !== true;
			}
			return true;
		});
		
		for (let i = 0; i < allActiveQuestions.length; i++) {
			const { question, originalIndex } = allActiveQuestions[i];
			// Check ref first (immediate) then fall back to state
			const userAnswer = userAnswersRef.current.get(originalIndex) ?? userAnswers.get(originalIndex);
			
			if (userAnswer === undefined) {
				// No answer provided, mark as incorrect
				results.push({ questionIndex: originalIndex, correct: false });
				continue;
			}
			
			let correct = false;
			
			// Calculate correctness based on question type
			if (isTrueFalse(question)) {
				correct = userAnswer === question.answer;
			} else if (isMultipleChoice(question)) {
				// Support both single answer (legacy) and multiple selections
				const userSelections = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
				correct = userSelections.includes(question.answer);
			} else if (isSelectAllThatApply(question)) {
				const userAnswerArray = Array.isArray(userAnswer) ? userAnswer : [];
				const userSet = new Set(userAnswerArray);
				const answerSet = new Set(question.answer);
				correct = userSet.size === answerSet.size && 
					Array.from(userSet).every((val: number) => answerSet.has(val));
			} else if (isFillInTheBlank(question)) {
				const userAnswersArray = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
				correct = question.answer.every((ans, idx) => 
					userAnswersArray[idx]?.toLowerCase().trim() === ans.toLowerCase().trim()
				);
			} else if (isMatching(question)) {
				// For matching, userAnswer is an array of {leftOption, rightOption} pairs
				const userPairs = Array.isArray(userAnswer) ? userAnswer : [];
				const correctPairsMap = new Map<string, string>();
				question.answer.forEach(pair => {
					correctPairsMap.set(pair.leftOption, pair.rightOption);
				});
				correct = userPairs.length === question.answer.length &&
					userPairs.every(pair => correctPairsMap.get(pair.leftOption) === pair.rightOption);
			} else if (isShortOrLongAnswer(question)) {
				// For short/long answer, we need to check similarity
				// This requires async evaluation, so we'll handle it separately
				try {
					const GeneratorFactory = (await import("../../generators/generatorFactory")).default;
					const generator = GeneratorFactory.createInstance(settings);
					const similarity = await generator.shortOrLongAnswerSimilarity(userAnswer.trim(), question.answer);
					correct = similarity >= 0.7; // 70% threshold
				} catch (error) {
					console.error("Error evaluating short/long answer:", error);
					correct = false;
				}
			}
			
			results.push({ questionIndex: originalIndex, correct });
		}
		
		return results;
	};
	
	const handleAnswerResult = (correct: boolean, userAnswer?: any) => {
		const hideResults = settings.showResultsAtEndOnly ?? false;
		
		// Stop any currently playing audio when answer is finalized
		if (elevenLabsRef.current) {
			elevenLabsRef.current.stopAllAudio();
		}
		
		// Stop question timer if active
		if (questionTimerRef.current) {
			clearInterval(questionTimerRef.current);
			questionTimerRef.current = null;
		}
		
		// Stop ticking if active
		if (tickingIntervalRef.current) {
			clearInterval(tickingIntervalRef.current);
			tickingIntervalRef.current = null;
		}
		
		// Clear any existing auto-progress timer
		if (autoProgressRef.current) {
			clearTimeout(autoProgressRef.current);
			autoProgressRef.current = null;
		}
		
		const originalIndex = activeOriginalIndices[questionIndex];
		
		// Store user answer if provided
		if (userAnswer !== undefined) {
			// Store in ref immediately (synchronous) so it's available even if navigation happens before state update
			userAnswersRef.current.set(originalIndex, userAnswer);
			// Also update state (asynchronous)
			setUserAnswers(prev => {
				const newAnswers = new Map(prev);
				newAnswers.set(originalIndex, userAnswer);
				return newAnswers;
			});
		}
		
		if (currentQuestionHash) {
			updateDraftResponse(currentQuestionHash, null);
		}
		
		// In review-at-end mode, don't store correctness or play sounds until scoring
		if (hideResults) {
			// Just mark that this question has been answered (for tracking purposes)
			// But don't store correctness yet
			
			// For fill-in-the-blank and short/long answer questions, navigate to next question after submitting
			// Use setTimeout to ensure state updates are complete before navigating
			const currentQuestion = activeQuestions[questionIndex];
			if (isFillInTheBlank(currentQuestion) || isShortOrLongAnswer(currentQuestion)) {
				setTimeout(() => {
					// Navigate to next question or score page
					if (questionIndex < activeQuestions.length - 1) {
						setQuestionIndex(questionIndex + 1);
					} else if (questionIndex === activeQuestions.length - 1) {
						// Go to score page
						setShowUnansweredOnly(false);
						setUnansweredSnapshot(null); // Clear snapshot when exiting unanswered-only mode
						setQuestionIndex(questionIndex + 1);
					}
				}, 100); // Small delay to ensure answer is saved
			}
			
			return;
		}
		
		// Normal mode: store correctness and play sounds immediately
		// Play sound effect (only if not muted)
		if (soundManagerRef.current && !soundsMuted) {
			if (correct) {
				soundManagerRef.current.playCorrect();
			} else {
				soundManagerRef.current.playWrong();
			}
		}
		
		const newResults = new Map(quizResults);
		newResults.set(originalIndex, correct);
		setQuizResults(newResults);
		
		// Track answer order for streak calculation
		const newAnswerOrder = [...answerOrder, correct];
		setAnswerOrder(newAnswerOrder);
		
		// Update correct streak for gamification
		if (gamification.enabled && gamification.showStreakCounter) {
			const currentStreak = streakTrackerRef.current.getCurrentCorrectStreak(newAnswerOrder);
			const previousStreak = previousCorrectStreakRef.current;
			
			// Play flame ignite sound when streak reaches 5 (flame effect activates)
			if (previousStreak < 5 && currentStreak >= 5) {
				if (soundManagerRef.current && !soundsMuted && gamification.enabled && gamification.enableFlameEffect) {
					soundManagerRef.current.playFlameIgnite();
				}
			}
			
			// Play zap sound for each correct answer when streak is 5 or more
			if (correct && currentStreak >= 5) {
				if (soundManagerRef.current && !soundsMuted) {
					soundManagerRef.current.playZap();
				}
			}
			
			setCorrectStreak(currentStreak);
			previousCorrectStreakRef.current = currentStreak;
		} else if (!correct) {
			// Reset streak tracking when answer is wrong
			previousCorrectStreakRef.current = 0;
		}
		
		// Auto-progress to next question if enabled (forced on when pagination is disabled)
		// But skip auto-progress for short and long answer questions
		// Also skip if we're in review-at-end mode (hideResults) - user should navigate manually
		const currentQuestion = activeQuestions[questionIndex];
		const isShortOrLong = currentQuestion && isShortOrLongAnswer(currentQuestion);
		const shouldAutoProgress = (!gamification.paginationEnabled || gamification.autoProgressEnabled) && !isShortOrLong && !hideResults;
		
		if (shouldAutoProgress && questionIndex < activeQuestions.length - 1) {
			const progressDelay = (gamification.autoProgressSeconds || 3) * 1000;
			autoProgressRef.current = setTimeout(() => {
				setQuestionIndex(questionIndex + 1);
			}, progressDelay);
		}
		
		// Check if quiz is complete
		const allAnswered = newResults.size === activeQuestions.length;
		if (allAnswered && !quizCompleted) {
			setQuizCompleted(true);
			// Stop timer
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}
			if (tickingIntervalRef.current) {
				clearInterval(tickingIntervalRef.current);
				tickingIntervalRef.current = null;
			}
			const finalElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
			setElapsedTime(finalElapsed);
			
			// Show summary modal
			const results: QuizResult[] = Array.from(newResults.entries()).map(([index, correct]) => ({
				questionIndex: index,
				correct
			}));
			const correctCount = results.filter(r => r.correct).length;
			const totalCount = results.length;
			const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
			const passed = accuracy >= 70; // 70% or higher is passing
			
			// Play celebration if passed (only if not muted)
			if (passed && soundManagerRef.current && !soundsMuted) {
				soundManagerRef.current.playCelebration();
				setShowConfetti(true);
				setTimeout(() => setShowConfetti(false), 3000);
			}
			
			// Update streak data
			const streakData = streakTrackerRef.current.updateStreak(totalCount, correctCount);
			
			// Save results
			onQuizComplete?.(results, allQuestionHashes, sessionTimestamp);
			
			// Always show summary modal with results and share functionality
			setTimeout(() => {
				const summaryModal = new QuizSummaryModal(
					app,
					settings,
					results,
					finalElapsed,
					streakData,
					correctStreak,
					() => {
						handleClose();
					},
					undefined, // failureReason
					plugin,
					existingQuizFile,
					quiz,
					userAnswers
				);
				summaryModal.open();
			}, 500);
		} else {
			// Save after each question is answered (using consistent session timestamp)
			// Map results back to original question indices
			const results: QuizResult[] = Array.from(newResults.entries()).map(([index, correct]) => ({
				questionIndex: index,
				correct
			}));
			onQuizComplete?.(results, allQuestionHashes, sessionTimestamp);
		}
	};

	const endQuizAsFailed = useCallback((reason: string) => {
		if (quizCompleted || cheatingDetected) return; // Already ended
		
		setCheatingDetected(true);
		
		// Stop all timers
		if (timerIntervalRef.current) {
			clearInterval(timerIntervalRef.current);
			timerIntervalRef.current = null;
		}
		if (questionTimerRef.current) {
			clearInterval(questionTimerRef.current);
			questionTimerRef.current = null;
		}
		if (tickingIntervalRef.current) {
			clearInterval(tickingIntervalRef.current);
			tickingIntervalRef.current = null;
		}
		if (autoProgressRef.current) {
			clearTimeout(autoProgressRef.current);
			autoProgressRef.current = null;
		}
		if (cursorLeaveTimeoutRef.current) {
			clearTimeout(cursorLeaveTimeoutRef.current);
			cursorLeaveTimeoutRef.current = null;
		}
		if (cursorLeaveCountdownIntervalRef.current) {
			clearInterval(cursorLeaveCountdownIntervalRef.current);
			cursorLeaveCountdownIntervalRef.current = null;
		}
		
		// Mark all remaining questions as incorrect
		const newResults = new Map(quizResults);
		const hashesToClear: string[] = [];
		activeQuestions.forEach((_, index) => {
			const originalIndex = activeOriginalIndices[index];
			if (!newResults.has(originalIndex)) {
				newResults.set(originalIndex, false);
			}
			const hash = questionHashes[index];
			if (hash) {
				hashesToClear.push(hash);
			}
		});
		if (hashesToClear.length > 0) {
			clearDraftResponses(hashesToClear);
		}
		
		setQuizResults(newResults);
		setQuizCompleted(true);
		
		const finalElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
		setElapsedTime(finalElapsed);
		
		// Create results with all questions marked as incorrect
		const results: QuizResult[] = Array.from(newResults.entries()).map(([index, correct]) => ({
			questionIndex: index,
			correct
		}));
		
		const correctCount = results.filter(r => r.correct).length;
		const totalCount = results.length;
		
		// Update streak data
		const streakData = streakTrackerRef.current.updateStreak(totalCount, correctCount);
		
		// Save results
		onQuizComplete?.(results, allQuestionHashes, sessionTimestamp);
		
		// Show summary modal with failure message
		handleClose();

		setTimeout(() => {
			const summaryModal = new QuizSummaryModal(
				app,
				settings,
				results,
				finalElapsed,
				streakData,
				0, // No streak on failure
				() => {},
				reason, // Pass failure reason
				plugin,
				existingQuizFile,
				quiz,
				userAnswers
			);
			summaryModal.open();
		}, 500);
	}, [quizCompleted, cheatingDetected, quizResults, activeQuestions, activeOriginalIndices, allQuestionHashes, sessionTimestamp, onQuizComplete, app, settings, handleClose, streakTrackerRef, clearDraftResponses]);

	// Listen for file rename events to update quiz name in top bar
	useEffect(() => {
		if (!existingQuizFile) return;

		// Initialize the ref with the current file path
		currentQuizFilePathRef.current = existingQuizFile.path;

		const handleRename = (file: TAbstractFile, oldPath: string) => {
			// Check if the renamed file is our quiz file by comparing old path
			// Also ensure it's a TFile instance
			if (file instanceof TFile && oldPath === currentQuizFilePathRef.current) {
				// Update the displayed name and track the new path
				setQuizFileName(file.basename);
				currentQuizFilePathRef.current = file.path;
			}
		};

		// @ts-ignore - Obsidian's vault.on/off types are not perfectly aligned
		app.vault.on('rename', handleRename);

		return () => {
			// @ts-ignore - Obsidian's vault.on/off types are not perfectly aligned
			app.vault.off('rename', handleRename);
		};
	}, [app, existingQuizFile]);

	// No cheating mode: Window focus/blur detection
	useEffect(() => {
		const hideResults = settings.showResultsAtEndOnly ?? false;
		const isScorePage = hideResults && questionIndex === activeQuestions.length;
		
		// Disable no-cheat mode on score page
		if (!gamification.noCheatingMode || quizCompleted || cheatingDetected || isScorePage) return;

		const handleBlur = () => {
			endQuizAsFailed("Window lost focus");
		};

		window.addEventListener('blur', handleBlur);

		return () => {
			window.removeEventListener('blur', handleBlur);
		};
	}, [gamification.noCheatingMode, quizCompleted, cheatingDetected, endQuizAsFailed, settings, questionIndex, activeQuestions.length]);

	// No cheating mode: Cursor tracking
	useEffect(() => {
		const hideResults = settings.showResultsAtEndOnly ?? false;
		const isScorePage = hideResults && questionIndex === activeQuestions.length;
		
		// Disable no-cheat mode on score page
		if (!gamification.noCheatingMode || quizCompleted || cheatingDetected || isScorePage || !modalContainerRef.current) return;

		const modalElement = modalContainerRef.current;
		
		const handleMouseLeave = () => {
			// Start 3 second countdown
			setCursorLeaveCountdown(3);
			
			// Countdown interval
			cursorLeaveCountdownIntervalRef.current = setInterval(() => {
				setCursorLeaveCountdown(prev => {
					if (prev === null || prev <= 1) {
						return null;
					}
					return prev - 1;
				});
			}, 1000);
			
			// Timeout to fail quiz after 3 seconds
			cursorLeaveTimeoutRef.current = setTimeout(() => {
				endQuizAsFailed("Cursor left quiz area");
			}, 3000);
		};

		const handleMouseEnter = () => {
			// Clear countdown and timeout
			if (cursorLeaveTimeoutRef.current) {
				clearTimeout(cursorLeaveTimeoutRef.current);
				cursorLeaveTimeoutRef.current = null;
			}
			if (cursorLeaveCountdownIntervalRef.current) {
				clearInterval(cursorLeaveCountdownIntervalRef.current);
				cursorLeaveCountdownIntervalRef.current = null;
			}
			setCursorLeaveCountdown(null);
		};

		modalElement.addEventListener('mouseleave', handleMouseLeave);
		modalElement.addEventListener('mouseenter', handleMouseEnter);

		return () => {
			modalElement.removeEventListener('mouseleave', handleMouseLeave);
			modalElement.removeEventListener('mouseenter', handleMouseEnter);
			if (cursorLeaveTimeoutRef.current) {
				clearTimeout(cursorLeaveTimeoutRef.current);
			}
			if (cursorLeaveCountdownIntervalRef.current) {
				clearInterval(cursorLeaveCountdownIntervalRef.current);
			}
		};
	}, [gamification.noCheatingMode, quizCompleted, cheatingDetected, endQuizAsFailed, settings, questionIndex, activeQuestions.length]);

	const handleChooseAnswer = () => {
		// Stop any currently playing audio when an answer is selected
		if (elevenLabsRef.current) {
			elevenLabsRef.current.stopAllAudio();
		}
		// Play choose sound when user clicks/selects an answer option (only if not muted)
		if (soundManagerRef.current && !soundsMuted) {
			soundManagerRef.current.playChoose();
		}
	};
	
	const handleToggleSounds = async () => {
		const newValue = !soundsMuted;
		setSoundsMuted(newValue);
		if (plugin) {
			plugin.settings.gamification.soundsMuted = newValue;
			await plugin.saveSettings();
		}
		// Stop all sound effects if muting
		if (newValue && soundManagerRef.current) {
			soundManagerRef.current.stopAllSounds();
		}
		// Update icon
		if (soundMuteButtonRef.current) {
			setIcon(soundMuteButtonRef.current, newValue ? "volume-x" : "volume-2");
		}
	};
	
	const handleToggleVoice = async () => {
		const newValue = !voiceMuted;
		setVoiceMuted(newValue);
		if (plugin) {
			plugin.settings.gamification.voiceMuted = newValue;
			await plugin.saveSettings();
		}
		// Stop all voice audio if muting
		if (newValue && elevenLabsRef.current) {
			elevenLabsRef.current.stopAllAudio();
		}
		// Update icon - show person icon when unmuted, person with slash when muted
		if (voiceMuteButtonRef.current) {
			setIcon(voiceMuteButtonRef.current, newValue ? "user-x" : "user");
		}
	};

	const handleRegenerateQuiz = async () => {
		if (!plugin || !existingQuizFile) {
			new Notice("Cannot regenerate: Quiz file not found");
			return;
		}

		try {
			// Read the quiz file to extract metadata
			const content = await app.vault.read(existingQuizFile);
			const frontmatterInfo = getFrontMatterInfo(content);
			
			if (!frontmatterInfo.exists) {
				new Notice("Cannot regenerate: No metadata found in quiz file");
				return;
			}

			// Parse frontmatter to extract sources and content selection mode
			const fmLines = frontmatterInfo.frontmatter.split('\n');
			let sources: TFile[] = [];
			let savedContentMode: string | undefined = contentSelectionMode;

			// Extract sources from quizMaterialProperty
			// First, check if quizMaterialProperty is configured
			if (settings.quizMaterialProperty) {
				const materialPropertyLine = fmLines.find(line => 
					line.trim().startsWith(`${settings.quizMaterialProperty}:`)
				);
				
				// If quizMaterialProperty is configured but not found in frontmatter, prevent regeneration
				if (!materialPropertyLine) {
					new Notice(`Cannot regenerate: Quiz material property "${settings.quizMaterialProperty}" not found in quiz file frontmatter. Please ensure the quiz file contains this property.`);
					return;
				}
				
				// Extract sources from the property
				// Find all lines that are part of the list (indented with -)
				const materialIndex = fmLines.indexOf(materialPropertyLine);
				for (let i = materialIndex + 1; i < fmLines.length; i++) {
					const line = fmLines[i].trim();
					if (line.startsWith('-')) {
						// Extract link from line - could be:
						// - "[[file path]]" (markdown link)
						// - [[file path]] (markdown link without quotes)
						// - "file path" (plain path in quotes)
						let filePath: string | null = null;
						
						// Try markdown link first
						const markdownLinkMatch = line.match(/\[\[([^\]]+)\]\]/);
						if (markdownLinkMatch) {
							filePath = markdownLinkMatch[1];
						} else {
							// Try quoted path
							const quotedMatch = line.match(/-\s*"([^"]+)"/);
							if (quotedMatch) {
								filePath = quotedMatch[1];
							} else {
								// Try unquoted path after dash
								const unquotedMatch = line.match(/-\s*(.+)/);
								if (unquotedMatch) {
									filePath = unquotedMatch[1].trim();
								}
							}
						}
						
						if (filePath) {
							const file = app.vault.getAbstractFileByPath(filePath);
							if (file instanceof TFile) {
								sources.push(file);
							}
						}
					} else if (line && !line.startsWith('quiz_') && !line.startsWith('---')) {
						// Stop if we hit a non-list, non-quiz property line (but allow --- for frontmatter boundary)
						break;
					}
				}
			}

			// Extract content selection mode
			const contentModeLine = fmLines.find(line => line.trim().startsWith('quiz_content_mode:'));
			if (contentModeLine) {
				const match = contentModeLine.match(/quiz_content_mode:\s*(.+)/);
				if (match) {
					savedContentMode = match[1].trim();
				}
			}

			if (sources.length === 0) {
				new Notice("Cannot regenerate: No source files found in quiz metadata");
				return;
			}

			// Close current quiz
			handleClose();

			// Open SelectorModal with pre-populated sources and content selection mode
			const selectorModal = new SelectorModal(app, plugin, sources, undefined, savedContentMode);
			selectorModal.open();
		} catch (error) {
			new Notice(`Error regenerating quiz: ${error instanceof Error ? error.message : 'Unknown error'}`);
			console.error('Error regenerating quiz:', error);
		}
	};
	
	const handleShowReview = () => {
		const results: QuizResult[] = Array.from(quizResults.entries()).map(([index, correct]) => ({
			questionIndex: index,
			correct
		}));
		const reviewModal = new ReviewModal(app, settings, quiz, results, userAnswers);
		reviewModal.open();
	};

	const handleRepeatQuestion = () => {
		if (gamification.elevenLabsEnabled && elevenLabsRef.current && !voiceMuted) {
			// Stop any currently playing audio first
			elevenLabsRef.current.stopAllAudio();
			
			const currentQuestion = activeQuestions[questionIndex];
			const originalIndex = activeOriginalIndices[questionIndex];
			const questionHash = questionHashes[questionIndex];
			const cacheKey = `q-${originalIndex}-${questionHash}`;
			
			if (audioCacheRef.current.has(cacheKey)) {
				const audio = audioCacheRef.current.get(cacheKey)!.cloneNode(true) as HTMLAudioElement;
				// Track this audio element
				elevenLabsRef.current.trackAudio(audio);
				// Play immediately without delay
				if (!voiceMuted && elevenLabsRef.current) {
					audio.play().catch(err => console.error('[QuizModal] Audio play error on repeat:', err));
				}
			} else {
				// Fallback: generate on demand
				// Replace blank markers with "BLANK" for audio, then clean markdown
				let questionText = currentQuestion.question.replace(/`_+`/g, ' BLANK ');
				questionText = questionText.replace(/[`*_\[\]()]/g, '').trim();
				if (questionText) {
					elevenLabsRef.current.generateAudio(questionText, cacheKey).then(audio => {
						if (audio) {
							audioCacheRef.current.set(cacheKey, audio);
							const cloned = audio.cloneNode(true) as HTMLAudioElement;
							// Track this audio element
							elevenLabsRef.current!.trackAudio(cloned);
							// Play immediately without delay
							if (!voiceMuted && elevenLabsRef.current) {
								cloned.play().catch(err => console.error('[QuizModal] Audio play error on repeat:', err));
							}
						}
					}).catch(err => {
						console.error('[QuizModal] Error generating audio on repeat:', err);
					});
				}
			}
		}
	};

	const renderQuestion = () => {
		const hideResults = settings.showResultsAtEndOnly ?? false;
		
		// Check if we're on the "Score My Quiz" page (only when hideResults is true and we're past the last question)
		const isScorePage = hideResults && questionIndex === activeQuestions.length;
		
		if (isScorePage) {
			// Render "Score My Quiz" page
			// Get all active questions (not filtered by unanswered filter) for counting
			const allActiveQuestionsForCount = quiz.map((q, idx) => ({
				originalIndex: idx,
				hash: allQuestionHashes[idx]
			})).filter(item => {
				if (skipCorrect) {
					const wasCorrect = previousAttempts.get(item.hash);
					return wasCorrect !== true;
				}
				return true;
			});
			
			const allActiveCount = allActiveQuestionsForCount.length;
			const hideResults = settings.showResultsAtEndOnly ?? false;
			const unansweredCount = allActiveQuestionsForCount.filter(item => {
				const question = quiz[item.originalIndex];
				return !isQuestionAnswered(item.originalIndex, question, item.hash, hideResults);
			}).length;
			const hasUnanswered = unansweredCount > 0;
			
			return (
				<div className="question-container-qg" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
					{isScoring ? (
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1em' }}>
							<div className="loading-spinner-qg" style={{ width: '48px', height: '48px', border: '4px solid var(--background-modifier-border)', borderTop: '4px solid var(--text-accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
							<p style={{ color: 'var(--text-normal)', textAlign: 'center', margin: 0 }}>
								Calculating scores...
							</p>
						</div>
					) : (
						<>
							{hasUnanswered && (
								<button
									className="submit-answer-qg"
									style={{ fontSize: '1em', padding: '0.75em 1.5em', marginTop: '2em', marginBottom: '1em', backgroundColor: 'var(--background-modifier-border)', color: 'var(--text-normal)' }}
									onClick={() => {
										// Create snapshot of unanswered questions before entering review mode
										const allActiveOriginalIndices = quiz.map((q, idx) => ({
											originalIndex: idx,
											hash: allQuestionHashes[idx]
										})).filter(item => {
											if (skipCorrect) {
												const wasCorrect = previousAttempts.get(item.hash);
												return wasCorrect !== true;
											}
											return true;
										}).map(item => item.originalIndex);
										
										const hideResults = settings.showResultsAtEndOnly ?? false;
										const unansweredIndices = new Set(
											allActiveOriginalIndices.filter(origIdx => {
												const question = quiz[origIdx];
												const hash = allQuestionHashes[origIdx];
												return !isQuestionAnswered(origIdx, question, hash, hideResults);
											})
										);
										
										setUnansweredSnapshot(unansweredIndices);
										setShowUnansweredOnly(true);
										setQuestionIndex(0); // Reset to first unanswered question
									}}
								>
									Review {unansweredCount} unanswered question{unansweredCount !== 1 ? 's' : ''}
								</button>
							)}
							{hasUnanswered && (
								<p style={{ marginBottom: '1em', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9em' }}>
									{unansweredCount} question{unansweredCount !== 1 ? 's' : ''} left unanswered will be marked as incorrect.
								</p>
							)}
							<button
								className="submit-answer-qg score-quiz-button-qg"
								style={{ fontSize: '1.2em', padding: '1em 2em', marginTop: hasUnanswered ? '0' : '2em' }}
								onClick={async () => {
									if (!isScoring) {
										setIsScoring(true);
										
										try {
											// Calculate all scores
											const results = await calculateAllScores();
											
											// Store results
											const resultsMap = new Map<number, boolean>();
											results.forEach(r => resultsMap.set(r.questionIndex, r.correct));
											setQuizResults(resultsMap);
											
											// Calculate answer order for streak
											const newAnswerOrder = results.map(r => r.correct);
											setAnswerOrder(newAnswerOrder);
											
											// Calculate streak
											let finalStreak = 0;
											if (gamification.enabled && gamification.showStreakCounter) {
												finalStreak = streakTrackerRef.current.getCurrentCorrectStreak(newAnswerOrder);
												setCorrectStreak(finalStreak);
											}
											
											const correctCount = results.filter(r => r.correct).length;
											const totalCount = results.length;
											const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
											const passed = accuracy >= 70;
											
											// Stop timer
											if (timerIntervalRef.current) {
												clearInterval(timerIntervalRef.current);
											}
											if (tickingIntervalRef.current) {
												clearInterval(tickingIntervalRef.current);
												tickingIntervalRef.current = null;
											}
											const finalElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
											setElapsedTime(finalElapsed);
											
											// Play celebration if passed
											if (passed && soundManagerRef.current && !soundsMuted) {
												soundManagerRef.current.playCelebration();
												setShowConfetti(true);
												setTimeout(() => setShowConfetti(false), 3000);
											}
											
											// Update streak data
											const streakData = streakTrackerRef.current.updateStreak(totalCount, correctCount);
											
											// Save results
											onQuizComplete?.(results, allQuestionHashes, sessionTimestamp);
											
											// Show summary modal
											setTimeout(() => {
												const summaryModal = new QuizSummaryModal(
													app,
													settings,
													results,
													finalElapsed,
													streakData,
													finalStreak,
													() => {
														handleClose();
													},
													undefined,
													plugin,
													existingQuizFile,
													quiz,
													userAnswers
												);
												summaryModal.open();
											}, 500);
										} catch (error) {
											console.error("Error calculating scores:", error);
											new Notice("Error calculating scores. Please try again.");
											setIsScoring(false);
										}
									}
								}}
								disabled={isScoring}
							>
								Score My Quiz
							</button>
						</>
					)}
				</div>
			);
		}
		
		const question = activeQuestions[questionIndex];
		const originalIndex = activeOriginalIndices[questionIndex];
		const currentHash = questionHashes[questionIndex];
		// In review-at-end mode, check if user has answered (including draft text for text input questions)
		// In normal mode, check quiz results
		const isAnswered = hideResults 
			? isQuestionAnswered(originalIndex, question, currentHash, hideResults)
			: quizResults.has(originalIndex);
		// Use a unique key that includes the original index and skipCorrect state to force remount when filter changes
		const uniqueKey = `${originalIndex}-${skipCorrect}-${questionIndex}`;
		
		const showRepeat = gamification.elevenLabsEnabled && !voiceMuted;
		const draftValue = currentHash ? draftResponses[currentHash] : undefined;
		// Check ref first (immediate) then fall back to state (may be async)
		const savedUserAnswer = userAnswersRef.current.get(originalIndex) ?? userAnswers.get(originalIndex);
		
		if (isTrueFalse(question)) {
			return <TrueFalseQuestion key={uniqueKey} app={app} question={question} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} hideResults={hideResults} savedUserAnswer={savedUserAnswer} />;
		} else if (isMultipleChoice(question)) {
			return <MultipleChoiceQuestion key={uniqueKey} app={app} question={question} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} hideResults={hideResults} savedUserAnswer={savedUserAnswer} />;
		} else if (isSelectAllThatApply(question)) {
			return <SelectAllThatApplyQuestion key={uniqueKey} app={app} question={question} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} hideResults={hideResults} savedUserAnswer={savedUserAnswer} />;
		} else if (isFillInTheBlank(question)) {
			return (
				<FillInTheBlankQuestion
					key={uniqueKey}
					app={app}
					question={question}
					onAnswer={handleAnswerResult}
					onChoose={handleChooseAnswer}
					answered={isAnswered}
					onRepeat={handleRepeatQuestion}
					showRepeat={showRepeat}
					hideResults={hideResults}
					savedInputs={Array.isArray(draftValue) && (draftValue.length === 0 || typeof draftValue[0] === 'string') ? draftValue as string[] : undefined}
					onDraftChange={(values) => {
						if (currentHash) {
							updateDraftResponse(currentHash, values);
						}
					}}
				/>
			);
		} else if (isMatching(question)) {
			const savedDraftPairs = Array.isArray(draftValue) && draftValue.length > 0 && typeof draftValue[0] === 'object' && 'leftOption' in draftValue[0]
				? draftValue as { leftOption: string, rightOption: string }[]
				: undefined;
			return <MatchingQuestion 
				key={uniqueKey} 
				app={app} 
				question={question} 
				onAnswer={handleAnswerResult} 
				onChoose={handleChooseAnswer} 
				answered={isAnswered} 
				onRepeat={handleRepeatQuestion} 
				showRepeat={showRepeat} 
				hideResults={hideResults} 
				savedUserAnswer={savedUserAnswer}
				onDraftChange={(pairs) => {
					if (currentHash) {
						updateDraftResponse(currentHash, pairs.length > 0 ? pairs : null);
					}
				}}
				savedDraftPairs={savedDraftPairs}
			/>;
		} else if (isShortOrLongAnswer(question)) {
			return (
				<ShortOrLongAnswerQuestion
					key={uniqueKey}
					app={app}
					question={question}
					settings={settings}
					onAnswer={handleAnswerResult}
					onChoose={handleChooseAnswer}
					answered={isAnswered}
					onRepeat={handleRepeatQuestion}
					showRepeat={showRepeat}
					hideResults={hideResults}
					savedInput={typeof draftValue === "string" ? draftValue : ""}
					onDraftChange={(value) => {
						if (currentHash) {
							updateDraftResponse(currentHash, value);
						}
					}}
				/>
			);
		}
	};

	// Format timer display
	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};
	
	// Calculate glow intensity based on streak
	const getStreakGlowIntensity = (streak: number): number => {
		if (streak < 3) return 0;
		if (streak < 5) return 0.5;
		if (streak < 10) return 0.75;
		return 1;
	};
	
	const hideResults = settings.showResultsAtEndOnly ?? false;
	const showFlameEffect = !hideResults && gamification.enabled && gamification.enableFlameEffect && correctStreak >= 5;
	const glowIntensity = !hideResults && gamification.enabled && gamification.showStreakCounter 
		? getStreakGlowIntensity(correctStreak) 
		: 0;

	return (
		<div className="modal-container mod-dim">
			<ConfettiEffect active={showConfetti} duration={3000} />
			<div className="modal-bg" style={{opacity: 0.85}} onClick={handleClose} />
			<div 
				className={`modal modal-qg ${showFlameEffect ? 'flame-effect-qg' : ''} ${gamification.noCheatingMode ? 'no-cheating-mode-qg' : ''}`}
				ref={modalContainerRef}
			>
				{cursorLeaveCountdown !== null && gamification.noCheatingMode && (
					<div className="cursor-leave-countdown-qg">
						<div className="countdown-number-qg">{cursorLeaveCountdown}</div>
						<div className="countdown-message-qg">Return cursor to quiz or quiz will fail!</div>
					</div>
				)}
				<div className="modal-close-button" onClick={handleClose} />
				<div className="modal-header">
					<div className="modal-title modal-title-qg">
						{showWrongBadge ? (
							<span className="wrong-count-badge-qg">Wrong {wrongCountForQuestion}x</span>
						) : showSkipInline ? (
							<label className="skip-inline-toggle-qg">
								<input
									type="checkbox"
									checked={skipCorrect}
									onChange={(e) => {
										setSkipCorrect(e.target.checked);
										setQuestionIndex(0);
									}}
								/>
								<span>Skip questions I've gotten right</span>
							</label>
						) : quizFileName ? (
							<span className="quiz-file-name-qg">{quizFileName}</span>
						) : null}
					</div>
					<div className="quiz-controls-top-right-qg">
						{existingQuizFile && plugin && (
							<button
								ref={regenerateButtonRef}
								className="quiz-mute-btn-qg"
								onClick={(e) => {
									e.stopPropagation();
									handleRegenerateQuiz();
								}}
								title="Re-generate quiz from same sources"
							/>
						)}
						<button
							ref={keyboardIconButtonRef}
							className="quiz-mute-btn-qg keyboard-icon-btn-qg"
							onClick={(e) => {
								e.stopPropagation();
								setShowHotkeyOverlays(!showHotkeyOverlays);
							}}
							title="Show keyboard shortcuts"
						/>
						<button
							ref={soundMuteButtonRef}
							className="quiz-mute-btn-qg"
							onClick={handleToggleSounds}
						/>
					</div>
					{gamification.enabled && (
						<div className="gamification-header-qg">
							{gamification.questionTimerEnabled && questionTimer > 0 && (
								<div className={`question-timer-qg ${questionTimer <= 5 ? 'question-timer-warning-qg' : ''}`}>
									⏰ {questionTimer}s
								</div>
							)}
							{!hideResults && gamification.showStreakCounter && correctStreak > 0 && (
								<div 
									className="streak-counter-qg" 
									style={{
										opacity: 0.7 + (glowIntensity * 0.3),
										boxShadow: glowIntensity > 0 ? `0 0 ${10 + glowIntensity * 20}px rgba(255, 165, 0, ${glowIntensity})` : 'none'
									}}
								>
									🔥 {correctStreak}
								</div>
							)}
							{gamification.showTimer && gamification.showTimerDuringQuiz && (
								<div className="timer-display-qg">
									⏱️ {formatTime(elapsedTime)}
								</div>
							)}
						</div>
					)}
				</div>
				<div className="modal-content modal-content-flex-qg">
					<div className="question-content-wrapper-qg">
						{renderQuestion()}
					</div>
					{gamification.noCheatingMode && (
						<div className="quiz-delete-button-bottom-left-qg">
							<ModalButton
								icon="trash-2"
								tooltip="Delete this question"
								onClick={handleDeleteQuestion}
								disabled={activeQuestions.length <= 1}
							/>
						</div>
					)}
					{settings.hintsEnabled && (() => {
						// Check if there's a cached hint for the current question
						const currentHash = questionHashes[questionIndex];
						const hasCachedHint = hintCacheRef.current.has(currentHash);
						const maxHints = settings.gamification?.maxHintsPerQuiz ?? null;
						const maxHintsReached = maxHints !== null && hintsUsed >= maxHints;
						// Disable only if generating OR (max hints reached AND no cached hint available)
						const isDisabled = generatingHint || (maxHintsReached && !hasCachedHint);
						
						return (
							<div className="quiz-hint-button-bottom-right-qg">
								<button
									ref={hintButtonRef}
									className="quiz-hint-button-qg"
									onClick={handleRequestHint}
									disabled={isDisabled}
									title={generatingHint ? "Generating hint..." : `Hint${maxHints !== null ? ` (${hintsUsed}/${maxHints} used)` : ""}`}
								/>
							</div>
						);
					})()}
					{/* Question counter with pagination */}
					<div className="quiz-question-counter-bottom-qg">
						{gamification.paginationEnabled && (
							<button
								className="quiz-pagination-button-qg"
								onClick={handlePreviousQuestion}
								disabled={hideResults ? questionIndex === 0 : questionIndex === 0}
								title={
									hideResults && questionIndex === activeQuestions.length
										? "Go back to last question"
										: questionIndex === 0
										? "At first question"
										: "Previous question"
								}
							>
								←
							</button>
						)}
						<span className="quiz-counter-text-qg">
							{hideResults && questionIndex === activeQuestions.length ? (
								"Score My Quiz"
							) : (
								<>
									Question {questionIndex + 1} of {activeQuestions.length}
									{skipCorrect && ` (${quiz.length} total)`}
									{showUnansweredOnly && ` (unanswered only)`}
								</>
							)}
						</span>
						{gamification.paginationEnabled && (
							<button
								className="quiz-pagination-button-qg"
								onClick={handleNextQuestion}
								disabled={hideResults ? questionIndex >= activeQuestions.length : questionIndex === activeQuestions.length - 1}
								title={
									hideResults && questionIndex === activeQuestions.length - 1
										? "Go to Score My Quiz"
										: questionIndex === activeQuestions.length - 1
										? "At last question"
										: "Next question"
								}
							>
								→
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default QuizModal;
