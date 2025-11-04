import { useEffect, useRef } from 'react';

interface ConfettiEffectProps {
	active: boolean;
	duration?: number;
}

const ConfettiEffect = ({ active, duration = 3000 }: ConfettiEffectProps) => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!active || !containerRef.current) return;

		const container = containerRef.current;
		const colors = ['#ff4500', '#ff6347', '#ffa500', '#ffd700', '#ff69b4', '#00ff7f', '#1e90ff', '#9370db'];
		const particles: HTMLDivElement[] = [];

		// Create confetti particles
		for (let i = 0; i < 100; i++) {
			const particle = document.createElement('div');
			particle.className = 'confetti-particle-qg';
			const startX = Math.random() * 100;
			const driftX = (Math.random() - 0.5) * 200; // Random drift left/right
			particle.style.left = `${startX}%`;
			particle.style.setProperty('--confetti-x', `${driftX}px`);
			particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
			particle.style.animationDelay = `${Math.random() * 0.5}s`;
			particle.style.animationDuration = `${1 + Math.random() * 0.5}s`;
			
			container.appendChild(particle);
			particles.push(particle);
		}

		// Cleanup after duration
		const timeout = setTimeout(() => {
			particles.forEach(p => p.remove());
		}, duration);

		return () => {
			clearTimeout(timeout);
			particles.forEach(p => p.remove());
		};
	}, [active, duration]);

	if (!active) return null;

	return <div ref={containerRef} className="confetti-container-qg" />;
};

export default ConfettiEffect;

