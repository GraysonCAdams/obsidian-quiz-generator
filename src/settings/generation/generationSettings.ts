import { Notice, Setting, setIcon } from "obsidian";
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
			const newTotal = Math.max(0, Math.min(50, currentTotal + delta)); // Cap at 50
			
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
		
		// Get enabled question types (where quantity > 0)
		const enabledTypes = getAllQuestionTypes().filter(item => item.current > 0);
		const numEnabledTypes = enabledTypes.length;
		
		// Always use proportional distribution based on enabled types
		// If no types are enabled, default to all 7 types set to 1 (even distribution)
		if (numEnabledTypes === 0) {
			// When starting from all zeros, set all to 1
			if (delta > 0) {
				const allTypes = getAllQuestionTypes();
				allTypes.forEach(item => {
					switch (item.type) {
						case "trueFalse":
							plugin.settings.numberOfTrueFalse = 1;
							plugin.settings.generateTrueFalse = true;
							break;
						case "multipleChoice":
							plugin.settings.numberOfMultipleChoice = 1;
							plugin.settings.generateMultipleChoice = true;
							break;
						case "selectAllThatApply":
							plugin.settings.numberOfSelectAllThatApply = 1;
							plugin.settings.generateSelectAllThatApply = true;
							break;
						case "fillInTheBlank":
							plugin.settings.numberOfFillInTheBlank = 1;
							plugin.settings.generateFillInTheBlank = true;
							break;
						case "matching":
							plugin.settings.numberOfMatching = 1;
							plugin.settings.generateMatching = true;
							break;
						case "shortAnswer":
							plugin.settings.numberOfShortAnswer = 1;
							plugin.settings.generateShortAnswer = true;
							break;
						case "longAnswer":
							plugin.settings.numberOfLongAnswer = 1;
							plugin.settings.generateLongAnswer = true;
							break;
					}
				});
				await plugin.saveSettings();
				updateTotalCount();
				refreshQuestionTypeSettings?.();
				return;
			} else {
				// Can't decrease from 0
				return;
			}
		}
		
		// Proportional distribution: increment amount is number of enabled types
		const incrementAmount = numEnabledTypes;
		const actualDelta = delta * incrementAmount;
		const currentTotal = enabledTypes.reduce((sum, item) => sum + item.current, 0);
		const newTotal = Math.max(0, Math.min(50, currentTotal + actualDelta)); // Cap at 50
		
		if (newTotal === 0) {
			// Set all enabled types to 0
			enabledTypes.forEach(item => {
				switch (item.type) {
					case "trueFalse":
						plugin.settings.numberOfTrueFalse = 0;
						plugin.settings.generateTrueFalse = false;
						break;
					case "multipleChoice":
						plugin.settings.numberOfMultipleChoice = 0;
						plugin.settings.generateMultipleChoice = false;
						break;
					case "selectAllThatApply":
						plugin.settings.numberOfSelectAllThatApply = 0;
						plugin.settings.generateSelectAllThatApply = false;
						break;
					case "fillInTheBlank":
						plugin.settings.numberOfFillInTheBlank = 0;
						plugin.settings.generateFillInTheBlank = false;
						break;
					case "matching":
						plugin.settings.numberOfMatching = 0;
						plugin.settings.generateMatching = false;
						break;
					case "shortAnswer":
						plugin.settings.numberOfShortAnswer = 0;
						plugin.settings.generateShortAnswer = false;
						break;
					case "longAnswer":
						plugin.settings.numberOfLongAnswer = 0;
						plugin.settings.generateLongAnswer = false;
						break;
				}
			});
		} else {
			// Use actual integer values as ratios (as visually presented)
			// This maintains the intended proportions based on what the user sees
			const newValues: Array<{ type: string; value: number; fractional: number }> = [];
			let totalRounded = 0;
			
			// Calculate the sum of current integer values to use as the ratio base
			const currentSum = enabledTypes.reduce((sum, item) => sum + item.current, 0);
			
			if (currentSum === 0) {
				// If all are 0, distribute evenly
				const perType = Math.floor(newTotal / enabledTypes.length);
				const remainder = newTotal % enabledTypes.length;
				
				enabledTypes.forEach((item, index) => {
					const value = perType + (index < remainder ? 1 : 0);
					newValues.push({
						type: item.type,
						value: value,
						fractional: 0
					});
				});
			} else {
				// Calculate target values based on current integer values as ratios
				enabledTypes.forEach(item => {
					// Use current integer value as the ratio part
					// Example: if types are 2, 5, 3, use 2:5:3 ratio
					const targetValue = (newTotal * item.current) / currentSum;
					const roundedValue = Math.max(0, Math.floor(targetValue));
					const fractional = targetValue - roundedValue;
					
					newValues.push({
						type: item.type,
						value: roundedValue,
						fractional: fractional
					});
					
					totalRounded += roundedValue;
				});
			}
			
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
			
			// Apply new values (only to enabled types)
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
		refreshDistributionChart?.();
	};

	// Total question count display (at top with +/- buttons)
	const totalCountContainer = generationSection.createDiv("total-question-count-container-qg");
	totalCountContainer.style.marginBottom = "1.5em";
	totalCountContainer.style.gridColumn = "1 / -1"; // Span both columns
	
	const updateTotalCount = (): void => {
		totalCountContainer.empty();
		
		const totalContainer = totalCountContainer.createDiv("total-display-enhanced-qg");
		totalContainer.style.display = "flex";
		totalContainer.style.flexDirection = "column";
		totalContainer.style.gap = "0.75em";
		totalContainer.style.padding = "1em";
		totalContainer.style.background = "var(--background-secondary)";
		totalContainer.style.borderRadius = "8px";
		totalContainer.style.border = "1px solid var(--background-modifier-border)";
		
		// Top row: Total text and buttons
		const topRow = totalContainer.createDiv();
		topRow.style.display = "flex";
		topRow.style.alignItems = "center";
		topRow.style.justifyContent = "center";
		topRow.style.gap = "0.75em";
		
		// Minus button
		const minusBtn = topRow.createEl("button", { cls: "clickable-icon" });
		setIcon(minusBtn, "minus");
		minusBtn.style.padding = "0.5em";
		minusBtn.style.fontSize = "1.2em";
		minusBtn.title = "Decrease total questions proportionally";
		minusBtn.addEventListener("click", async () => {
			await adjustProportionally(-1);
		});
		
		// Total display
		const totalText = topRow.createDiv("total-question-count-text-qg");
		const currentTotal = calculateTotalQuestions();
		totalText.textContent = `Total: ${currentTotal} / 50`;
		totalText.style.fontWeight = "700";
		totalText.style.fontSize = "1.3em";
		totalText.style.color = "var(--text-normal)";
		
		// Plus button
		const plusBtn = topRow.createEl("button", { cls: "clickable-icon" });
		setIcon(plusBtn, "plus");
		plusBtn.style.padding = "0.5em";
		plusBtn.style.fontSize = "1.2em";
		plusBtn.title = currentTotal >= 50 ? "Maximum of 50 questions reached" : "Increase total questions proportionally";
		if (currentTotal >= 50) {
			plusBtn.disabled = true;
			plusBtn.style.opacity = "0.4";
			plusBtn.style.cursor = "not-allowed";
		}
		plusBtn.addEventListener("click", async () => {
			if (currentTotal < 50) {
				await adjustProportionally(1);
			} else {
				new Notice("Maximum of 50 questions reached");
			}
		});
		
		// Progress bar
		const progressBarContainer = totalContainer.createDiv();
		progressBarContainer.style.width = "100%";
		progressBarContainer.style.height = "8px";
		progressBarContainer.style.background = "var(--background-modifier-border)";
		progressBarContainer.style.borderRadius = "4px";
		progressBarContainer.style.overflow = "hidden";
		progressBarContainer.style.position = "relative";
		
		const progressBar = progressBarContainer.createDiv();
		const percentage = (currentTotal / 50) * 100;
		progressBar.style.width = `${percentage}%`;
		progressBar.style.height = "100%";
		progressBar.style.background = currentTotal >= 50 
			? "var(--text-error)" 
			: currentTotal >= 40 
				? "var(--text-warning)" 
				: "var(--text-accent)";
		progressBar.style.transition = "width 0.3s ease, background-color 0.3s ease";
	};
	
	// Initial ratios update
	updateRatiosFromCurrent();
	updateTotalCount();
	
		// Surprise me toggle
		const surpriseMeSetting = new Setting(generationSection)
			.setName("Surprise me")
			.setDesc("Randomize question type distribution. Individual question type controls will be hidden when enabled.")
		.addToggle(toggle =>
			toggle
					.setValue(plugin.settings.surpriseMe)
				.onChange(async (value) => {
						plugin.settings.surpriseMe = value;
					await plugin.saveSettings();
						refreshQuestionTypeSettings?.();
						refreshQuestionTypeOrderUI?.();
						refreshDistributionChart?.();
						updateTotalCount();
					})
			);
		surpriseMeSetting.settingEl.style.gridColumn = "1 / -1"; // Span both columns
	
	// Split-view container for question types and distribution
	const splitViewContainer = generationSection.createDiv("question-types-split-view-qg");
	splitViewContainer.style.display = "grid";
	splitViewContainer.style.gridTemplateColumns = "1fr 1fr";
	splitViewContainer.style.gap = "2em";
	splitViewContainer.style.gridColumn = "1 / -1";
	splitViewContainer.style.marginTop = "1em";
	
	// Left panel: Question type controls
	const questionTypesLeftPanel = splitViewContainer.createDiv("question-types-left-panel-qg");
	
	// Right panel: Distribution visualization
	const questionTypesRightPanel = splitViewContainer.createDiv("question-types-right-panel-qg");
	
	// Question type settings container (inside left panel)
	const questionTypesContainer = questionTypesLeftPanel.createDiv("question-types-container-qg");
	
	let refreshQuestionTypeSettings: (() => void) | null = null;
	let refreshDistributionChart: (() => void) | null = null;

	const createQuestionTypeSetting = (
		name: string, 
		iconName: string, 
		quantity: number, 
		isEnabled: boolean,
		onQuantityChange: (value: number) => Promise<void>,
		onEnabledChange: (enabled: boolean) => Promise<void>,
		container: HTMLElement, 
		hideCounters: boolean = false
	): void => {
		const setting = new Setting(container);
		setting.settingEl.classList.add("question-type-row-qg");
		
		// Clear default name and create custom name container with checkbox, icon, and name
		setting.nameEl.empty();
		const nameContainer = setting.nameEl.createDiv("question-type-name-container-qg");
		nameContainer.style.display = "flex";
		nameContainer.style.alignItems = "center";
		nameContainer.style.gap = "0.5em";
		
		// Add checkbox for enable/disable
		const checkbox = nameContainer.createEl("input", { type: "checkbox", cls: "question-type-checkbox-qg" });
		checkbox.checked = isEnabled;
		const checkboxRef = checkbox; // Store reference for updates
		checkbox.addEventListener("change", async (e) => {
			const checked = (e.target as HTMLInputElement).checked;
			await onEnabledChange(checked);
			if (!checked) {
				// When disabling, set quantity to 0
				await onQuantityChange(0);
			}
		});
		
		// Add icon
		const iconEl = nameContainer.createDiv("question-type-icon-qg");
		setIcon(iconEl, iconName);
		iconEl.style.opacity = isEnabled ? "1" : "0.5";
		
		// Add name text
		const nameTextEl = nameContainer.createSpan();
		nameTextEl.textContent = name;
		nameTextEl.style.opacity = isEnabled ? "1" : "0.7";
		
		// Create slider container
		const controlContainer = setting.controlEl.createDiv("question-type-control-qg");
		controlContainer.style.display = "flex";
		controlContainer.style.alignItems = "center";
		controlContainer.style.gap = "0.5em";
		
		// Value display (declare before slider so it can be used in onChange)
		let valueDisplay: HTMLDivElement | null = null;
		let countInput: HTMLInputElement | null = null;
		
		// Value display with direct input and +/- buttons (only show if not hiding counters)
		if (!hideCounters) {
			const valueContainer = controlContainer.createDiv();
			valueContainer.style.display = "flex";
			valueContainer.style.alignItems = "center";
			valueContainer.style.gap = "0.25em";
			
			// Direct number input field
			countInput = valueContainer.createEl("input", { type: "number", cls: "count-input-qg" });
			countInput.value = quantity.toString();
			countInput.min = "0";
			countInput.max = "50";
			countInput.style.width = "3em";
			countInput.style.textAlign = "center";
			countInput.style.padding = "0.25em";
			countInput.style.border = "1px solid var(--background-modifier-border)";
			countInput.style.borderRadius = "4px";
			countInput.style.background = "var(--background-primary)";
			countInput.disabled = !isEnabled;
			
			countInput.addEventListener("change", async (e) => {
				const inputValue = parseInt((e.target as HTMLInputElement).value) || 0;
				const currentTotal = calculateTotalQuestions();
				const currentValue = quantity;
				const newTotal = currentTotal - currentValue + inputValue;
				
				if (newTotal > 50) {
					const maxAllowed = 50 - (currentTotal - currentValue);
					const finalValue = Math.max(0, Math.min(maxAllowed, inputValue));
					countInput!.value = finalValue.toString();
					if (sliderComponent) {
						sliderComponent.setValue(finalValue);
					}
					new Notice("Maximum of 50 total questions reached");
					await onQuantityChange(finalValue);
					// Update checkbox if value > 0
					if (checkboxRef && finalValue > 0 && !checkboxRef.checked) {
						checkboxRef.checked = true;
						await onEnabledChange(true);
					}
				} else {
					if (sliderComponent) {
						sliderComponent.setValue(inputValue);
					}
					await onQuantityChange(inputValue);
					// Update checkbox if value > 0
					if (checkboxRef && inputValue > 0 && !checkboxRef.checked) {
						checkboxRef.checked = true;
						await onEnabledChange(true);
					} else if (checkboxRef && inputValue === 0 && checkboxRef.checked) {
						checkboxRef.checked = false;
						await onEnabledChange(false);
					}
				}
				updateTotalCount();
				refreshQuestionTypeOrderUI?.();
				refreshDistributionChart?.();
			});
			
			// Value display (for visual feedback, can be hidden if using input)
			valueDisplay = valueContainer.createDiv();
			valueDisplay.textContent = quantity.toString();
			valueDisplay.style.minWidth = "2em";
			valueDisplay.style.textAlign = "center";
			valueDisplay.style.fontWeight = "500";
			valueDisplay.style.color = "var(--text-muted)";
			valueDisplay.style.display = "none"; // Hide since we have direct input
			
			// Minus button
			const minusBtn = valueContainer.createEl("button", { cls: "clickable-icon" });
			setIcon(minusBtn, "minus");
			minusBtn.style.padding = "0.25em";
			minusBtn.title = "Decrease quantity";
			minusBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				const currentValue = parseInt(countInput?.value || "0");
				if (currentValue > 0 && sliderComponent && countInput) {
					const newValue = currentValue - 1;
					sliderComponent.setValue(newValue);
					countInput.value = newValue.toString();
				await onQuantityChange(newValue);
				// Update checkbox if value > 0
				if (checkboxRef && newValue > 0 && !checkboxRef.checked) {
					checkboxRef.checked = true;
					await onEnabledChange(true);
				} else if (checkboxRef && newValue === 0 && checkboxRef.checked) {
					checkboxRef.checked = false;
					await onEnabledChange(false);
				}
				updateTotalCount();
				refreshQuestionTypeOrderUI?.();
				refreshDistributionChart?.();
				}
			});
			
			// Plus button
			const plusBtn = valueContainer.createEl("button", { cls: "clickable-icon" });
			setIcon(plusBtn, "plus");
			plusBtn.style.padding = "0.25em";
			plusBtn.title = "Increase quantity";
			plusBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				const currentValue = parseInt(countInput?.value || "0");
				const currentTotal = calculateTotalQuestions();
				const maxAllowed = 50 - (currentTotal - currentValue); // No per-type max, just 50 total
				
				if (currentValue < maxAllowed && sliderComponent && maxAllowed > 0 && countInput) {
					const newValue = currentValue + 1;
					sliderComponent.setValue(newValue);
					countInput.value = newValue.toString();
					await onQuantityChange(newValue);
					// Update checkbox if value > 0
					if (checkboxRef && newValue > 0 && !checkboxRef.checked) {
						checkboxRef.checked = true;
						await onEnabledChange(true);
					}
					updateTotalCount();
					refreshQuestionTypeOrderUI?.();
					refreshDistributionChart?.();
				} else if (maxAllowed <= 0) {
					// Show warning when trying to exceed 50
					new Notice("Maximum of 50 total questions reached");
				}
			});
		}
		
		// Slider using Obsidian's component
		let sliderComponent: any = null;
		setting.addSlider(sliderEl => {
			sliderEl.setValue(quantity);
			sliderEl.setLimits(0, 50, 1); // No per-type max, just 50 total limit
			sliderComponent = sliderEl;
			sliderEl.onChange(async (value) => {
				// Check if adjusting this slider would exceed 50 total questions
				const currentTotal = calculateTotalQuestions();
				const currentValue = quantity;
				const newTotal = currentTotal - currentValue + value;
				
				if (newTotal > 50) {
					// Cap the value to prevent exceeding 50
					const maxAllowed = 50 - (currentTotal - currentValue);
					value = Math.max(0, Math.min(maxAllowed, value));
					sliderEl.setValue(value);
					if (!hideCounters && countInput) {
						countInput.value = value.toString();
					}
				} else if (!hideCounters && countInput) {
					countInput.value = value.toString();
				}
				
				await onQuantityChange(value);
				// Update checkbox if value > 0
				if (checkboxRef && value > 0 && !checkboxRef.checked) {
					checkboxRef.checked = true;
					await onEnabledChange(true);
				} else if (checkboxRef && value === 0 && checkboxRef.checked) {
					checkboxRef.checked = false;
					await onEnabledChange(false);
				}
				updateTotalCount();
				refreshQuestionTypeOrderUI?.();
				refreshDistributionChart?.();
			});
			
			// Disable slider and input when type is disabled
			if (!isEnabled) {
				sliderEl.sliderEl.disabled = true;
				sliderEl.sliderEl.style.opacity = "0.5";
				sliderEl.sliderEl.style.cursor = "not-allowed";
				if (countInput) {
					countInput.disabled = true;
				}
			}
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

	// Function to create distribution chart
	const createDistributionChart = (): void => {
		questionTypesRightPanel.empty();
		
		if (plugin.settings.surpriseMe) {
			const infoText = questionTypesRightPanel.createDiv();
			infoText.textContent = "Distribution visualization is disabled in 'Surprise me' mode.";
			infoText.style.color = "var(--text-muted)";
			infoText.style.fontSize = "0.9em";
			infoText.style.padding = "1em";
			return;
		}
		
		const chartContainer = questionTypesRightPanel.createDiv("distribution-chart-qg");
		chartContainer.style.padding = "1em";
		chartContainer.style.background = "var(--background-secondary)";
		chartContainer.style.borderRadius = "8px";
		chartContainer.style.border = "1px solid var(--background-modifier-border)";
		
		const heading = chartContainer.createEl("h3", { text: "Distribution" });
		heading.style.marginTop = "0";
		heading.style.marginBottom = "1em";
		heading.style.fontSize = "1.1em";
		heading.style.fontWeight = "600";
		
		const allTypes = getAllQuestionTypes();
		const enabledTypes = allTypes.filter(item => item.current > 0);
		const currentTotal = calculateTotalQuestions();
		
		if (currentTotal === 0) {
			const emptyText = chartContainer.createDiv();
			emptyText.textContent = "No questions configured. Enable question types to see distribution.";
			emptyText.style.color = "var(--text-muted)";
			emptyText.style.fontSize = "0.9em";
			return;
		}
		
		// Stacked bar chart
		const barContainer = chartContainer.createDiv();
		barContainer.style.width = "100%";
		barContainer.style.height = "200px";
		barContainer.style.display = "flex";
		barContainer.style.flexDirection = "row";
		barContainer.style.border = "1px solid var(--background-modifier-border)";
		barContainer.style.borderRadius = "4px";
		barContainer.style.overflow = "hidden";
		barContainer.style.marginBottom = "1em";
		
		// Color palette for question types
		const typeColors: Record<string, string> = {
			"trueFalse": "#4a90e2",
			"multipleChoice": "#50c878",
			"selectAllThatApply": "#f39c12",
			"fillInTheBlank": "#e74c3c",
			"matching": "#9b59b6",
			"shortAnswer": "#1abc9c",
			"longAnswer": "#34495e"
		};
		
		// Create segments
		enabledTypes.forEach((item, index) => {
			const percentage = (item.current / currentTotal) * 100;
			const segment = barContainer.createDiv("distribution-segment-qg");
			segment.style.width = `${percentage}%`;
			segment.style.height = "100%";
			segment.style.background = typeColors[item.type] || "var(--text-muted)";
			segment.style.position = "relative";
			segment.style.cursor = "pointer";
			segment.style.transition = "opacity 0.2s ease";
			
			// Add hover effect
			segment.addEventListener("mouseenter", () => {
				segment.style.opacity = "0.8";
			});
			segment.addEventListener("mouseleave", () => {
				segment.style.opacity = "1";
			});
			
			// Tooltip on hover
			const typeLabels: Record<string, string> = {
				"trueFalse": "True or False",
				"multipleChoice": "Multiple Choice",
				"selectAllThatApply": "Select All That Apply",
				"fillInTheBlank": "Fill in the Blank",
				"matching": "Matching",
				"shortAnswer": "Short Answer",
				"longAnswer": "Long Answer"
			};
			
			segment.title = `${typeLabels[item.type]}: ${item.current} (${percentage.toFixed(1)}%)`;
		});
		
		// List of types with percentages
		const typeList = chartContainer.createDiv();
		typeList.style.display = "flex";
		typeList.style.flexDirection = "column";
		typeList.style.gap = "0.5em";
		
		enabledTypes.forEach(item => {
			const percentage = (item.current / currentTotal) * 100;
			const typeRow = typeList.createDiv();
			typeRow.style.display = "flex";
			typeRow.style.alignItems = "center";
			typeRow.style.gap = "0.5em";
			typeRow.style.padding = "0.25em 0";
			
			const colorIndicator = typeRow.createDiv();
			colorIndicator.style.width = "12px";
			colorIndicator.style.height = "12px";
			colorIndicator.style.borderRadius = "2px";
			colorIndicator.style.background = typeColors[item.type] || "var(--text-muted)";
			
			const typeLabels: Record<string, string> = {
				"trueFalse": "True or False",
				"multipleChoice": "Multiple Choice",
				"selectAllThatApply": "Select All That Apply",
				"fillInTheBlank": "Fill in the Blank",
				"matching": "Matching",
				"shortAnswer": "Short Answer",
				"longAnswer": "Long Answer"
			};
			
			const label = typeRow.createSpan();
			label.textContent = typeLabels[item.type] || item.type;
			label.style.flex = "1";
			label.style.fontSize = "0.9em";
			
			const count = typeRow.createSpan();
			count.textContent = `${item.current}`;
			count.style.fontWeight = "600";
			count.style.minWidth = "2em";
			count.style.textAlign = "right";
			
			const percent = typeRow.createSpan();
			percent.textContent = `${percentage.toFixed(1)}%`;
			percent.style.minWidth = "3.5em";
			percent.style.textAlign = "right";
			percent.style.color = "var(--text-muted)";
			percent.style.fontSize = "0.85em";
		});
	};
	
	// Function to refresh question type settings visibility
	const refreshQuestionTypeSettingsFn = (): void => {
		questionTypesContainer.empty();
		
		// Always show question type settings, but disable/hide counters when surprise me is enabled
		questionTypesContainer.style.display = "block";
		const hideCounters = plugin.settings.surpriseMe;
		
		// Hide/show split view based on surprise me
		if (plugin.settings.surpriseMe) {
			splitViewContainer.style.display = "none";
		} else {
			splitViewContainer.style.display = "grid";
		}
		
		createQuestionTypeSetting(
			"True or false",
			"toggle-left",
			plugin.settings.numberOfTrueFalse,
			plugin.settings.generateTrueFalse,
			async (value) => {
				plugin.settings.numberOfTrueFalse = value;
				plugin.settings.generateTrueFalse = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			async (enabled) => {
				plugin.settings.generateTrueFalse = enabled;
				if (!enabled) {
					plugin.settings.numberOfTrueFalse = 0;
				}
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Multiple choice",
			"circle-dot",
			plugin.settings.numberOfMultipleChoice,
			plugin.settings.generateMultipleChoice,
			async (value) => {
				plugin.settings.numberOfMultipleChoice = value;
				plugin.settings.generateMultipleChoice = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			async (enabled) => {
				plugin.settings.generateMultipleChoice = enabled;
				if (!enabled) {
					plugin.settings.numberOfMultipleChoice = 0;
				}
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Select all that apply",
			"check-square",
			plugin.settings.numberOfSelectAllThatApply,
			plugin.settings.generateSelectAllThatApply,
			async (value) => {
				plugin.settings.numberOfSelectAllThatApply = value;
				plugin.settings.generateSelectAllThatApply = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			async (enabled) => {
				plugin.settings.generateSelectAllThatApply = enabled;
				if (!enabled) {
					plugin.settings.numberOfSelectAllThatApply = 0;
				}
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Fill in the blank",
			"minus",
			plugin.settings.numberOfFillInTheBlank,
			plugin.settings.generateFillInTheBlank,
			async (value) => {
				plugin.settings.numberOfFillInTheBlank = value;
				plugin.settings.generateFillInTheBlank = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			async (enabled) => {
				plugin.settings.generateFillInTheBlank = enabled;
				if (!enabled) {
					plugin.settings.numberOfFillInTheBlank = 0;
				}
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Matching",
			"link-2",
			plugin.settings.numberOfMatching,
			plugin.settings.generateMatching,
			async (value) => {
				plugin.settings.numberOfMatching = value;
				plugin.settings.generateMatching = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			async (enabled) => {
				plugin.settings.generateMatching = enabled;
				if (!enabled) {
					plugin.settings.numberOfMatching = 0;
				}
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Short answer",
			"message-square",
			plugin.settings.numberOfShortAnswer,
			plugin.settings.generateShortAnswer,
			async (value) => {
				plugin.settings.numberOfShortAnswer = value;
				plugin.settings.generateShortAnswer = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			async (enabled) => {
				plugin.settings.generateShortAnswer = enabled;
				if (!enabled) {
					plugin.settings.numberOfShortAnswer = 0;
				}
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			questionTypesContainer,
			hideCounters
		);

		createQuestionTypeSetting(
			"Long answer",
			"file-text",
			plugin.settings.numberOfLongAnswer,
			plugin.settings.generateLongAnswer,
			async (value) => {
				plugin.settings.numberOfLongAnswer = value;
				plugin.settings.generateLongAnswer = value > 0;
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			async (enabled) => {
				plugin.settings.generateLongAnswer = enabled;
				if (!enabled) {
					plugin.settings.numberOfLongAnswer = 0;
				}
				updateRatiosFromCurrent();
				await plugin.saveSettings();
				updateTotalCount();
				refreshDistributionChart?.();
			},
			questionTypesContainer,
			hideCounters
		);
		
		// Refresh distribution chart
		if (refreshDistributionChart) {
			refreshDistributionChart();
		}
	};
	
	refreshQuestionTypeSettings = refreshQuestionTypeSettingsFn;
	refreshDistributionChart = createDistributionChart;
	
	refreshQuestionTypeSettings();
	refreshDistributionChart();

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
