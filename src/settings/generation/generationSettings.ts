import { Setting, setIcon } from "obsidian";
import QuizGenerator from "../../main";
import { QuestionType } from "./generationConfig";

const displayGenerationSettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings?: () => void): void => {
	new Setting(containerEl).setName("Generation").setHeading();

	const generationSection = containerEl.createDiv("generation-container-qg");

	// Calculate total question count (sum of all enabled types)
	const calculateTotalQuestions = (): number => {
		if (plugin.settings.surpriseMe) {
			// For surprise me, use a target total (could be stored or calculated)
			// For now, calculate from current values
			let total = 0;
			total += plugin.settings.numberOfTrueFalse;
			total += plugin.settings.numberOfMultipleChoice;
			total += plugin.settings.numberOfSelectAllThatApply;
			total += plugin.settings.numberOfFillInTheBlank;
			total += plugin.settings.numberOfMatching;
			total += plugin.settings.numberOfShortAnswer;
			total += plugin.settings.numberOfLongAnswer;
			return total;
		}
		let total = 0;
		if (plugin.settings.generateTrueFalse) total += plugin.settings.numberOfTrueFalse;
		if (plugin.settings.generateMultipleChoice) total += plugin.settings.numberOfMultipleChoice;
		if (plugin.settings.generateSelectAllThatApply) total += plugin.settings.numberOfSelectAllThatApply;
		if (plugin.settings.generateFillInTheBlank) total += plugin.settings.numberOfFillInTheBlank;
		if (plugin.settings.generateMatching) total += plugin.settings.numberOfMatching;
		if (plugin.settings.generateShortAnswer) total += plugin.settings.numberOfShortAnswer;
		if (plugin.settings.generateLongAnswer) total += plugin.settings.numberOfLongAnswer;
		return total;
	};

	// Get enabled question types
	const getEnabledTypes = (): Array<{type: string, current: number, ratio: number}> => {
		return [
			{ type: "trueFalse", current: plugin.settings.numberOfTrueFalse, ratio: plugin.settings.questionTypeRatios.trueFalse },
			{ type: "multipleChoice", current: plugin.settings.numberOfMultipleChoice, ratio: plugin.settings.questionTypeRatios.multipleChoice },
			{ type: "selectAllThatApply", current: plugin.settings.numberOfSelectAllThatApply, ratio: plugin.settings.questionTypeRatios.selectAllThatApply },
			{ type: "fillInTheBlank", current: plugin.settings.numberOfFillInTheBlank, ratio: plugin.settings.questionTypeRatios.fillInTheBlank },
			{ type: "matching", current: plugin.settings.numberOfMatching, ratio: plugin.settings.questionTypeRatios.matching },
			{ type: "shortAnswer", current: plugin.settings.numberOfShortAnswer, ratio: plugin.settings.questionTypeRatios.shortAnswer },
			{ type: "longAnswer", current: plugin.settings.numberOfLongAnswer, ratio: plugin.settings.questionTypeRatios.longAnswer },
		].filter(item => {
			// In surprise me mode, show all types. Otherwise, only show types with count > 0
			if (plugin.settings.surpriseMe) return true;
			return item.current > 0;
		});
	};

	// Get all question types (for proportional adjustment when starting from 0)
	const getAllQuestionTypes = (): Array<{type: string, current: number, ratio: number}> => {
		return [
			{ type: "trueFalse", current: plugin.settings.numberOfTrueFalse, ratio: plugin.settings.questionTypeRatios.trueFalse },
			{ type: "multipleChoice", current: plugin.settings.numberOfMultipleChoice, ratio: plugin.settings.questionTypeRatios.multipleChoice },
			{ type: "selectAllThatApply", current: plugin.settings.numberOfSelectAllThatApply, ratio: plugin.settings.questionTypeRatios.selectAllThatApply },
			{ type: "fillInTheBlank", current: plugin.settings.numberOfFillInTheBlank, ratio: plugin.settings.questionTypeRatios.fillInTheBlank },
			{ type: "matching", current: plugin.settings.numberOfMatching, ratio: plugin.settings.questionTypeRatios.matching },
			{ type: "shortAnswer", current: plugin.settings.numberOfShortAnswer, ratio: plugin.settings.questionTypeRatios.shortAnswer },
			{ type: "longAnswer", current: plugin.settings.numberOfLongAnswer, ratio: plugin.settings.questionTypeRatios.longAnswer },
		];
	};

	// Update ratios based on current values
	const updateRatiosFromCurrent = (): void => {
		const total = calculateTotalQuestions();
		if (total === 0) return;
		
		const enabledTypes = getEnabledTypes();
		const totalRatio = enabledTypes.reduce((sum, item) => sum + item.current, 0);
		
		if (totalRatio > 0) {
			enabledTypes.forEach(item => {
				const ratio = item.current / totalRatio;
				switch (item.type) {
					case "trueFalse": plugin.settings.questionTypeRatios.trueFalse = ratio; break;
					case "multipleChoice": plugin.settings.questionTypeRatios.multipleChoice = ratio; break;
					case "selectAllThatApply": plugin.settings.questionTypeRatios.selectAllThatApply = ratio; break;
					case "fillInTheBlank": plugin.settings.questionTypeRatios.fillInTheBlank = ratio; break;
					case "matching": plugin.settings.questionTypeRatios.matching = ratio; break;
					case "shortAnswer": plugin.settings.questionTypeRatios.shortAnswer = ratio; break;
					case "longAnswer": plugin.settings.questionTypeRatios.longAnswer = ratio; break;
				}
			});
		}
	};

	// Apply proportional adjustment to all question types
	const adjustProportionally = async (delta: number): Promise<void> => {
		if (plugin.settings.surpriseMe) {
			// In surprise me mode, just adjust the total directly
			const currentTotal = calculateTotalQuestions();
			const newTotal = Math.max(0, currentTotal + delta);
			
			// Set all types to 0 initially, then distribute the total randomly
			plugin.settings.numberOfTrueFalse = 0;
			plugin.settings.numberOfMultipleChoice = 0;
			plugin.settings.numberOfSelectAllThatApply = 0;
			plugin.settings.numberOfFillInTheBlank = 0;
			plugin.settings.numberOfMatching = 0;
			plugin.settings.numberOfShortAnswer = 0;
			plugin.settings.numberOfLongAnswer = 0;
			
			if (newTotal > 0) {
				// Distribute randomly
				const types = [
					() => plugin.settings.numberOfTrueFalse++,
					() => plugin.settings.numberOfMultipleChoice++,
					() => plugin.settings.numberOfSelectAllThatApply++,
					() => plugin.settings.numberOfFillInTheBlank++,
					() => plugin.settings.numberOfMatching++,
					() => plugin.settings.numberOfShortAnswer++,
					() => plugin.settings.numberOfLongAnswer++,
				];
				
				for (let i = 0; i < newTotal; i++) {
					const randomIndex = Math.floor(Math.random() * types.length);
					types[randomIndex]();
				}
			}
			
			await plugin.saveSettings();
			updateTotalCount();
			return;
		}
		
		const currentTotal = calculateTotalQuestions();
		const newTotal = Math.max(0, currentTotal + delta);
		
		if (newTotal === 0) {
			// Set all to 0
			plugin.settings.numberOfTrueFalse = 0;
			plugin.settings.numberOfMultipleChoice = 0;
			plugin.settings.numberOfSelectAllThatApply = 0;
			plugin.settings.numberOfFillInTheBlank = 0;
			plugin.settings.numberOfMatching = 0;
			plugin.settings.numberOfShortAnswer = 0;
			plugin.settings.numberOfLongAnswer = 0;
			plugin.settings.generateTrueFalse = false;
			plugin.settings.generateMultipleChoice = false;
			plugin.settings.generateSelectAllThatApply = false;
			plugin.settings.generateFillInTheBlank = false;
			plugin.settings.generateMatching = false;
			plugin.settings.generateShortAnswer = false;
			plugin.settings.generateLongAnswer = false;
			await plugin.saveSettings();
			updateTotalCount();
			refreshQuestionTypeSettings?.();
			return;
		}
		
		// Get current total (checking all types, not just enabled ones)
		const allTypes = getAllQuestionTypes();
		const currentTotalValue = allTypes.reduce((sum, item) => sum + item.current, 0);
		
		// If all types are at 0, distribute sequentially (round-robin)
		// Each type gets incremented to 1 before moving to the next
		if (currentTotalValue === 0) {
			// Initialize all to 0
			plugin.settings.numberOfTrueFalse = 0;
			plugin.settings.numberOfMultipleChoice = 0;
			plugin.settings.numberOfSelectAllThatApply = 0;
			plugin.settings.numberOfFillInTheBlank = 0;
			plugin.settings.numberOfMatching = 0;
			plugin.settings.numberOfShortAnswer = 0;
			plugin.settings.numberOfLongAnswer = 0;
			
			// Sequential distribution: increment each type one by one
			const typeOrder = [
				"trueFalse",
				"multipleChoice",
				"selectAllThatApply",
				"fillInTheBlank",
				"matching",
				"shortAnswer",
				"longAnswer"
			];
			
			// Distribute sequentially: each type gets 1 before moving to next
			for (let i = 0; i < newTotal; i++) {
				const typeIndex = i % typeOrder.length;
				const type = typeOrder[typeIndex];
				
				switch (type) {
					case "trueFalse":
						plugin.settings.numberOfTrueFalse++;
						break;
					case "multipleChoice":
						plugin.settings.numberOfMultipleChoice++;
						break;
					case "selectAllThatApply":
						plugin.settings.numberOfSelectAllThatApply++;
						break;
					case "fillInTheBlank":
						plugin.settings.numberOfFillInTheBlank++;
						break;
					case "matching":
						plugin.settings.numberOfMatching++;
						break;
					case "shortAnswer":
						plugin.settings.numberOfShortAnswer++;
						break;
					case "longAnswer":
						plugin.settings.numberOfLongAnswer++;
						break;
				}
			}
			
			// Enable all types that have count > 0
			plugin.settings.generateTrueFalse = plugin.settings.numberOfTrueFalse > 0;
			plugin.settings.generateMultipleChoice = plugin.settings.numberOfMultipleChoice > 0;
			plugin.settings.generateSelectAllThatApply = plugin.settings.numberOfSelectAllThatApply > 0;
			plugin.settings.generateFillInTheBlank = plugin.settings.numberOfFillInTheBlank > 0;
			plugin.settings.generateMatching = plugin.settings.numberOfMatching > 0;
			plugin.settings.generateShortAnswer = plugin.settings.numberOfShortAnswer > 0;
			plugin.settings.generateLongAnswer = plugin.settings.numberOfLongAnswer > 0;
		} else {
			// Speaker group slider logic: apply proportional multiplier to all values
			// Calculate multiplier (like a master volume control)
			const multiplier = currentTotalValue > 0 ? newTotal / currentTotalValue : 1;
			
			// Store new values with fractional parts for proper rounding
			const newValues: Array<{ type: string; value: number; fractional: number }> = [];
			let totalRounded = 0;
			
			// Apply multiplier to each type and round down
			allTypes.forEach(item => {
				const scaledValue = item.current * multiplier;
				const roundedValue = Math.max(0, Math.floor(scaledValue));
				const fractional = scaledValue - roundedValue;
				
				newValues.push({
					type: item.type,
					value: roundedValue,
					fractional: fractional
				});
				
				totalRounded += roundedValue;
			});
			
			// Distribute remainder to ensure exact total
			let remainder = newTotal - totalRounded;
			
			if (remainder !== 0) {
				// Sort by fractional part (descending) to distribute remainder fairly
				// This prioritizes types that were closest to rounding up
				newValues.sort((a, b) => b.fractional - a.fractional);
				
				// Distribute remainder
				for (let i = 0; i < Math.abs(remainder); i++) {
					const targetIndex = i % newValues.length;
					if (remainder > 0) {
						newValues[targetIndex].value++;
					} else {
						newValues[targetIndex].value = Math.max(0, newValues[targetIndex].value - 1);
					}
				}
			}
			
			// Apply new values
			newValues.forEach(item => {
				switch (item.type) {
					case "trueFalse":
						plugin.settings.numberOfTrueFalse = item.value;
						plugin.settings.generateTrueFalse = item.value > 0;
						break;
					case "multipleChoice":
						plugin.settings.numberOfMultipleChoice = item.value;
						plugin.settings.generateMultipleChoice = item.value > 0;
						break;
					case "selectAllThatApply":
						plugin.settings.numberOfSelectAllThatApply = item.value;
						plugin.settings.generateSelectAllThatApply = item.value > 0;
						break;
					case "fillInTheBlank":
						plugin.settings.numberOfFillInTheBlank = item.value;
						plugin.settings.generateFillInTheBlank = item.value > 0;
						break;
					case "matching":
						plugin.settings.numberOfMatching = item.value;
						plugin.settings.generateMatching = item.value > 0;
						break;
					case "shortAnswer":
						plugin.settings.numberOfShortAnswer = item.value;
						plugin.settings.generateShortAnswer = item.value > 0;
						break;
					case "longAnswer":
						plugin.settings.numberOfLongAnswer = item.value;
						plugin.settings.generateLongAnswer = item.value > 0;
						break;
				}
			});
		}
		
		await plugin.saveSettings();
		updateTotalCount();
		refreshQuestionTypeSettings?.();
	};

	// Total question count display (at top with +/- buttons)
	const totalCountContainer = generationSection.createDiv("total-question-count-container-qg");
	totalCountContainer.style.marginBottom = "1.5em";
	totalCountContainer.style.gridColumn = "1 / -1"; // Span both columns
	
	const updateTotalCount = (): void => {
		totalCountContainer.empty();
		
		const totalContainer = totalCountContainer.createDiv();
		totalContainer.style.display = "flex";
		totalContainer.style.alignItems = "center";
		totalContainer.style.gap = "0.5em";
		totalContainer.style.justifyContent = "center";
		
		// Minus button
		const minusBtn = totalContainer.createEl("button", { cls: "clickable-icon" });
		setIcon(minusBtn, "minus");
		minusBtn.style.padding = "0.25em";
		minusBtn.title = "Decrease total questions proportionally";
		minusBtn.addEventListener("click", async () => {
			await adjustProportionally(-1);
		});
		
		// Total display
		const totalText = totalContainer.createDiv("total-question-count-text-qg");
		const total = calculateTotalQuestions();
		totalText.textContent = `Total questions per quiz: ${total}`;
		totalText.style.fontWeight = "600";
		totalText.style.fontSize = "1.1em";
		totalText.style.color = "var(--text-normal)";
		
		// Plus button
		const plusBtn = totalContainer.createEl("button", { cls: "clickable-icon" });
		setIcon(plusBtn, "plus");
		plusBtn.style.padding = "0.25em";
		plusBtn.title = "Increase total questions proportionally";
		plusBtn.addEventListener("click", async () => {
			await adjustProportionally(1);
		});
	};
	
	// Initial ratios update
	updateRatiosFromCurrent();
	updateTotalCount();
	
		// Surprise me toggle
		const surpriseMeSetting = new Setting(generationSection)
			.setName("Surprise me")
			.setDesc("Randomize question type distribution. Individual question type counters will be hidden and order controls disabled when enabled.")
		.addToggle(toggle =>
			toggle
					.setValue(plugin.settings.surpriseMe)
				.onChange(async (value) => {
						plugin.settings.surpriseMe = value;
					await plugin.saveSettings();
						refreshQuestionTypeSettings?.();
						refreshQuestionTypeOrderUI?.();
						updateTotalCount();
					})
			);
		surpriseMeSetting.settingEl.style.gridColumn = "1 / -1"; // Span both columns
	
	// Question type settings container (will be hidden when surprise me is enabled)
	const questionTypesContainer = generationSection.createDiv("question-types-container-qg");
	questionTypesContainer.style.gridColumn = "1 / -1"; // Span both columns
	
	let refreshQuestionTypeSettings: (() => void) | null = null;

	const createQuestionTypeSetting = (name: string, iconName: string, quantity: number, onQuantityChange: (value: number) => Promise<void>, container: HTMLElement, hideCounters: boolean = false): void => {
		const setting = new Setting(container);
		
		// Clear default name and create custom name container with icon
		setting.nameEl.empty();
		const nameContainer = setting.nameEl.createDiv("question-type-name-container-qg");
		nameContainer.style.display = "flex";
		nameContainer.style.alignItems = "center";
		nameContainer.style.gap = "0.5em";
		
		// Add icon
		const iconEl = nameContainer.createDiv("question-type-icon-qg");
		setIcon(iconEl, iconName);
		
		// Add name text
		const nameTextEl = nameContainer.createSpan();
		nameTextEl.textContent = name;
		
		// Create slider container
		const controlContainer = setting.controlEl.createDiv("question-type-control-qg");
		controlContainer.style.display = "flex";
		controlContainer.style.alignItems = "center";
		controlContainer.style.gap = "0.5em";
		
		// Value display (declare before slider so it can be used in onChange)
		let valueDisplay: HTMLDivElement | null = null;
		
		// Value display with +/- buttons (only show if not hiding counters)
		if (!hideCounters) {
			const valueContainer = controlContainer.createDiv();
			valueContainer.style.display = "flex";
			valueContainer.style.alignItems = "center";
			valueContainer.style.gap = "0.25em";
			
			// Value display
			valueDisplay = valueContainer.createDiv();
			valueDisplay.textContent = quantity.toString();
			valueDisplay.style.minWidth = "2em";
			valueDisplay.style.textAlign = "center";
			valueDisplay.style.fontWeight = "500";
			valueDisplay.style.color = "var(--text-muted)";
			
			// Minus button
			const minusBtn = valueContainer.createEl("button", { cls: "clickable-icon" });
			setIcon(minusBtn, "minus");
			minusBtn.style.padding = "0.25em";
			minusBtn.title = "Decrease quantity";
			minusBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				const currentValue = parseInt(valueDisplay!.textContent || "0");
				if (currentValue > 0 && sliderComponent) {
					const newValue = currentValue - 1;
					sliderComponent.setValue(newValue);
					valueDisplay!.textContent = newValue.toString();
					await onQuantityChange(newValue);
					updateTotalCount();
					refreshQuestionTypeOrderUI?.();
				}
			});
			
			// Plus button
			const plusBtn = valueContainer.createEl("button", { cls: "clickable-icon" });
			setIcon(plusBtn, "plus");
			plusBtn.style.padding = "0.25em";
			plusBtn.title = "Increase quantity";
			plusBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				const currentValue = parseInt(valueDisplay!.textContent || "0");
				if (currentValue < 20 && sliderComponent) {
					const newValue = currentValue + 1;
					sliderComponent.setValue(newValue);
					valueDisplay!.textContent = newValue.toString();
					await onQuantityChange(newValue);
					updateTotalCount();
					refreshQuestionTypeOrderUI?.();
				}
			});
		}
		
		// Slider using Obsidian's component
		let sliderComponent: any = null;
		setting.addSlider(sliderEl => {
			sliderEl.setValue(quantity);
			sliderEl.setLimits(0, 20, 1);
			sliderComponent = sliderEl;
			sliderEl.onChange(async (value) => {
				if (!hideCounters && valueDisplay) {
					valueDisplay.textContent = value.toString();
				}
				await onQuantityChange(value);
				updateTotalCount();
				refreshQuestionTypeOrderUI?.();
			});
			// Disable slider when surprise me is enabled
			if (hideCounters) {
				sliderEl.sliderEl.disabled = true;
				sliderEl.sliderEl.style.opacity = "0.5";
				sliderEl.sliderEl.style.cursor = "not-allowed";
			}
			// Move slider into our container
			controlContainer.appendChild(sliderEl.sliderEl);
		});
	};

	// Function to refresh question type settings visibility
	const refreshQuestionTypeSettingsFn = (): void => {
		questionTypesContainer.empty();
		
		// Always show question type settings, but disable/hide counters when surprise me is enabled
		questionTypesContainer.style.display = "block";
		const hideCounters = plugin.settings.surpriseMe;
		
		createQuestionTypeSetting(
			"True or false",
			"toggle-left",
			plugin.settings.numberOfTrueFalse,
			async (value) => {
				plugin.settings.numberOfTrueFalse = value;
				plugin.settings.generateTrueFalse = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Multiple choice",
			"circle-dot",
			plugin.settings.numberOfMultipleChoice,
			async (value) => {
				plugin.settings.numberOfMultipleChoice = value;
				plugin.settings.generateMultipleChoice = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Select all that apply",
			"check-square",
			plugin.settings.numberOfSelectAllThatApply,
			async (value) => {
				plugin.settings.numberOfSelectAllThatApply = value;
				plugin.settings.generateSelectAllThatApply = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Fill in the blank",
			"minus",
			plugin.settings.numberOfFillInTheBlank,
			async (value) => {
				plugin.settings.numberOfFillInTheBlank = value;
				plugin.settings.generateFillInTheBlank = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Matching",
			"link-2",
			plugin.settings.numberOfMatching,
			async (value) => {
				plugin.settings.numberOfMatching = value;
				plugin.settings.generateMatching = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Short answer",
			"message-square",
			plugin.settings.numberOfShortAnswer,
			async (value) => {
				plugin.settings.numberOfShortAnswer = value;
				plugin.settings.generateShortAnswer = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Long answer",
			"file-text",
			plugin.settings.numberOfLongAnswer,
			async (value) => {
				plugin.settings.numberOfLongAnswer = value;
				plugin.settings.generateLongAnswer = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
			},
			questionTypesContainer,
			hideCounters
		);
	};
	
	refreshQuestionTypeSettings = refreshQuestionTypeSettingsFn;
	refreshQuestionTypeSettings();

	// Question Type Order Settings
	const questionTypeOrderHeading = new Setting(generationSection).setName("Question Type Order").setHeading();
	questionTypeOrderHeading.settingEl.style.gridColumn = "1 / -1"; // Span both columns

	const randomizeQuestionOrderSetting = new Setting(generationSection)
		.setName("Question randomization")
		.setDesc("Choose how questions are randomized in the quiz.")
		.addDropdown(dropdown =>
			dropdown
				.addOption("all", "Randomize all questions and subjects")
				.addOption("within-subjects", "Randomize questions within each subject")
				.setValue(plugin.settings.randomizeQuestions)
				.onChange(async (value) => {
					plugin.settings.randomizeQuestions = value as "all" | "within-subjects";
					await plugin.saveSettings();
				})
		);
	randomizeQuestionOrderSetting.settingEl.style.gridColumn = "1 / -1"; // Span both columns

	const randomizeQuestionTypeOrderSetting = new Setting(generationSection)
		.setName("Randomize order question types are presented")
		.setDesc("When enabled, shuffles the presentation of question types. When disabled, question type order is preserved for the whole quiz structure.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.randomizeQuestionTypeOrder)
				.onChange(async (value) => {
					plugin.settings.randomizeQuestionTypeOrder = value;
					await plugin.saveSettings();
					refreshQuestionTypeOrderUI?.();
				})
		);
	randomizeQuestionTypeOrderSetting.settingEl.style.gridColumn = "1 / -1"; // Span both columns

	// Question type order drag-drop UI
	const questionTypeOrderContainer = generationSection.createDiv("question-type-order-container-qg");
	questionTypeOrderContainer.style.gridColumn = "1 / -1"; // Span both columns
	
	let refreshQuestionTypeOrderUI: (() => void) | null = null;
	
	const createRefreshFunction = (): (() => void) => {
		return (): void => {
			questionTypeOrderContainer.empty();
			
			// Disable drag-drop interface when surprise me is enabled
			if (plugin.settings.surpriseMe) {
				const infoText = questionTypeOrderContainer.createDiv("question-type-order-info-qg");
				infoText.textContent = "Question type order is disabled when 'Surprise me' is enabled.";
				infoText.style.color = "var(--text-muted)";
				infoText.style.fontSize = "0.9em";
				infoText.style.marginTop = "0.5em";
				return;
			}
			
			if (plugin.settings.randomizeQuestionTypeOrder) {
				// When randomized, show a simple message
				const infoText = questionTypeOrderContainer.createDiv("question-type-order-info-qg");
				infoText.textContent = "Question types will be randomized. Drag-drop is disabled when randomization is enabled.";
				infoText.style.color = "var(--text-muted)";
				infoText.style.fontSize = "0.9em";
				infoText.style.marginTop = "0.5em";
			} else {
				// Show drag-drop interface
				const orderList = questionTypeOrderContainer.createDiv("question-type-order-list-qg");
			
				const questionTypeLabels: Record<QuestionType, string> = {
					trueFalse: "True or False",
					multipleChoice: "Multiple Choice",
					selectAllThatApply: "Select All That Apply",
					fillInTheBlank: "Fill in the Blank",
					matching: "Matching",
					shortAnswer: "Short Answer",
					longAnswer: "Long Answer",
				};
				
				const questionTypeIcons: Record<QuestionType, string> = {
					trueFalse: "toggle-left",
					multipleChoice: "circle-dot",
					selectAllThatApply: "check-square",
					fillInTheBlank: "minus",
					matching: "link-2",
					shortAnswer: "message-square",
					longAnswer: "file-text",
				};
				
				// Get enabled question types from current order
				const enabledTypes = plugin.settings.questionTypeOrder.filter(type => {
					switch (type) {
						case "trueFalse": return plugin.settings.generateTrueFalse;
						case "multipleChoice": return plugin.settings.generateMultipleChoice;
						case "selectAllThatApply": return plugin.settings.generateSelectAllThatApply;
						case "fillInTheBlank": return plugin.settings.generateFillInTheBlank;
						case "matching": return plugin.settings.generateMatching;
						case "shortAnswer": return plugin.settings.generateShortAnswer;
						case "longAnswer": return plugin.settings.generateLongAnswer;
						default: return false;
					}
				});
				
				// Create draggable items
				enabledTypes.forEach((type, index) => {
					const item = orderList.createDiv("question-type-order-item-qg");
					item.setAttribute("data-type", type);
					item.setAttribute("draggable", "true");
					
					// Drag handle icon
					const dragHandle = item.createDiv("question-type-order-drag-handle-qg");
					setIcon(dragHandle, "grip-vertical");
					
					// Label with icon
					const labelContainer = item.createDiv("question-type-order-label-container-qg");
					labelContainer.style.display = "flex";
					labelContainer.style.alignItems = "center";
					labelContainer.style.gap = "0.5em";
					labelContainer.style.flex = "1";
					
					// Icon
					const typeIcon = labelContainer.createDiv("question-type-order-icon-qg");
					typeIcon.style.display = "flex";
					typeIcon.style.alignItems = "center";
					typeIcon.style.minWidth = "1em";
					setIcon(typeIcon, questionTypeIcons[type]);
					
					// Label text
					const label = labelContainer.createSpan("question-type-order-label-qg");
					label.textContent = questionTypeLabels[type];
					
					// Index indicator
					const indexIndicator = item.createDiv("question-type-order-index-qg");
					indexIndicator.textContent = `${index + 1}`;
					
					// Drag and drop event handlers
					item.addEventListener("dragstart", (e) => {
						e.dataTransfer!.effectAllowed = "move";
						e.dataTransfer!.setData("text/plain", type);
						item.classList.add("dragging-qg");
					});
					
					item.addEventListener("dragend", () => {
						item.classList.remove("dragging-qg");
						orderList.querySelectorAll(".question-type-order-item-qg").forEach(el => {
							el.classList.remove("drag-over-qg");
						});
					});
					
					item.addEventListener("dragover", (e) => {
						e.preventDefault();
						e.dataTransfer!.dropEffect = "move";
						item.classList.add("drag-over-qg");
					});
					
					item.addEventListener("dragleave", () => {
						item.classList.remove("drag-over-qg");
					});
					
					item.addEventListener("drop", async (e) => {
						e.preventDefault();
						item.classList.remove("drag-over-qg");
						
						const draggedType = e.dataTransfer!.getData("text/plain") as QuestionType;
						const targetType = type;
						
						if (draggedType !== targetType) {
							// Reorder the array
							const currentOrder = [...plugin.settings.questionTypeOrder];
							const draggedIndex = currentOrder.indexOf(draggedType);
							const targetIndex = currentOrder.indexOf(targetType);
							
							// Remove dragged item
							currentOrder.splice(draggedIndex, 1);
							// Insert at target position
							currentOrder.splice(targetIndex, 0, draggedType);
							
							plugin.settings.questionTypeOrder = currentOrder;
					await plugin.saveSettings();
							refreshQuestionTypeOrderUI?.();
						}
					});
					
					// Touch support for mobile
					let touchStartY = 0;
					let touchStartIndex = 0;
					
					item.addEventListener("touchstart", (e) => {
						touchStartY = e.touches[0].clientY;
						touchStartIndex = index;
					}, { passive: true });
					
					item.addEventListener("touchmove", (e) => {
						e.preventDefault();
						const touchY = e.touches[0].clientY;
						const deltaY = touchY - touchStartY;
						
						if (Math.abs(deltaY) > 30) {
							const direction = deltaY > 0 ? 1 : -1;
							const newIndex = touchStartIndex + direction;
							
							if (newIndex >= 0 && newIndex < enabledTypes.length) {
								const currentOrder = [...plugin.settings.questionTypeOrder];
								const draggedType = enabledTypes[touchStartIndex];
								const targetType = enabledTypes[newIndex];
								
								const draggedIndex = currentOrder.indexOf(draggedType);
								const targetIndex = currentOrder.indexOf(targetType);
								
								currentOrder.splice(draggedIndex, 1);
								currentOrder.splice(targetIndex, 0, draggedType);
								
							plugin.settings.questionTypeOrder = currentOrder;
							plugin.saveSettings();
							refreshQuestionTypeOrderUI?.();
							}
						}
					}, { passive: false });
				});
				
				if (enabledTypes.length === 0) {
					const emptyMessage = orderList.createDiv("question-type-order-empty-qg");
					emptyMessage.textContent = "Enable at least one question type to configure order.";
					emptyMessage.style.color = "var(--text-muted)";
					emptyMessage.style.fontSize = "0.9em";
					emptyMessage.style.padding = "1em";
					emptyMessage.style.textAlign = "center";
				}
			}
		};
	};
	
	refreshQuestionTypeOrderUI = createRefreshFunction();
	refreshQuestionTypeOrderUI();
};

export default displayGenerationSettings;
