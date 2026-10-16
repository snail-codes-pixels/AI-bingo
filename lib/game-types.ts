export type GameSnapshot = {
  counts: Record<string, number>;
  participants: number;
  currentCall: { id: number; promptId: string } | null;
  calledCount: number;
  yes: number;
  no: number;
  winners: { name: string; wonAt: string }[];
};
