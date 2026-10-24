import type { Data } from '../src/model'
export type AnalysisProfile = { goal: 'strength' | 'muscle' | 'fat_loss' | 'maintain'; weightKg?: number }
export type AnalysisReport = { summary: string; training: string[]; nutrition: string[]; nextSteps: string[]; missingData: string[] }
export const GOALS: Record<AnalysisProfile['goal'], string>
export const PROMPT_VERSION: string
export function validProfile(value: unknown): value is AnalysisProfile
export function buildAnalysis(data: Data, profile: AnalysisProfile, days: number, endDate: string): {
  period: { start: string; end: string; days: number }; goal: string; weightKg: number | null;
  training: { sessions: number; completedSets: number; volumeKg: number; exercises: unknown[] };
  nutrition: { recordedDays: number; averages: Record<string, { value: number | null; recordedDays: number }>; completeness: string }
}
export function validReport(value: unknown): value is AnalysisReport
