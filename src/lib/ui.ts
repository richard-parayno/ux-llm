/** Client-side view state for a suggested probe. */
export interface ProbeState {
	question: string;
	dismissed: boolean;
	inGuide: boolean;
	rating: 'helpful' | 'not_helpful' | null;
}
