import { App, Modal, Notice, setIcon } from "obsidian";
import { Question } from "../../utils/types";
import { QuizSettings } from "../../settings/config";
import { ConversationStyle } from "../../settings/general/generalConfig";
import type QuizGenerator from "../../main";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse
} from "../../utils/typeGuards";

export default class ConversationModeModal extends Modal {
	private readonly questions: Question[];
	private readonly settings: QuizSettings;
	private readonly plugin: QuizGenerator;
	private readonly extraContext?: string;
	private selectedStyle: ConversationStyle | null = null;

	constructor(app: App, questions: Question[], settings: QuizSettings, plugin: QuizGenerator, extraContext?: string) {
		super(app);
		this.questions = questions;
		this.settings = settings;
		this.plugin = plugin;
		this.extraContext = extraContext;
		this.modalEl.addClass("conversation-mode-modal-qg");
	}

	onOpen(): void {
		super.onOpen();
		this.titleEl.setText("Conversation Mode - ChatGPT");
		
		const content = this.contentEl.createDiv("conversation-mode-content-qg");
		
		// Show style selection first
		this.showStyleSelection(content);
	}

	private addBackButtonToTitleBar(container: HTMLElement): void {
		// Remove existing back button if any
		const existingBackBtn = this.modalEl.querySelector(".title-back-button-qg");
		if (existingBackBtn) {
			existingBackBtn.remove();
		}

		// Create back button in title bar (insert at beginning)
		const backBtn = document.createElement("span");
		backBtn.className = "title-back-button-qg";
		backBtn.textContent = "←";
		backBtn.title = "Back to Style Selection";
		
		// Insert at the beginning of titleEl
		this.titleEl.insertBefore(backBtn, this.titleEl.firstChild);
		
		backBtn.addEventListener("click", () => {
			this.showStyleSelection(container);
		});
	}

