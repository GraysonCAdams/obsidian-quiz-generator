import { Notice } from "obsidian";
import { ChangeEvent, KeyboardEvent, useRef, useState } from "react";

interface AnswerInputProps {
	onSubmit: (input: string) => void;
	clearInputOnSubmit?: boolean;
	disabled?: boolean;
	onChoose?: () => void;
}

const AnswerInput = ({ onSubmit, clearInputOnSubmit = true, disabled = false, onChoose }: AnswerInputProps) => {
	const [userInput, setUserInput] = useState<string>("");
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
		if (onChoose && !hasPlayedChoose.current && event.target.value.length === 1) {
			onChoose();
			hasPlayedChoose.current = true;
		}
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== "Enter" || event.shiftKey) return;

		event.preventDefault();
		if (!userInput.trim()) {
			new Notice("Input cannot be blank");
			return;
		}

		onSubmit(userInput);
		if (clearInputOnSubmit || userInput.toLowerCase().trim() === "skip") {
			setUserInput("");
		}
		adjustInputHeight();
	};

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
