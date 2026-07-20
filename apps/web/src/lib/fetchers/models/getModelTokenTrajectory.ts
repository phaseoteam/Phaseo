export type ModelTokenTrajectoryPoint = {
	date: string;
	tokens: number;
	cumulativeTokens: number;
	daysSinceRelease: number;
};

export type ModelTokenMilestone = {
	threshold: number;
	reachedOn: string | null;
	daysSinceRelease: number | null;
};

export type ModelSuccessorMilestone = {
	modelId: string;
	name: string;
	releaseDate: string | null;
	daysSinceRelease: number | null;
};

export type ModelTokenTrajectory = {
	releaseDate: string;
	deprecationDate: string | null;
	deprecationDaysSinceRelease: number | null;
	points: ModelTokenTrajectoryPoint[];
	tokenMilestones: ModelTokenMilestone[];
	successorMilestones: ModelSuccessorMilestone[];
};
