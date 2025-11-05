import { App, Notice, setIcon, setTooltip, TFile, getFrontMatterInfo } from "obsidian";
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
	const [correctStreak, setCorrectStreak] = useState<number>(0);
	const [elapsedTime, setElapsedTime] = useState<number>(0);
	const [questionTimer, setQuestionTimer] = useState<number>(0);
	const [quizCompleted, setQuizCompleted] = useState<boolean>(false);
	const [showConfetti, setShowConfetti] = useState<boolean>(false);
	const [soundsMuted, setSoundsMuted] = useState<boolean>(settings.gamification?.soundsMuted ?? false);
	const [voiceMuted, setVoiceMuted] = useState<boolean>(settings.gamification?.voiceMuted ?? false);
	const [audioPreGenerated, setAudioPreGenerated] = useState<boolean>(false);
	const [showHotkeyOverlays, setShowHotkeyOverlays] = useState<boolean>(false);
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
	
	// Generate hashes for all questions - memoized to prevent recalculation
	const allQuestionHashes = useMemo(() => quiz.map(q => hashString(JSON.stringify(q))), [quiz]);
	
	// Filter questions based on skipCorrect setting - memoized to prevent infinite loops
	const filteredQuizData = useMemo(() => {
		return quiz.map((q, index) => ({
			question: q,
			originalIndex: index,
			hash: allQuestionHashes[index]
		})).filter(item => {
			if (!skipCorrect) return true;
			const wasCorrect = previousAttempts.get(item.hash);
			return wasCorrect !== true; // Include if never attempted or was incorrect
		});
	}, [quiz, skipCorrect, previousAttempts, allQuestionHashes]);
	
	const activeQuestions = useMemo(() => filteredQuizData.map(item => item.question), [filteredQuizData]);
	const activeOriginalIndices = useMemo(() => filteredQuizData.map(item => item.originalIndex), [filteredQuizData]);
	const questionHashes = useMemo(() => filteredQuizData.map(item => item.hash), [filteredQuizData]);
	
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
				if (event.key === 'ArrowLeft' || key === 'k') {
					event.preventDefault();
					// Go to previous question
					if (questionIndex > 0) {
						handlePreviousQuestion();
					}
					return;
				}
				
				if (event.key === 'ArrowRight' || key === 'j') {
					event.preventDefault();
					// Go to next question
					if (questionIndex < activeQuestions.length - 1) {
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
				if (isMultipleChoice(currentQuestion) || isTrueFalse(currentQuestion) || isSelectAllThatApply(currentQuestion)) {
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
			console.log('[QuizModal] playQuestionAudio called', {
				questionIndex,
				elevenLabsEnabled: gamification.elevenLabsEnabled,
				hasService: !!elevenLabsRef.current,
				voiceMuted,
				audioPreGenerated: audioPreGeneratedRef.current
			});

			if (!gamification.elevenLabsEnabled || !elevenLabsRef.current || voiceMuted) {
				console.log('[QuizModal] playQuestionAudio early return - disabled or muted');
				return;
			}

			// Don't play audio if not pre-generated yet (waiting for credit check)
			if (!audioPreGeneratedRef.current) {
				console.log('[QuizModal] playQuestionAudio early return - audio not pre-generated yet');
				return;
			}

			// Stop any currently playing audio first
			console.log('[QuizModal] Stopping all audio before playing new question');
			elevenLabsRef.current.stopAllAudio();

			const currentQuestion = activeQuestions[questionIndex];
			const originalIndex = activeOriginalIndices[questionIndex];
			const questionHash = questionHashes[questionIndex];
			const cacheKey = `q-${originalIndex}-${questionHash}`;

			console.log('[QuizModal] Attempting to play audio', {
				cacheKey,
				hasCached: audioCacheRef.current.has(cacheKey),
				originalIndex,
				questionHash
			});

			if (audioCacheRef.current.has(cacheKey)) {
				const audio = audioCacheRef.current.get(cacheKey)!.cloneNode(true) as HTMLAudioElement;
				console.log('[QuizModal] Using cached audio, cloning and tracking');
				// Track this audio element
				elevenLabsRef.current.trackAudio(audio);
				// Wait 1 second before playing
				setTimeout(() => {
					if (!voiceMuted && elevenLabsRef.current) {
						console.log('[QuizModal] Playing cloned audio after 1s delay');
						audio.play().then(() => {
							console.log('[QuizModal] Audio play started successfully');
						}).catch(err => {
							console.error('[QuizModal] Audio play error:', err);
						});
					} else {
						console.log('[QuizModal] Audio play skipped - voice muted or service unavailable');
					}
				}, 1000);
			} else {
				console.log('[QuizModal] Audio not in cache, generating on demand');
				// Fallback: generate on demand if pre-generation failed
				// Replace blank markers with "BLANK" for audio, then clean markdown
				let questionText = currentQuestion.question.replace(/`_+`/g, ' BLANK ');
				questionText = questionText.replace(/[`*_\[\]()]/g, '').trim();
				if (questionText) {
					elevenLabsRef.current.generateAudio(questionText, cacheKey).then(audio => {
						if (audio && !voiceMuted) {
							console.log('[QuizModal] Generated audio on demand, caching and playing');
							audioCacheRef.current.set(cacheKey, audio);
							const cloned = audio.cloneNode(true) as HTMLAudioElement;
							// Track this audio element
							elevenLabsRef.current!.trackAudio(cloned);
							// Wait 1 second before playing
							setTimeout(() => {
								if (!voiceMuted && elevenLabsRef.current) {
									console.log('[QuizModal] Playing on-demand generated audio');
									cloned.play().then(() => {
										console.log('[QuizModal] On-demand audio play started successfully');
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
			console.log('[QuizModal] Question timer useEffect cleanup', {
				questionIndex,
				clearingIntervals: true
			});
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
				console.log('[QuizModal] Stopping audio during cleanup');
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
			console.log('[QuizModal] Audio playback effect skipped - audio not pre-generated yet');
			return;
		}

		// Prevent double-play: only play if we haven't already played for this question
		if (audioPlayedForQuestionRef.current === questionIndex) {
			console.log('[QuizModal] Audio playback effect skipped - already played for question', questionIndex);
			return;
		}

		console.log('[QuizModal] Audio playback effect - question changed, playing audio');
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

	const handleAnswerResult = (correct: boolean) => {
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
		
		// Play sound effect (only if not muted)
		if (soundManagerRef.current && !soundsMuted) {
			if (correct) {
				soundManagerRef.current.playCorrect();
			} else {
				soundManagerRef.current.playWrong();
			}
		}
		
		const newResults = new Map(quizResults);
		const originalIndex = activeOriginalIndices[questionIndex];
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
		const currentQuestion = activeQuestions[questionIndex];
		const isShortOrLong = currentQuestion && isShortOrLongAnswer(currentQuestion);
		const shouldAutoProgress = (!gamification.paginationEnabled || gamification.autoProgressEnabled) && !isShortOrLong;
		
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
					}
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
		const question = activeQuestions[questionIndex];
		const originalIndex = activeOriginalIndices[questionIndex];
		const isAnswered = quizResults.has(originalIndex);
		// Use a unique key that includes the original index and skipCorrect state to force remount when filter changes
		const uniqueKey = `${originalIndex}-${skipCorrect}-${questionIndex}`;
		
		const showRepeat = gamification.elevenLabsEnabled && !voiceMuted;
		
		if (isTrueFalse(question)) {
			return <TrueFalseQuestion key={uniqueKey} app={app} question={question} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} />;
		} else if (isMultipleChoice(question)) {
			return <MultipleChoiceQuestion key={uniqueKey} app={app} question={question} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} />;
		} else if (isSelectAllThatApply(question)) {
			return <SelectAllThatApplyQuestion key={uniqueKey} app={app} question={question} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} />;
		} else if (isFillInTheBlank(question)) {
			return <FillInTheBlankQuestion key={uniqueKey} app={app} question={question} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} />;
		} else if (isMatching(question)) {
			return <MatchingQuestion key={uniqueKey} app={app} question={question} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} />;
		} else if (isShortOrLongAnswer(question)) {
			return <ShortOrLongAnswerQuestion key={uniqueKey} app={app} question={question} settings={settings} onAnswer={handleAnswerResult} onChoose={handleChooseAnswer} answered={isAnswered} onRepeat={handleRepeatQuestion} showRepeat={showRepeat} />;
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
	
	const showFlameEffect = gamification.enabled && gamification.enableFlameEffect && correctStreak >= 5;
	const glowIntensity = gamification.enabled && gamification.showStreakCounter 
		? getStreakGlowIntensity(correctStreak) 
		: 0;

	return (
		<div className="modal-container mod-dim">
			<ConfettiEffect active={showConfetti} duration={3000} />
			<div className="modal-bg" style={{opacity: 0.85}} onClick={handleClose} />
			<div 
				className={`modal modal-qg ${showFlameEffect ? 'flame-effect-qg' : ''}`}
				ref={modalContainerRef}
			>
				<div className="modal-close-button" onClick={handleClose} />
				<div className="modal-header">
					<div className="modal-title modal-title-qg">
						Question {questionIndex + 1} of {activeQuestions.length}
						{skipCorrect && ` (${quiz.length} total)`}
						{(() => {
							const currentHash = questionHashes[questionIndex];
							const wrongCount = questionWrongCounts?.get(currentHash);
							return wrongCount !== undefined && wrongCount > 0 ? (
								<span className="wrong-count-badge-qg">Wrong {wrongCount}x</span>
							) : null;
						})()}
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
						{gamification.elevenLabsEnabled && (
							<button
								ref={voiceMuteButtonRef}
								className="quiz-mute-btn-qg"
								onClick={handleToggleVoice}
							/>
						)}
					</div>
					{gamification.enabled && (
						<div className="gamification-header-qg">
							{gamification.questionTimerEnabled && questionTimer > 0 && (
								<div className={`question-timer-qg ${questionTimer <= 5 ? 'question-timer-warning-qg' : ''}`}>
									⏰ {questionTimer}s
								</div>
							)}
							{gamification.showStreakCounter && correctStreak > 0 && (
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
					{hasBeenTaken && (
						<div className="skip-correct-container-qg">
							<label className="skip-correct-label-qg">
								<input
									type="checkbox"
									checked={skipCorrect}
									onChange={(e) => {
										setSkipCorrect(e.target.checked);
										setQuestionIndex(0); // Reset to first question when toggling
									}}
								/>
								<span>Skip questions I've gotten right</span>
							</label>
						</div>
					)}
					<div className="question-content-wrapper-qg">
						{renderQuestion()}
					</div>
					<div className="modal-button-container-qg">
						{gamification.paginationEnabled && (
						<ModalButton
							icon="arrow-left"
							tooltip="Back"
							onClick={handlePreviousQuestion}
							disabled={questionIndex === 0}
						/>
						)}
						<ModalButton
							icon="trash-2"
							tooltip="Delete this question"
							onClick={handleDeleteQuestion}
							disabled={activeQuestions.length <= 1}
						/>
						<ModalButton
							icon="message-square"
							tooltip="Conversation Mode - ChatGPT"
							onClick={() => {
								// @ts-ignore - Access plugin instance
								const plugin = app.plugins.plugins["obsidian-quiz-generator"];
								const modal = new ConversationModeModal(app, activeQuestions, settings, plugin);
								
								// Pause timers when modal opens
								conversationModalPausedAtRef.current = Date.now();
								
								// Override modal's onClose to resume timers
								const originalOnClose = modal.onClose;
								modal.onClose = () => {
									// Resume timers
									if (conversationModalPausedAtRef.current !== null) {
										const pausedDuration = Date.now() - conversationModalPausedAtRef.current;
										conversationModalPausedTimeRef.current += pausedDuration;
										
										// Question timer doesn't need adjustment since we prevent decrementing when paused
										// It will continue from where it left off automatically
										
										conversationModalPausedAtRef.current = null;
									}
									
									// Call original onClose
									originalOnClose.call(modal);
								};
								
								modal.open();
							}}
						/>
						{gamification.paginationEnabled && (
						<ModalButton
							icon="arrow-right"
							tooltip="Next"
							onClick={handleNextQuestion}
								disabled={questionIndex === activeQuestions.length - 1}
						/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default QuizModal;
