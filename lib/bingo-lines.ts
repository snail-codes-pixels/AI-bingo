const lines: number[][] = [
  ...Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => row * 5 + col)),
  ...Array.from({ length: 5 }, (_, col) => Array.from({ length: 5 }, (_, row) => row * 5 + col)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

export function completedLineIds(card: string[], selected: ReadonlySet<string>): string[] {
  if (card.length !== 25) return [];
  return lines
    .filter(indices => indices.every(index => card[index] === 'free' || selected.has(card[index])))
    .map(indices => indices.map(index => card[index]).sort().join('|'));
}