	private showStyleSelection(container: HTMLElement): void {
		container.empty();
		
		// Remove back button from title bar when showing style selection
		const existingBackBtn = this.modalEl.querySelector(".title-back-button-qg");
		if (existingBackBtn) {
			existingBackBtn.remove();
		}
		
		const description = container.createDiv("style-selection-description-qg");
		description.setText("Select how you'd like ChatGPT to interact with you during the study session:");
		
		const stylesContainer = container.createDiv("styles-container-qg");
		
		// Built-in styles
		const builtInStyles: ConversationStyle[] = [
			{
				id: "debate",
				name: "Debate Style",
				description: "Engage in an intellectual debate on the themes and topics from the material. ChatGPT will act as a devil's advocate, presenting strong counterarguments and challenging your perspectives.",
				prompt: `I'd like you to engage with me in an intellectual debate about the themes and topics in this material. Your role is to act as a devil's advocate - take strong, assertive positions that challenge conventional thinking and push me to defend my viewpoints.

Your approach:
- **DO NOT go through questions one by one in order** - instead, kick off a conversation about the general themes, concepts, and implications you see in this material
- **Take assertive, contrarian positions** - don't just present neutral viewpoints; take a strong stance that challenges the material or common interpretations
- **Act as a devil's advocate** - argue positions that might be unpopular or counterintuitive to deepen the discussion
- **Be intellectually rigorous** - focus on principles, implications, and deeper meanings rather than surface-level facts
- **Be assertive and stick to your guns** - unless I present a genuinely compelling argument that you find valid
- **Concede when warranted** - if I make a valid point that genuinely challenges your position, acknowledge it and adjust your argument accordingly
- **Keep it respectful and intellectual** - no personal attacks, ad hominem arguments, or condescension; focus on the ideas themselves
- **Engage me in a back-and-forth debate** - respond to my points, challenge my reasoning, and push me to think more deeply
- **Draw connections thoughtfully** - only connect themes and concepts that are genuinely related within the same subject matter; do NOT force connections between completely different topics or subject areas
- **Respect topic boundaries** - this quiz may cover a wide array of topics, so focus on the material at hand rather than trying to artificially bridge unrelated subjects
- **Maintain intellectual integrity** - defend your positions vigorously, but be willing to acknowledge when you're wrong or when I make a superior point

The goal is to have a stimulating, challenging intellectual debate that helps me think critically about the material from multiple perspectives. Don't just agree with me - push back, challenge, and make me work to defend my positions.`,
				isCustom: false
			},
			{
				id: "teacher-student",
				name: "Teacher / Student 1-on-1",
				description: "Like office hours with a professor. Supportive, listens to your thoughts, provides gentle corrections, and checks in on your understanding.",
				prompt: `I'd like you to help me study by engaging in a comprehensive teaching conversation, like a college professor talking to a student during office hours. Your goal is to ensure I have strong foundational understanding of the material, and to expand my thinking beyond surface-level facts.

Your approach:
- **Go broader than just question-by-question** - focus on concepts, themes, and foundational understanding rather than just individual questions
- **Start with probing questions** - ask me "Tell me your understanding of [concept/topic]" or "Explain to me how [concept] works" before diving into specific questions
- **Act as a knowledgeable, supportive college professor** having a 1-on-1 conversation
- **Be genuinely interested in hearing my thoughts** - listen to my full explanation before providing feedback
- **If I seem off base or struggling**, then start to explain it to me, elaborating beyond the notes if necessary to ensure I have strong foundational understanding
- **Check in with me periodically** - ask "Are you following along?" or "Does this make sense?" to gauge comprehension
- **Quiz me occasionally** - throw in quick questions to make sure I'm following along, not just nodding along
- **If I'm not following**, focus on that concept until I understand it - don't move forward if I'm clearly lost
- **Keep steady forward momentum** towards covering all material - don't get stuck, but don't rush past foundational gaps
- **When I demonstrate understanding**, acknowledge it and move forward - don't over-explain concepts I've already grasped
- **Elaborate beyond the notes when needed** - if the material is unclear or I need more context, provide additional explanation or examples
- **Think like a college professor** - expand on concepts with deeper analysis:
  - **Symbolism and meaning**: What deeper meanings, symbols, or metaphors are present? What do they represent?
  - **Historical context and value**: When was this relevant? What historical significance does this have? How did it shape or reflect its time period?
  - **Impact and implications**: What are the broader implications? How did this influence later developments? What are the real-world consequences?
  - **Connections and relationships**: How does this connect to other concepts? What are the relationships between different ideas?
  - **Critical perspectives**: What are alternative viewpoints? What are the limitations or criticisms?
  - **Contemporary relevance**: How does this relate to today? What can we learn from this now?
- Keep the conversation natural and engaging, not robotic
- **Balance thoroughness with efficiency** - ensure I understand, but keep us making progress through all the material

Remember, this is a teaching conversation. Your priority is ensuring I have strong foundational understanding AND helping me think critically about the material like a college professor would. Probe my understanding, explain when I'm struggling, expand on concepts with deeper analysis, quiz me to check comprehension, and keep moving forward through all the material.`,
				isCustom: false
			},
			{
				id: "conversational-review",
				name: "Conversational with Review",
				description: "Natural peer-to-peer conversation about the material. You explain your understanding, and the AI reiterates back what you've said, making gentle corrections and keeping the discussion flowing.",
				prompt: `I'd like to have a natural, peer-to-peer conversation about this material - like two people talking about a subject they're both learning or discussing.

Your role:
- Act like a knowledgeable conversation partner who's also familiar with this material
- **Let me explain my understanding** - I'll be sharing what I think about the material, concepts, and topics
- **Reiterate back what I've told you** - summarize or paraphrase what you heard me say to show you're listening and to confirm understanding
- **Make corrections where necessary** - if what I'm saying doesn't match what's in the material, gently correct me based on what you know from the text
- **Agree when I'm on the right track** - if what I'm saying matches up with the material, affirm that and build on it
- **Keep the conversation flowing** - use prompts like "What's your take on the [topic/concept]?" or "How do you understand [concept]?" to keep us talking
- **Don't talk about specific questions** - focus on the material, concepts, and themes covered, not individual quiz questions
- **Focus on the material covered** - make sure we discuss the key concepts, ideas, and topics from the material
- Keep it natural and conversational - like a study buddy checking in with each other
- **Be conversational and engaging** - respond naturally to what I'm saying, ask follow-up questions, and share insights

At the end of our discussion:
- Review my overall understanding based on our conversation
- Summarize what I got right and what needed correction
- Identify any patterns in my understanding or misunderstandings
- Suggest specific areas where I should focus more study time
- Provide encouragement about what I understood well

Let's have a natural conversation where I explain my understanding, you listen and respond, and we both learn from the discussion.`,
				isCustom: false
			}
		];
		
		// Add custom styles
		const allStyles = [...builtInStyles, ...this.settings.customConversationStyles];
		
		allStyles.forEach(style => {
			const styleCard = stylesContainer.createDiv("style-card-qg");
			
			const header = styleCard.createDiv("style-card-header-qg");
			header.createEl("strong", { text: style.name });
			if (style.isCustom) {
				const customBadge = header.createSpan("custom-badge-qg");
				customBadge.setText("Custom");
			}
			
			const desc = styleCard.createDiv("style-card-description-qg");
			desc.setText(style.description);
			
			styleCard.addEventListener("click", () => {
				// Hide custom input if it was showing
				const customOption = container.querySelector(".custom-style-option-qg");
				if (customOption) {
					customOption.addClass("hidden-qg");
				}
				
				// Remove selected class from all cards
				stylesContainer.querySelectorAll(".style-card-qg").forEach(card => {
					card.removeClass("selected-qg");
				});
				
				// Add selected class to clicked card
				styleCard.addClass("selected-qg");
				this.selectedStyle = style;
				
				// Immediately show prompt and instructions
				this.showPromptAndInstructions(container);
			});
		});
		
		// Custom style option (hidden by default)
		const customOption = container.createDiv("custom-style-option-qg hidden-qg");
		const customLabel = customOption.createDiv("custom-label-qg");
		customLabel.createEl("strong", { text: "Use Custom Style" });
		
		const customTextarea = customOption.createEl("textarea", {
			cls: "custom-prompt-textarea-qg",
			attr: {
				placeholder: "Enter your custom conversation prompt here. The quiz questions will be automatically appended at the end.",
				rows: "6"
			}
		});
		
		// Pre-populate with saved draft
		customTextarea.value = this.settings.customConversationPromptDraft || "";
		
		// Auto-save as user types (with debouncing)
		let saveTimeout: NodeJS.Timeout;
		customTextarea.addEventListener("input", () => {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(() => {
				this.settings.customConversationPromptDraft = customTextarea.value;
				this.plugin.saveSettings();
			}, 1000); // Save after 1 second of inactivity
		});
		
		const saveCustomBtn = customOption.createEl("button", {
			text: "Use This Custom Style",
			cls: "mod-secondary"
		});
		
		saveCustomBtn.addEventListener("click", () => {
			if (!customTextarea.value.trim()) {
				new Notice("Please enter a custom prompt");
				return;
			}
			
			// Save the draft
			this.settings.customConversationPromptDraft = customTextarea.value;
			this.plugin.saveSettings();
			
			// Create temporary custom style for this session only
			this.selectedStyle = {
				id: "custom-temp",
				name: "Custom (This Session)",
				description: "Your custom conversation style",
				prompt: customTextarea.value.trim(),
				isCustom: true
			};
			
			// Immediately show prompt and instructions
			this.showPromptAndInstructions(container);
		});
		
		const saveToSettingsBtn = customOption.createEl("button", {
			text: "Save to Settings for Future Use",
			cls: "mod-cta"
		});
		
		saveToSettingsBtn.addEventListener("click", () => {
			if (!customTextarea.value.trim()) {
				new Notice("Please enter a custom prompt");
				return;
			}
			
			// Save the draft
			this.settings.customConversationPromptDraft = customTextarea.value;
			
			// Prompt for name
			const name = prompt("Enter a name for this custom style:");
			if (!name || !name.trim()) {
				return;
			}
			
			// Create and save custom style
			const newStyle: ConversationStyle = {
				id: `custom-${Date.now()}`,
				name: name.trim(),
				description: "Custom conversation style",
				prompt: customTextarea.value.trim(),
				isCustom: true
			};
			
			this.settings.customConversationStyles.push(newStyle);
			this.plugin.saveSettings();
			
			new Notice(`Custom style "${name}" saved!`);
			
			// Refresh to show new style
			this.showStyleSelection(container);
		});
		
		// Always show "Use Custom Style" card, but disable if not configured
		const hasCustomPrompt = this.settings.customConversationPromptDraft && this.settings.customConversationPromptDraft.trim();
		const customStyleCard = stylesContainer.createDiv("style-card-qg custom-style-card-qg");
		
		if (!hasCustomPrompt) {
			customStyleCard.addClass("disabled-qg");
		}
		
		const customHeader = customStyleCard.createDiv("style-card-header-qg");
		customHeader.createEl("strong", { text: "Use Custom Style" });
		const customBadge = customHeader.createSpan("custom-badge-qg");
		customBadge.setText("Custom");
		
		const customDesc = customStyleCard.createDiv("style-card-description-qg");
		if (hasCustomPrompt) {
			customDesc.setText("Use your saved custom conversation prompt. The quiz questions will be automatically appended at the end.");
		} else {
			customDesc.setText("Configure a custom conversation prompt in the plugin settings to enable this option.");
		}
		
		if (hasCustomPrompt) {
			customStyleCard.addEventListener("click", () => {
				// Show custom input
				customOption.removeClass("hidden-qg");
				
				// Remove selected class from all cards
				stylesContainer.querySelectorAll(".style-card-qg").forEach(card => {
					card.removeClass("selected-qg");
				});
				
				// Add selected class to custom card
				customStyleCard.addClass("selected-qg");
				
				// Clear any previous selection
				this.selectedStyle = null;
				
				// Focus textarea
				setTimeout(() => {
					customTextarea.focus();
				}, 100);
			});
		}
	}
	

