export type StoryTargetLevel = 'Junior' | 'Middle' | 'Senior';
export type StoryDuration = 60 | 90 | 120;

export type StoryBlockType =
  | 'greeting'
  | 'workExperience'
  | 'responsibilities'
  | 'achievements'
  | 'reasonForSearch'
  | 'targetRoleOutro';

export type StoryBlock = {
  id: string;
  type: StoryBlockType;
  enabled: boolean;
  order: number;
  jobId?: string;
};

export type JobStory = {
  id: string;
  company: string;
  project: string;
  genrePlatform: string;
  mechanicsSummary: string;
  responsibilities: string[];
  achievements: string[];
};

export type SelfPresentationProfile = {
  name: string;
  yearsOfExperience: string;
  reasonForSearch: string;
  targetRoleOutro: string;
  targetLevel: StoryTargetLevel;
};

export type SelfPresentationSettings = {
  duration: StoryDuration;
};

export type SelfPresentationBuilderData = {
  schemaVersion: 1;
  profile: SelfPresentationProfile;
  jobs: JobStory[];
  storyBlocks: StoryBlock[];
  settings: SelfPresentationSettings;
  updatedAt: string;
};

export type LibraryBlockItem = {
  type: StoryBlockType;
  title: string;
  description: string;
  required: boolean;
  repeatable: boolean;
  jobScoped: boolean;
};

export type StoryRenderContext = {
  profile: SelfPresentationProfile;
  jobsById: Record<string, JobStory>;
};

export type QualityCheckResult = {
  score: number;
  checks: Array<{ label: string; passed: boolean }>;
  recommendations: string[];
  wordCount: number;
  estimatedSeconds: number;
};

export type GenerateSelfPresentationPayload = {
  data: SelfPresentationBuilderData;
  settings: SelfPresentationSettings;
};

export type GenerateSelfPresentationResponse = {
  ok?: boolean;
  text?: string;
  upgradeRequired?: boolean;
  message?: string;
};
