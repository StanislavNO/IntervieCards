import { PracticeWorkspace } from '../components/PracticeWorkspace';
import type { AuthUser } from '../types';

type Props = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  authUser: AuthUser | null;
  authLoading: boolean;
  authEnabled: boolean;
  onAuthChange: (user: AuthUser | null) => void;
};

export function TrainingPage({ theme, onToggleTheme, authUser, authLoading, authEnabled, onAuthChange }: Props) {
  return (
    <PracticeWorkspace
      initialView="study"
      theme={theme}
      onToggleTheme={onToggleTheme}
      onBack={() => undefined}
      authUser={authUser}
      authLoading={authLoading}
      authEnabled={authEnabled}
      onAuthChange={onAuthChange}
      hideWorkspaceHeader
      showDecorations={false}
    />
  );
}
