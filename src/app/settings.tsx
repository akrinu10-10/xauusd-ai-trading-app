import { router } from 'expo-router';

import { SettingsScreen } from '@/screens/SettingsScreen';

export default function SettingsRoute() {
  return (
    <SettingsScreen
      onSaved={() => {
        // Balik ke tab Chart setelah key tersimpan.
        router.replace('/');
      }}
    />
  );
}