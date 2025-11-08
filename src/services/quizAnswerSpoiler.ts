import { MarkdownPostProcessorContext, App, TFile, getFrontMatterInfo, setIcon, Notice } from "obsidian";
import QuizReviewer from "./quizReviewer";
import ConversationModeModal from "../ui/quiz/ConversationModeModal";
import type QuizGenerator from "../main";

export default class QuizAnswerSpoiler {
	private readonly app: App;
	private readonly plugin: QuizGenerator;
	private revealedStates: Map<string, boolean> = new Map(); // Track revealed state per file
	private processedFiles: Set<string> = new Set(); // Track which files have been processed

	constructor(app: App, plugin: QuizGenerator) {
		this.app = app;
		this.plugin = plugin;
	}

	public process(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		// Check if this is a quiz file by examining the source file
		const sourcePath = ctx.sourcePath;
		if (!sourcePath) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const fileKey = file.path;

		// Clean up any overlays from OTHER files (when switching between quizzes)
		// Find all overlays in the document
		const allOverlays = document.querySelectorAll('.quiz-content-overlay-qg');
		allOverlays.forEach(overlay => {
			const overlayPath = (overlay as HTMLElement).getAttribute('data-source-path');
			// Remove overlay if it's from a different file
			if (overlayPath && overlayPath !== sourcePath) {
				const relatedPanel = document.querySelector(`.quiz-attempts-panel-qg[data-source-path="${overlayPath}"]`);
				if (relatedPanel) {
					relatedPanel.remove();
				}
				overlay.remove();
				// Remove from processed files set
				this.processedFiles.delete(overlayPath);
			}
		});

		// EARLY CHECK: Before reading file, check if overlay already exists at document level for THIS source
		// This prevents duplicate processing even if multiple elements trigger the processor
		const overlayId = `quiz-overlay-${sourcePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
		const existingOverlay = document.getElementById(overlayId) || 
			document.querySelector(`.quiz-content-overlay-qg[data-source-path="${sourcePath}"]`);
		
		if (existingOverlay) {
			// Already processed - mark and exit immediately without reading file
			this.processedFiles.add(fileKey);
			return;
		}

		// Also check if we've already processed this file
		if (this.processedFiles.has(fileKey)) {
			return;
		}

		// Mark as processing immediately to prevent race conditions
		this.processedFiles.add(fileKey);

		// Read frontmatter to check if this is a quiz file
		this.app.vault.read(file).then(content => {
			const frontmatterInfo = getFrontMatterInfo(content);
			if (!frontmatterInfo.exists) return;

			// Check if frontmatter contains quiz-related properties
			const fmLines = frontmatterInfo.frontmatter.split('\n');
			const hasQuizProperties = fmLines.some(line => 
				line.trim().startsWith('quiz_') || 
				line.trim().startsWith('quiz_score:') ||
				line.trim().startsWith('quiz_total:') ||
				line.trim().startsWith('quiz_attempts:')
			);

			if (!hasQuizProperties) {
				// Not a quiz file, allow retry
				this.processedFiles.delete(fileKey);
				return;
			}

			// Double-check overlay doesn't exist (in case it was created between checks)
			const existingOverlayCheck = document.getElementById(overlayId) || 
				document.querySelector(`.quiz-content-overlay-qg[data-source-path="${sourcePath}"]`);
			
			if (existingOverlayCheck) {
				const existingPanel = document.querySelector(`.quiz-attempts-panel-qg[data-source-path="${sourcePath}"]`);
				if (existingPanel) {
					existingPanel.remove();
				}
				// Overlay was created by another process() call - exit
				return;
			}

			// Find the root container - use document-level query to find ALL quiz content
			// Search from the document root to ensure we catch everything
			let rootContainer: HTMLElement | null = null;
			
			// Try to find the markdown preview container for this source
			const previewContainers = document.querySelectorAll('.markdown-preview-view, .markdown-reading-view, .markdown-source-view');
			for (const container of Array.from(previewContainers)) {
				// Check if this container has our source path or quiz callouts
				const hasQuizContent = container.querySelector('.callout[data-callout="question"]');
				if (hasQuizContent) {
					rootContainer = container as HTMLElement;
					break;
				}
			}
			
			// Fallback: find by traversing up from current element
			if (!rootContainer) {
				let current = el;
				let maxDepth = 15;
				let depth = 0;
				
				while (current.parentElement && depth < maxDepth) {
					const parent = current.parentElement;
					if (parent.classList.contains('markdown-preview-view') ||
						parent.classList.contains('markdown-reading-view') ||
						parent.classList.contains('markdown-source-view') ||
						parent.classList.contains('markdown-preview-section') ||
						parent.classList.contains('view-content')) {
						rootContainer = parent;
						break;
					}
					if (parent.querySelector('.callout[data-callout="question"]')) {
						rootContainer = parent;
					}
					current = parent;
					depth++;
				}
			}
			
			// Final fallback: use the element itself if it contains quiz content
			if (!rootContainer && el.querySelector('.callout[data-callout="question"]')) {
				rootContainer = el;
			}
			
			if (!rootContainer) {
				// Can't find container, abort
				this.processedFiles.delete(fileKey); // Allow retry
				return;
			}

		// Note: We'll identify content to blur after inserting the overlay

		// Parse question count from file content FIRST
		const reviewer = new QuizReviewer(this.app, this.plugin.settings, this.plugin);
		const questions = reviewer.parseQuestions(content);
		const questionCount = questions.length;

		// Parse stats from frontmatter
		let quizScore: number | null = null;
		let quizCorrect: number | null = null;
		let quizTotal: number | null = null;
		let quizCompleted: string | null = null;
		
		const scoreLine = fmLines.find(line => line.trim().startsWith('quiz_score:'));
		if (scoreLine) {
			const match = scoreLine.match(/quiz_score:\s*(\d+)/);
			if (match) quizScore = parseInt(match[1]);
		}
		
		const correctLine = fmLines.find(line => line.trim().startsWith('quiz_correct:'));
		if (correctLine) {
			const match = correctLine.match(/quiz_correct:\s*(\d+)/);
			if (match) quizCorrect = parseInt(match[1]);
				}
		
		const totalLine = fmLines.find(line => line.trim().startsWith('quiz_total:'));
		if (totalLine) {
			const match = totalLine.match(/quiz_total:\s*(\d+)/);
			if (match) quizTotal = parseInt(match[1]);
		}

		const completedLine = fmLines.find(line => line.trim().startsWith('quiz_completed:'));
		if (completedLine) {
			const match = completedLine.match(/quiz_completed:\s*"?([^"\n]+)"?/);
			if (match) quizCompleted = match[1];
		}

		const attemptSummaries: { timestamp: string; correct: number; total: number; score: number }[] = [];
		const quizAttemptsLine = fmLines.find(line => line.trim().startsWith('quiz_attempts:'));
		if (quizAttemptsLine) {
			try {
				const jsonMatch = quizAttemptsLine.match(/quiz_attempts:\s*(.+)$/);
				if (jsonMatch) {
					const attemptsRaw = JSON.parse(jsonMatch[1]);
					const scoresByTimestamp = new Map<string, { correct: number; total: number }>();
					attemptsRaw.forEach((attempt: any) => {
						if (!attempt?.t) return;
						if (!scoresByTimestamp.has(attempt.t)) {
							scoresByTimestamp.set(attempt.t, { correct: 0, total: 0 });
						}
						const session = scoresByTimestamp.get(attempt.t)!;
						session.total++;
						if (attempt.c) session.correct++;
					});
					Array.from(scoresByTimestamp.entries()).forEach(([timestamp, session]) => {
						const score = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0;
						attemptSummaries.push({ timestamp, correct: session.correct, total: session.total, score });
					});
				}
			} catch (error) {
				console.error('Error parsing quiz_attempts:', error);
			}
		}

		if (attemptSummaries.length === 0 && quizCompleted && quizCorrect !== null && quizTotal !== null) {
			const fallbackScore = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0;
			attemptSummaries.push({ timestamp: quizCompleted, correct: quizCorrect, total: quizTotal, score: fallbackScore });
		}

		attemptSummaries.sort((a, b) => {
			const dateA = new Date(a.timestamp).getTime();
			const dateB = new Date(b.timestamp).getTime();
			return dateB - dateA;
		});

			// Create overlay container with source path attribute and unique ID
			const overlay = rootContainer.createDiv('quiz-content-overlay-qg');
			overlay.setAttribute('data-source-path', sourcePath);
			overlay.setAttribute('id', overlayId);
			
		let expandButton: HTMLButtonElement | null = null;
		let expandIcon: HTMLElement | null = null;
		let attemptsPanel: HTMLElement | null = null;
		let attemptsOpen = false;

		if (attemptSummaries.length > 0) {
			expandButton = overlay.createEl('button', {
				cls: 'quiz-icon-button-qg quiz-expand-button-qg',
				attr: { 'aria-label': 'Show past attempts', 'title': 'Show past attempts', 'aria-expanded': 'false' }
			});
			expandIcon = expandButton.createSpan({ cls: 'quiz-button-icon-qg' });
			setIcon(expandIcon, 'chevron-down');
		}

		// Left section: icon + title + metadata
		const leftSection = overlay.createDiv('quiz-overlay-left-section-qg');
			
			// Quiz icon
		const quizIcon = leftSection.createSpan('quiz-overlay-icon-qg');
			setIcon(quizIcon, 'graduation-cap');
			
			// Title (file name without extension)
		const title = leftSection.createSpan({ 
				cls: 'quiz-overlay-title-qg',
				text: file.basename 
			});
			
		// Metadata badges container
		const metadataContainer = leftSection.createDiv('quiz-overlay-metadata-qg');
		
		// Question count badge
			if (questionCount > 0) {
			const questionBadge = metadataContainer.createSpan('quiz-badge-qg quiz-badge-neutral-qg');
			questionBadge.createSpan({ 
					text: `${questionCount} question${questionCount !== 1 ? 's' : ''}`,
			});
		}
		
		// Stats badge (if quiz has been taken)
		if (quizScore !== null && quizCorrect !== null && quizTotal !== null) {
			const statsBadge = metadataContainer.createSpan('quiz-badge-qg');
			
			// Color code based on score
			if (quizScore >= 80) {
				statsBadge.addClass('quiz-badge-success-qg');
			} else if (quizScore >= 60) {
				statsBadge.addClass('quiz-badge-warning-qg');
			} else {
				statsBadge.addClass('quiz-badge-danger-qg');
			}
			
			statsBadge.createSpan({ 
				text: `${quizScore}% • ${quizCorrect}/${quizTotal}`,
				});
			}
			
		// Right section: buttons
		const rightSection = overlay.createDiv('quiz-overlay-right-section-qg');
			
		// Converse Mode button (icon-only, green, conversation icon)
		const converseModeButton = rightSection.createEl('button', {
			cls: 'quiz-icon-button-qg quiz-converse-button-qg',
			attr: { 'aria-label': 'Converse Mode', 'title': 'Converse Mode' }
		});
		const converseModeIcon = converseModeButton.createSpan({ cls: 'quiz-button-icon-qg' });
		setIcon(converseModeIcon, 'message-circle'); // Use message-circle for conversation
		
		// Reveal Source button (icon-only toggle) - starts with eye-off (blurred state)
		const revealButton = rightSection.createEl('button', {
			cls: 'quiz-icon-button-qg quiz-reveal-button-qg',
			attr: { 'aria-label': 'Reveal Source', 'title': 'Reveal Source' }
		});
		const revealIcon = revealButton.createSpan({ cls: 'quiz-button-icon-qg' });
		setIcon(revealIcon, 'eye-off'); // Start with eye-off since content is blurred
		
		// Take Quiz button (primary action)
		const takeQuizButton = rightSection.createEl('button', {
				cls: 'quiz-take-quiz-button-qg'
			});
			const takeQuizIcon = takeQuizButton.createSpan({ cls: 'quiz-button-icon-qg' });
			setIcon(takeQuizIcon, 'play');
			takeQuizButton.createSpan({ text: 'Take Quiz', cls: 'quiz-button-text-qg' });

			// Check revealed state for this file
			const isRevealed = this.revealedStates.get(fileKey) || false;

			// Check if legend has been viewed in frontmatter
			const legendViewed = fmLines.some(line => 
				line.trim().startsWith('quiz_legend_viewed:') && 
				line.trim().includes('true')
			);

			// Take Quiz button handler
			takeQuizButton.addEventListener('click', async () => {
				// Open quiz using QuizReviewer
				try {
					const reviewer = new QuizReviewer(this.app, this.plugin.settings, this.plugin);
					await reviewer.openQuiz(file);
				} catch (error) {
					console.error('Error opening quiz:', error);
				}
			});

			// Converse Mode button handler
			converseModeButton.addEventListener('click', async () => {
				try {
					// Parse questions from file
					const reviewer = new QuizReviewer(this.app, this.plugin.settings, this.plugin);
					const fileContents = await this.app.vault.cachedRead(file);
					const questions = reviewer.parseQuestions(fileContents);
					
					if (questions.length > 0) {
						const modal = new ConversationModeModal(
							this.app,
							questions,
							this.plugin.settings,
							this.plugin
						);
						modal.open();
					} else {
						new Notice("No questions found in this quiz");
					}
				} catch (error) {
					console.error('Error opening converse mode:', error);
					new Notice("Error opening converse mode");
				}
			});

		// Find where frontmatter ends and insert overlay
		const children = Array.from(rootContainer.children) as HTMLElement[];
		let firstContentIndex = 0;
		
		if (children.length > 0) {
			const firstChild = children[0];
			const isFrontmatter = firstChild.tagName === 'PRE' && 
				(firstChild.querySelector('code.language-yaml') !== null ||
				 firstChild.querySelector('code[class*="yaml"]') !== null ||
				 (firstChild.textContent?.includes('---') && firstChild.textContent?.includes('quiz_')));
			
			if (isFrontmatter) {
				firstContentIndex = 1;
			}
		}

		// Insert overlay after frontmatter
			if (firstContentIndex > 0 && children[firstContentIndex - 1]) {
				rootContainer.insertBefore(overlay, children[firstContentIndex] || null);
			} else {
				rootContainer.insertBefore(overlay, children[0] || null);
			}

		const formatAttemptTimestamp = (timestamp: string): string => {
			if (!timestamp) return 'Unknown date';
			const date = new Date(timestamp);
			if (isNaN(date.getTime())) return timestamp;
			return date.toLocaleString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		};

		if (attemptSummaries.length > 0) {
			attemptsPanel = document.createElement('div');
			attemptsPanel.classList.add('quiz-attempts-panel-qg');
			attemptsPanel.setAttribute('data-source-path', sourcePath);
			attemptsPanel.style.display = 'none';
			const existingPanel = document.querySelector(`.quiz-attempts-panel-qg[data-source-path="${sourcePath}"]`);
			if (existingPanel) {
				existingPanel.remove();
			}
			overlay.insertAdjacentElement('afterend', attemptsPanel);

			const attemptsHeader = attemptsPanel.createDiv('quiz-attempts-header-qg');
			attemptsHeader.createSpan({ cls: 'quiz-attempts-title-qg', text: 'Past attempts' });

			const attemptsList = attemptsPanel.createDiv('quiz-attempts-list-qg');
			attemptSummaries.forEach((attempt, index) => {
				const item = attemptsList.createDiv('quiz-attempt-item-qg');
				if (index === 0) item.addClass('quiz-attempt-item-recent-qg');
				item.createSpan({ cls: 'quiz-attempt-item-date-qg', text: formatAttemptTimestamp(attempt.timestamp) });
				item.createSpan({ cls: 'quiz-attempt-item-score-qg', text: `${attempt.score}% (${attempt.correct}/${attempt.total})` });
			});

			if (expandButton && expandIcon) {
				expandButton.addEventListener('click', () => {
					attemptsOpen = !attemptsOpen;
					attemptsPanel!.style.display = attemptsOpen ? 'block' : 'none';
					expandButton!.classList.toggle('expanded', attemptsOpen);
					expandButton!.setAttribute('aria-expanded', attemptsOpen ? 'true' : 'false');
					overlay.classList.toggle('quiz-overlay-expanded-qg', attemptsOpen);
					setIcon(expandIcon!, attemptsOpen ? 'chevron-up' : 'chevron-down');
				});
			}
		}

		// NOW blur content after overlay is inserted
		const contentToHide: HTMLElement[] = [];
		
		// Find all question callouts and regular content to blur
		// Look for callouts with data-callout="question"
		const questionCallouts = rootContainer.querySelectorAll('.callout[data-callout="question"]');
		questionCallouts.forEach(callout => {
			contentToHide.push(callout as HTMLElement);
		});
		
		// Also look for answer callouts
		const answerCallouts = rootContainer.querySelectorAll('.callout[data-callout="success"]');
		answerCallouts.forEach(callout => {
			const calloutTitle = callout.querySelector('.callout-title');
			if (calloutTitle && calloutTitle.textContent?.toLowerCase().includes('answer')) {
				contentToHide.push(callout as HTMLElement);
			}
		});
		
		// If no callouts found, blur all children after the overlay
		if (contentToHide.length === 0) {
			const updatedChildren = Array.from(rootContainer.children) as HTMLElement[];
			let startBlurringFrom = 0;
			
			for (let i = 0; i < updatedChildren.length; i++) {
				if (updatedChildren[i].classList.contains('quiz-content-overlay-qg')) {
					startBlurringFrom = i + 1;
					break;
				}
			}
			
			// Blur ALL children after the overlay
			for (let i = startBlurringFrom; i < updatedChildren.length; i++) {
				const child = updatedChildren[i];
				// Skip if it's the overlay itself
				if (!child.classList.contains('quiz-content-overlay-qg')) {
					contentToHide.push(child);
				}
			}
		}

		console.log('Quiz Spoiler: Found', contentToHide.length, 'elements to blur');

		// Apply blur to all content by default and make it clickable
		contentToHide.forEach(element => {
			element.classList.add('quiz-content-hidden-qg');
			element.setAttribute('data-quiz-hidden', 'true');
			element.style.cursor = 'pointer';
			element.setAttribute('title', 'Click to reveal');
			console.log('Applied blur to:', element.tagName, element.className);
		});

		// Function to reveal all content
		const revealAllContent = () => {
			console.log('Revealing all content');
			
			// Unblur ALL content permanently for this session
			contentToHide.forEach(element => {
				element.classList.remove('quiz-content-hidden-qg');
				element.classList.add('quiz-content-revealed-qg');
				element.removeAttribute('data-quiz-hidden');
				element.style.cursor = '';
				element.removeAttribute('title');
				console.log('Unblurring element:', element.tagName, element.className);
			});
			this.revealedStates.set(fileKey, true);
			
			// Hide the reveal button after revealing
			revealButton.style.display = 'none';
			
			console.log('Content revealed - button hidden');
			
			// Update frontmatter to mark legend as viewed (only once)
			if (!legendViewed) {
				this.updateFrontmatter(file).catch(err => {
					console.error('Error updating frontmatter:', err);
				});
			}
		};

		// Check if already revealed
		if (isRevealed || legendViewed) {
			contentToHide.forEach(element => {
				element.classList.remove('quiz-content-hidden-qg');
				element.classList.add('quiz-content-revealed-qg');
				element.removeAttribute('data-quiz-hidden');
				element.style.cursor = '';
			});
			// Hide the reveal button since content is already revealed
			revealButton.style.display = 'none';
		} else {
			// Add click handlers to blurred content to reveal when clicked
			contentToHide.forEach(element => {
				element.addEventListener('click', (e) => {
					// Check if content is still blurred
					if (element.classList.contains('quiz-content-hidden-qg')) {
						e.preventDefault();
						e.stopPropagation();
						console.log('Blurred content clicked - revealing all');
						revealAllContent();
					}
				});
			});
		}

		// Reveal button click handler
		revealButton.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			console.log('Reveal button clicked');
			
			// Check if content is currently blurred
			const isCurrentlyBlurred = contentToHide.some(el => 
				el.classList.contains('quiz-content-hidden-qg')
			);
			
			if (isCurrentlyBlurred) {
				revealAllContent();
			}
		});
		}).catch(err => {
			console.error('Error reading file for quiz spoiler:', err);
		});
	}

	private async updateFrontmatter(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			const frontmatterInfo = getFrontMatterInfo(content);

			if (!frontmatterInfo.exists) {
				// Add new frontmatter
				const newContent = `---\nquiz_legend_viewed: true\n---\n${content}`;
				await this.app.vault.modify(file, newContent);
				return;
			}

			// Check if quiz_legend_viewed already exists
			const fmLines = frontmatterInfo.frontmatter.split('\n');
			const hasLegendViewed = fmLines.some(line => line.trim().startsWith('quiz_legend_viewed:'));

			let updatedFrontmatterLines: string[];
			if (hasLegendViewed) {
				// Update existing property
				updatedFrontmatterLines = fmLines.map(line => {
					if (line.trim().startsWith('quiz_legend_viewed:')) {
						return line.replace(/quiz_legend_viewed:\s*.*/, 'quiz_legend_viewed: true');
					}
					return line;
				});
			} else {
				// Add new property
				updatedFrontmatterLines = [...fmLines, 'quiz_legend_viewed: true'];
			}

			// Reconstruct frontmatter with proper --- markers
			const updatedFrontmatter = `---\n${updatedFrontmatterLines.join('\n')}\n---`;
			
			// Get the body content (everything after the frontmatter)
			const bodyContent = content.slice(frontmatterInfo.contentStart);
			
			// Ensure proper newline between frontmatter and body
			const newContent = updatedFrontmatter + (bodyContent.startsWith('\n') ? '' : '\n') + bodyContent;
			
			await this.app.vault.modify(file, newContent);
		} catch (error) {
			console.error('Error updating frontmatter:', error);
		}
	}
}

