/**
 * Persistent audio cache service for ElevenLabs audio
 * Caches audio in memory to avoid re-generating and spending credits
 * Cache persists across quiz sessions until Obsidian is closed or plugin is disabled
 */

export default class AudioCache {
	private static instance: AudioCache | null = null;
	private cache: Map<string, HTMLAudioElement> = new Map();

	private constructor() {
		// Private constructor for singleton pattern
	}

	public static getInstance(): AudioCache {
		if (!AudioCache.instance) {
			AudioCache.instance = new AudioCache();
		}
		return AudioCache.instance;
	}

	/**
	 * Get audio from cache by key
	 */
	public get(cacheKey: string): HTMLAudioElement | null {
		if (this.cache.has(cacheKey)) {
			const cached = this.cache.get(cacheKey)!;
			// Clone the audio element to allow multiple plays
			const clone = cached.cloneNode(true) as HTMLAudioElement;
			return clone;
		}
		return null;
	}

	/**
	 * Check if audio exists in cache
	 */
	public has(cacheKey: string): boolean {
		return this.cache.has(cacheKey);
	}

	/**
	 * Store audio in cache
	 */
	public set(cacheKey: string, audio: HTMLAudioElement): void {
		this.cache.set(cacheKey, audio);
		console.log(`[AudioCache] Cached audio for: ${cacheKey} (total cached: ${this.cache.size})`);
	}

	/**
	 * Get all cached keys for a set of questions
	 */
	public getCachedKeys(questions: Array<{ cacheKey: string }>): Set<string> {
		const cached = new Set<string>();
		questions.forEach(q => {
			if (this.has(q.cacheKey)) {
				cached.add(q.cacheKey);
			}
		});
		return cached;
	}

	/**
	 * Clear all cached audio
	 */
	public clear(): void {
		console.log(`[AudioCache] Clearing ${this.cache.size} cached audio elements`);
		// Revoke all object URLs to free memory
		this.cache.forEach(audio => {
			if (audio.src.startsWith('blob:')) {
				URL.revokeObjectURL(audio.src);
			}
		});
		this.cache.clear();
		console.log('[AudioCache] Cache cleared');
	}

	/**
	 * Get cache statistics
	 */
	public getStats(): { size: number; keys: string[] } {
		return {
			size: this.cache.size,
			keys: Array.from(this.cache.keys())
		};
	}
}

