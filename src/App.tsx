import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from './api/queryClient';
import { SubmissionProvider } from './api/submissions';
import { MainMenu } from './ui/screens/MainMenu';
import { MatchScreen } from './ui/screens/MatchScreen';
import { OptionsScreen } from './ui/screens/OptionsScreen';

type Screen = 'menu' | 'options' | 'match';

/** Screen state lives in memory only: reloading the page always lands on the menu (and abandons any match). */
function Screens() {
  const [screen, setScreen] = useState<Screen>('menu');
  const toMenu = () => {
    setScreen('menu');
  };
  if (screen === 'match') return <MatchScreen onExit={toMenu} />;
  if (screen === 'options') return <OptionsScreen onBack={toMenu} />;
  return (
    <MainMenu
      onPlay={() => {
        setScreen('match');
      }}
      onOptions={() => {
        setScreen('options');
      }}
    />
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SubmissionProvider>
        <Screens />
      </SubmissionProvider>
    </QueryClientProvider>
  );
}
