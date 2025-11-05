import { App, TFile } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Question, QuizResult } from "../../utils/types";
import QuizModal from "./QuizModal";
import QuizSaver from "../../services/quizSaver";
import type QuizGenerator from "../../main";

interface QuizModalWrapperProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	quizSaver: QuizSaver;
	reviewing: boolean;
	hasBeenTaken: boolean;
	previousAttempts: Map<string, boolean>;
	questionWrongCounts?: Map<string, number>;
	plugin?: QuizGenerator;
	handleClose: () => void;
	onQuizComplete?: (results: QuizResult[], questionHashes: string[], timestamp: string) => void;
	existingQuizFile?: TFile;
	contentSelectionMode?: string;
}

const QuizModalWrapper = ({ app, settings, quiz, quizSaver, reviewing, hasBeenTaken, previousAttempts, questionWrongCounts, plugin, handleClose, onQuizComplete, existingQuizFile, contentSelectionMode }: QuizModalWrapperProps) => {
	return <QuizModal
		app={app}
		settings={settings}
		quiz={quiz}
		quizSaver={quizSaver}
		reviewing={reviewing}
		hasBeenTaken={hasBeenTaken}
		previousAttempts={previousAttempts}
		questionWrongCounts={questionWrongCounts}
		plugin={plugin}
		handleClose={handleClose}
		onQuizComplete={onQuizComplete}
		existingQuizFile={existingQuizFile}
		contentSelectionMode={contentSelectionMode}
	/>;
};

export default QuizModalWrapper;