	private showPromptAndInstructions(container: HTMLElement): void {
		container.empty();
		
		// Add back button to title bar
		this.addBackButtonToTitleBar(container);
		
		// Detect device type
		const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
			(window.innerWidth <= 768);
		
		// Instructions
		const instructions = container.createDiv("conversation-instructions-qg");
		instructions.createEl("h3", { text: "How to Start Voice Conversation in ChatGPT" });
		
		if (isMobile) {
			const mobileSteps = instructions.createEl("ol", { cls: "steps-list-qg" });
			mobileSteps.createEl("li", { text: "Copy the prompt below" });
			mobileSteps.createEl("li", { text: "Open the ChatGPT app on your device" });
			mobileSteps.createEl("li", { text: "Start a new conversation" });
			mobileSteps.createEl("li", { text: "Paste the prompt into the chat" });
			mobileSteps.createEl("li", { text: "ChatGPT will explain how to start voice mode - follow its instructions" });
			mobileSteps.createEl("li", { text: "Once voice mode is active, say \"Let's get started\" to begin" });
		} else {
			const desktopSteps = instructions.createEl("ol", { cls: "steps-list-qg" });
			desktopSteps.createEl("li", { text: "Copy the prompt below" });
			desktopSteps.createEl("li", { text: "Open ChatGPT (web: chat.openai.com or desktop app)" });
			desktopSteps.createEl("li", { text: "Start a new conversation" });
			desktopSteps.createEl("li", { text: "Paste the prompt into the chat" });
			desktopSteps.createEl("li", { text: "ChatGPT will explain how to start voice mode - follow its instructions" });
			desktopSteps.createEl("li", { text: "Once voice mode is active, say \"Let's get started\" to begin" });
		}
		
		// Generate conversation prompt (full version for clipboard)
		const fullPrompt = this.generateConversationPrompt();
		
		// Generate redacted version for display
		const redactedPrompt = this.generateRedactedPrompt();
		
		// Prompt preview
		const previewContainer = container.createDiv("prompt-preview-container-qg");
		previewContainer.createEl("h3", { text: "Conversation Prompt" });
		
		const promptTextarea = previewContainer.createEl("textarea", {
			cls: "prompt-textarea-qg",
			attr: {
				readonly: "readonly"
			}
		});
		promptTextarea.value = redactedPrompt;
		
		// Store full prompt in data attribute for clipboard
		promptTextarea.dataset.fullPrompt = fullPrompt;
		
		// Buttons
		const buttonContainer = container.createDiv("conversation-buttons-qg");
		
		const copyButton = buttonContainer.createEl("button", {
			text: "Copy",
			cls: "mod-cta copy-prompt-btn-qg"
		});
		
		copyButton.addEventListener("click", async () => {
			// Copy the full prompt (with answers) to clipboard
			const fullPromptToCopy = promptTextarea.dataset.fullPrompt || fullPrompt;
			await navigator.clipboard.writeText(fullPromptToCopy);
			new Notice("Conversation prompt copied to clipboard!");
			copyButton.textContent = "✓ Copied!";
			setTimeout(() => {
				copyButton.textContent = "Copy";
			}, 2000);
		});
		
		// Open ChatGPT button (directly opens web with URL-encoded prompt)
		const openChatGPTBtn = buttonContainer.createEl("button", {
			text: "Open ChatGPT",
			cls: "mod-secondary open-chatgpt-btn-qg"
		});
		
		openChatGPTBtn.addEventListener("click", () => {
			// Encode the full prompt as URL parameter
			const encodedPrompt = encodeURIComponent(fullPrompt);
			const chatUrl = `https://chat.openai.com/?q=${encodedPrompt}`;
			window.open(chatUrl, '_blank');
			new Notice("ChatGPT opened in browser with prompt pre-filled!");
		});
		
		const closeButton = buttonContainer.createEl("button", {
			text: "Close",
			cls: "mod-secondary close-btn-qg"
		});
		
		closeButton.addEventListener("click", () => {
			this.close();
		});
	}

