import { Notice } from "obsidian";
import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

interface AnswerInputProps {
	onSubmit: (input: string) => void;
	clearInputOnSubmit?: boolean;
	disabled?: boolean;
	onChoose?: () => void;
	value?: string;
	onChange?: (value: string) => void;
	reviewMode?: boolean;
}

const AnswerInput = ({ onSubmit, clearInputOnSubmit = true, disabled = false, onChoose, value, onChange, reviewMode = false }: AnswerInputProps) => {
	const [userInput, setUserInput] = useState<string>(value ?? "");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const hasPlayedChoose = useRef<boolean>(false);

	const adjustInputHeight = () => {
		if (inputRef.current) {
			inputRef.current.style.height = "auto";
			inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
		}
	};

	const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		setUserInput(event.target.value);
		adjustInputHeight();
		onChange?.(event.target.value);
		if (onChoose && !hasPlayedChoose.current && event.target.value.length === 1) {
			onChoose();
			hasPlayedChoose.current = true;
		}
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== "Enter" || event.shiftKey) return;

		event.preventDefault();
		
		// In review mode, Enter should ALWAYS just navigate - don't call onSubmit at all
		if (reviewMode) {
			// Trigger navigation event directly - don't go through submit flow
			const navEvent = new CustomEvent('quiz-navigate-next');
			window.dispatchEvent(navEvent);
			return;
		}
		
		// Normal mode: require input and submit
		if (!userInput.trim()) {
			new Notice("Input cannot be blank");
			return;
		}

		onSubmit(userInput);
		if (clearInputOnSubmit || userInput.toLowerCase().trim() === "skip") {
			setUserInput("");
			onChange?.("");
		}
		adjustInputHeight();
	};

	useEffect(() => {
		if (value === undefined || value === userInput) return;
		setUserInput(value);
		setTimeout(adjustInputHeight, 0);
	}, [value, userInput]);

	return (
		<textarea
			className="text-area-input-qg"
			value={userInput}
			ref={inputRef}
			onChange={handleInputChange}
			onKeyDown={handleKeyDown}
			onFocus={() => {
				if (onChoose && !hasPlayedChoose.current && userInput === "") {
					onChoose();
					hasPlayedChoose.current = true;
				}
			}}
			disabled={disabled}
			placeholder="Type your answer here..."
			rows={1}
		/>
	);
};

export default AnswerInput;
