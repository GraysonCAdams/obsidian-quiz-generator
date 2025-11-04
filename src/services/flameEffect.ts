/**
 * Realistic flame effect using canvas-based particle system
 */

interface FlameParticle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	maxLife: number;
	size: number;
	baseSize: number;
	opacity: number;
}

export class FlameEffect {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private particles: FlameParticle[] = [];
	private animationFrameId: number | null = null;
	private isActive: boolean = false;
	private modalElement: HTMLElement | null = null;
	private borderThickness: number = 30;
	private particleDensity: number = 2; // Particles per 10px of border
	
	constructor(container: HTMLElement) {
		this.modalElement = container;
		this.canvas = document.createElement('canvas');
		this.canvas.className = 'flame-canvas-qg';
		this.canvas.style.position = 'absolute';
		this.canvas.style.top = '0';
		this.canvas.style.left = '0';
		this.canvas.style.pointerEvents = 'none';
		this.canvas.style.zIndex = '-1';
		
		const ctx = this.canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Failed to get canvas context');
		}
		this.ctx = ctx;
		
		// Insert canvas before the modal content
		container.insertBefore(this.canvas, container.firstChild);
		
		this.updateCanvasSize();
		window.addEventListener('resize', () => this.updateCanvasSize());
	}
	
	private updateCanvasSize(): void {
		if (!this.modalElement) return;
		
		const rect = this.modalElement.getBoundingClientRect();
		const padding = this.borderThickness * 2;
		
		this.canvas.width = rect.width + padding;
		this.canvas.height = rect.height + padding;
		this.canvas.style.width = `${this.canvas.width}px`;
		this.canvas.style.height = `${this.canvas.height}px`;
		this.canvas.style.top = `${-this.borderThickness}px`;
		this.canvas.style.left = `${-this.borderThickness}px`;
		
		// Reinitialize particles when size changes
		if (this.isActive) {
			this.initParticles();
		}
	}
	
	private initParticles(): void {
		if (!this.modalElement) return;
		
		this.particles = [];
		const rect = this.modalElement.getBoundingClientRect();
		const width = rect.width;
		const height = rect.height;
		
		// Calculate border length
		const borderLength = (width + height) * 2;
		const totalParticles = Math.floor((borderLength / 10) * this.particleDensity);
		
		// Top edge
		for (let i = 0; i < totalParticles / 4; i++) {
			const x = (width / (totalParticles / 4)) * i;
			this.addParticle(x, 0, Math.PI); // Upward direction
		}
		
		// Right edge
		for (let i = 0; i < totalParticles / 4; i++) {
			const y = (height / (totalParticles / 4)) * i;
			this.addParticle(width, y, -Math.PI / 2); // Leftward direction
		}
		
		// Bottom edge
		for (let i = 0; i < totalParticles / 4; i++) {
			const x = width - ((width / (totalParticles / 4)) * i);
			this.addParticle(x, height, 0); // Downward direction
		}
		
		// Left edge
		for (let i = 0; i < totalParticles / 4; i++) {
			const y = height - ((height / (totalParticles / 4)) * i);
			this.addParticle(0, y, Math.PI / 2); // Rightward direction
		}
	}
	
	private addParticle(x: number, y: number, baseAngle: number): void {
		// Add slight randomness to position
		const jitterX = (Math.random() - 0.5) * 4;
		const jitterY = (Math.random() - 0.5) * 4;
		
		// Random angle variation (±30 degrees)
		const angleVariation = (Math.random() - 0.5) * (Math.PI / 3);
		const angle = baseAngle + angleVariation;
		
		// Random velocity
		const speed = 0.5 + Math.random() * 1.5;
		const vx = Math.cos(angle) * speed;
		const vy = Math.sin(angle) * speed;
		
		// Random size and life
		const baseSize = 3 + Math.random() * 5;
		const maxLife = 60 + Math.random() * 40; // 60-100 frames
		
		this.particles.push({
			x: x + this.borderThickness + jitterX,
			y: y + this.borderThickness + jitterY,
			vx,
			vy,
			life: maxLife,
			maxLife,
			size: baseSize,
			baseSize,
			opacity: 1
		});
	}
	
	public start(): void {
		if (this.isActive) return;
		
		this.isActive = true;
		this.updateCanvasSize();
		this.initParticles();
		this.animate();
	}
	
	public stop(): void {
		this.isActive = false;
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		this.particles = [];
		this.clearCanvas();
	}
	
	private clearCanvas(): void {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
	}
	
	private animate(): void {
		if (!this.isActive) return;
		
		this.animationFrameId = requestAnimationFrame(() => this.animate());
		
		// Clear canvas with slight fade for trail effect
		this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		
		// Update and draw particles
		for (let i = this.particles.length - 1; i >= 0; i--) {
			const particle = this.particles[i];
			
			// Update position
			particle.x += particle.vx;
			particle.y += particle.vy;
			
			// Add upward drift and turbulence
			particle.vy -= 0.05; // Upward force
			particle.vx += (Math.random() - 0.5) * 0.2; // Turbulence
			
			// Update life
			particle.life--;
			
			// Update size and opacity based on life
			const lifeRatio = particle.life / particle.maxLife;
			particle.size = particle.baseSize * (0.3 + lifeRatio * 0.7);
			particle.opacity = lifeRatio;
			
			// Remove dead particles and add new ones at borders
			if (particle.life <= 0) {
				this.particles.splice(i, 1);
				// Add new particle at random border position
				this.addParticleAtRandomBorder();
				continue;
			}
			
			// Draw particle with gradient
			this.drawParticle(particle);
		}
		
		// Ensure we maintain particle count
		while (this.particles.length < 50) {
			this.addParticleAtRandomBorder();
		}
	}
	
	private addParticleAtRandomBorder(): void {
		if (!this.modalElement) return;
		
		const rect = this.modalElement.getBoundingClientRect();
		const width = rect.width;
		const height = rect.height;
		const side = Math.floor(Math.random() * 4);
		
		let x: number, y: number, angle: number;
		
		switch (side) {
			case 0: // Top
				x = Math.random() * width;
				y = 0;
				angle = Math.PI; // Up
				break;
			case 1: // Right
				x = width;
				y = Math.random() * height;
				angle = -Math.PI / 2; // Left
				break;
			case 2: // Bottom
				x = Math.random() * width;
				y = height;
				angle = 0; // Down
				break;
			default: // Left
				x = 0;
				y = Math.random() * height;
				angle = Math.PI / 2; // Right
				break;
		}
		
		this.addParticle(x, y, angle);
	}
	
	private drawParticle(particle: FlameParticle): void {
		const { x, y, size, opacity } = particle;
		
		// Create gradient for realistic flame color
		const gradient = this.ctx.createRadialGradient(
			x, y, 0,
			x, y, size
		);
		
		// Flame colors: white-hot center -> yellow -> orange -> red -> dark
		const alpha = opacity * 0.9;
		gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
		gradient.addColorStop(0.2, `rgba(255, 240, 100, ${alpha * 0.7})`);
		gradient.addColorStop(0.4, `rgba(255, 165, 0, ${alpha * 0.6})`);
		gradient.addColorStop(0.7, `rgba(255, 69, 0, ${alpha * 0.5})`);
		gradient.addColorStop(1, `rgba(128, 0, 0, 0)`);
		
		this.ctx.fillStyle = gradient;
		this.ctx.beginPath();
		this.ctx.arc(x, y, size, 0, Math.PI * 2);
		this.ctx.fill();
		
		// Add some sparkle for realism
		if (Math.random() > 0.95) {
			this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.5})`;
			this.ctx.fillRect(x - 1, y - size * 0.5, 2, 2);
		}
	}
	
	public destroy(): void {
		this.stop();
		if (this.canvas.parentNode) {
			this.canvas.parentNode.removeChild(this.canvas);
		}
		window.removeEventListener('resize', () => this.updateCanvasSize());
	}
}