	private formatQuestionText(text: string): string {
		// Replace escaped newlines with actual newlines, then clean up
		return text.replace(/\\n/g, "\n").trim();
	}

	private generateConversationPrompt(): string {
		if (!this.selectedStyle) {
			return "";
		}
		
		let basePrompt = this.selectedStyle.prompt;

		if (this.extraContext && this.extraContext.trim().length > 0) {
			basePrompt += `\n\n### Study Recommendations and Context\n${this.extraContext.trim()}`;
		}
		
		// Format questions
		const questionsText = this.formatQuestionsForPrompt();
		
		// Always append questions at the end of the prompt
		// Replace {{QUESTIONS}} placeholder if it exists, otherwise append
		if (basePrompt.includes("{{QUESTIONS}}")) {
			basePrompt = basePrompt.replace("{{QUESTIONS}}", questionsText);
		} else {
			// Automatically append questions after the prompt
			basePrompt += "\n\n**Here are the questions we'll discuss:**\n\n";
			basePrompt += questionsText;
		}
		
		// Add instructions for ChatGPT to provide voice mode instructions
		basePrompt += "\n\n---\n\n**Important Instructions for You (ChatGPT):**\n\n1. After I send this message, respond with ONLY concise step-by-step instructions (less than 3 bullet points) on how to start voice mode in ChatGPT. Do NOT describe what the voice icon looks like - instead, explain the process of finding and activating voice mode.\n2. After providing the voice mode instructions, tell me to say \"Let's get started\" to begin our interaction.\n3. Once I say \"Let's get started\", immediately begin our conversation with a greeting or opening statement to kick off the discussion.\n4. **CRITICAL**: During our voice conversation, you must actively provide each question and its context to me. Do NOT assume I can see the questions - I will be listening to you, so you need to read each question aloud, explain the context, and guide us through the discussion. Present each question one at a time, wait for my response, then provide feedback before moving to the next question.";
		
		return basePrompt;
	}
	
