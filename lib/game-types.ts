export type GameSnapshot = {
  gameId: number;
  counts: Record<string, number>;
  participants: number;
  currentCall: { id: number; promptId: string; remainingMs: number | null } | null;
  receivedAt?: number;
  calledCount: number;
  yes: number;
  no: number;
  markedPromptIds?: string[];
  winners: { id: number; name: string; wonAt: string; winNumber: number }[];
};
