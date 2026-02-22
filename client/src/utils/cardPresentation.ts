import type { Card, Difficulty } from '../types';

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

export function inferDifficulty(card: Card): Difficulty {
  return card.difficulty;
}

export function difficultyLabel(difficulty: Difficulty): string {
  if (difficulty === 'hard') return 'Senior';
  if (difficulty === 'medium') return 'Mid';
  return 'Junior';
}

export function difficultyClass(difficulty: Difficulty): string {
  if (difficulty === 'hard') return 'difficulty-hard';
  if (difficulty === 'medium') return 'difficulty-medium';
  return 'difficulty-easy';
}

export function tagCategoryClass(tag: string): string {
  const normalized = normalize(tag);

  if (normalized.includes('render') || normalized.includes('shader') || normalized.includes('lighting')) {
    return 'tag-cat-rendering';
  }
  if (normalized.includes('physics') || normalized.includes('rigidbody') || normalized.includes('collision')) {
    return 'tag-cat-physics';
  }
  if (normalized.includes('c#') || normalized.includes('cs') || normalized.includes('language')) {
    return 'tag-cat-csharp';
  }
  if (normalized.includes('architecture') || normalized.includes('паттерн') || normalized.includes('oop')) {
    return 'tag-cat-architecture';
  }
  if (normalized.includes('network') || normalized.includes('multiplayer') || normalized.includes('netcode')) {
    return 'tag-cat-networking';
  }
  if (normalized.includes('ecs') || normalized.includes('dots') || normalized.includes('entity')) {
    return 'tag-cat-ecs';
  }

  return 'tag-cat-default';
}