	private formatQuestionsForPrompt(redactAnswers: boolean = false): string {
		let questionsText = "";
		
		this.questions.forEach((question, index) => {
			questionsText += `\n--- Question ${index + 1} ---\n`;
			const formattedQuestion = this.formatQuestionText(question.question);
			
			if (isTrueFalse(question)) {
				questionsText += `Type: True/False\n`;
				questionsText += `Question: ${formattedQuestion}\n`;
				questionsText += `Correct Answer: ${redactAnswers ? "[REDACTED]" : (question.answer ? "True" : "False")}\n`;
			} else if (isMultipleChoice(question)) {
				questionsText += `Type: Multiple Choice\n`;
				questionsText += `Question: ${formattedQuestion}\n`;
				question.options.forEach((opt, i) => {
					const marker = (redactAnswers ? false : (i === question.answer)) ? "✓" : " ";
					const formattedOpt = this.formatQuestionText(opt);
					questionsText += `${marker} ${String.fromCharCode(65 + i)}. ${formattedOpt}\n`;
				});
				questionsText += `Correct Answer: ${redactAnswers ? "[REDACTED]" : String.fromCharCode(65 + question.answer)}\n`;
			} else if (isSelectAllThatApply(question)) {
				questionsText += `Type: Select All That Apply\n`;
				questionsText += `Question: ${formattedQuestion}\n`;
				question.options.forEach((opt, i) => {
					const marker = (redactAnswers ? false : question.answer.includes(i)) ? "✓" : " ";
					const formattedOpt = this.formatQuestionText(opt);
					questionsText += `${marker} ${String.fromCharCode(65 + i)}. ${formattedOpt}\n`;
				});
				if (redactAnswers) {
					questionsText += `Correct Answers: [REDACTED]\n`;
				} else {
					const correctLetters = question.answer.map(i => String.fromCharCode(65 + i)).join(", ");
					questionsText += `Correct Answers: ${correctLetters}\n`;
				}
			} else if (isFillInTheBlank(question)) {
				questionsText += `Type: Fill in the Blank\n`;
				questionsText += `Question: ${formattedQuestion}\n`;
				questionsText += `Correct Answers: ${redactAnswers ? "[REDACTED]" : question.answer.join(", ")}\n`;
			} else if (isMatching(question)) {
				questionsText += `Type: Matching\n`;
				questionsText += `Question: ${formattedQuestion}\n`;
				questionsText += `Matching Pairs:\n`;
				if (redactAnswers) {
					questionsText += `  [REDACTED]\n`;
				} else {
					question.answer.forEach((pair) => {
						questionsText += `  - ${pair.leftOption} → ${pair.rightOption}\n`;
					});
				}
			} else if (isShortOrLongAnswer(question)) {
				const isLong = formattedQuestion.includes("\n");
				questionsText += `Type: ${isLong ? "Long Answer" : "Short Answer"}\n`;
				questionsText += `Question: ${formattedQuestion}\n`;
				questionsText += `Expected Answer Points: ${redactAnswers ? "[REDACTED]" : this.formatQuestionText(question.answer)}\n`;
			}
			
			questionsText += `\n`;
		});
		
		return questionsText;
	}

