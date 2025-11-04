import { Notice } from "obsidian";
import AudioCache from "./audioCache";

export interface ElevenLabsVoice {
	voice_id: string;
	name: string;
	labels?: {
		accent?: string;
		age?: string;
		gender?: string;
		use_case?: string;
		description?: string;
	};
	category?: string;
}

export default class ElevenLabsService {
	private readonly apiKey: string;
	private readonly voiceId: string;
	private persistentCache: AudioCache;
	private hasFailed: boolean = false; // Track if any request has failed
	private activeAudioElements: Set<HTMLAudioElement> = new Set(); // Track all currently playing audio

	constructor(apiKey: string, voiceId: string) {
		this.apiKey = apiKey;
		this.voiceId = voiceId;
		this.persistentCache = AudioCache.getInstance();
	}

	/**
	 * Generate audio for text using ElevenLabs API
	 * Checks persistent cache first to avoid spending credits
	 */
	public async generateAudio(text: string, cacheKey: string): Promise<HTMLAudioElement | null> {
		// Check persistent cache first - if cached, use it without API call
		const cached = this.persistentCache.get(cacheKey);
		if (cached) {
			console.log(`[ElevenLabs] Using cached audio for ${cacheKey} (no credits spent)`);
			return cached;
		}

		// Stop making requests if a previous request has failed
		if (this.hasFailed) {
			console.log(`[ElevenLabs] Skipping request for ${cacheKey} - previous request failed`);
			return null;
		}

		if (!this.apiKey || !this.voiceId) {
			return null;
		}

		try {
			console.log(`[ElevenLabs] Generating audio for cache key: ${cacheKey}`);
			console.log(`[ElevenLabs] Text length: ${text.length} characters`);
			console.log(`[ElevenLabs] Voice ID: ${this.voiceId}`);
			
			const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
				method: 'POST',
				headers: {
					'Accept': 'audio/mpeg',
					'Content-Type': 'application/json',
					'xi-api-key': this.apiKey
				},
				body: JSON.stringify({
					text: text,
					model_id: 'eleven_turbo_v2_5', // Cheapest model (0.5 credits per character)
					voice_settings: {
						stability: 0.5,
						similarity_boost: 0.75
					}
				})
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unknown error');
				console.error(`[ElevenLabs] API error ${response.status}:`, errorText);
				// Mark as failed to stop future requests
				this.hasFailed = true;
				throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
			}

			const audioBlob = await response.blob();
			console.log(`[ElevenLabs] Audio blob size: ${audioBlob.size} bytes`);
			const audioUrl = URL.createObjectURL(audioBlob);
			const audio = new Audio(audioUrl);
			
			// Store in persistent cache (saves credits on future quizzes)
			this.persistentCache.set(cacheKey, audio);
			console.log(`[ElevenLabs] Audio cached in persistent cache for: ${cacheKey}`);
			
			// Clone for return to allow multiple plays
			const clone = audio.cloneNode(true) as HTMLAudioElement;
			clone.src = audioUrl;
			
			return clone;
		} catch (error) {
			console.error('[ElevenLabs] Audio generation error:', error);
			console.error('[ElevenLabs] Error details:', {
				cacheKey,
				textLength: text.length,
				voiceId: this.voiceId,
				hasApiKey: !!this.apiKey,
				errorMessage: error instanceof Error ? error.message : String(error)
			});
			// Mark as failed to stop future requests
			this.hasFailed = true;
			new Notice(`Failed to generate audio: ${error instanceof Error ? error.message : 'Unknown error'}. Stopping further requests.`);
			return null;
		}
	}

	/**
	 * Play audio for a question (with 1 second delay)
	 */
	public async playQuestionAudio(text: string, cacheKey: string): Promise<void> {
		const audio = await this.generateAudio(text, cacheKey);
		if (audio) {
			console.log(`[ElevenLabs] Playing audio for: ${cacheKey} (with 1s delay)`);
			// Track this audio element
			this.trackAudio(audio);
			// Wait 1 second before playing
			setTimeout(() => {
				audio.play().catch(err => {
					console.error('[ElevenLabs] Audio play error:', err);
					console.error('[ElevenLabs] Play error details:', {
						cacheKey,
						audioSrc: audio.src,
						errorMessage: err.message
					});
					this.activeAudioElements.delete(audio);
				});
			}, 1000);
		} else {
			console.warn(`[ElevenLabs] No audio available to play for: ${cacheKey}`);
		}
	}
	
	/**
	 * Pre-generate audio for all questions with progress callback
	 * Only generates audio that's not already in cache (saves credits)
	 */
	public async pregenerateAudioForQuestions(
		questions: Array<{ text: string; cacheKey: string }>,
		onProgress?: (current: number, total: number, cached: number) => void
	): Promise<Map<string, HTMLAudioElement>> {
		console.log(`[ElevenLabs] Pre-generating audio for ${questions.length} questions`);
		
		// Check which questions are already cached
		const cachedKeys = this.persistentCache.getCachedKeys(questions);
		const questionsToGenerate = questions.filter(q => !cachedKeys.has(q.cacheKey));
		
		console.log(`[ElevenLabs] ${cachedKeys.size} questions already cached, ${questionsToGenerate.length} need generation`);
		
		const results = new Map<string, HTMLAudioElement>();
		
		// Add cached audio to results
		cachedKeys.forEach(cacheKey => {
			const audio = this.persistentCache.get(cacheKey);
			if (audio) {
				results.set(cacheKey, audio);
			}
		});
		
		// Generate audio for questions not in cache
		for (let i = 0; i < questionsToGenerate.length; i++) {
			// Stop if a previous request has failed
			if (this.hasFailed) {
				console.log(`[ElevenLabs] Stopping pre-generation after ${i} attempts due to previous failure`);
				break;
			}
			
			const { text, cacheKey } = questionsToGenerate[i];
			try {
				console.log(`[ElevenLabs] Generating audio ${i + 1}/${questionsToGenerate.length}: ${cacheKey}`);
				const audio = await this.generateAudio(text, cacheKey);
				if (audio) {
					results.set(cacheKey, audio);
				} else {
					console.warn(`[ElevenLabs] Failed to generate audio for: ${cacheKey}`);
					// If generateAudio returned null and hasFailed is true, break out of loop
					if (this.hasFailed) {
						console.log(`[ElevenLabs] Stopping pre-generation due to failure`);
						break;
					}
				}
				
				// Report progress
				if (onProgress) {
					onProgress(i + 1, questionsToGenerate.length, cachedKeys.size);
				}
			} catch (error) {
				console.error(`[ElevenLabs] Error generating audio for ${cacheKey}:`, error);
				// hasFailed will be set in generateAudio, so break out of loop
				break;
			}
		}
		
		console.log(`[ElevenLabs] Pre-generation complete: ${results.size}/${questions.length} total (${cachedKeys.size} cached, ${results.size - cachedKeys.size} generated)`);
		return results;
	}

	/**
	 * Track an audio element for stopping
	 */
	public trackAudio(audio: HTMLAudioElement): void {
		console.log('[ElevenLabs] Tracking new audio element', {
			audioSrc: audio.src.substring(0, 50),
			currentActiveCount: this.activeAudioElements.size,
			audioReadyState: audio.readyState
		});
		this.activeAudioElements.add(audio);
		console.log('[ElevenLabs] Active audio count after add:', this.activeAudioElements.size);
		
		audio.addEventListener('ended', () => {
			console.log('[ElevenLabs] Audio ended, removing from tracking');
			this.activeAudioElements.delete(audio);
			console.log('[ElevenLabs] Active audio count after ended:', this.activeAudioElements.size);
		});
		audio.addEventListener('error', (e) => {
			console.error('[ElevenLabs] Audio error, removing from tracking:', e);
			this.activeAudioElements.delete(audio);
			console.log('[ElevenLabs] Active audio count after error:', this.activeAudioElements.size);
		});
		audio.addEventListener('play', () => {
			console.log('[ElevenLabs] Audio play event fired');
		});
		audio.addEventListener('pause', () => {
			console.log('[ElevenLabs] Audio pause event fired');
		});
	}

	/**
	 * Stop all currently playing audio
	 */
	public stopAllAudio(): void {
		console.log('[ElevenLabs] stopAllAudio called, stopping', this.activeAudioElements.size, 'audio elements');
		let index = 0;
		this.activeAudioElements.forEach((audio) => {
			try {
				index++;
				console.log(`[ElevenLabs] Stopping audio ${index}/${this.activeAudioElements.size}`, {
					paused: audio.paused,
					currentTime: audio.currentTime,
					readyState: audio.readyState
				});
				audio.pause();
				audio.currentTime = 0;
			} catch (err) {
				console.warn('[ElevenLabs] Error stopping audio:', err);
			}
		});
		this.activeAudioElements.clear();
		console.log('[ElevenLabs] All audio stopped, active count:', this.activeAudioElements.size);
	}

	/**
	 * Clear audio cache (only clears local state, not persistent cache)
	 */
	public clearCache(): void {
		// Stop all playing audio first
		this.stopAllAudio();
		// Reset failure flag when clearing cache
		this.hasFailed = false;
		// Note: We don't clear persistent cache here - it's managed by AudioCache singleton
	}

	/**
	 * Get user's subscription information (requires API key)
	 */
	public async getSubscription(): Promise<{ tier?: string; plan?: string; remaining_credits?: number } | null> {
		if (!this.apiKey) {
			console.warn('[ElevenLabs] No API key provided for subscription check');
			return null;
		}

		try {
			const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
				headers: {
					'xi-api-key': this.apiKey
				}
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unknown error');
				console.error(`[ElevenLabs] Subscription check failed: ${response.status} - ${errorText}`);
				return null;
			}

			const data = await response.json();
			return {
				tier: data.tier,
				plan: data.plan,
				remaining_credits: data.remaining_credits ?? data.character_count ?? null
			};
		} catch (error) {
			console.error('[ElevenLabs] Failed to fetch subscription:', error);
			return null;
		}
	}

	/**
	 * Get user's remaining credits (requires API key)
	 */
	public async getRemainingCredits(): Promise<number | null> {
		const subscription = await this.getSubscription();
		return subscription?.remaining_credits ?? null;
	}

	/**
	 * Calculate credit cost for text (Turbo v2.5 = 0.5 credits per character)
	 */
	public calculateCreditCost(text: string): number {
		// Turbo v2.5 model costs 0.5 credits per character
		return Math.ceil(text.length * 0.5);
	}

	/**
	 * Get available voices (requires API key)
	 * The API automatically filters voices based on the user's subscription plan,
	 * so only voices available to the current plan are returned
	 */
	public async getVoices(): Promise<ElevenLabsVoice[]> {
		if (!this.apiKey) {
			return [];
		}

		try {
			const response = await fetch('https://api.elevenlabs.io/v1/voices', {
				headers: {
					'xi-api-key': this.apiKey
				}
			});

			if (!response.ok) {
				throw new Error(`ElevenLabs API error: ${response.status}`);
			}

			const data = await response.json();
			// The API already filters voices based on the user's subscription plan
			// Only voices available to the current plan are returned
			const voices: ElevenLabsVoice[] = data.voices || [];
			
			// Sort voices by suitability for quiz/questionnaire narration
			// Priority: clear, neutral, professional voices first
			voices.sort((a, b) => {
				// Prioritize voices with "narration" or "educational" use cases
				const aUseCase = a.labels?.use_case?.toLowerCase() || '';
				const bUseCase = b.labels?.use_case?.toLowerCase() || '';
				const aNarration = aUseCase.includes('narration') || aUseCase.includes('educational');
				const bNarration = bUseCase.includes('narration') || bUseCase.includes('educational');
				
				if (aNarration && !bNarration) return -1;
				if (!aNarration && bNarration) return 1;
				
				// Then prioritize neutral/adult voices
				const aAge = a.labels?.age?.toLowerCase() || '';
				const bAge = b.labels?.age?.toLowerCase() || '';
				const aAdult = aAge.includes('adult') || aAge.includes('middle');
				const bAdult = bAge.includes('adult') || bAge.includes('middle');
				
				if (aAdult && !bAdult) return -1;
				if (!aAdult && bAdult) return 1;
				
				// Finally, sort alphabetically by name
				return a.name.localeCompare(b.name);
			});
			
			return voices;
		} catch (error) {
			console.error('Failed to fetch ElevenLabs voices:', error);
			return [];
		}
	}
}

