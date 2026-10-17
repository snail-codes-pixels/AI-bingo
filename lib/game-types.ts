export type GameSnapshot = {
  gameId: number;
  counts: Record<string, number>;
  participants: number;
  currentCall: { id: number; promptId: string } | null;
  calledCount: number;
  yes: number;
  no: number;
  winners: { id: number; name: string; wonAt: string; winNumber: number }[];
};
