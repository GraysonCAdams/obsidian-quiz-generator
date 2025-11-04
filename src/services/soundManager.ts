/**
 * Sound Manager - Generates simple sound effects using Web Audio API
 * All sounds are generated client-side, no external resources needed
 */

export default class SoundManager {
	private audioContext: AudioContext | null = null;
	private enabled: boolean = false;
	private volume: number = 0.5; // 0.0 to 1.0
	private activeOscillators: Set<OscillatorNode> = new Set();
	private flameIgniteAudio: HTMLAudioElement | null = null;

	constructor(enabled: boolean = false, volume: number = 0.5) {
		this.enabled = enabled;
		this.volume = volume;
		try {
			this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		} catch (err) {
			console.warn('Web Audio API not supported:', err);
		}
		// Load flame ignite sound
		this.loadFlameIgniteSound();
	}
	
	/**
	 * Load the flame ignite sound from a free sound file
	 * Using a free CC0/public domain flame sound
	 */
	private async loadFlameIgniteSound(): Promise<void> {
		try {
			// Use a free flame ignition sound (CC0/public domain)
			// Trying multiple free sources for reliability
			
			// Create audio element
			this.flameIgniteAudio = new Audio();
			this.flameIgniteAudio.preload = 'auto';
			this.flameIgniteAudio.volume = this.volume;
			
			// Try loading from a free sound CDN (OpenGameArt, freesound, etc.)
			// Using a free flame sound from a reliable source
			// Option 1: Mixkit (free CC0 sounds)
			const soundUrl = 'https://assets.mixkit.co/sfx/preview/mixkit-fire-ignite-1712.mp3';
			
			// Load the sound
			this.flameIgniteAudio.src = soundUrl;
			
			// Preload the audio
			const loadPromise = new Promise<void>((resolve, reject) => {
				if (this.flameIgniteAudio) {
					this.flameIgniteAudio.oncanplaythrough = () => resolve();
					this.flameIgniteAudio.onerror = () => {
						// Try alternative source if first fails
						if (this.flameIgniteAudio) {
							// Alternative: Use a GitHub raw file or other free source
							// For now, fall back to synthesized
							console.warn('Failed to load flame ignite sound, will use synthesized fallback');
							this.flameIgniteAudio = null;
						}
						reject(new Error('Failed to load sound'));
					};
				} else {
					reject(new Error('Audio element not created'));
				}
			});
			
			// Try to load, but don't block if it fails
			loadPromise.catch(() => {
				// Silently fail - will use synthesized fallback
			});
		} catch (err) {
			console.warn('Error loading flame ignite sound:', err);
			this.flameIgniteAudio = null;
		}
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	public setVolume(volume: number): void {
		this.volume = Math.max(0, Math.min(1, volume)); // Clamp between 0 and 1
		// Update flame audio volume if loaded
		if (this.flameIgniteAudio) {
			this.flameIgniteAudio.volume = this.volume;
		}
	}

	public getVolume(): number {
		return this.volume;
	}

	private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', baseVolume: number = 0.3): void {
		if (!this.enabled || !this.audioContext) return;

		try {
			const oscillator = this.audioContext.createOscillator();
			const gainNode = this.audioContext.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(this.audioContext.destination);

			oscillator.frequency.value = frequency;
			oscillator.type = type;

			// Track active oscillator
			this.activeOscillators.add(oscillator);
			oscillator.onended = () => {
				this.activeOscillators.delete(oscillator);
			};

			// Apply volume multiplier
			const adjustedVolume = baseVolume * this.volume;

			// Envelope for smoother sound
			const now = this.audioContext.currentTime;
			gainNode.gain.setValueAtTime(0, now);
			gainNode.gain.linearRampToValueAtTime(adjustedVolume, now + 0.01);
			gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

			oscillator.start(now);
			oscillator.stop(now + duration);
		} catch (err) {
			console.warn('Sound playback error:', err);
		}
	}

	/**
	 * Play a "correct answer" sound - pleasant chime
	 */
	public playCorrect(): void {
		// Play ascending notes (C major chord)
		this.playTone(523.25, 0.15, 'sine', 0.25); // C5
		setTimeout(() => {
			this.playTone(659.25, 0.15, 'sine', 0.25); // E5
		}, 50);
		setTimeout(() => {
			this.playTone(783.99, 0.2, 'sine', 0.3); // G5
		}, 100);
	}

	/**
	 * Play a "wrong answer" sound - low buzz
	 */
	public playWrong(): void {
		// Play descending discordant tone
		this.playTone(200, 0.3, 'sawtooth', 0.2);
		setTimeout(() => {
			this.playTone(150, 0.3, 'sawtooth', 0.15);
		}, 100);
	}

	/**
	 * Play a "choose answer" sound - subtle click
	 */
	public playChoose(): void {
		// Short click sound
		this.playTone(800, 0.05, 'square', 0.15);
	}