	private generateRedactedPrompt(): string {
		if (!this.selectedStyle) {
			return "";
		}
		
		let basePrompt = this.selectedStyle.prompt;

		if (this.extraContext && this.extraContext.trim().length > 0) {
			basePrompt += `\n\n### Study Recommendations and Context\n${this.extraContext.trim()}`;
		}
		
		// Format questions with redacted answers
		const questionsText = this.formatQuestionsForPrompt(true);
		
		// Always append questions at the end of the prompt
		// Replace {{QUESTIONS}} placeholder if it exists, otherwise append
		if (basePrompt.includes("{{QUESTIONS}}")) {
			basePrompt = basePrompt.replace("{{QUESTIONS}}", questionsText);
		} else {
			// Automatically append questions after the prompt
			basePrompt += "\n\n**Here are the questions we'll discuss:**\n\n";
			basePrompt += questionsText;
		}
		
		// Add instructions for ChatGPT to provide voice mode instructions (also in redacted version)
		basePrompt += "\n\n---\n\n**Important Instructions for You (ChatGPT):**\n\n1. After I send this message, respond with ONLY concise step-by-step instructions (less than 3 bullet points) on how to start voice mode in ChatGPT. Do NOT describe what the voice icon looks like - instead, explain the process of finding and activating voice mode.\n2. After providing the voice mode instructions, tell me to say \"Let's get started\" to begin our interaction.\n3. Once I say \"Let's get started\", immediately begin our conversation with a greeting or opening statement to kick off the discussion.\n4. **CRITICAL**: During our voice conversation, you must actively provide each question and its context to me. Do NOT assume I can see the questions - I will be listening to you, so you need to read each question aloud, explain the context, and guide us through the discussion. Present each question one at a time, wait for my response, then provide feedback before moving to the next question.";
		
		return basePrompt;
	}

	onClose(): void {
		this.contentEl.empty();
		super.onClose();
	}
}