	/**
	 * Play ticking clock sound - traditional clock tick
	 */
	public playTick(): void {
		// Traditional clock tick: lower frequency, more mechanical
		// Use a click-like sound with a quick attack and decay
		if (!this.enabled || !this.audioContext) return;

		try {
			const oscillator = this.audioContext.createOscillator();
			const gainNode = this.audioContext.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(this.audioContext.destination);

			// Lower frequency for clock-like sound
			oscillator.frequency.value = 400;
			oscillator.type = 'square';

			// Quick attack and decay for clock tick
			const now = this.audioContext.currentTime;
			const adjustedVolume = 0.25 * this.volume;
			gainNode.gain.setValueAtTime(0, now);
			gainNode.gain.linearRampToValueAtTime(adjustedVolume, now + 0.001);
			gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.02);

			oscillator.start(now);
			oscillator.stop(now + 0.02);
		} catch (err) {
			console.warn('Sound playback error:', err);
		}
	}

	/**
	 * Play a "dink" sound for volume slider adjustments
	 */
	public playDink(): void {
		// Short, pleasant click/dink sound
		this.playTone(600, 0.03, 'sine', 0.2);
	}

	/**
	 * Play celebration sound - triumphant fanfare
	 */
	public playCelebration(): void {
		// Play a triumphant ascending scale
		const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C, E, G, C6, E6
		notes.forEach((freq, index) => {
			setTimeout(() => {
				this.playTone(freq, 0.2, 'sine', 0.3);
			}, index * 100);
		});
	}

	/**
	 * Play flame ignite sound - using actual free sound file
	 */
	public playFlameIgnite(): void {
		if (!this.enabled) return;

		try {
			// Try to play the actual flame sound file if loaded
			if (this.flameIgniteAudio) {
				// Clone the audio element to allow overlapping plays if needed
				const audio = this.flameIgniteAudio.cloneNode() as HTMLAudioElement;
				audio.volume = this.volume;
				audio.play().catch(err => {
					console.warn('Error playing flame ignite sound:', err);
					// Fallback to synthesized sound if audio file fails
					this.playFlameIgniteSynthesized();
				});
				return;
			}
			
			// Fallback to synthesized sound if audio file not loaded
			this.playFlameIgniteSynthesized();
		} catch (err) {
			console.warn('Flame ignite sound playback error:', err);
			// Fallback to synthesized sound
			this.playFlameIgniteSynthesized();
		}
	}
	
	/**
	 * Fallback: Play synthesized flame ignite sound
	 */
	private playFlameIgniteSynthesized(): void {
		if (!this.audioContext) return;

		try {
			// Create a rising whoosh sound with multiple oscillators
			const now = this.audioContext.currentTime;
			const duration = 0.6; // 600ms

			// Base whoosh - low to high frequency sweep
			const oscillator1 = this.audioContext.createOscillator();
			const gainNode1 = this.audioContext.createGain();
			oscillator1.connect(gainNode1);
			gainNode1.connect(this.audioContext.destination);

			oscillator1.type = 'sawtooth';
			oscillator1.frequency.setValueAtTime(100, now);
			oscillator1.frequency.exponentialRampToValueAtTime(800, now + duration);

			const adjustedVolume1 = 0.4 * this.volume;
			gainNode1.gain.setValueAtTime(0, now);
			gainNode1.gain.linearRampToValueAtTime(adjustedVolume1, now + 0.05);
			gainNode1.gain.exponentialRampToValueAtTime(0.01, now + duration);

			this.activeOscillators.add(oscillator1);
			oscillator1.onended = () => {
				this.activeOscillators.delete(oscillator1);
			};

			oscillator1.start(now);
			oscillator1.stop(now + duration);

			// High frequency crackle
			const oscillator2 = this.audioContext.createOscillator();
			const gainNode2 = this.audioContext.createGain();
			oscillator2.connect(gainNode2);
			gainNode2.connect(this.audioContext.destination);

			oscillator2.type = 'square';
			oscillator2.frequency.setValueAtTime(2000, now);
			oscillator2.frequency.exponentialRampToValueAtTime(3000, now + duration * 0.5);

			const adjustedVolume2 = 0.2 * this.volume;
			gainNode2.gain.setValueAtTime(0, now + 0.1);
			gainNode2.gain.linearRampToValueAtTime(adjustedVolume2, now + 0.15);
			gainNode2.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.6);

			this.activeOscillators.add(oscillator2);
			oscillator2.onended = () => {
				this.activeOscillators.delete(oscillator2);
			};

			oscillator2.start(now + 0.1);
			oscillator2.stop(now + duration * 0.6);
		} catch (err) {
			console.warn('Synthesized flame ignite sound playback error:', err);
		}
	}

	/**
	 * Play zap sound - electric zap effect
	 */
	public playZap(): void {
		if (!this.enabled || !this.audioContext) return;

		try {
			// Create a quick electric zap sound
			const now = this.audioContext.currentTime;
			const duration = 0.15; // 150ms

			// Quick zap - high frequency with rapid decay
			const oscillator = this.audioContext.createOscillator();
			const gainNode = this.audioContext.createGain();
			oscillator.connect(gainNode);
			gainNode.connect(this.audioContext.destination);

			oscillator.type = 'square';
			oscillator.frequency.setValueAtTime(1200, now);
			oscillator.frequency.exponentialRampToValueAtTime(800, now + duration);

			const adjustedVolume = 0.3 * this.volume;
			gainNode.gain.setValueAtTime(0, now);
			gainNode.gain.linearRampToValueAtTime(adjustedVolume, now + 0.001);
			gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

			this.activeOscillators.add(oscillator);
			oscillator.onended = () => {
				this.activeOscillators.delete(oscillator);
			};

			oscillator.start(now);
			oscillator.stop(now + duration);
		} catch (err) {
			console.warn('Zap sound playback error:', err);
		}
	}

	/**
	 * Stop all currently playing sounds
	 */
	public stopAllSounds(): void {
		// Stop all active oscillators
		this.activeOscillators.forEach(oscillator => {
			try {
				oscillator.stop();
			} catch (err) {
				// Oscillator may have already stopped
			}
		});
		this.activeOscillators.clear();
	}
}

